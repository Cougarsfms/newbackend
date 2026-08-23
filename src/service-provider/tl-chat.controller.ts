import { Controller, Post, Headers, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { TlDashboardService } from './tl-dashboard.service';
import { AuthService } from '../auth/auth.service';
import { SendChatMessageDto } from './dto/tl-chat.dto';

@ApiTags('Team Leader Chat')
@Controller('tl/chat')
export class TlChatController {
  constructor(
    private readonly tlDashboardService: TlDashboardService,
    private readonly authService: AuthService,
  ) {}

  @Post('message')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a chat message to a managed service provider' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 201, description: 'Chat message sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters or target user not on team' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async sendMessage(
    @Body() dto: SendChatMessageDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.sendChatMessage(verified.id, dto);
  }

  @Post('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch chat messages history with a specific service provider' })
  @ApiHeader({ name: 'authorization', description: 'Bearer JWT token', required: true })
  @ApiResponse({ status: 200, description: 'Chat messages history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized access or invalid token' })
  async getHistory(
    @Body() body: { providerUserId: string },
    @Headers('authorization') authHeader?: string,
  ) {
    const verified = await this.authService.verifyTlToken(authHeader);
    return this.tlDashboardService.getChatHistory(verified.id, body.providerUserId);
  }
}
