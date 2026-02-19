import { Controller, Post, Body, Get, Put, Param, Query, Delete, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { AddAddressDto } from './dto/add-address.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { RateProviderDto } from './dto/rate-provider.dto';

@ApiTags('Customer')
@Controller('customer')
export class CustomerController {
    constructor(private readonly customerService: CustomerService) { }

    // ==================== AUTH ====================

    @Post('auth/register')
    @ApiOperation({ summary: 'Register customer' })
    async register(@Body() dto: RegisterCustomerDto) {
        return this.customerService.register(dto);
    }

    @Post('auth/login')
    @ApiOperation({ summary: 'Login with OTP' })
    async login(@Body() body: { phoneNumber: string; otp: string }) {
        return this.customerService.verifyOtp(body.phoneNumber, body.otp);
    }

    // ==================== PROFILE ====================

    @Get(':id/profile')
    @ApiOperation({ summary: 'Get profile' })
    async getProfile(@Param('id') id: string) {
        return this.customerService.getProfile(id);
    }

    @Put(':id/profile')
    @ApiOperation({ summary: 'Update profile' })
    async updateProfile(@Param('id') id: string, @Body() dto: UpdateCustomerProfileDto) {
        return this.customerService.updateProfile(id, dto);
    }

    @Post(':id/addresses')
    @ApiOperation({ summary: 'Add address' })
    async addAddress(@Param('id') id: string, @Body() dto: AddAddressDto) {
        return this.customerService.addAddress(id, dto);
    }

    @Get(':id/addresses')
    @ApiOperation({ summary: 'List addresses' })
    async getAddresses(@Param('id') id: string) {
        return this.customerService.getAddresses(id);
    }

    @Put(':id/addresses/:addressId')
    @ApiOperation({ summary: 'Update address' })
    async updateAddress(@Param('id') id: string, @Param('addressId') addressId: string, @Body() dto: AddAddressDto) {
        return this.customerService.updateAddress(id, addressId, dto);
    }

    @Delete(':id/addresses/:addressId')
    @ApiOperation({ summary: 'Delete address' })
    async deleteAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
        return this.customerService.deleteAddress(id, addressId);
    }

    @Delete(':id/account')
    @ApiOperation({ summary: 'Deactivate account' })
    async deactivateAccount(@Param('id') id: string) {
        return this.customerService.deactivateAccount(id);
    }

    // ==================== SERVICE DISCOVERY ====================

    @Get('services/categories')
    @ApiOperation({ summary: 'List service categories' })
    async getCategories(@Query('city') city?: string) {
        return this.customerService.getCategories(city);
    }

    @Get('services/nearby')
    @ApiOperation({ summary: 'Find nearby providers' })
    async getNearbyProviders(@Query('lat') lat: number, @Query('long') long: number) {
        return this.customerService.getNearbyProviders(lat, long);
    }

    @Get('services/:id/estimate')
    @ApiOperation({ summary: 'Get pricing estimate' })
    async getEstimate(@Param('id') id: string) {
        return this.customerService.getEstimate(id);
    }

    // ==================== BOOKINGS ====================

    @Post(':id/bookings')
    @ApiOperation({ summary: 'Create booking' })
    async createBooking(@Param('id') id: string, @Body() dto: CreateBookingDto) {
        return this.customerService.createBooking(id, dto);
    }

    @Get(':id/bookings')
    @ApiOperation({ summary: 'List bookings' })
    async getBookings(@Param('id') id: string) {
        return this.customerService.getBookings(id);
    }

    @Get(':id/bookings/:bookingId')
    @ApiOperation({ summary: 'Get booking details' })
    async getBookingDetails(@Param('id') id: string, @Param('bookingId') bookingId: string) {
        return this.customerService.getBookingDetails(id, bookingId);
    }

    @Post(':id/bookings/:bookingId/cancel')
    @ApiOperation({ summary: 'Cancel booking' })
    async cancelBooking(@Param('id') id: string, @Param('bookingId') bookingId: string) {
        return this.customerService.cancelBooking(id, bookingId);
    }

    // ==================== TRACKING ====================

    @Get(':id/bookings/:bookingId/tracking')
    @ApiOperation({ summary: 'Get provider location' })
    async getTracking(@Param('id') id: string, @Param('bookingId') bookingId: string) {
        return this.customerService.getTracking(id, bookingId);
    }

    // ==================== PAYMENTS ====================

    @Post(':id/payments/initiate')
    @ApiOperation({ summary: 'Initiate payment' })
    async initiatePayment(@Param('id') id: string, @Body() dto: InitiatePaymentDto) {
        return this.customerService.initiatePayment(id, dto);
    }

    @Get(':id/payments/history')
    @ApiOperation({ summary: 'Get payment history' })
    async getPaymentHistory(@Param('id') id: string) {
        return this.customerService.getPaymentHistory(id);
    }

    // ==================== RATINGS & SUPPORT ====================

    @Post(':id/ratings')
    @ApiOperation({ summary: 'Rate provider' })
    async rateProvider(@Param('id') id: string, @Body() dto: RateProviderDto) {
        return this.customerService.rateProvider(id, dto);
    }

    @Post(':id/support')
    @ApiOperation({ summary: 'Raise support ticket' })
    async raiseTicket(@Param('id') id: string, @Body() body: { bookingId: string; message: string }) {
        return this.customerService.raiseTicket(id, body.bookingId, body.message);
    }
}
