import { Controller, Get, Post, Headers, Query, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';
import { RejectLeaveDto } from './dto/tl-leave.dto';

@ApiTags('Team Leader Leaves')
@Controller('tl/leaves')
export class TlLeaveController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch leave requests for service providers assigned to this Team Leader' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiQuery({ name: 'status', description: 'Optional status filter: PENDING, APPROVED, REJECTED', required: false })
  @ApiQuery({ name: 'providerId', description: 'Optional service provider ID filter', required: false })
  @ApiResponse({ status: 200, description: 'Leave requests retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getLeaves(
    @Query('status') status?: string,
    @Query('providerId') providerId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getAssignedLeaves(verified.id, { status, providerId });
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending leave request' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Leave request approved successfully' })
  @ApiResponse({ status: 400, description: 'Leave request not in PENDING state' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  @ApiResponse({ status: 404, description: 'Leave request not found or not assigned to you' })
  async approveLeave(
    @Param('id') id: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.approveLeave(verified.id, id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending leave request' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Leave request rejected successfully' })
  @ApiResponse({ status: 400, description: 'Leave request not in PENDING state' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  @ApiResponse({ status: 404, description: 'Leave request not found or not assigned to you' })
  async rejectLeave(
    @Param('id') id: string,
    @Body() dto: RejectLeaveDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.rejectLeave(verified.id, id, dto);
  }
}
