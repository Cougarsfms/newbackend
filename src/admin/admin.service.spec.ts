import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: PrismaService;

  const mockPrismaService = {
    coupon: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCoupon', () => {
    it('should create a coupon successfully', async () => {
      const createCouponDto: CreateCouponDto = {
        code: 'TEST20',
        discountPercent: 20,
        maxDiscount: 100,
        expiryDate: '2026-12-31T23:59:59Z',
        isActive: true,
        usageLimit: 100,
      };

      const expectedResult = {
        id: '1',
        ...createCouponDto,
        code: 'TEST20',
        expiryDate: new Date(createCouponDto.expiryDate),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.coupon.create.mockResolvedValue(expectedResult);

      const result = await service.createCoupon(createCouponDto);

      expect(prisma.coupon.create).toHaveBeenCalledWith({
        data: {
          code: 'TEST20',
          discountPercent: 20,
          maxDiscount: 100,
          expiryDate: new Date(createCouponDto.expiryDate),
          isActive: true,
          usageLimit: 100,
        },
      });
      expect(result).toEqual(expectedResult);
    });

    it('should convert code to uppercase', async () => {
        const createCouponDto: CreateCouponDto = {
          code: 'lowercode',
          discountPercent: 10,
          expiryDate: '2026-12-31T23:59:59Z',
        };
  
        const expectedResult = {
          id: '2',
          ...createCouponDto,
          code: 'LOWERCODE',
          expiryDate: new Date(createCouponDto.expiryDate),
          isActive: true,
          usageLimit: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
  
        mockPrismaService.coupon.create.mockResolvedValue(expectedResult);
  
        const result = await service.createCoupon(createCouponDto);
  
        expect(prisma.coupon.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            code: 'LOWERCODE',
          }),
        });
        expect(result.code).toBe('LOWERCODE');
      });
  });
});
