import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma, Booking } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService
  ) { }

  private async notifyProvider(bookingId: string, title: string, body: string, status: string) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          provider: {
            include: { user: true }
          }
        }
      });

      if (booking?.provider?.user?.fcmToken) {
        await this.notifications.sendPushNotification(
          booking.provider.user.fcmToken,
          title,
          body,
          { bookingId, status, type: 'BOOKING_UPDATE' }
        );
      }
    } catch (e) {
      console.error('[BookingsService] Failed to notify provider:', e);
    }
  }

  private async notifyCustomer(bookingId: string, title: string, body: string, status: string) {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { user: true }
      });

      if (booking?.user?.fcmToken) {
        await this.notifications.sendPushNotification(
          booking.user.fcmToken,
          title,
          body,
          { bookingId, status, type: 'BOOKING_UPDATE' }
        );
      }
    } catch (e) {
      console.error('[BookingsService] Failed to notify customer:', e);
    }
  }

  async createBooking(params: {
    userId: string;
    serviceId: string;
    date: Date;
    addressId: string;
    bookingType: string;
    durationMinutes?: number;
    endDate?: Date;
    dates?: Date[];
    couponCode?: string;
    purchasedCouponId?: string;
  }) {
    const { userId, serviceId, date, addressId, bookingType, durationMinutes = 60, endDate, dates, couponCode, purchasedCouponId } = params;
    console.warn("Create Booking Entry:", { userId, serviceId, date, datesCount: dates?.length, endDate });
    const resolvedAddress = addressId ? await this.prisma.customerAddress.findUnique({ where: { id: addressId } }) : null;


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

    let couponId: string | null = null;
    let discountAmount = 0;
    let finalTotalAmount = Number(service.price);

    if (couponCode) {
      try {
        const coupon = await this.validateCoupon(couponCode);
        discountAmount = (finalTotalAmount * Number(coupon.discountPercent)) / 100;
        if (coupon.maxDiscount && discountAmount > Number(coupon.maxDiscount)) {
          discountAmount = Number(coupon.maxDiscount);
        }
        finalTotalAmount -= discountAmount;
        couponId = coupon.id;

        // Update coupon used count
        await this.prisma.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } }
        });
      } catch (e) {
        console.error("Coupon validation failed:", e.message);
        // Optionally throw error if user explicitly wanted to apply coupon
      }
    }

    let pCouponId: string | null = null;
    const customer = await this.prisma.customer.findFirst({
      where: { user_id: userId }
    });

    let bookingsCount = 1;
    if (dates && dates.length > 0) {
      bookingsCount = dates.length;
    } else if (endDate) {
      bookingsCount = 0;
      let currentDate = new Date(date);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      while (currentDate <= end) {
        bookingsCount++;
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    let pCoupon: any = null;
    if (purchasedCouponId) {
      pCoupon = await this.prisma.purchasedCoupon.findUnique({
        where: { id: purchasedCouponId },
        include: { customer: true }
      });
      if (!pCoupon) {
        throw new Error('Selected package not found.');
      }
      if (pCoupon.customer.user_id !== userId || !pCoupon.isPaid) {
        throw new Error('Invalid or unpaid package.');
      }
      if (pCoupon.remainingJobs < bookingsCount) {
        throw new Error(`Only ${pCoupon.remainingJobs} remaining jobs available in this package, but ${bookingsCount} bookings requested.`);
      }
      if (pCoupon.jobDuration !== durationMinutes) {
        throw new Error(`This package is only valid for ${pCoupon.jobDuration} minute jobs.`);
      }
    } else if (customer) {
      // Auto-apply if customer has any paid purchased coupon with enough remainingJobs
      pCoupon = await this.prisma.purchasedCoupon.findFirst({
        where: {
          customerId: customer.id,
          remainingJobs: { gte: bookingsCount },
          jobDuration: durationMinutes,
          isPaid: true
        },
        include: { customer: true },
        orderBy: { createdAt: 'asc' } // oldest first
      });
    }

    if (pCoupon) {
      finalTotalAmount = 0; // Prepaid / Free!
      pCouponId = pCoupon.id;

      // Decrement remaining jobs by the actual bookingsCount
      await this.prisma.purchasedCoupon.update({
        where: { id: pCoupon.id },
        data: { remainingJobs: { decrement: bookingsCount } },
      });
      console.log(`[BookingsService] Successfully applied package ${pCoupon.id}. Decremented remainingJobs by ${bookingsCount}.`);
    }

    // 1. If specific dates array is provided (Custom Selection)
    if (dates && dates.length > 0) {
      const bookings: any[] = [];
      for (const d of dates) {
        const booking = await this.prisma.booking.create({
          data: {
            userId,
            serviceId,
            date: new Date(d),
            totalAmount: finalTotalAmount,
            status: BookingStatus.PENDING,
            addressId,
            bookingType: 'Scheduled',
            durationMinutes,
            startOTP,
            couponId,
            discountAmount,
            purchasedCouponId: pCouponId,
            paymentStatus: pCouponId ? 'PAID' : 'PENDING',
          },
        });
        bookings.push({
          ...booking,
          address: resolvedAddress
        });
        // Start auto assignment logic asynchronously
        this.assignProviderToBooking(booking.id).catch(e => console.error(e));
      }
      return bookings;
    }

    // 2. If endDate is provided (Range Selection)
    if (endDate) {
      const bookings: any[] = [];
      let currentDate = new Date(date);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      while (currentDate <= end) {
        const booking = await this.prisma.booking.create({
          data: {
            userId,
            serviceId,
            date: new Date(currentDate),
            totalAmount: finalTotalAmount,
            status: BookingStatus.PENDING,
            addressId,
            bookingType: 'Scheduled',
            durationMinutes,
            startOTP,
            couponId,
            discountAmount,
            purchasedCouponId: pCouponId,
            paymentStatus: pCouponId ? 'PAID' : 'PENDING',
          },
        });
        bookings.push({
          ...booking,
          address: resolvedAddress
        });

        // Start assignment for each
        this.assignProviderToBooking(booking.id).catch(e => console.error(e));

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return bookings;
    }

    const booking = await this.prisma.booking.create({
      data: {
        userId,
        serviceId,
        date,
        totalAmount: finalTotalAmount,
        status: BookingStatus.PENDING,
        addressId,
        bookingType,
        durationMinutes,
        startOTP,
        couponId,
        discountAmount,
        purchasedCouponId: pCouponId,
        paymentStatus: pCouponId ? 'PAID' : 'PENDING',
      },
      include: {
        service: true,
        provider: true
      }
    });

    // Start auto assignment logic asynchronously
    this.assignProviderToBooking(booking.id).catch(e => console.error(e));

    return {
      ...booking,
      address: resolvedAddress
    };
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
        status: { in: ['ACTIVE', 'ONBOARDING_COMPLETED', 'PENDING'] }, // Include PENDING for testing
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
      console.log(`[Algorithm] Checking proximity/skill for ${candidates.length} candidates within ${radiusKm}km...`);
      return candidates.filter((provider) => {
        // 1. Skill check
        let hasSkill = false;
        if (targetCategoryId) {
          const hasItem = provider.items.some(item => item.id === booking.serviceId);
          const hasCategory = provider.categories.some(cat => cat.id === targetCategoryId);
          const profile = provider.providerProfiles[0];
          const hasLegacySkill = profile?.services.includes(targetCategoryId);

          hasSkill = hasItem || hasCategory || hasLegacySkill;

          if (!hasSkill) {
            console.log(`[Algorithm] Provider ${provider.name} (${provider.id}) skipped: Missing skill for category ${targetCategoryId}.`);
            return false;
          }
        } else {
          hasSkill = true;
        }

        const avail = provider.availabilities.find((a) => a.is_online);
        if (!avail) {
          console.log(`[Algorithm] Provider ${provider.name} (${provider.id}) skipped: Not online.`);
          return false;
        }

        let providerLat: number | null = avail.currentLatitude;
        let providerLng: number | null = avail.currentLongitude;

        // 2. Proximity check
        let proximityMatched = false;
        let distance = -1;

        if (providerLat !== null && providerLng !== null) {
          distance = this.calculateDistance(customerLat, customerLng, providerLat, providerLng);
          proximityMatched = distance <= radiusKm;
          console.log(`[Algorithm] Provider ${provider.name} (${provider.id}) - Live distance: ${distance.toFixed(2)}km. Radius match: ${proximityMatched}`);
        }

        if (!proximityMatched && provider.providerAddresses.length > 0) {
          for (const addr of provider.providerAddresses) {
            const d = this.calculateDistance(customerLat, customerLng, addr.latitude, addr.longitude);
            if (d <= radiusKm) {
              distance = d;
              proximityMatched = true;
              console.log(`[Algorithm] Provider ${provider.name} (${provider.id}) - Address match: ${d.toFixed(2)}km.`);
              break;
            }
          }
        }

        if (!proximityMatched) {
          console.log(`[Algorithm] Provider ${provider.name} (${provider.id}) skipped: Outside ${radiusKm}km (Found: ${distance > 0 ? distance.toFixed(2) : 'N/A'}km).`);
        }

        return proximityMatched;
      });
    };

    // Strictly find providers within 10KM (as per user requirement)
    let nearbyProviders = findNearby(10);

    if (nearbyProviders.length === 0) {
      console.warn(`[Algorithm] No skilled providers within 10km for booking ${bookingId}. (Customer lat: ${customerLat}, lng: ${customerLng})`);
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

      // Send Push Notification
      if (provider.user?.fcmToken) {
        this.notifications.sendPushNotification(
          provider.user.fcmToken,
          'New Job Request 🛠️',
          `New ${serviceItem?.name || 'job'} available within 10km! Tap to view details.`,
          {
            type: 'NEW_JOB',
            bookingId: booking.id,
            spBookingId: spBooking.id,
            latitude: customerLat,
            longitude: customerLng,
          }
        ).catch(e => console.error('[Notification] Failed to send push:', e));
      }

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
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      include: {
        service: true,
        provider: {
          select: {
            id: true,
            name: true,
            rating: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return Promise.all(
      bookings.map(async (booking) => {
        if (booking.addressId) {
          const address = await this.prisma.customerAddress.findUnique({
            where: { id: booking.addressId }
          });
          return {
            ...booking,
            address
          };
        }
        return booking;
      })
    );
  }

  async getBookingDetails(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        service: true,
        provider: {
          select: {
            id: true,
            name: true,
            rating: true,
          }
        }
      }
    });
    if (!booking) throw new Error('Booking not found');

    if (booking.addressId) {
      const address = await this.prisma.customerAddress.findUnique({
        where: { id: booking.addressId }
      });
      return {
        ...booking,
        address
      };
    }

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

    const result = { id: bookingId, status: 'completed' };

    // Notify Provider (if any)
    await this.notifyProvider(bookingId, 'Job Ended', 'The customer has marked the job as completed.', 'COMPLETED');

    return result;
  }
  async payBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new Error('Booking not found');

    if (booking.paymentStatus === 'PAID') {
      return booking;
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'PAID',
        payments: {
          create: {
            amount: booking.totalAmount,
            status: 'PAID',
            method: 'TEST_PAY'
          }
        }
      },
      include: { provider: true }
    });

    // Notify Provider of payment
    await this.notifyProvider(bookingId, 'Payment Received', 'Payment for your ongoing job has been received.', 'PAID');

    return updated;
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

  async validateCoupon(code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      throw new Error('Invalid coupon code');
    }

    if (!coupon.isActive) {
      throw new Error('Coupon is inactive');
    }

    if (new Date() > coupon.expiryDate) {
      throw new Error('Coupon has expired');
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      throw new Error('Coupon usage limit reached');
    }

    return coupon;
  }

  async submitRating(bookingId: string, score: number, comment: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { spBookings: true }
    });

    if (!booking) throw new Error('Booking not found');
    if (!booking.providerId) throw new Error('No provider assigned to this booking');

    const spBooking = booking.spBookings.find(sp => sp.status === 'COMPLETED' || sp.status === 'IN_PROGRESS');
    if (!spBooking) throw new Error('Completed job record not found');

    const rating = await this.prisma.rating.create({
      data: {
        provider_id: booking.providerId,
        booking_id: spBooking.id,
        score,
        comment: comment || '',
      }
    });

    // Update the average rating on the ServiceProvider record (cached)
    const allRatings = await this.prisma.rating.findMany({
      where: { provider_id: booking.providerId }
    });
    const avg = allRatings.reduce((sum, r) => sum + r.score, 0) / allRatings.length;

    await this.prisma.serviceProvider.update({
      where: { id: booking.providerId },
      data: { rating: Math.round(avg) }
    });

    return rating;
  }

  async checkAvailability(params: {
    serviceId: string;
    latitude: number;
    longitude: number;
    date: string;
    durationMinutes: number;
    timezoneOffset: number;
  }): Promise<Record<string, boolean>> {
    const { serviceId, latitude, longitude, date, durationMinutes, timezoneOffset } = params;

    // Normalize date to YYYY-MM-DD
    let dateStr = date;
    if (date.includes('T')) {
      const utcDate = new Date(date);
      const localTime = new Date(utcDate.getTime() - timezoneOffset * 60 * 1000);
      const year = localTime.getUTCFullYear();
      const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
      const day = String(localTime.getUTCDate()).padStart(2, '0');
      dateStr = `${year}-${month}-${day}`;
    }

    // 1. Fetch nearby skilled providers (10 km radius)
    const serviceItem = await this.prisma.serviceItem.findUnique({ where: { id: serviceId } });
    if (!serviceItem) throw new Error('Service not found');
    const targetCategoryId = serviceItem.categoryId;

    const candidates = await this.prisma.serviceProvider.findMany({
      where: {
        status: { in: ['ACTIVE', 'ONBOARDING_COMPLETED', 'PENDING'] },
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

    const nearbyProviders = candidates.filter((provider) => {
      // Skill check
      let hasSkill = false;
      const hasItem = provider.items.some(item => item.id === serviceId);
      const hasCategory = provider.categories.some(cat => cat.id === targetCategoryId);
      const profile = provider.providerProfiles[0];
      const hasLegacySkill = profile?.services.includes(targetCategoryId);

      hasSkill = hasItem || hasCategory || hasLegacySkill;
      if (!hasSkill) return false;

      const avail = provider.availabilities.find((a) => a.is_online);
      if (!avail) return false;

      let providerLat: number | null = avail.currentLatitude;
      let providerLng: number | null = avail.currentLongitude;

      let proximityMatched = false;
      if (providerLat !== null && providerLng !== null) {
        const d = this.calculateDistance(latitude, longitude, providerLat, providerLng);
        proximityMatched = d <= 10;
      }

      if (!proximityMatched && provider.providerAddresses.length > 0) {
        for (const addr of provider.providerAddresses) {
          const d = this.calculateDistance(latitude, longitude, addr.latitude, addr.longitude);
          if (d <= 10) {
            proximityMatched = true;
            break;
          }
        }
      }

      return proximityMatched;
    });

    const nearbyProviderIds = nearbyProviders.map(p => p.id);
    const availabilityMap: Record<string, boolean> = {};

    const timeSlots = [
      '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
      '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
      '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
      '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM'
    ];

    if (nearbyProviderIds.length === 0) {
      // If no providers are nearby, all slots are unavailable
      for (const slot of timeSlots) {
        availabilityMap[slot] = false;
      }
      return availabilityMap;
    }

    // Fetch all active bookings for nearby providers on the day of interest in absolute UTC
    const [year, month, day] = dateStr.split('-').map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, timezoneOffset, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 0, 1439 + timezoneOffset, 59, 999));

    const activeBookings = await this.prisma.booking.findMany({
      where: {
        providerId: { in: nearbyProviderIds },
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
        date: {
          gte: new Date(startOfDay.getTime() - 12 * 60 * 60 * 1000),
          lte: new Date(endOfDay.getTime() + 12 * 60 * 60 * 1000)
        }
      }
    });

    const parseSlotTime = (slotStr: string): { start: Date; end: Date } => {
      const [time, period] = slotStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;

      const localMinutes = hours * 60 + minutes;
      const utcMinutes = localMinutes + timezoneOffset;

      const start = new Date(Date.UTC(year, month - 1, day, 0, utcMinutes, 0, 0));
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

      return { start, end };
    };

    for (const slot of timeSlots) {
      const { start: slotStart, end: slotEnd } = parseSlotTime(slot);

      // Check if at least one nearby provider is available
      const hasAvailableProvider = nearbyProviderIds.some(providerId => {
        const bookingsForProvider = activeBookings.filter(b => b.providerId === providerId);

        // A provider is busy if they have an active booking overlapping with the slot,
        // unless the booking is scheduled to finish within the first 20 minutes after slotStart
        const isBusy = bookingsForProvider.some(b => {
          const existingStart = new Date(b.date);
          const existingEnd = new Date(existingStart.getTime() + b.durationMinutes * 60 * 1000);

          const overlaps = existingStart < slotEnd && existingEnd > slotStart;
          const isOver20MinOverlap = existingEnd > new Date(slotStart.getTime() + 20 * 60 * 1000);

          return overlaps && isOver20MinOverlap;
        });

        return !isBusy;
      });

      availabilityMap[slot] = hasAvailableProvider;
    }

    return availabilityMap;
  }
}
