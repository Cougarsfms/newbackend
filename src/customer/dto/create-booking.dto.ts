import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
    @ApiProperty({ description: 'ID of the service item', example: 'service-uuid' })
    serviceItemId: string; // Note: Schema links Provider to Booking, logic needs to handle service selection

    // For the MVP, if customers pick a provider directly:
    @ApiProperty({ description: 'ID of the service provider', example: 'provider-uuid' })
    providerId: string;

    @ApiProperty({ description: 'Scheduled Date Time', example: '2025-01-25T10:00:00Z' })
    scheduledAt: Date;
}
