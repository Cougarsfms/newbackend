import { IsString, IsOptional } from 'class-validator';

export class ResolveEscalationDto {
  @IsString()
  @IsOptional()
  remarks?: string;
}
