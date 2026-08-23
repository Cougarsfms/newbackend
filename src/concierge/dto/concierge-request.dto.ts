import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class ConciergeRequestDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsObject()
  @IsOptional()
  confirmAction?: {
    type: 'create_booking' | 'cancel_booking';
    details: any;
  };
}
