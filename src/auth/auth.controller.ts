import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

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
}
