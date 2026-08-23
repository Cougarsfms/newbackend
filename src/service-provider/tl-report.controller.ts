import { Controller, Get, Headers, Query, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';

@ApiTags('Team Leader Reports')
@Controller('tl/reports')
export class TlReportController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate and retrieve operational reports for the managed workforce' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiQuery({ name: 'type', description: 'Report type: attendance, jobs, performance, leaves', required: true, type: String })
  @ApiQuery({ name: 'startDate', description: 'Optional report period start date (YYYY-MM-DD)', required: false, type: String })
  @ApiQuery({ name: 'endDate', description: 'Optional report period end date (YYYY-MM-DD)', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Report generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid report parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getReports(
    @Query('type') type: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    if (!type) {
      throw new BadRequestException('Query parameter "type" is required.');
    }
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.generateTeamReport(verified.id, { type, startDate, endDate });
  }
}
