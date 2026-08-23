import { Controller, Get, Patch, Param, Headers, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';

@ApiTags('Team Leader Notifications')
@Controller('tl/notifications')
export class TlNotificationController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch notifications for the authenticated Team Leader' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiQuery({ name: 'isRead', description: 'Optional filter for read status (true or false)', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getNotifications(
    @Query('isRead') isRead?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);

    let isReadBool: boolean | undefined = undefined;
    if (isRead !== undefined) {
      isReadBool = String(isRead) === 'true';
    }

    return this.tlDashboardService.getNotifications(verified.id, { isRead: isReadBool });
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read for the authenticated Team Leader' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async markAllRead(
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.markAllNotificationsRead(verified.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a specific notification as read' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 400, description: 'Notification does not belong to TL' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markOneRead(
    @Param('id') notificationId: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.markNotificationRead(verified.id, notificationId);
  }
}
