import { IsString, IsOptional } from 'class-validator';

export class RejectLeaveDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
