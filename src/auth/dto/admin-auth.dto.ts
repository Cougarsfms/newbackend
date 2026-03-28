import { IsEmail, IsNotEmpty, IsString, MinLength, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({ example: 'superadmin@fms.com', description: 'Admin email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin123', description: 'Admin password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class AdminSignupDto {
  @ApiProperty({ example: 'John Doe', description: 'Admin full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'john@fms.com', description: 'Admin email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securepass123', description: 'Password (min 6 chars)', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({
    example: 'SUPER_ADMIN',
    description: 'Admin role',
    enum: ['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_AGENT', 'COMPLIANCE_OFFICER'],
  })
  @IsIn(['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_AGENT', 'COMPLIANCE_OFFICER'])
  role: string;
}

export class AdminForgotPasswordDto {
  @ApiProperty({ example: 'john@fms.com', description: 'Admin email address' })
  @IsEmail()
  email: string;
}
