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

  async searchItems(query: string) {
    return this.prisma.serviceItem.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' }
      }
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
