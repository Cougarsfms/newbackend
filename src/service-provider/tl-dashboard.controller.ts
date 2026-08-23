import { Controller, Get, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';

@ApiTags('Team Leader Dashboard')
@Controller('tl/dashboard')
export class TlDashboardController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch dashboard KPIs and workforce/leave tracking overview' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Dashboard metrics and active workforce list retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getDashboard(@Headers('authorization') authHeader?: string) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getDashboardKpis(verified.id);
  }
}
