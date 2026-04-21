import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma } from '@prisma/client';

@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService) { }
  debugger;
  async createBooking(userId: string, serviceId: string, date: Date, addressId: string, bookingType: string) {
    console.warn(serviceId, "service id ###############");
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

    const startOTP = Math.floor(1000 + Math.random() * 9000).toString();

    const booking = await this.prisma.booking.create({
      data: {
        userId,
        serviceId,
        date,
        totalAmount: service.price,
        status: BookingStatus.PENDING,
        addressId,
        bookingType,
        startOTP,
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

    let customerLat = 28.55;
    let customerLng = 77.20;
    if (booking.addressId) {
      const custAddr = await this.prisma.customerAddress.findUnique({ where: { id: booking.addressId } });
      if (custAddr) {
        console.log(custAddr, "cust addr ############### 1111111");
        customerLat = custAddr.latitude;
        customerLng = custAddr.longitude;
      }
    }

    const RADIUS_KM = 10;

    const serviceItem = await this.prisma.serviceItem.findUnique({ where: { id: booking.serviceId } });
    const targetCategoryId = serviceItem?.categoryId;

    // Get all online providers not already excluded, including their skills (profiles)
    const candidates = await this.prisma.serviceProvider.findMany({
      where: {
        status: { in: ['ACTIVE', 'ONBOARDING_COMPLETED'] }, // Be more inclusive during testing/rollout
        id: { notIn: excludeProviderIds },
        availabilities: { some: { is_online: true } },
      },
      include: {
        user: true,
        availabilities: true,
        providerAddresses: true,
        providerProfiles: true,
        categories: true,
        items: true,
      },
    });

    console.log(`[Algorithm] Found ${candidates.length} online candidate(s) globally for booking ${bookingId}`);

    const endTime = new Date(booking.date);
    endTime.setMinutes(endTime.getMinutes() + 5); // 5-minute window to accept

    const findNearby = (radiusKm: number) => {
      return candidates.filter((provider) => {
        // 1. Skill check
        if (targetCategoryId) {
          // Check explicit item mapping first
          const hasItem = provider.items.some(item => item.id === booking.serviceId);
          if (hasItem) return true;

          // Check explicit category mapping
          const hasCategory = provider.categories.some(cat => cat.id === targetCategoryId);
          if (hasCategory) return true;

          // Fallback: Check older Profile services string array
          const profile = provider.providerProfiles[0];
          const hasSkill = profile?.services.includes(targetCategoryId);
          if (!hasSkill) {
            console.log(`[Algorithm] Provider ${provider.name} skipped: Missing skill for category ${targetCategoryId}.`);
            return false;
          }
        }

        const avail = provider.availabilities.find((a) => a.is_online);
        if (!avail) return false;

        let providerLat: number | null = avail.currentLatitude;
        let providerLng: number | null = avail.currentLongitude;

        // 2. Proximity check
        // Prefer live GPS ping on availability record
        if (providerLat !== null && providerLng !== null) {
          const dist = this.calculateDistance(customerLat, customerLng, providerLat, providerLng);
          const matched = dist <= radiusKm;
          console.log(`[Algorithm] Provider ${provider.name} live distance: ${dist.toFixed(2)}km (lat: ${providerLat}, lng: ${providerLng}). Radius ${radiusKm}km match: ${matched}`);
          return matched;
        }

        // Fall back to the nearest saved provider address
        if (provider.providerAddresses.length > 0) {
          for (const addr of provider.providerAddresses) {
            const dist = this.calculateDistance(customerLat, customerLng, addr.latitude, addr.longitude);
            if (dist <= radiusKm) {
              console.log(`[Algorithm] Provider ${provider.name} address match: ${dist.toFixed(2)}km.`);
              return true;
            }
          }
        }

        console.log(`[Algorithm] Provider ${provider.name} skipped: No coordinates within ${radiusKm}km of customer (lat: ${customerLat}, lng: ${customerLng}).`);
        return false;
      });
    };

    let nearbyProviders = findNearby(10);

    // Rollout Fallback: If no providers found in 10km, try 50km
    if (nearbyProviders.length === 0) {
      console.log(`[Algorithm] No providers in 10km. Trying 50km fallback...`);
      nearbyProviders = findNearby(50);
    }

    if (nearbyProviders.length === 0) {
      console.warn(`[Algorithm] No skilled providers within 50km for booking ${bookingId}. (Customer lat: ${customerLat}, lng: ${customerLng})`);
      return;
    }

    console.log(`[Algorithm] Broadcasting to ${nearbyProviders.length} provider(s) within ${RADIUS_KM}km.`);

    // Create a pending SpBooking for EVERY nearby provider simultaneously
    for (const provider of nearbyProviders) {
      const spBooking = await this.prisma.spBooking.create({
        data: {
          provider_id: provider.id,
          status: 'PENDING',
          start_time: booking.date,
          end_time: endTime,
          booking_id: booking.id,
        },
      });

      console.log(`[Notification] Sent job notification to Provider ${provider.name} (${provider.id})`);

      // Auto-expire this provider's notification after 120s if not acted on
      setTimeout(async () => {
        try {
          const check = await this.prisma.spBooking.findUnique({ where: { id: spBooking.id } });
          if (check && check.status === 'PENDING') {
            await this.prisma.spBooking.update({ where: { id: spBooking.id }, data: { status: 'EXPIRED' } });
            console.log(`[Timeout] Job expired for Provider ${provider.name}.`);
          }
        } catch (e) {
          console.error('[Timeout] Error expiring spBooking:', e);
        }
      }, 120 * 1000);
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

  async endJob(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found');

    if (booking.status === BookingStatus.COMPLETED || booking.status === BookingStatus.CANCELLED) {
      throw new Error('Job already ended');
    }

    const now = new Date();

    // Update parent booking
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.COMPLETED,
        jobEndedAt: now,
      }
    });

    // Update any linked SpBooking
    await this.prisma.spBooking.updateMany({
      where: {
        booking_id: bookingId,
        status: { in: ['IN_PROGRESS', 'ACCEPTED', 'ARRIVED'] }
      },
      data: {
        status: 'COMPLETED',
        end_time: now,
      }
    });

    return { id: bookingId, status: 'completed' };
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
      const address = await this.prisma.customerAddress.findUnique({ where: { id: booking.addressId } });
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
