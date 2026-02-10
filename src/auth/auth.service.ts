import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
// import * as admin from 'firebase-admin';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) { }

  // Mock OTP storage (In production use Redis or DB)
  private otpStore = new Map<string, string>();

  async sendOtp(mobileNumber: string) {
    if (!mobileNumber) {
      throw new BadRequestException('Mobile number is required');
    }

    // Generate 4-digit OTP (Mock: always 1234 for easy testing)
    const otp = '1234';

    console.log(`[AuthService] Generated OTP for ${mobileNumber}: ${otp}`);
    this.otpStore.set(mobileNumber, otp);

    return {
      success: true,
      message: 'OTP sent successfully',
      data: {
        verificationId: 'mock_vid_' + Date.now()
      }
    };
  }

  async verifyOtp(mobileNumber: string, otp: string) {
    const storedOtp = this.otpStore.get(mobileNumber);

    // Allow '1234' as universal bypass for development
    if (storedOtp !== otp && otp !== '1234') {
      throw new UnauthorizedException('Invalid OTP');
    }

    // Clear OTP after use
    this.otpStore.delete(mobileNumber);

    const user = await this.usersService.findOrCreate(mobileNumber);

    // Generate Mock Token
    const token = 'mock-jwt-token-for-' + user.id;

    return {
      success: true,
      data: {
        token,
        user
      }
    };
  }

  // Stub for Firebase Token Verification
  async verifyFirebaseToken(token: string): Promise<string> {
    // In production:
    // const decodedToken = await admin.auth().verifyIdToken(token);
    // return decodedToken.phone_number;

    // For Development (Allow any token starting with "dev-")
    if (token.startsWith('dev-')) {
      return '+919876543210'; // Mock Phone
    }

    throw new UnauthorizedException('Invalid Token');
  }

  async login(token: string) {
    console.log('[AuthService] login called with token:', token);
    try {
      const phoneNumber = await this.verifyFirebaseToken(token);
      console.log('[AuthService] verified phone:', phoneNumber);
      const user = await this.usersService.findOrCreate(phoneNumber);
      console.log('[AuthService] user found/created:', user);

      // Wrap in standard response format
      return {
        success: true,
        data: {
          user,
          token: 'mock-jwt-token-for-' + user.id
        }
      };
    } catch (error) {
      console.log('[AuthService] login error:', error);
      throw new UnauthorizedException('Authentication Failed');
    }
  }
}
