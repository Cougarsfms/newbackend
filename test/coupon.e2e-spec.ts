import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Coupon Management (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a coupon via POST /api/admin/coupons', async () => {
    const couponData = {
      code: 'E2ETEST' + Math.floor(Math.random() * 1000),
      discountPercent: 15,
      maxDiscount: 200,
      expiryDate: '2026-12-31T23:59:59.000Z',
      isActive: true,
      usageLimit: 50,
    };

    const response = await request(app.getHttpServer())
      .post('/api/admin/coupons')
      .send(couponData)
      .expect(201);

    expect(response.body).toMatchObject({
      code: couponData.code.toUpperCase(),
      discountPercent: couponData.discountPercent.toString(),
      maxDiscount: couponData.maxDiscount.toString(),
      isActive: true,
      usageLimit: 50,
    });
    expect(response.body.id).toBeDefined();
  });

  it('should return 400 for invalid coupon data', async () => {
    const invalidData = {
      code: '', // Empty code
      discountPercent: 150, // More than 100
      expiryDate: 'invalid-date',
    };

    await request(app.getHttpServer())
      .post('/api/admin/coupons')
      .send(invalidData)
      .expect(400);
  });

  it('should get all coupons via GET /api/admin/coupons', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/admin/coupons')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});
