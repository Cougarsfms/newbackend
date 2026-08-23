import { Controller, Get, Post, Headers, Query, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';
import { ResolveEscalationDto } from './dto/tl-escalation.dto';

@ApiTags('Team Leader Escalations')
@Controller('tl/escalations')
export class TlEscalationController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch escalations for service providers assigned to this Team Leader' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiQuery({ name: 'status', description: 'Optional status filter: OPEN, IN_PROGRESS, RESOLVED', required: false })
  @ApiQuery({ name: 'priority', description: 'Optional priority filter: LOW, MEDIUM, HIGH', required: false })
  @ApiQuery({ name: 'providerId', description: 'Optional service provider ID filter', required: false })
  @ApiResponse({ status: 200, description: 'Escalations retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getEscalations(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('providerId') providerId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getAssignedEscalations(verified.id, { status, priority, providerId });
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a pending or active escalation' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Escalation resolved successfully' })
  @ApiResponse({ status: 400, description: 'Escalation is already resolved' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  @ApiResponse({ status: 404, description: 'Escalation not found or not assigned to your team' })
  async resolveEscalation(
    @Param('id') id: string,
    @Body() dto: ResolveEscalationDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.resolveEscalation(verified.id, id, dto);
  }
}
