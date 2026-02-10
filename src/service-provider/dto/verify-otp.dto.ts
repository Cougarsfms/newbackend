import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
    @ApiProperty({ description: 'Mobile number of the provider', example: '+919876543210' })
    phoneNumber: string;

    @ApiProperty({ description: 'OTP code received', example: '123456' })
    otp: string;
}
