import { Controller, Post, Body, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { TlLoginDto } from './dto/tl-auth.dto';

@ApiTags('Team Leader Auth')
@Controller('tl/auth')
export class TlAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate Team Leader using phone/email + password' })
  @ApiResponse({ status: 200, description: 'Authentication successful, returns user info and token' })
  @ApiResponse({ status: 400, description: 'Invalid input payload' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or access denied' })
  async tlLogin(@Body() body: TlLoginDto) {
    return this.authService.tlLogin(body);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout Team Leader session' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Invalid token or session' })
  async tlLogout(@Headers('authorization') authHeader?: string) {
    return this.authService.tlLogout(authHeader);
  }
}
