import { Controller, Post, Get, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';
import { AssignShiftDto, BulkAssignShiftDto } from './dto/tl-shift.dto';

@ApiTags('Team Leader Shifts')
@Controller('tl/shifts')
export class TlShiftController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get('types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all available shift types for assignment' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Shift types list retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getShiftTypes(@Headers('authorization') authHeader?: string) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getShiftTypes(verified.id);
  }

  @Post('assign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign a shift type to an agent' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 201, description: 'Shift assigned successfully' })
  @ApiResponse({ status: 400, description: 'Duplicate shift assignment on same date or invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  @ApiResponse({ status: 404, description: 'Provider or Shift Type not found' })
  async assignShift(
    @Body() dto: AssignShiftDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.assignShift(verified.id, dto);
  }

  @Post('bulk-assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk assign a shift type to multiple agents' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Bulk shift assignment operation completed with status report' })
  @ApiResponse({ status: 400, description: 'Invalid input payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  @ApiResponse({ status: 404, description: 'Shift Type not found' })
  async bulkAssignShifts(
    @Body() dto: BulkAssignShiftDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.bulkAssignShifts(verified.id, dto);
  }
}
