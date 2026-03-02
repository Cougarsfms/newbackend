import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
    @ApiProperty({ description: 'Full name', required: false })
    name?: string;

    @ApiProperty({ description: 'Service Categories', required: false, type: [String] })
    serviceCategories?: string[];

    @ApiProperty({ description: 'Years of Experience', required: false, type: [String] })
    experiences?: string[];

    @ApiProperty({ description: 'City / Location', required: false })
    city?: string;

    @ApiProperty({ description: 'Years of experience (numeric)', required: false })
    yearsOfExperience?: number;
}
