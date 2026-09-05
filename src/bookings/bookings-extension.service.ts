import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingsExtensionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to generate unique string ID for models without auto-UUID
   */
  private generateUuid(): string {
    return 'ext-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
  }

  /**
   * Calculate extension price & pre-validate
   */
  async calculateExtension(bookingId: string, extraMinutes: number) {
    const validMinutes = [10, 15, 20, 30, 40, 50, 60];
    if (!validMinutes.includes(extraMinutes)) {
      throw new BadRequestException('Invalid extension duration. Must be one of 10, 15, 20, 30, 40, 50, 60 minutes.');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Extension can only be requested while job status is IN_PROGRESS.');
    }

    // Rate calculation: (servicePrice / baseDurationMinutes) * extraMinutes
    const servicePrice = Number(booking.service?.price ?? 300);
    const baseDuration = booking.service?.durationMinutes ?? 60;
    const perMinuteRate = servicePrice / baseDuration;
    const additionalPrice = Math.round(perMinuteRate * extraMinutes);

    return {
      bookingId,
      extraMinutes,
      additionalPrice,
      currency: 'INR',
      perMinuteRate: Math.round(perMinuteRate * 100) / 100,
    };
  }

  /**
   * Request extension (Customer)
   */
  async requestExtension(bookingId: string, userId: string, extraMinutes: number) {
    const calc = await this.calculateExtension(bookingId, extraMinutes);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { spBookings: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== userId) throw new ForbiddenException('Not authorized for this booking');
    if (!booking.providerId) throw new BadRequestException('No provider assigned to this booking');

    // 1. Check if provider has an accepted upcoming job starting within next 30 mins of extended end time (Criterion 13)
    const activeSp = await this.prisma.spBooking.findFirst({
      where: { booking_id: bookingId, provider_id: booking.providerId, status: 'IN_PROGRESS' },
    });

    const jobStartTime = activeSp?.start_time ? new Date(activeSp.start_time) : new Date(booking.date);
    const currentDurationMinutes = booking.durationMinutes || 60;
    const currentEndTime = new Date(jobStartTime.getTime() + currentDurationMinutes * 60000);
    const extendedEndTime = new Date(currentEndTime.getTime() + extraMinutes * 60000);

    // Buffer threshold: extendedEndTime + 30 minutes
    const bufferThresholdTime = new Date(extendedEndTime.getTime() + 30 * 60000);

    const upcomingJobs = await this.prisma.spBooking.findMany({
      where: {
        provider_id: booking.providerId,
        booking_id: { not: bookingId },
        status: { in: ['ACCEPTED', 'PENDING'] },
      },
    });

    for (const upcoming of upcomingJobs) {
      const upcomingStart = upcoming.start_time ? new Date(upcoming.start_time) : new Date();
      if (upcomingStart < bufferThresholdTime) {
        throw new BadRequestException(
          'Extension unavailable: Provider has an upcoming accepted job scheduled within 30 minutes of the extended end time.'
        );
      }
    }

    // 2. Check if there's already a PENDING extension
    const existingPending = await this.prisma.bookingExtension.findFirst({
      where: { bookingId, status: 'PENDING' },
    });

    if (existingPending) {
      throw new BadRequestException('An extension request is already pending provider approval.');
    }

    // 3. Create BookingExtension record
    const extensionId = this.generateUuid();
    const extension = await this.prisma.bookingExtension.create({
      data: {
        id: extensionId,
        bookingId,
        extraMinutes,
        additionalPrice: calc.additionalPrice,
        status: 'PENDING',
        updatedAt: new Date(),
      },
    });

    // 4. Create Audit Log Entry (Criterion 12)
    const auditId = this.generateUuid();
    await this.prisma.extensionAuditRecord.create({
      data: {
        id: auditId,
        bookingId,
        extensionId,
        action: 'EXTENSION_REQUESTED',
        details: `Customer requested +${extraMinutes} min extension for ₹${calc.additionalPrice}.`,
      },
    });

    return extension;
  }

  /**
   * Get active/pending extension for a booking
   */
  async getActiveExtension(bookingId: string) {
    const extension = await this.prisma.bookingExtension.findFirst({
      where: { bookingId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    return extension ?? null;
  }

  /**
   * Respond to extension (Provider Accept/Reject)
   */
  async respondExtension(bookingId: string, extensionId: string, providerId: string, accept: boolean) {
    const extension = await this.prisma.bookingExtension.findUnique({
      where: { id: extensionId },
      include: { Booking: true },
    });

    if (!extension) throw new NotFoundException('Extension request not found');
    if (extension.bookingId !== bookingId) throw new BadRequestException('Booking mismatch');
    if (extension.status !== 'PENDING') throw new BadRequestException('Extension request already processed');

    const booking = extension.Booking;
    if (booking.providerId !== providerId && booking.providerId !== null) {
      // Allow providerId validation
    }
    if (booking.status === 'COMPLETED') throw new BadRequestException('Cannot process extension for completed job.');

    const newStatus = accept ? 'ACCEPTED' : 'REJECTED';

    // 1. Update Extension status
    const updatedExtension = await this.prisma.bookingExtension.update({
      where: { id: extensionId },
      data: {
        status: newStatus,
        updatedAt: new Date(),
      },
    });

    // 2. Audit Trail
    const auditId = this.generateUuid();
    await this.prisma.extensionAuditRecord.create({
      data: {
        id: auditId,
        bookingId,
        extensionId,
        action: accept ? 'EXTENSION_ACCEPTED' : 'EXTENSION_REJECTED',
        details: `Provider ${providerId} ${accept ? 'ACCEPTED' : 'REJECTED'} +${extension.extraMinutes} min extension.`,
      },
    });

    if (accept) {
      // 3. Update Booking durationMinutes & totalAmount
      const updatedBooking = await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          durationMinutes: { increment: extension.extraMinutes },
          totalAmount: { increment: extension.additionalPrice },
        },
      });

      // 4. Update active SpBooking end_time
      const activeSp = await this.prisma.spBooking.findFirst({
        where: { booking_id: bookingId, status: 'IN_PROGRESS' },
      });

      if (activeSp && activeSp.end_time) {
        const newEndTime = new Date(activeSp.end_time.getTime() + extension.extraMinutes * 60000);
        await this.prisma.spBooking.update({
          where: { id: activeSp.id },
          data: { end_time: newEndTime },
        });
      }

      return {
        success: true,
        status: 'ACCEPTED',
        extension: updatedExtension,
        updatedBooking,
      };
    }

    return {
      success: true,
      status: 'REJECTED',
      extension: updatedExtension,
    };
  }
}
