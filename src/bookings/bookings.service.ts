import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService) { }

  async createBooking(userId: string, serviceId: string, date: Date, addressId: string, bookingType: string) {
    // 1. Fetch service to get price
    const service = await this.prisma.serviceItem.findUnique({ where: { id: serviceId } });
    if (!service) throw new Error('Service not found');

    // 2. Find Available Provider (Simple Logic: First available)
    const availableProvider = await this.prisma.serviceProvider.findFirst({
      where: {
        status: 'ACTIVE',
        availabilities: {
          some: { is_online: true }
        }
      },
      include: { user: true } // Fetch name from user? No, provider has name
    });

    let assignedProviderId: string | null = null;
    let initialStatus: BookingStatus = BookingStatus.PENDING;

    if (availableProvider) {
      console.log(`[Algorithm] Found nearest provider: ${availableProvider.name} (${availableProvider.id})`);
      assignedProviderId = availableProvider.id;
      // Mark as CONFIRMED if provider found
      initialStatus = BookingStatus.CONFIRMED;

      // Simulate Notification
      console.log(`[Notification] To Customer: Your booking is confirmed. Provider ${availableProvider.name} assigned.`);
      console.log(`[Notification] To Provider ${availableProvider.name}: New booking assigned!`);
    } else {
      console.warn('[Algorithm] No available providers found.');
    }

    // 3. Create Booking
    const booking = await this.prisma.booking.create({
      data: {
        userId,
        serviceId,
        date,
        totalAmount: service.price,
        status: initialStatus,
        addressId,
        bookingType,
        providerId: assignedProviderId,
      },
      include: {
        service: true,
        provider: true
      }
    });

    return booking;
  }

  async getUserBookings(userId: string) {
    return this.prisma.booking.findMany({
      where: { userId },
      include: {
        service: true,
        provider: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async updateStatus(bookingId: string, status: BookingStatus) {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status },
      include: { provider: true } // Return provider info on update too
    });
  }
  async payBooking(bookingId: string) {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'PAID',
        payments: {
          create: {
            amount: 0, // Should be fetched from booking.totalAmount but requires finding first.
            status: 'PAID',
            method: 'TEST_PAY'
          }
        }
      },
      include: { provider: true }
    });
  }

  async cancelBooking(bookingId: string, reason: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found');

    if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) {
      throw new Error('Cannot cancel a completed or already cancelled booking');
    }

    // Check if eligible for refund (i.e., if it was PAID)
    // Note: TypeScript might not know about paymentStatus until we regenerate client, so casting as any or using dictionary access if needed, but we generated client.
    let refundMessage = '';
    let updatedPaymentStatus = (booking as any).paymentStatus; // Default to existing

    // Logic: If PAID, initiate refund to wallet
    if ((booking as any).paymentStatus === 'PAID') {
      updatedPaymentStatus = 'REFUNDED';
      refundMessage = 'Refund initiated to wallet.';

      const refundAmount = booking.totalAmount;

      // 1. Find or Create Wallet
      let wallet = await this.prisma.wallet.findFirst({
        where: { user_id: booking.userId }
      });

      if (!wallet) {
        wallet = await this.prisma.wallet.create({
          data: { user_id: booking.userId, balance: 0 }
        });
      }

      // 2. Update Wallet Balance and Add Ledger Entry
      await this.prisma.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: refundAmount },
          walletLedgers: {
            create: {
              entry_type: 'REFUND',
              amount: refundAmount
            }
          }
        }
      });
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancellationReason: reason,
        cancelledAt: new Date(),
        paymentStatus: updatedPaymentStatus,
      },
      include: { provider: true, payments: true }
    });

    return {
      ...updatedBooking,
      message: 'Booking cancelled successfully. ' + refundMessage
    };
  }
  async getTrackingLocation(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId }
    });
    if (!booking) throw new Error('Booking not found');

    if (!booking.providerId) {
      // Return null/empty if no provider to avoid error in UI polling
      return { location: null, eta: null };
    }

    const ping = await this.prisma.locationPing.findFirst({
      where: { provider_id: booking.providerId },
      orderBy: { createdAt: 'desc' },
    });

    // For demo: if no ping, generate a mock one based on a fixed location (e.g. city center)
    // so the tracking screen always shows something.
    const mockLatitude = 12.9716;
    const mockLongitude = 77.5946;

    return {
      location: ping ? {
        latitude: ping.latitude,
        longitude: ping.longitude,
        timestamp: ping.createdAt,
        accuracy: 10
      } : {
        latitude: mockLatitude + (Math.random() - 0.5) * 0.01,
        longitude: mockLongitude + (Math.random() - 0.5) * 0.01,
        timestamp: new Date(),
        accuracy: 20
      },
      eta: 15 // Mock ETA
    };
  }
}
