import { ApiProperty } from '@nestjs/swagger';

export class AddAddressDto {
    @ApiProperty({ description: 'Full address string', example: '123 Main St, Mumbai' })
    address: string;

    @ApiProperty({ description: 'Address Label (Home, Work)', example: 'Home' })
    label: string;

    @ApiProperty({ description: 'Latitude', example: 19.0760 })
    latitude: number;

    @ApiProperty({ description: 'Longitude', example: 72.8777 })
    longitude: number;

    @ApiProperty({ description: 'City', example: 'Mumbai' })
    city: string;

    @ApiProperty({ description: 'State', example: 'Maharashtra' })
    state: string;

    @ApiProperty({ description: 'Zipcode', example: '400001' })
    zipcode: string;

    @ApiProperty({ description: 'Country', example: 'India' })
    country: string;
}
