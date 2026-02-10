import { Module } from '@nestjs/common';
import { ServiceProviderController } from './service-provider.controller';
import { ServiceProviderService } from './service-provider.service';

@Module({
  controllers: [ServiceProviderController],
  providers: [ServiceProviderService]
})
export class ServiceProviderModule {}
