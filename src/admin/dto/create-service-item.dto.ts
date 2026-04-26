import { IsString, IsNotEmpty, IsNumber, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateServiceItemDto {
    @ApiProperty({ example: 'House Cleaning', description: 'Name of the service item' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'Full house deep cleaning service', description: 'Description of the service' })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiProperty({ example: 499, description: 'Base price of the service' })
    @IsNumber()
    @IsNotEmpty()
    price: number;

    @ApiProperty({ example: 'uuid-of-category', description: 'ID of the parent category' })
    @IsUUID()
    @IsNotEmpty()
    categoryId: string;

    @ApiProperty({ example: 60, description: 'Duration in minutes', required: false })
    @IsNumber()
    @IsOptional()
    durationMinutes?: number;
}
