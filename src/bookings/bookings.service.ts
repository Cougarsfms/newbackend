import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService) {}

  async createBooking(userId: string, serviceId: string, date: Date) {
    // 1. Fetch service to get price
    const service = await this.prisma.serviceItem.findUnique({ where: { id: serviceId } });
    if (!service) throw new Error('Service not found');

    // 2. Create Booking
    return this.prisma.booking.create({
      data: {
        userId,
        serviceId,
        date,
        totalAmount: service.price,
        status: BookingStatus.PENDING,
      },
      include: { service: true }
    });
  }

  async getUserBookings(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      include: { service: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateStatus(bookingId: string, status: BookingStatus) {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status }
    });
  }
}
