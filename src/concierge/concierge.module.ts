import { Module } from '@nestjs/common';
import { ConciergeController } from './concierge.controller';
import { ConciergeService } from './concierge.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { ServicesModule } from '../services/services.module';
import { CustomerModule } from '../customer/customer.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PrismaModule,
    BookingsModule,
    ServicesModule,
    CustomerModule,
    UsersModule,
  ],
  controllers: [ConciergeController],
  providers: [ConciergeService],
})
export class ConciergeModule {}
