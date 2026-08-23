import { Controller, Post, Get, Body, Param, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConciergeService } from './concierge.service';
import { ConciergeRequestDto } from './dto/concierge-request.dto';

@ApiTags('Customer Concierge')
@Controller('customer-concierge')
export class ConciergeController {
  constructor(private readonly conciergeService: ConciergeService) {}

  @Post('customer/:customerId/chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a message to the AI Customer Concierge' })
  @ApiResponse({ status: 200, description: 'AI response returned successfully.' })
  async chat(
    @Param('customerId') customerId: string,
    @Body() dto: ConciergeRequestDto,
  ) {
    return this.conciergeService.processMessage(
      customerId,
      dto.message,
      dto.sessionId,
      dto.confirmAction,
    );
  }

  @Get('customer/:customerId/history')
  @ApiOperation({ summary: 'Get recent conversation history' })
  @ApiResponse({ status: 200, description: 'Conversation history retrieved successfully.' })
  async getHistory(@Param('customerId') customerId: string) {
    return this.conciergeService.getSessionHistory(customerId);
  }
}
