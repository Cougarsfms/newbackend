import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

// ─── simple password helpers (no external dep needed) ──────────────────────
// We use PBKDF2 via Node's built-in crypto so we don't need bcrypt installed.
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, 'sha512')
    .toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':');
  const hash = crypto
    .pbkdf2Sync(password, salt, 100_000, 64, 'sha512')
    .toString('hex');
  return hash === storedHash;
}

// Simple token: in production replace with @nestjs/jwt
function generateToken(adminUser: { id: string; email: string }): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: adminUser.id, email: adminUser.email, iat: Date.now() }),
  ).toString('base64');
  return `fmsadmin.${payload}.mock`;
}

// ─── Role → AdminRole lookup name mapping ──────────────────────────────────
const ROLE_NAME_MAP: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  OPERATIONS_ADMIN: 'Operations Admin',
  FINANCE_ADMIN: 'Finance Admin',
  SUPPORT_AGENT: 'Support Agent',
  COMPLIANCE_OFFICER: 'Compliance Officer',
};

@Injectable()
export class AdminAuthService {
  constructor(private readonly prisma: PrismaService) {}

  // ── POST /api/auth/admin/login ────────────────────────────────────────────
  async adminLogin(email: string, password: string) {
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { email } });

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (admin.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${admin.status.toLowerCase()}. Please contact a Super Admin.`);
    }

    if (!admin.passwordHash) {
      throw new UnauthorizedException('Account has no password set. Please use the signup flow or contact support.');
    }

    const valid = verifyPassword(password, admin.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = generateToken({ id: admin.id, email: admin.email! });

    return {
      success: true,
      data: {
        token,
        user: {
          id: admin.id,
          name: admin.name ?? admin.email,
          email: admin.email,
          role: admin.adminRole,
          status: admin.status,
        },
      },
    };
  }

  // ── POST /api/auth/admin/signup ───────────────────────────────────────────
  async adminSignup(name: string, email: string, password: string, role: string) {
    const existing = await this.prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An admin account with this email already exists');
    }

    // Resolve or lazily create the AdminRole row
    let adminRole = await this.prisma.adminRole.findFirst({
      where: { role_name: ROLE_NAME_MAP[role] ?? role },
    });

    if (!adminRole) {
      adminRole = await this.prisma.adminRole.create({
        data: {
          role_name: ROLE_NAME_MAP[role] ?? role,
          permissions: [],
        },
      });
    }

    const passwordHash = hashPassword(password);

    const admin = await this.prisma.adminUser.create({
      data: {
        name,
        email,
        passwordHash,
        adminRole: role,
        role_id: adminRole.id,
        status: 'ACTIVE',
      },
    });

    return {
      success: true,
      data: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.adminRole,
      },
      message: 'Admin account created successfully',
    };
  }

  // ── POST /api/auth/admin/forgot-password ──────────────────────────────────
  async adminForgotPassword(email: string) {
    // Always return success – never reveal whether the email exists (security)
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (admin) {
      // TODO: send actual reset email via a mail service (e.g. SendGrid / Nodemailer)
      console.log(`[AdminAuth] Password reset requested for ${email} (admin id: ${admin.id})`);
    }
    return {
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.',
    };
  }
}
