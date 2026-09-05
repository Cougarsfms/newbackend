import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ limit: '15mb', extended: true }));

  app.setGlobalPrefix('api');
  app.enableCors();

  // Ensure uploads directory exists and configure static assets serving
  const uploadDir = join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
  });

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

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${process.env.PORT ?? 3000}/api`);
}
bootstrap();
