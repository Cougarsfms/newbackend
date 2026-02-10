import { ApiProperty } from '@nestjs/swagger';

export class PayoutRequestDto {
    @ApiProperty({ description: 'Amount to withdraw', example: 1000 })
    amount: number;

    @ApiProperty({ description: 'Bank Account ID or details', example: 'bank_123' })
    bankDetails: string;
}
