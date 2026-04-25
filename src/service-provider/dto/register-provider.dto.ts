import { ApiProperty } from '@nestjs/swagger';

export class RegisterProviderDto {
    @ApiProperty({ description: 'Mobile number of the provider', example: '+919876543210' })
    phoneNumber: string;

    @ApiProperty({ description: 'Full name of the provider', example: 'John Doe' })
    name: string;

    @ApiProperty({
        description: 'Preferred service category IDs',
        example: ['plumbing', 'electrical'],
        type: [String]
    })
    serviceCategories: string[];

    @ApiProperty({
        description: 'Preferred service item IDs',
        example: ['pipe-repair', 'wiring'],
        type: [String]
    })
    serviceItems?: string[];
}
