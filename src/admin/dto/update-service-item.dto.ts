import { IsString, IsNotEmpty, IsNumber, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateServiceItemDto {
    @ApiProperty({ example: 'House Cleaning', description: 'Name of the service item', required: false })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiProperty({ example: 'Full house deep cleaning service', description: 'Description of the service', required: false })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ example: 499, description: 'Base price of the service', required: false })
    @IsNumber()
    @IsOptional()
    price?: number;

    @ApiProperty({ example: 'uuid-of-category', description: 'ID of the parent category', required: false })
    @IsUUID()
    @IsOptional()
    categoryId?: string;

    @ApiProperty({ example: 60, description: 'Duration in minutes', required: false })
    @IsNumber()
    @IsOptional()
    durationMinutes?: number;

    @ApiProperty({ example: 'https://images.unsplash.com/...', description: 'URL of the service photo', required: false })
    @IsString()
    @IsOptional()
    imageUrl?: string;
}
