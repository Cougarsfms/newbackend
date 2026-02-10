import { ApiProperty } from '@nestjs/swagger';

export class InitiatePaymentDto {
    @ApiProperty({ description: 'Booking ID', example: 'booking-uuid' })
    bookingId: string;

    @ApiProperty({ description: 'Amount', example: 500 })
    amount: number;

    @ApiProperty({ description: 'Payment Method (UPI, CARD, COD)', example: 'UPI' })
    method: string;
}
