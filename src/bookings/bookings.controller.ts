import { Controller, Get, Post, Body, Headers, Param, ParseUUIDPipe } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { UsersService } from '../users/users.service';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly usersService: UsersService
  ) {}

  @Post()
  async createBooking(
    @Body('serviceId') serviceId: string,
    @Body('date') date: string,
    @Body('phoneNumber') phoneNumber: string // In real app, extracting from JWT
  ) {
    // Mock user lookup/create from token logic since we don't have full JWT middleware yet
    const user = await this.usersService.findOrCreate(phoneNumber);
    return this.bookingsService.createBooking(user.id, serviceId, new Date(date));
  }

  @Get('user/:phone')
  async getUserBookings(@Param('phone') phone: string) {
    const user = await this.usersService.findOneByPhone(phone);
    if (!user) return [];
    return this.bookingsService.getUserBookings(user.id);
  }
}
