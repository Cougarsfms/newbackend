import { IsString, IsNotEmpty, IsOptional, IsArray, IsEnum } from 'class-validator';

export class BroadcastDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsArray()
  @IsEnum(['PUSH', 'SMS'], { each: true })
  @IsOptional()
  channels?: ('PUSH' | 'SMS')[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  providerIds?: string[];
}
