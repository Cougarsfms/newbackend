import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateServiceCategoryDto {
    @ApiProperty({ example: 'Cleaning', description: 'Name of the service category' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'cleaning_icon', description: 'Icon name or URL' })
    @IsString()
    @IsNotEmpty()
    icon: string;

    @ApiProperty({ example: true, description: 'Whether the category is active', required: false })
    @IsBoolean()
    @IsOptional()
    active?: boolean;
}
