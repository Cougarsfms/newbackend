import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SmsService } from './sms.service';

export interface StoredOtpRecord {
  otp: string;
  expiresAt: number; // Unix timestamp in ms
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  // In-memory OTP storage mapping phoneNumber -> StoredOtpRecord
  private readonly otpStore = new Map<string, StoredOtpRecord>();

  constructor(private readonly smsService: SmsService) {}

  /**
   * Helper to clean phone numbers for consistent storage keys.
   */
  private normalizePhone(phone: string): string {
    return phone.trim().replace(/\s+/g, '');
  }

  /**
   * Check whether Developer/Bypass mode is enabled or configured.
   */
  public isBypassEnabled(): boolean {
    const devBypassEnv = process.env.DEV_OTP_BYPASS;
    if (devBypassEnv !== undefined && devBypassEnv !== '') {
      return devBypassEnv.toLowerCase() === 'true';
    }
    // Default to bypass mode if Fast2SMS API key is not configured
    const fast2smsKey = process.env.FAST2SMS_API_KEY;
    return !fast2smsKey;
  }

  /**
   * Generate a random numeric OTP string of given length.
   */
  private generateNumericOtp(length = 4): string {
    const otpLength = parseInt(process.env.OTP_LENGTH || `${length}`, 10);
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < otpLength; i++) {
      otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
  }

  /**
   * Generates and sends OTP to specified phone number.
   */
  async sendOtp(mobileNumber: string): Promise<{
    success: boolean;
    message: string;
    data?: { verificationId: string; expiresAt: number; devOtp?: string };
  }> {
    if (!mobileNumber) {
      throw new BadRequestException('Mobile number is required');
    }

    const normalizedPhone = this.normalizePhone(mobileNumber);
    const otp = this.generateNumericOtp(4);

    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10);
    const expiresAt = Date.now() + expiryMinutes * 60 * 1000;

    // Store in memory
    this.otpStore.set(normalizedPhone, { otp, expiresAt });

    const bypassActive = this.isBypassEnabled();

    if (bypassActive) {
      this.logger.warn(
        `\n======================================================\n` +
        ` [DEV_OTP_BYPASS] OTP for ${normalizedPhone}: ${otp} (Bypass '1234' also enabled)\n` +
        `======================================================`
      );
    }

    // Dispatch SMS if API key present or non-mock
    let smsResult = { success: true, message: 'OTP generated' };
    if (process.env.FAST2SMS_API_KEY || process.env.SMS_PROVIDER === 'WEBHOOK' || process.env.SMS_PROVIDER === 'TWILIO') {
      smsResult = await this.smsService.sendSms({
        to: normalizedPhone,
        otp,
        message: `Your verification code is ${otp}. Valid for ${expiryMinutes} minutes.`,
      });
    }

    const verificationId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      success: true,
      message: smsResult.success
        ? 'OTP sent successfully'
        : `OTP generated (SMS dispatch status: ${smsResult.message})`,
      data: {
        verificationId,
        expiresAt,
        ...(bypassActive ? { devOtp: otp } : {}),
      },
    };
  }

  /**
   * Verifies the provided OTP for a mobile number.
   */
  async verifyOtp(mobileNumber: string, inputOtp: string): Promise<boolean> {
    if (!mobileNumber || !inputOtp) {
      throw new BadRequestException('Mobile number and OTP are required');
    }

    const normalizedPhone = this.normalizePhone(mobileNumber);
    const storedRecord = this.otpStore.get(normalizedPhone);
    const bypassActive = this.isBypassEnabled();

    // 1. Check universal developer bypass '1234' if bypass mode is enabled
    if (bypassActive && inputOtp === '1234') {
      this.logger.log(`[OtpService] Developer bypass OTP '1234' accepted for ${normalizedPhone}`);
      this.otpStore.delete(normalizedPhone);
      return true;
    }

    // 2. Check generated OTP in store
    if (!storedRecord) {
      this.logger.warn(`[OtpService] No OTP record found for ${normalizedPhone}`);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Check expiry
    if (Date.now() > storedRecord.expiresAt) {
      this.otpStore.delete(normalizedPhone);
      this.logger.warn(`[OtpService] OTP expired for ${normalizedPhone}`);
      throw new UnauthorizedException('OTP has expired');
    }

    // Check code match
    if (storedRecord.otp !== inputOtp.trim()) {
      this.logger.warn(`[OtpService] Incorrect OTP for ${normalizedPhone}`);
      throw new UnauthorizedException('Invalid OTP');
    }

    // OTP is valid - clear store
    this.otpStore.delete(normalizedPhone);
    this.logger.log(`[OtpService] OTP successfully verified for ${normalizedPhone}`);
    return true;
  }
}
