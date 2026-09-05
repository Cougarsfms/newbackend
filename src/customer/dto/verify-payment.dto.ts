import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({ description: 'Razorpay Order ID' })
  @IsNotEmpty()
  @IsString()
  razorpayOrderId: string;

  @ApiProperty({ description: 'Razorpay Payment ID' })
  @IsNotEmpty()
  @IsString()
  razorpayPaymentId: string;

  @ApiProperty({ description: 'Razorpay Signature' })
  @IsNotEmpty()
  @IsString()
  razorpaySignature: string;

  @ApiProperty({ description: 'Booking ID' })
  @IsNotEmpty()
  @IsString()
  bookingId: string;
}
