import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { BookingsModule } from './bookings/bookings.module';
import { AdminModule } from './admin/admin.module';
import { ServiceProviderModule } from './service-provider/service-provider.module';
import { CustomerModule } from './customer/customer.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SmsModule } from './sms/sms.module';
import { ConciergeModule } from './concierge/concierge.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    PrismaModule,
    ServicesModule,
    BookingsModule,
    AdminModule,
    ServiceProviderModule,
    CustomerModule,
    NotificationsModule,
    SmsModule,
    ConciergeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
