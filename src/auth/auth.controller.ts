import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto, AdminSignupDto, AdminForgotPasswordDto } from './dto/admin-auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminAuthService: AdminAuthService,
  ) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body('mobileNumber') mobileNumber: string) {
    return this.authService.sendOtp(mobileNumber);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() body: { mobileNumber: string; otp: string }) {
    return this.authService.verifyOtp(body.mobileNumber, body.otp);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body('token') token: string) {
    return this.authService.login(token);
  }

  // ── Admin email+password auth ─────────────────────────────────────────────

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login with email + password' })
  async adminLogin(@Body() body: AdminLoginDto) {
    return this.adminAuthService.adminLogin(body.email, body.password);
  }

  @Post('admin/signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new admin account' })
  async adminSignup(@Body() body: AdminSignupDto) {
    return this.adminAuthService.adminSignup(body.name, body.email, body.password, body.role);
  }

  @Post('admin/forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request admin password reset link' })
  async adminForgotPassword(@Body() body: AdminForgotPasswordDto) {
    return this.adminAuthService.adminForgotPassword(body.email);
  }
}
