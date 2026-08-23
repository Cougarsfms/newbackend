import { Controller, Get, Headers, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';

@ApiTags('Team Leader Performance')
@Controller('tl/performance')
export class TlPerformanceController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch performance statistics and leaderboard for assigned service providers' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiQuery({ name: 'providerId', description: 'Optional service provider ID filter', required: false })
  @ApiResponse({ status: 200, description: 'Performance dashboard KPIs retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getPerformance(
    @Query('providerId') providerId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getTeamPerformance(verified.id, { providerId });
  }
}
