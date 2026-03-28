import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateServiceProviderDto {
    @ApiProperty({ example: 'user-uuid-here', description: 'User ID this provider is linked to' })
    @IsString()
    user_id: string;

    @ApiProperty({ example: 'Ravi Kumar', description: 'Full name of the service provider' })
    @IsString()
    name: string;

    @ApiProperty({ example: '+919876543210', description: 'Provider phone number' })
    @IsString()
    phoneNumber: string;

    @ApiPropertyOptional({ example: 'Mumbai', description: 'City of operation' })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional({ example: 3, description: 'Years of experience' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(50)
    yearsOfExperience?: number;

    @ApiPropertyOptional({
        example: 'ACTIVE',
        description: 'Provider status: PENDING | ACTIVE | SUSPENDED | REJECTED',
    })
    @IsOptional()
    @IsString()
    status?: string;
}
