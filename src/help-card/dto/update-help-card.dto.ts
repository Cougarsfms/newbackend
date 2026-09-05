import { PartialType } from '@nestjs/mapped-types';
import { CreateHelpCardDto } from './create-help-card.dto';

export class UpdateHelpCardDto extends PartialType(CreateHelpCardDto) {}
