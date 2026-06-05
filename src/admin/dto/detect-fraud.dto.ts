import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsNumber, Min, Max, IsBoolean, IsOptional } from 'class-validator';

export class DetectFraudDto {
    @ApiProperty({
        example: 'provider-uuid-1234',
        description: 'Service Provider ID to verify',
    })
    @IsString()
    @IsNotEmpty()
    providerId: string;

    @ApiProperty({
        example: 19.0760,
        description: 'Current GPS Latitude of the provider',
    })
    @IsNumber()
    @IsNotEmpty()
    @Min(-90)
    @Max(90)
    latitude: number;

    @ApiProperty({
        example: 72.8777,
        description: 'Current GPS Longitude of the provider',
    })
    @IsNumber()
    @IsNotEmpty()
    @Min(-180)
    @Max(180)
    longitude: number;

    @ApiProperty({
        example: 'device-id-xyz-9876',
        description: 'Unique mobile device ID',
    })
    @IsString()
    @IsNotEmpty()
    deviceId: string;

    @ApiProperty({
        example: false,
        description: 'Flag indicating if the mobile client detected mock location usage',
        required: false,
        default: false
    })
    @IsBoolean()
    @IsOptional()
    isMockLocation?: boolean;
}
