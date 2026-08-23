import { Injectable, Logger } from '@nestjs/common';

export interface SendSmsOptions {
  to: string;
  otp: string;
  message?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  /**
   * Cleans mobile number by stripping non-numeric characters and country code prefix (e.g. +91) if 10 digits follow.
   */
  private sanitizePhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.length > 10 && cleaned.startsWith('91')) {
      cleaned = cleaned.substring(2);
    }
    return cleaned;
  }

  /**
   * Dispatch SMS via configured provider (Defaults to Fast2SMS)
   */
  async sendSms(options: SendSmsOptions): Promise<{ success: boolean; message: string; data?: any }> {
    const provider = (process.env.SMS_PROVIDER || 'FAST2SMS').toUpperCase();
    const sanitizedTo = this.sanitizePhoneNumber(options.to);

    switch (provider) {
      case 'FAST2SMS':
        return this.sendViaFast2SMS(sanitizedTo, options.otp, options.message);
      case 'WEBHOOK':
        return this.sendViaWebhook(options.to, options.otp, options.message);
      case 'TWILIO':
        return this.sendViaTwilio(options.to, options.otp, options.message);
      case 'MOCK':
      default:
        this.logger.log(`[MOCK SMS] Sent OTP ${options.otp} to ${options.to}`);
        return { success: true, message: 'Mock SMS logged' };
    }
  }

  /**
   * Fast2SMS Bulk V2 API integration
   */
  private async sendViaFast2SMS(
    mobileNumber: string,
    otp: string,
    customMessage?: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const apiKey = process.env.FAST2SMS_API_KEY;

    if (!apiKey) {
      this.logger.warn(`FAST2SMS_API_KEY is not configured in .env. Skipping real SMS dispatch.`);
      return { success: false, message: 'Fast2SMS API key missing' };
    }

    try {
      const route = process.env.FAST2SMS_ROUTE || 'otp';
      const bodyPayload: any = {
        route: route,
        numbers: mobileNumber,
        flash: '0',
      };

      if (route === 'q') {
        bodyPayload.message = customMessage || `Your verification code is ${otp}`;
      } else {
        bodyPayload.variables_values = otp;
      }


      this.logger.log(`[Fast2SMS] Sending OTP to ${mobileNumber}...`);

      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          authorization: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });

      const responseData: any = await response.json();

      if (response.ok && responseData && responseData.return === true) {
        this.logger.log(`[Fast2SMS] SMS sent successfully to ${mobileNumber}. RequestId: ${responseData.request_id}`);
        return {
          success: true,
          message: 'SMS sent successfully via Fast2SMS',
          data: responseData,
        };
      } else {
        const errorMsg = Array.isArray(responseData?.message)
          ? responseData.message.join(', ')
          : responseData?.message || 'Failed to send SMS';
        this.logger.error(`[Fast2SMS] Error sending SMS to ${mobileNumber}: ${errorMsg}`, responseData);
        return {
          success: false,
          message: errorMsg,
          data: responseData,
        };
      }
    } catch (error: any) {
      this.logger.error(`[Fast2SMS] Exception while dispatching SMS to ${mobileNumber}: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || 'Fast2SMS API request failed',
      };
    }
  }

  /**
   * Generic HTTP Webhook provider dispatch
   */
  private async sendViaWebhook(
    to: string,
    otp: string,
    message?: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const webhookUrl = process.env.WEBHOOK_SMS_URL;
    if (!webhookUrl) {
      this.logger.warn('WEBHOOK_SMS_URL is not configured in .env');
      return { success: false, message: 'Webhook SMS URL missing' };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, otp, message: message || `Your OTP is ${otp}` }),
      });

      const data = await response.json().catch(() => ({}));
      return { success: response.ok, message: 'Webhook triggered', data };
    } catch (error: any) {
      this.logger.error(`[Webhook SMS] Error sending to ${to}: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Twilio Messaging API dispatch
   */
  private async sendViaTwilio(
    to: string,
    otp: string,
    message?: string,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
      this.logger.warn('Twilio credentials missing in .env');
      return { success: false, message: 'Twilio credentials missing' };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams({
        To: to,
        From: fromPhone,
        Body: message || `Your verification code is ${otp}`,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data: any = await response.json();
      return { success: response.ok, message: data.message || 'Twilio SMS sent', data };
    } catch (error: any) {
      this.logger.error(`[Twilio] Error sending to ${to}: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}
