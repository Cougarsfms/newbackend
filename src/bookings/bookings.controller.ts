import { Controller, Get, Post, Body, Headers, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { UsersService } from '../users/users.service';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
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
  ) {
    // Mock user lookup/create from token logic since we don't have full JWT middleware yet
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
    });
  }

  @Get('user/:phone')
  async getUserBookings(@Param('phone') phone: string) {
    const user = await this.usersService.findOneByPhone(phone);
    if (!user) return [];
    return this.bookingsService.getUserBookings(user.id);
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
}
