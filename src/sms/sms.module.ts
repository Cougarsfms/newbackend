import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { OtpService } from './otp.service';

@Module({
  providers: [SmsService, OtpService],
  exports: [SmsService, OtpService],
})
export class SmsModule {}
