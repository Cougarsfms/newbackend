import { BookingStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBookingStatusDto {
    @ApiProperty({
        description: 'New booking status',
        example: 'CONFIRMED',
        enum: BookingStatus,
    })
    status: BookingStatus;

    @ApiProperty({
        description: 'Reason for status change',
        example: 'Customer requested cancellation',
    })
    reason: string;
}
