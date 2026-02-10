import { ApiProperty } from '@nestjs/swagger';

export class LocationUpdateDto {
    @ApiProperty({ description: 'Latitude', example: 19.0760 })
    latitude: number;

    @ApiProperty({ description: 'Longitude', example: 72.8777 })
    longitude: number;
}
