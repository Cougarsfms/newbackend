import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors();

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('DailyChores Admin API')
    .setDescription('Admin Panel API for DailyChores - Manpower Management System')
    .setVersion('1.0')
    .addTag('Admin', 'Admin panel endpoints for user, booking, and system management')
    .addTag('User Management', 'Endpoints for managing users and their status')
    .addTag('KYC & Verification', 'Endpoints for KYC document review and verification')
    .addTag('Booking Management', 'Endpoints for managing bookings and their status')
    .addTag('Pricing & Commission', 'Endpoints for pricing rules and surge management')
    .addTag('Finance & Settlements', 'Endpoints for wallet and settlement management')
    .addTag('Analytics & Reporting', 'Endpoints for analytics and reporting data')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
