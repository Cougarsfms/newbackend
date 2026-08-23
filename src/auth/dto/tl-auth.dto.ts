import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TlLoginDto {
  @ApiProperty({ example: '+919876543210', description: 'Team Leader phone number', required: false })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({ example: 'teamleader@example.com', description: 'Team Leader email address', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'password123', description: 'Team Leader password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
