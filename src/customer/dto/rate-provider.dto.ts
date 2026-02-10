import { ApiProperty } from '@nestjs/swagger';

export class RateProviderDto {
    @ApiProperty({ description: 'Booking ID', example: 'booking-uuid' })
    bookingId: string;

    @ApiProperty({ description: 'Rating Score (1-5)', example: 5 })
    score: number;

    @ApiProperty({ description: 'Comment or Review', example: 'Great service!' })
    comment: string;
}
