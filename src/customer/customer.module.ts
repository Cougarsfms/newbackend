import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { RazorpayService } from './razorpay.service';
import { SmsModule } from '../sms/sms.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [SmsModule, BookingsModule],
  controllers: [CustomerController],
  providers: [CustomerService, RazorpayService],
  exports: [CustomerService, RazorpayService]
})
export class CustomerModule {}
