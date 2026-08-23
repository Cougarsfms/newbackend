import { Controller, Get, Post, Headers, HttpCode, HttpStatus, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';

@ApiTags('Team Leader Inventory')
@Controller('tl/inventory')
export class TlInventoryController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all stock inventory items' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Inventory stock list retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getInventory(@Headers('authorization') authHeader?: string) {
    await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getInventoryItems();
  }

  @Get('issued')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all issued inventory items' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Issued inventory list retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getIssuedInventory(@Headers('authorization') authHeader?: string) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getIssuedInventory(verified.id);
  }

  @Post('issue')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Issue an inventory item to a provider' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 201, description: 'Item issued successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async issueInventory(
    @Body() dto: { providerId: string; itemId: string; quantity: number; remarks?: string },
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.issueInventory(verified.id, dto);
  }

  @Post('return/:issuedId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an issued inventory item as returned, damaged, or lost' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Item return processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid action or item already returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async returnInventory(
    @Param('issuedId') issuedId: string,
    @Body() dto: { status: string; remarks?: string },
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.returnInventory(verified.id, issuedId, dto.status, dto.remarks);
  }
}
