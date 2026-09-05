import { Module } from '@nestjs/common';
import { HelpCardService } from './help-card.service';
import { HelpCardController } from './help-card.controller';

@Module({
  controllers: [HelpCardController],
  providers: [HelpCardService],
})
export class HelpCardModule {}
