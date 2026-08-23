import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { OtpService } from '../sms/otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { TlLoginDto } from './dto/tl-auth.dto';
import { User } from '@prisma/client';
import * as crypto from 'crypto';

function verifyPassword(password: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':');
  const hash = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, 'sha512')
    .toString('hex');
  return hash === storedHash;
}

function generateTlToken(user: { id: string; phoneNumber: string; role: string }): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: user.id, phoneNumber: user.phoneNumber, role: user.role, iat: Date.now() }),
  ).toString('base64');
  return `tlapp.${payload}.mock`;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private otpService: OtpService,
    private prisma: PrismaService,
  ) { }

  async sendOtp(mobileNumber: string) {
    return this.otpService.sendOtp(mobileNumber);
  }

  async verifyOtp(mobileNumber: string, otp: string) {
    await this.otpService.verifyOtp(mobileNumber, otp);

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

    // For Development
    if (token.startsWith('dev-')) {
      return '+919876543210';
    }

    // Mock user for testing if no logic matches
    return '+919876543210';
  }

  async login(token: string) {
    console.log('[AuthService] login called with token:', token);
    try {
      const phoneNumber = await this.verifyFirebaseToken(token);
      console.log('[AuthService] verified phone:', phoneNumber);

      // Ensure we get customers relation
      const user = await this.usersService.findOrCreate(phoneNumber);

      return {
        success: true,
        data: {
          user: {
            ...user,
            customerId: 'cust_' + user.id
          },
          token: 'mock-jwt-token-for-' + user.id
        }
      };
    } catch (error) {
      throw new UnauthorizedException('Firebase authentication failed');
    }
  }

  async tlLogin(dto: TlLoginDto) {
    const { phoneNumber, email, password } = dto;
    if (!phoneNumber && !email) {
      throw new BadRequestException('Either phone number or email is required');
    }

    let user: User | null = null;
    if (phoneNumber) {
      const cleaned = phoneNumber.replace(/\D/g, '').slice(-10);
      user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { phoneNumber: cleaned },
            { phoneNumber: '+91' + cleaned },
            { phoneNumber: '+91-' + cleaned }
          ]
        }
      });
    } else if (email) {
      user = await this.prisma.user.findUnique({
        where: { email }
      });
    }

    if (!user) {
      await this.prisma.auditLog.create({
        data: {
          action: 'TEAM_LEADER_LOGIN_FAIL',
          details: `User not found for identifier: ${phoneNumber || email}`,
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.role !== 'TEAM_LEADER') {
      await this.prisma.auditLog.create({
        data: {
          action: 'TEAM_LEADER_LOGIN_FAIL',
          details: `User ${user.id} attempted to log in as Team Leader, but has role ${user.role}`,
        },
      });
      throw new UnauthorizedException('Access denied: not a Team Leader');
    }

    if (!user.passwordHash) {
      await this.prisma.auditLog.create({
        data: {
          action: 'TEAM_LEADER_LOGIN_FAIL',
          details: `User ${user.id} has no password set.`,
        },
      });
      throw new UnauthorizedException('Password not set. Please contact support.');
    }

    const valid = verifyPassword(password, user.passwordHash);
    if (!valid) {
      await this.prisma.auditLog.create({
        data: {
          action: 'TEAM_LEADER_LOGIN_FAIL',
          details: `Incorrect password for user ${user.id}`,
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_LOGIN_SUCCESS',
        details: `Successful login for user ${user.id} (${user.phoneNumber})`,
      },
    });

    const token = generateTlToken({
      id: user.id,
      phoneNumber: user.phoneNumber,
      role: user.role,
    });

    return {
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          phoneNumber: user.phoneNumber,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      },
    };
  }

  async verifyTlToken(authHeader?: string): Promise<{ id: string; phoneNumber: string; role: string }> {
    if (!authHeader) {
      throw new BadRequestException('Authorization header is required');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    const token = parts[1];
    if (!token.startsWith('tlapp.') || !token.endsWith('.mock')) {
      throw new UnauthorizedException('Invalid mock token signature or prefix');
    }

    const middle = token.substring(6, token.length - 5);
    let payload: any;
    try {
      const decodedJson = Buffer.from(middle, 'base64').toString('utf8');
      payload = JSON.parse(decodedJson);
    } catch {
      throw new UnauthorizedException('Invalid mock token payload encoding');
    }

    const userId = payload.sub;
    const role = payload.role;

    if (role !== 'TEAM_LEADER' || !userId) {
      throw new UnauthorizedException('Access denied: not a Team Leader');
    }

    return {
      id: userId,
      phoneNumber: payload.phoneNumber,
      role,
    };
  }

  async tlLogout(authHeader?: string) {
    const verified = await this.verifyTlToken(authHeader);

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_LOGOUT_SUCCESS',
        details: `Successful logout for Team Leader with user ID: ${verified.id}`,
      },
    });

    return {
      success: true,
      message: 'Logout successful',
    };
  }
}
