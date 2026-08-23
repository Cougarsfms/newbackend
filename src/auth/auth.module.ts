import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TlAuthController } from './tl-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [UsersModule, PrismaModule, SmsModule],
  controllers: [AuthController, TlAuthController],
  providers: [AuthService, AdminAuthService],
  exports: [AuthService],
})
export class AuthModule {}

