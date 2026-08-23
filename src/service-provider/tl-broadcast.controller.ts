import { Controller, Post, Headers, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';
import { BroadcastDto } from './dto/tl-broadcast.dto';

@ApiTags('Team Leader Broadcast')
@Controller('tl/broadcast')
export class TlBroadcastController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a broadcast message via Push notification and/or SMS to team providers' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Broadcast sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async sendBroadcast(
    @Body() dto: BroadcastDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.sendBroadcast(verified.id, dto);
  }
}
