import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ServiceProviderController } from './service-provider.controller';
import { ServiceProviderService } from './service-provider.service';
import { TlDashboardController } from './tl-dashboard.controller';
import { TlDashboardService } from './tl-dashboard.service';
import { TlProviderController } from './tl-provider.controller';
import { TlShiftController } from './tl-shift.controller';
import { TlAttendanceController } from './tl-attendance.controller';
import { TlTrackingController } from './tl-tracking.controller';
import { TlLeaveController } from './tl-leave.controller';
import { TlEscalationController } from './tl-escalation.controller';
import { TlPerformanceController } from './tl-performance.controller';
import { TlBroadcastController } from './tl-broadcast.controller';
import { TlChatController } from './tl-chat.controller';
import { TlNotificationController } from './tl-notification.controller';
import { TlReportController } from './tl-report.controller';
import { TlInventoryController } from './tl-inventory.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SmsModule } from '../sms/sms.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'gyors_secret_123',
      signOptions: { expiresIn: '30d' },
    }),
    NotificationsModule,
    SmsModule,
    AuthModule,
  ],
  controllers: [ServiceProviderController, TlDashboardController, TlProviderController, TlShiftController, TlAttendanceController, TlTrackingController, TlLeaveController, TlEscalationController, TlPerformanceController, TlBroadcastController, TlChatController, TlNotificationController, TlReportController, TlInventoryController],
  providers: [ServiceProviderService, TlDashboardService]
})
export class ServiceProviderModule {}
