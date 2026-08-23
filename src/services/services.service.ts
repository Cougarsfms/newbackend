import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async findAllCategories() {
    return this.prisma.serviceCategory.findMany({
      include: { items: true },
    });
  }

  async findAllItems() {
    return this.prisma.serviceItem.findMany();
  }

  async searchItems(query: string) {
    return this.prisma.serviceItem.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' }
      }
    });
  }

  async findFiltered(category?: string, search?: string) {
    const where: any = {};

    if (category) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(category);
      if (isUuid) {
        where.categoryId = category;
      } else {
        where.category = {
          name: { contains: category, mode: 'insensitive' }
        };
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    return this.prisma.serviceItem.findMany({
      where,
      include: { category: true }
    });
  }

  // Seeding helper (dev only)
  async seed() {
    const count = await this.prisma.serviceCategory.count();
    if (count > 0) return;

    await this.prisma.serviceCategory.create({
      data: {
        name: 'Cleaning',
        icon: 'cleaning-services',
        items: {
          create: [
            { name: 'Home Cleaning', description: 'Full home deep cleaning', price: 499 },
            { name: 'Sofa Cleaning', description: 'Shampoo and vacuum', price: 299 },
          ]
        }
      }
    });
    
    await this.prisma.serviceCategory.create({
        data: {
          name: 'Repairs',
          icon: 'plumbing',
          items: {
            create: [
              { name: 'AC Repair', description: 'Gas refill and service', price: 599 },
              { name: 'Plumbing', description: 'Leak fix', price: 199 },
            ]
          }
        }
      });
  }
}
