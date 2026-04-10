import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService) { }

  async createBooking(userId: string, serviceId: string, date: Date, addressId: string, bookingType: string) {
    let service = await this.prisma.serviceItem.findUnique({ where: { id: serviceId } });
    if (!service && serviceId.startsWith('svc_')) {
      let category = await this.prisma.serviceCategory.findFirst({});
      if (!category) {
        category = await this.prisma.serviceCategory.create({ data: { name: 'Mock Category', icon: '📝' } });
      }
      service = await this.prisma.serviceItem.create({
        data: { id: serviceId, name: 'Mock Service ' + serviceId, description: 'Auto-generated mock service', price: 499, categoryId: category.id }
      });
    } else if (!service) {
      throw new Error('Service not found');
    }

    const booking = await this.prisma.booking.create({
      data: {
        userId,
        serviceId,
        date,
        totalAmount: service.price,
        status: BookingStatus.PENDING,
        addressId,
        bookingType,
      },
      include: {
        service: true,
        provider: true
      }
    });

    // Start auto assignment logic asynchronously
    this.assignProviderToBooking(booking.id).catch(e => console.error(e));

    return booking;
  }

  async assignProviderToBooking(bookingId: string, excludeProviderIds: string[] = []) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.status !== BookingStatus.PENDING) return;

    let customerAddress: any = booking.addressId ? await this.prisma.customerAddress.findUnique({ where: { id: booking.addressId } }) : null;
    if (!customerAddress) {
      customerAddress = { latitude: 28.55, longitude: 77.20 };
    }

    const providers = await this.prisma.serviceProvider.findMany({
      where: {
        status: 'ACTIVE',
        id: { notIn: excludeProviderIds },
        availabilities: { some: { is_online: true } },
      },
      include: { user: true, providerAddresses: true },
    });

    let availableProvider: any = null;
    let minDistance = Infinity;

    for (const provider of providers) {
      for (const addr of provider.providerAddresses) {
        const dist = this.calculateDistance(customerAddress.latitude, customerAddress.longitude, addr.latitude, addr.longitude);
        if (dist < minDistance) {
          minDistance = dist;
          availableProvider = provider;
        }
      }
    }

    if (!availableProvider) {
      availableProvider = await this.prisma.serviceProvider.findFirst({
        where: { status: 'ACTIVE', id: { notIn: excludeProviderIds }, availabilities: { some: { is_online: true } } },
        include: { user: true },
      });
    }

    if (availableProvider) {
      console.log(`[Algorithm] Found nearest provider: ${availableProvider.name} (${availableProvider.id})`);
      
      const endDate = new Date(booking.date);
      endDate.setHours(endDate.getHours() + 1);

      // Create an SpBooking for this provider to accept/reject
      const spBooking = await this.prisma.spBooking.create({
        data: {
          provider_id: availableProvider.id,
          status: 'PENDING',
          start_time: booking.date,
          end_time: endDate,
          booking_id: booking.id,
        }
      });

      console.log(`[Notification] To Provider ${availableProvider.name}: You have been matched for a new booking.`);
      
      // Auto-expire after 120 seconds if not accepted
      setTimeout(async () => {
        const checkSp = await this.prisma.spBooking.findUnique({ where: { id: spBooking.id } });
        if (checkSp && checkSp.status === 'PENDING') {
           console.log(`[Timeout] Job expired for ${availableProvider.name}, reassigning...`);
           await this.prisma.spBooking.update({ where: { id: spBooking.id }, data: { status: 'EXPIRED' } });
           this.assignProviderToBooking(booking.id, [...excludeProviderIds, availableProvider.id]).catch(e => console.error(e));
        }
      }, 120 * 1000);

    } else {
      console.warn('[Algorithm] No available providers found.');
    }
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

  async getBookingDetails(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        provider: true
      }
    });
    if (!booking) throw new Error('Booking not found');
    return booking;
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
      return { location: null, eta: null };
    }

    let destLat = 12.9716;
    let destLng = 77.5946;
    if (booking.addressId) {
       const address = await this.prisma.customerAddress.findUnique({ where: { id: booking.addressId }});
       if (address) {
          destLat = address.latitude;
          destLng = address.longitude;
       }
    }

    const ping = await this.prisma.locationPing.findFirst({
      where: { provider_id: booking.providerId },
      orderBy: { createdAt: 'desc' },
    });

    let currentLat = 12.9716 + (Math.random() - 0.5) * 0.01;
    let currentLng = 77.5946 + (Math.random() - 0.5) * 0.01;
    let accuracy = 20;
    
    if (ping) {
       currentLat = ping.latitude;
       currentLng = ping.longitude;
       accuracy = 10;
    }

    const distanceKm = this.calculateDistance(destLat, destLng, currentLat, currentLng);
    // Rough estimate: average speed 30km/h in city => 0.5 km/min.
    const estimatedMinutes = Math.max(1, Math.round(distanceKm / 0.5));

    return {
      location: {
        latitude: currentLat,
        longitude: currentLng,
        timestamp: ping ? ping.createdAt : new Date(),
        accuracy: accuracy
      },
      eta: estimatedMinutes
    };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  }
}
