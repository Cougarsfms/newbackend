import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ServiceProviderController } from './service-provider.controller';
import { ServiceProviderService } from './service-provider.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'gyors_secret_123',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [ServiceProviderController],
  providers: [ServiceProviderService]
})
export class ServiceProviderModule {}
