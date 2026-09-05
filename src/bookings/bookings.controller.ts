import { Controller, Get, Post, Body, Headers, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsExtensionService } from './bookings-extension.service';
import { UsersService } from '../users/users.service';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly extensionService: BookingsExtensionService,
    private readonly usersService: UsersService
  ) { }

  @Post()
  async createBooking(
    @Body('serviceId') serviceId: string,
    @Body('date') date: string,
    @Body('phoneNumber') phoneNumber: string,
    @Body('addressId') addressId: string,
    @Body('type') type: string,
    @Body('durationMinutes') durationMinutes?: number,
    @Body('endDate') endDate?: string,
    @Body('dates') dates?: string[],
    @Body('couponCode') couponCode?: string,
    @Body('purchasedCouponId') purchasedCouponId?: string,
  ) {
    const user = await this.usersService.findOrCreate(phoneNumber);
    return this.bookingsService.createBooking({
      userId: user.id,
      serviceId,
      date: new Date(date),
      addressId,
      bookingType: type,
      durationMinutes,
      endDate: endDate ? new Date(endDate) : undefined,
      dates: dates ? dates.map(d => new Date(d)) : undefined,
      couponCode,
      purchasedCouponId,
    });
  }

  @Post('validate-coupon')
  async validateCoupon(@Body('code') code: string) {
    return this.bookingsService.validateCoupon(code);
  }

  @Get('check-availability')
  async checkAvailability(
    @Query('serviceId') serviceId: string,
    @Query('latitude') latitude: number,
    @Query('longitude') longitude: number,
    @Query('date') date: string,
    @Query('durationMinutes') durationMinutes: number = 60,
    @Query('timezoneOffset') timezoneOffset?: number,
  ) {
    return this.bookingsService.checkAvailability({
      serviceId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      date: date,
      durationMinutes: Number(durationMinutes),
      timezoneOffset: Number(timezoneOffset || 0),
    });
  }

  @Get()
  async getUserBookings(@Query('userId') userId?: string, @Query('phoneNumber') phoneNumber?: string) {
    if (phoneNumber) {
      const user = await this.usersService.findOrCreate(phoneNumber);
      return this.bookingsService.getUserBookings(user.id);
    }
    return this.bookingsService.getUserBookings(userId || '');
  }

  @Get(':id')
  async getBookingDetails(@Param('id') id: string) {
    return this.bookingsService.getBookingDetails(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: any
  ) {
    return this.bookingsService.updateStatus(id, status);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body('reason') reason: string
  ) {
    return this.bookingsService.cancelBooking(id, reason || 'User requested');
  }

  @Post(':id/pay')
  async pay(@Param('id') id: string) {
    return this.bookingsService.payBooking(id);
  }

  @Get(':id/location')
  async getLocation(@Param('id') id: string) {
    return this.bookingsService.getTrackingLocation(id);
  }

  @Post(':id/end')
  async endJob(@Param('id') id: string) {
    return this.bookingsService.endJob(id);
  }

  @Post(':id/rate')
  async submitRating(
    @Param('id') id: string,
    @Body('score') score: number,
    @Body('comment') comment: string
  ) {
    return this.bookingsService.submitRating(id, score, comment);
  }

  // ==================== JOB DURATION EXTENSION ENDPOINTS ====================

  @Post(':id/extend/calculate')
  async calculateExtension(
    @Param('id') id: string,
    @Body('extraMinutes') extraMinutes: number
  ) {
    return this.extensionService.calculateExtension(id, Number(extraMinutes));
  }

  @Post(':id/extend/request')
  async requestExtension(
    @Param('id') id: string,
    @Body('userId') userId: string,
    @Body('phoneNumber') phoneNumber: string,
    @Body('extraMinutes') extraMinutes: number
  ) {
    let effectiveUserId = userId;
    if (!effectiveUserId && phoneNumber) {
      const user = await this.usersService.findOrCreate(phoneNumber);
      effectiveUserId = user.id;
    }
    return this.extensionService.requestExtension(id, effectiveUserId, Number(extraMinutes));
  }

  @Get(':id/extend/active')
  async getActiveExtension(@Param('id') id: string) {
    return this.extensionService.getActiveExtension(id);
  }

  @Post(':id/extend/:extensionId/respond')
  async respondExtension(
    @Param('id') id: string,
    @Param('extensionId') extensionId: string,
    @Body('providerId') providerId: string,
    @Body('accept') accept: boolean
  ) {
    return this.extensionService.respondExtension(id, extensionId, providerId, Boolean(accept));
  }
}
