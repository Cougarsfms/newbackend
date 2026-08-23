import { Controller, Get, Headers, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';

@ApiTags('Team Leader Providers')
@Controller('tl/providers')
export class TlProviderController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch all service providers assigned to this Team Leader' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Assigned service providers list retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getProviders(@Headers('authorization') authHeader?: string) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getAssignedProviders(verified.id);
  }

  @Get(':providerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get detailed profile of an assigned service provider' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Service provider profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  @ApiResponse({ status: 404, description: 'Provider not found or not assigned to you' })
  async getProviderProfile(
    @Param('providerId') providerId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getAssignedProviderProfile(verified.id, providerId);
  }

  @Get(':providerId/salary-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get salary preview/earnings dashboard of an assigned service provider' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Salary preview retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  @ApiResponse({ status: 404, description: 'Provider not found or not assigned to you' })
  async getProviderSalaryPreview(
    @Param('providerId') providerId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getProviderSalaryPreview(verified.id, providerId);
  }
}
