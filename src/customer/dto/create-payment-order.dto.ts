import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsNumber } from 'class-validator';

export class CreatePaymentOrderDto {
  @ApiProperty({ description: 'Service Item ID' })
  @IsNotEmpty()
  @IsString()
  serviceId: string;

  @ApiProperty({ description: 'Scheduled date ISO string' })
  @IsNotEmpty()
  @IsString()
  scheduledAt: string;

  @ApiProperty({ description: 'Customer Address ID', required: false })
  @IsOptional()
  @IsString()
  addressId?: string;

  @ApiProperty({ description: 'Coupon ID if applied', required: false })
  @IsOptional()
  @IsString()
  couponId?: string;

  @ApiProperty({ description: 'Purchased Coupon ID if using package', required: false })
  @IsOptional()
  @IsString()
  purchasedCouponId?: string;

  @ApiProperty({ description: 'Booking Type', required: false, default: 'Instant' })
  @IsOptional()
  @IsString()
  bookingType?: string;
}
