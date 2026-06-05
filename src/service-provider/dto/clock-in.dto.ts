import { ApiProperty } from '@nestjs/swagger';

export class ClockInDto {
    @ApiProperty({
        description: 'ID of the shift assignment',
        example: 'shift-assignment-uuid-1234',
    })
    shift_assignment_id: string;

    @ApiProperty({
        description: 'Current GPS Latitude of the provider',
        example: 19.0760,
    })
    latitude: number;

    @ApiProperty({
        description: 'Current GPS Longitude of the provider',
        example: 72.8777,
    })
    longitude: number;

    @ApiProperty({
        description: 'Unique hardware or mobile device ID',
        example: 'device-id-xyz-9876',
    })
    device_id: string;
}
