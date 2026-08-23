import { ApiProperty } from '@nestjs/swagger';

export class RegisterCustomerDto {
    @ApiProperty({ description: 'Mobile number of the customer', example: '+919876543210' })
    phoneNumber: string;

    @ApiProperty({ description: 'Full name', example: 'Jane Doe', required: false })
    name?: string;

    @ApiProperty({ description: 'Referral code of the referring customer', example: 'JANE1234', required: false })
    referralCode?: string;
}
