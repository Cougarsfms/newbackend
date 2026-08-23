import { Controller, Get, Post, Body, Param, Headers, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';

@ApiTags('Team Leader Attendance')
@Controller('tl/attendance')
export class TlAttendanceController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch attendance logs for service providers assigned to this Team Leader' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiQuery({ name: 'date', description: 'Optional date filter YYYY-MM-DD', required: false })
  @ApiQuery({ name: 'providerId', description: 'Optional service provider ID filter', required: false })
  @ApiResponse({ status: 200, description: 'Attendance logs retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getAttendance(
    @Query('date') date?: string,
    @Query('providerId') providerId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getAssignedAttendance(verified.id, { date, providerId });
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Excuse or regularize an attendance exception (e.g. LATE or ABSENT)' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Attendance exception resolved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  @ApiResponse({ status: 404, description: 'Attendance record not found' })
  async resolveException(
    @Param('id') id: string,
    @Body() dto: { status: string; remarks?: string },
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.resolveAttendanceException(verified.id, id, dto);
  }
}
