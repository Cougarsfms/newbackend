import { ApiProperty } from '@nestjs/swagger';

export class UpdateCustomerProfileDto {
    @ApiProperty({ description: 'Full name', required: false })
    name?: string;

    @ApiProperty({ description: 'Email address', required: false })
    email?: string;

    @ApiProperty({ description: 'Profile picture URL', required: false })
    profile?: string;

    @ApiProperty({ description: 'Preferences', required: false, type: [String] })
    preferences?: string[];
}
