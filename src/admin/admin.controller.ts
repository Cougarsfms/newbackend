import { Controller, Get, Query, Patch, Param, Body, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';

import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateKycStatusDto } from './dto/update-kyc-status.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { CreateSurgeRuleDto } from './dto/create-surge-rule.dto';
import { BookingStatus } from '@prisma/client';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    // ==================== USER MANAGEMENT ====================

    // FR-UM-001, FR-UM-002
    @Get('users')
    @ApiOperation({
        summary: 'Get all users with filters',
        description: 'Retrieve a list of users with optional filters for name, phone, role, and status',
        tags: ['User Management'],
    })
    @ApiQuery({ name: 'name', required: false, description: 'Filter by user name' })
    @ApiQuery({ name: 'phone', required: false, description: 'Filter by phone number' })
    @ApiQuery({ name: 'role', required: false, enum: Role, description: 'Filter by user role' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by user status' })
    @ApiResponse({ status: 200, description: 'List of users retrieved successfully' })
    async getUsers(
        @Query('name') name?: string,
        @Query('phone') phone?: string,
        @Query('role') role?: Role,
        @Query('status') status?: string,
    ) {
        return this.adminService.findAllUsers({ name, phone, role, status });
    }

    // FR-UM-003
    @Patch('users/:id/status')
    @ApiOperation({
        summary: 'Update user status',
        description: 'Block, unblock, or suspend a user with audit logging',
        tags: ['User Management'],
    })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiBody({ type: UpdateUserStatusDto })
    @ApiResponse({ status: 200, description: 'User status updated successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async updateUserStatus(
        @Param('id') id: string,
        @Body() body: UpdateUserStatusDto,
    ) {
        // Mock Admin ID for now
        const adminId = 'mock-admin-id';
        return this.adminService.updateUserStatus(id, body.status, body.reason, adminId);
    }

    // FR-UM-004
    @Get('users/:id/history')
    @ApiOperation({
        summary: 'Get user activity history',
        description: 'Retrieve complete activity history for a specific user',
        tags: ['User Management'],
    })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiResponse({ status: 200, description: 'User history retrieved successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async getUserHistory(@Param('id') id: string) {
        return this.adminService.getUserHistory(id);
    }

    // ==================== KYC & VERIFICATION ====================

    // FR-KYC-001
    @Get('kyc/pending')
    @ApiOperation({
        summary: 'Get pending KYC submissions',
        description: 'Retrieve all KYC submissions pending review',
        tags: ['KYC & Verification'],
    })
    @ApiResponse({ status: 200, description: 'Pending KYC submissions retrieved successfully' })
    async getPendingKyc() {
        return this.adminService.getPendingKyc();
    }

    // FR-KYC-001
    @Get('kyc/:id')
    @ApiOperation({
        summary: 'Get KYC details',
        description: 'Retrieve detailed information for a specific KYC submission',
        tags: ['KYC & Verification'],
    })
    @ApiParam({ name: 'id', description: 'KYC submission ID' })
    @ApiResponse({ status: 200, description: 'KYC details retrieved successfully' })
    @ApiResponse({ status: 404, description: 'KYC submission not found' })
    async getKycDetails(@Param('id') id: string) {
        return this.adminService.getKycDetails(id);
    }

    // FR-KYC-002
    @Patch('kyc/:id/status')
    @ApiOperation({
        summary: 'Update KYC status',
        description: 'Approve or reject a KYC submission with remarks and audit logging',
        tags: ['KYC & Verification'],
    })
    @ApiParam({ name: 'id', description: 'KYC submission ID' })
    @ApiBody({ type: UpdateKycStatusDto })
    @ApiResponse({ status: 200, description: 'KYC status updated successfully' })
    @ApiResponse({ status: 404, description: 'KYC submission not found' })
    async updateKycStatus(
        @Param('id') id: string,
        @Body() body: UpdateKycStatusDto,
    ) {
        const adminId = 'mock-admin-id';
        return this.adminService.updateKycStatus(id, body.status, body.remarks, adminId);
    }

    // ==================== BOOKING MANAGEMENT ====================

    // FR-BKG-001
    @Get('bookings')
    @ApiOperation({
        summary: 'Get all bookings with filters',
        description: 'Retrieve bookings with optional filters for status and user',
        tags: ['Booking Management'],
    })
    @ApiQuery({ name: 'status', required: false, enum: BookingStatus, description: 'Filter by booking status' })
    @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
    @ApiResponse({ status: 200, description: 'Bookings retrieved successfully' })
    async getBookings(
        @Query('status') status?: BookingStatus,
        @Query('userId') userId?: string,
    ) {
        return this.adminService.getBookings({ status, userId });
    }

    // FR-BKG-001
    @Get('bookings/:id')
    @ApiOperation({
        summary: 'Get booking details',
        description: 'Retrieve detailed information for a specific booking',
        tags: ['Booking Management'],
    })
    @ApiParam({ name: 'id', description: 'Booking ID' })
    @ApiResponse({ status: 200, description: 'Booking details retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Booking not found' })
    async getBookingDetails(@Param('id') id: string) {
        return this.adminService.getBookingDetails(id);
    }

    // FR-BKG-003
    @Patch('bookings/:id/status')
    @ApiOperation({
        summary: 'Update booking status',
        description: 'Update booking status with reason and audit logging',
        tags: ['Booking Management'],
    })
    @ApiParam({ name: 'id', description: 'Booking ID' })
    @ApiBody({ type: UpdateBookingStatusDto })
    @ApiResponse({ status: 200, description: 'Booking status updated successfully' })
    @ApiResponse({ status: 404, description: 'Booking not found' })
    async updateBookingStatus(
        @Param('id') id: string,
        @Body() body: UpdateBookingStatusDto,
    ) {
        const adminId = 'mock-admin-id';
        return this.adminService.updateBookingStatus(id, body.status, body.reason, adminId);
    }

    // ==================== PRICING & COMMISSION ====================

    // FR-PRC-001
    @Post('pricing-rules')
    @ApiOperation({
        summary: 'Create pricing rule',
        description: 'Create a new pricing rule for a service type and city',
        tags: ['Pricing & Commission'],
    })
    @ApiBody({ type: CreatePricingRuleDto })
    @ApiResponse({ status: 201, description: 'Pricing rule created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    async createPricingRule(@Body() body: CreatePricingRuleDto) {
        return this.adminService.createPricingRule(body);
    }

    // FR-PRC-001
    @Get('pricing-rules')
    @ApiOperation({
        summary: 'Get pricing rules',
        description: 'Retrieve all pricing rules with optional city filter',
        tags: ['Pricing & Commission'],
    })
    @ApiQuery({ name: 'city', required: false, description: 'Filter by city' })
    @ApiResponse({ status: 200, description: 'Pricing rules retrieved successfully' })
    async getPricingRules(@Query('city') city?: string) {
        return this.adminService.getPricingRules(city);
    }

    // FR-PRC-002
    @Post('surge-rules')
    @ApiOperation({
        summary: 'Create surge rule',
        description: 'Create a new surge pricing rule',
        tags: ['Pricing & Commission'],
    })
    @ApiBody({ type: CreateSurgeRuleDto })
    @ApiResponse({ status: 201, description: 'Surge rule created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    async createSurgeRule(@Body() body: CreateSurgeRuleDto) {
        return this.adminService.createSurgeRule(body);
    }

    // FR-PRC-002
    @Get('surge-rules')
    @ApiOperation({
        summary: 'Get surge rules',
        description: 'Retrieve all surge pricing rules',
        tags: ['Pricing & Commission'],
    })
    @ApiResponse({ status: 200, description: 'Surge rules retrieved successfully' })
    async getSurgeRules() {
        return this.adminService.getSurgeRules();
    }

    // ==================== FINANCE & SETTLEMENTS ====================

    // FR-FIN-001
    @Get('wallets')
    @ApiOperation({
        summary: 'Get all wallets',
        description: 'Retrieve wallet balances for all users',
        tags: ['Finance & Settlements'],
    })
    @ApiResponse({ status: 200, description: 'Wallets retrieved successfully' })
    async getWallets() {
        return this.adminService.getWallets();
    }

    // FR-FIN-001
    @Get('wallets/:id/ledger')
    @ApiOperation({
        summary: 'Get wallet ledger',
        description: 'Retrieve transaction ledger for a specific wallet',
        tags: ['Finance & Settlements'],
    })
    @ApiParam({ name: 'id', description: 'Wallet ID' })
    @ApiResponse({ status: 200, description: 'Wallet ledger retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Wallet not found' })
    async getWalletLedger(@Param('id') id: string) {
        return this.adminService.getWalletLedger(id);
    }

    // FR-FIN-002
    @Get('settlements')
    @ApiOperation({
        summary: 'Get all settlements',
        description: 'Retrieve all settlement records',
        tags: ['Finance & Settlements'],
    })
    @ApiResponse({ status: 200, description: 'Settlements retrieved successfully' })
    async getSettlements() {
        return this.adminService.getSettlements();
    }

    // FR-FIN-002
    @Get('settlements/:id')
    @ApiOperation({
        summary: 'Get settlement details',
        description: 'Retrieve detailed information for a specific settlement',
        tags: ['Finance & Settlements'],
    })
    @ApiParam({ name: 'id', description: 'Settlement ID' })
    @ApiResponse({ status: 200, description: 'Settlement details retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Settlement not found' })
    async getSettlementDetails(@Param('id') id: string) {
        return this.adminService.getSettlementDetails(id);
    }

    // ==================== ANALYTICS & REPORTING ====================

    // FR-ANA-001
    @Get('analytics/dashboard')
    @ApiOperation({
        summary: 'Get dashboard statistics',
        description: 'Retrieve key metrics and statistics for the admin dashboard',
        tags: ['Analytics & Reporting'],
    })
    @ApiResponse({ status: 200, description: 'Dashboard statistics retrieved successfully' })
    async getDashboardStats() {
        return this.adminService.getDashboardStats();
    }

    // FR-ANA-002
    @Get('analytics/users')
    @ApiOperation({
        summary: 'Get user analytics',
        description: 'Retrieve analytics data for user registrations and activity',
        tags: ['Analytics & Reporting'],
    })
    @ApiResponse({ status: 200, description: 'User analytics retrieved successfully' })
    async getUserAnalytics() {
        return this.adminService.getUserAnalytics();
    }

    // FR-ANA-003
    @Get('analytics/bookings')
    @ApiOperation({
        summary: 'Get booking analytics',
        description: 'Retrieve analytics data for bookings and trends',
        tags: ['Analytics & Reporting'],
    })
    @ApiResponse({ status: 200, description: 'Booking analytics retrieved successfully' })
    async getBookingAnalytics() {
        return this.adminService.getBookingAnalytics();
    }

    // FR-ANA-004
    @Get('analytics/revenue')
    @ApiOperation({
        summary: 'Get revenue analytics',
        description: 'Retrieve revenue analytics and financial metrics',
        tags: ['Analytics & Reporting'],
    })
    @ApiResponse({ status: 200, description: 'Revenue analytics retrieved successfully' })
    async getRevenueAnalytics() {
        return this.adminService.getRevenueAnalytics();
    }
}
