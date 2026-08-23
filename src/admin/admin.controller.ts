import { Controller, Get, Query, Patch, Param, Body, Post, Delete } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Role } from '@prisma/client';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';

import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateKycStatusDto } from './dto/update-kyc-status.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { CreateSurgeRuleDto } from './dto/create-surge-rule.dto';
import { BookingStatus } from '@prisma/client';
import { CreateServiceProviderDto } from './dto/create-service-provider.dto';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto';
import { CreateServiceItemDto } from './dto/create-service-item.dto';
import { UpdateServiceItemDto } from './dto/update-service-item.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { CreateShiftTypeDto } from './dto/create-shift-type.dto';
import { UpdateShiftTypeDto } from './dto/update-shift-type.dto';
import { AssignShiftDto } from './dto/assign-shift.dto';
import { UpdateAssignmentStatusDto } from './dto/update-assignment-status.dto';
import { GeneratePayrollSettlementDto } from './dto/generate-payroll-settlement.dto';
import { ExportPayrollReportDto } from './dto/export-payroll-report.dto';
import { DetectFraudDto } from './dto/detect-fraud.dto';


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

    @Patch('users/:id/role')
    @ApiOperation({
        summary: 'Update user role',
        description: 'Update the role of a user (e.g. CUSTOMER, PROVIDER, TEAM_LEADER, ADMIN) with audit logging',
        tags: ['User Management'],
    })
    @ApiParam({ name: 'id', description: 'User ID' })
    @ApiBody({ type: UpdateUserRoleDto })
    @ApiResponse({ status: 200, description: 'User role updated successfully' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async updateUserRole(
        @Param('id') id: string,
        @Body() body: UpdateUserRoleDto,
    ) {
        const adminId = 'mock-admin-id';
        return this.adminService.updateUserRole(id, body.role, adminId);
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
    @ApiQuery({ name: 'limit', required: false, description: 'Limit number of results' })
    @ApiQuery({ name: 'page', required: false, description: 'Page number' })
    @ApiResponse({ status: 200, description: 'Bookings retrieved successfully' })
    async getBookings(
        @Query('status') status?: BookingStatus,
        @Query('userId') userId?: string,
        @Query('limit') limit?: string,
        @Query('page') page?: string,
    ) {
        const take = limit ? parseInt(limit, 10) : undefined;
        const skip = page && take ? (parseInt(page, 10) - 1) * take : undefined;
        return this.adminService.getBookings({ status, userId, take, skip });
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

    // FR-BKG-004
    @Patch('bookings/:id/assign')
    @ApiOperation({
        summary: 'Manually assign provider',
        description: 'Assign a service provider to a booking manually',
        tags: ['Booking Management'],
    })
    @ApiParam({ name: 'id', description: 'Booking ID' })
    @ApiBody({ schema: { type: 'object', properties: { providerId: { type: 'string' } } } })
    @ApiResponse({ status: 200, description: 'Provider assigned successfully' })
    @ApiResponse({ status: 404, description: 'Booking or provider not found' })
    async assignProvider(
        @Param('id') id: string,
        @Body('providerId') providerId: string,
    ) {
        const adminId = 'mock-admin-id';
        return this.adminService.assignProvider(id, providerId, adminId);
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

    @Patch('pricing-rules/:id')
    @ApiOperation({
        summary: 'Update pricing rule',
        description: 'Update an existing pricing rule',
        tags: ['Pricing & Commission'],
    })
    @ApiResponse({ status: 200, description: 'Pricing rule updated successfully' })
    async updatePricingRule(@Param('id') id: string, @Body() body: Partial<CreatePricingRuleDto>) {
        return this.adminService.updatePricingRule(id, body);
    }

    @Delete('pricing-rules/:id')
    @ApiOperation({
        summary: 'Delete pricing rule',
        description: 'Delete an existing pricing rule by ID',
        tags: ['Pricing & Commission'],
    })
    @ApiResponse({ status: 200, description: 'Pricing rule deleted successfully' })
    async deletePricingRule(@Param('id') id: string) {
        return this.adminService.deletePricingRule(id);
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

    @Patch('surge-rules/:id')
    @ApiOperation({
        summary: 'Update surge rule',
        description: 'Update an existing surge pricing rule',
        tags: ['Pricing & Commission'],
    })
    @ApiResponse({ status: 200, description: 'Surge rule updated successfully' })
    async updateSurgeRule(@Param('id') id: string, @Body() body: Partial<CreateSurgeRuleDto>) {
        return this.adminService.updateSurgeRule(id, body);
    }

    @Delete('surge-rules/:id')
    @ApiOperation({
        summary: 'Delete surge rule',
        description: 'Delete an existing surge pricing rule by ID',
        tags: ['Pricing & Commission'],
    })
    @ApiResponse({ status: 200, description: 'Surge rule deleted successfully' })
    async deleteSurgeRule(@Param('id') id: string) {
        return this.adminService.deleteSurgeRule(id);
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

    @Post('wallets/:id/payout')
    @ApiOperation({
        summary: 'Trigger provider payout',
        description: 'Trigger a payout to a specific provider wallet',
        tags: ['Finance & Settlements'],
    })
    @ApiParam({ name: 'id', description: 'Wallet ID' })
    @ApiBody({ schema: { type: 'object', properties: { amount: { type: 'number' } } } })
    @ApiResponse({ status: 200, description: 'Payout successful' })
    @ApiResponse({ status: 400, description: 'Bad request / Insufficient balance' })
    async triggerPayout(
        @Param('id') id: string,
        @Body('amount') amount: number,
    ) {
        return this.adminService.triggerPayout(id, amount);
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

    // ==================== NOTIFICATIONS ====================

    @Get('notifications')
    @ApiOperation({
        summary: 'Get admin notifications',
        description: 'Retrieve unread admin notifications (e.g. new KYC submissions)',
        tags: ['Notifications'],
    })
    @ApiQuery({ name: 'all', required: false, description: 'Pass "true" to include already-read notifications' })
    @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
    async getNotifications(@Query('all') all?: string) {
        return this.adminService.getNotifications(all !== 'true');
    }

    @Patch('notifications/:id/read')
    @ApiOperation({
        summary: 'Mark notification as read',
        description: 'Mark a specific admin notification as read',
        tags: ['Notifications'],
    })
    @ApiParam({ name: 'id', description: 'Notification ID' })
    @ApiResponse({ status: 200, description: 'Notification marked as read' })
    async markNotificationRead(@Param('id') id: string) {
        return this.adminService.markNotificationRead(id);
    }

    // ==================== SERVICE PROVIDER MANAGEMENT ====================

    @Get('service-providers')
    @ApiOperation({
        summary: 'Get all service providers',
        description: 'Retrieve service providers with optional filters',
        tags: ['Service Provider Management'],
    })
    @ApiQuery({ name: 'name', required: false, description: 'Filter by name' })
    @ApiQuery({ name: 'city', required: false, description: 'Filter by city' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
    @ApiResponse({ status: 200, description: 'Service providers retrieved successfully' })
    async getServiceProviders(
        @Query('name') name?: string,
        @Query('city') city?: string,
        @Query('status') status?: string,
    ) {
        return this.adminService.getServiceProviders({ name, city, status });
    }

    @Get('service-providers/:id')
    @ApiOperation({
        summary: 'Get service provider by ID',
        description: 'Retrieve a single service provider with full details',
        tags: ['Service Provider Management'],
    })
    @ApiParam({ name: 'id', description: 'Service Provider ID' })
    @ApiResponse({ status: 200, description: 'Service provider retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Service provider not found' })
    async getServiceProviderById(@Param('id') id: string) {
        return this.adminService.getServiceProviderById(id);
    }

    @Post('service-providers')
    @ApiOperation({
        summary: 'Create service provider',
        description: 'Create a new service provider linked to an existing user',
        tags: ['Service Provider Management'],
    })
    @ApiBody({ type: CreateServiceProviderDto })
    @ApiResponse({ status: 201, description: 'Service provider created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input' })
    @ApiResponse({ status: 404, description: 'User not found' })
    async createServiceProvider(@Body() body: CreateServiceProviderDto) {
        return this.adminService.createServiceProvider(body);
    }

    @Patch('service-providers/:id')
    @ApiOperation({
        summary: 'Update service provider',
        description: 'Update an existing service provider record',
        tags: ['Service Provider Management'],
    })
    @ApiParam({ name: 'id', description: 'Service Provider ID' })
    @ApiBody({ type: CreateServiceProviderDto })
    @ApiResponse({ status: 200, description: 'Service provider updated successfully' })
    @ApiResponse({ status: 404, description: 'Service provider not found' })
    async updateServiceProvider(
        @Param('id') id: string,
        @Body() body: Partial<CreateServiceProviderDto>,
    ) {
        console.log(`[AdminController] PATCH service-providers/${id} body:`, JSON.stringify(body, null, 2));
        return this.adminService.updateServiceProvider(id, body);
    }

    @Patch('service-providers/:id/status')
    @ApiOperation({
        summary: 'Update service provider status',
        description: 'Activate, suspend or reject a service provider',
        tags: ['Service Provider Management'],
    })
    @ApiParam({ name: 'id', description: 'Service Provider ID' })
    @ApiResponse({ status: 200, description: 'Status updated successfully' })
    @ApiResponse({ status: 404, description: 'Service provider not found' })
    async updateServiceProviderStatus(
        @Param('id') id: string,
        @Body('status') status: string,
    ) {
        const adminId = 'mock-admin-id';
        return this.adminService.updateServiceProviderStatus(id, status, adminId);
    }

    @Patch('service-providers/:id/assign-tl')
    @ApiOperation({
        summary: 'Assign Team Leader to Service Provider',
        description: 'Assign a Team Leader to a Service Provider, or unassign if teamLeaderId is empty/null',
        tags: ['Service Provider Management'],
    })
    @ApiParam({ name: 'id', description: 'Service Provider ID' })
    @ApiBody({ schema: { type: 'object', properties: { teamLeaderId: { type: 'string', nullable: true } } } })
    @ApiResponse({ status: 200, description: 'Team Leader assigned successfully' })
    async assignTeamLeader(
        @Param('id') id: string,
        @Body('teamLeaderId') teamLeaderId?: string | null,
    ) {
        const adminId = 'mock-admin-id';
        return this.adminService.assignTeamLeader(id, teamLeaderId, adminId);
    }

    @Delete('service-providers/:id')
    @ApiOperation({
        summary: 'Delete service provider',
        description: 'Permanently delete a service provider record',
        tags: ['Service Provider Management'],
    })
    @ApiParam({ name: 'id', description: 'Service Provider ID' })
    @ApiResponse({ status: 200, description: 'Service provider deleted successfully' })
    @ApiResponse({ status: 404, description: 'Service provider not found' })
    async deleteServiceProvider(@Param('id') id: string) {
        return this.adminService.deleteServiceProvider(id);
    }

    // ==================== SERVICE CATALOG MANAGEMENT ====================

    @Get('service-categories')
    @ApiOperation({
        summary: 'Get all service categories',
        description: 'Retrieve a list of all service categories',
        tags: ['Service Catalog'],
    })
    @ApiResponse({ status: 200, description: 'Service categories retrieved successfully' })
    async getServiceCategories(@Query('includeItems') includeItems?: string) {
        return this.adminService.getServiceCategories(includeItems === 'true');
    }

    @Post('service-categories')
    @ApiOperation({
        summary: 'Create service category',
        description: 'Create a new service category',
        tags: ['Service Catalog'],
    })
    @ApiBody({ type: CreateServiceCategoryDto })
    @ApiResponse({ status: 201, description: 'Service category created successfully' })
    async createServiceCategory(@Body() body: CreateServiceCategoryDto) {
        return this.adminService.createServiceCategory(body);
    }

    @Get('service-items')
    @ApiOperation({
        summary: 'Get all service items',
        description: 'Retrieve a list of all service items with optional category filter',
        tags: ['Service Catalog'],
    })
    @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category ID' })
    @ApiResponse({ status: 200, description: 'Service items retrieved successfully' })
    async getServiceItems(@Query('categoryId') categoryId?: string) {
        return this.adminService.getServiceItems(categoryId);
    }

    @Post('service-items')
    @ApiOperation({
        summary: 'Create service item',
        description: 'Create a new service item under a category',
        tags: ['Service Catalog'],
    })
    @ApiBody({ type: CreateServiceItemDto })
    @ApiResponse({ status: 201, description: 'Service item created successfully' })
    async createServiceItem(@Body() body: CreateServiceItemDto) {
        return this.adminService.createServiceItem(body);
    }

    @Patch('service-items/:id')
    @ApiOperation({
        summary: 'Update service item',
        description: 'Update an existing service item details and optional photo',
        tags: ['Service Catalog'],
    })
    @ApiParam({ name: 'id', description: 'ID of the service item to update' })
    @ApiBody({ type: UpdateServiceItemDto })
    @ApiResponse({ status: 200, description: 'Service item updated successfully' })
    async updateServiceItem(@Param('id') id: string, @Body() body: UpdateServiceItemDto) {
        return this.adminService.updateServiceItem(id, body);
    }

    // ==================== COUPON MANAGEMENT ====================

    @Post('coupons')
    @ApiOperation({
        summary: 'Create discount coupon',
        description: 'Create a new discount coupon with percentage and expiry',
        tags: ['Coupon Management'],
    })
    @ApiBody({ type: CreateCouponDto })
    @ApiResponse({ status: 201, description: 'Coupon created successfully' })
    async createCoupon(@Body() body: CreateCouponDto) {
        return this.adminService.createCoupon(body);
    }

    @Get('coupons')
    @ApiOperation({
        summary: 'Get all coupons',
        description: 'Retrieve a list of all discount coupons',
        tags: ['Coupon Management'],
    })
    @ApiResponse({ status: 200, description: 'Coupons retrieved successfully' })
    async getCoupons() {
        return this.adminService.getCoupons();
    }

    @Delete('coupons/:id')
    @ApiOperation({
        summary: 'Delete coupon',
        description: 'Permanently delete a discount coupon by ID',
        tags: ['Coupon Management'],
    })
    @ApiParam({ name: 'id', description: 'Coupon ID' })
    @ApiResponse({ status: 200, description: 'Coupon deleted successfully' })
    async deleteCoupon(@Param('id') id: string) {
        return this.adminService.deleteCoupon(id);
    }

    // ==================== SHIFT CONFIGURATION (FR-PAY-001) ====================

    @Post('shifts')
    @ApiOperation({
        summary: 'Create shift type configuration',
        description: 'Configure shift types (8h/10h/12h) with salary and overtime settings',
        tags: ['Shift Configuration'],
    })
    @ApiBody({ type: CreateShiftTypeDto })
    @ApiResponse({ status: 201, description: 'Shift type created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid shift details or duration hours' })
    async createShiftType(@Body() body: CreateShiftTypeDto) {
        // Authenticated admin ID mocked
        const adminId = 'mock-admin-id';
        return this.adminService.createShiftType(body, adminId);
    }

    @Get('shifts')
    @ApiOperation({
        summary: 'Get all configured shift types',
        description: 'Retrieve a list of all configured shift types',
        tags: ['Shift Configuration'],
    })
    @ApiResponse({ status: 200, description: 'Configured shift types retrieved successfully' })
    async getShiftTypes() {
        return this.adminService.findAllShiftTypes();
    }

    @Get('shifts/:id')
    @ApiOperation({
        summary: 'Get shift type details',
        description: 'Retrieve details for a specific configured shift type by ID',
        tags: ['Shift Configuration'],
    })
    @ApiParam({ name: 'id', description: 'Shift Type ID' })
    @ApiResponse({ status: 200, description: 'Shift type details retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Shift type not found' })
    async getShiftType(@Param('id') id: string) {
        return this.adminService.findOneShiftType(id);
    }

    @Patch('shifts/:id')
    @ApiOperation({
        summary: 'Update shift type configuration',
        description: 'Update salary, overtime rate or details of a shift type',
        tags: ['Shift Configuration'],
    })
    @ApiParam({ name: 'id', description: 'Shift Type ID' })
    @ApiBody({ type: UpdateShiftTypeDto })
    @ApiResponse({ status: 200, description: 'Shift type updated successfully' })
    @ApiResponse({ status: 404, description: 'Shift type not found' })
    async updateShiftType(@Param('id') id: string, @Body() body: UpdateShiftTypeDto) {
        // Authenticated admin ID mocked
        const adminId = 'mock-admin-id';
        return this.adminService.updateShiftType(id, body, adminId);
    }

    @Delete('shifts/:id')
    @ApiOperation({
        summary: 'Delete shift type configuration',
        description: 'Delete a configured shift type by ID',
        tags: ['Shift Configuration'],
    })
    @ApiParam({ name: 'id', description: 'Shift Type ID' })
    @ApiResponse({ status: 200, description: 'Shift type deleted successfully' })
    @ApiResponse({ status: 404, description: 'Shift type not found' })
    async deleteShiftType(@Param('id') id: string) {
        // Authenticated admin ID mocked
        const adminId = 'mock-admin-id';
        return this.adminService.deleteShiftType(id, adminId);
    }

    // ==================== SHIFT ASSIGNMENT (FR-PAY-002) ====================

    @Post('shifts/assign')
    @ApiOperation({
        summary: 'Assign provider to shift',
        description: 'Admin shall assign active/verified providers to shift types on specific dates',
        tags: ['Shift Assignment'],
    })
    @ApiBody({ type: AssignShiftDto })
    @ApiResponse({ status: 201, description: 'Shift assignment created successfully' })
    @ApiResponse({ status: 400, description: 'Provider not verified, invalid shift type, or double booking' })
    async assignShift(@Body() body: AssignShiftDto) {
        // Authenticated admin ID mocked
        const adminId = 'mock-admin-id';
        return this.adminService.assignShift(body, adminId);
    }

    @Get('shifts/assignments/all')
    @ApiOperation({
        summary: 'Get all shift assignments',
        description: 'Retrieve a list of all shift assignments with optional filters',
        tags: ['Shift Assignment'],
    })
    @ApiQuery({ name: 'provider_id', required: false, description: 'Filter by provider ID' })
    @ApiQuery({ name: 'shift_type_id', required: false, description: 'Filter by shift type ID' })
    @ApiQuery({ name: 'date', required: false, description: 'Filter by shift date (YYYY-MM-DD)' })
    @ApiResponse({ status: 200, description: 'Shift assignments retrieved successfully' })
    async getShiftAssignments(
        @Query('provider_id') providerId?: string,
        @Query('shift_type_id') shiftTypeId?: string,
        @Query('date') date?: string,
    ) {
        return this.adminService.findAllShiftAssignments({
            provider_id: providerId,
            shift_type_id: shiftTypeId,
            date
        });
    }

    @Get('shifts/assignments/:id')
    @ApiOperation({
        summary: 'Get shift assignment details',
        description: 'Retrieve details for a specific shift assignment by ID',
        tags: ['Shift Assignment'],
    })
    @ApiParam({ name: 'id', description: 'Shift Assignment ID' })
    @ApiResponse({ status: 200, description: 'Shift assignment details retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Shift assignment not found' })
    async getShiftAssignment(@Param('id') id: string) {
        return this.adminService.findOneShiftAssignment(id);
    }

    @Patch('shifts/assignments/:id/status')
    @ApiOperation({
        summary: 'Update shift assignment status',
        description: 'Update the status of a shift assignment (e.g. APPROVED, COMPLETED, CANCELLED)',
        tags: ['Shift Assignment'],
    })
    @ApiParam({ name: 'id', description: 'Shift Assignment ID' })
    @ApiBody({ type: UpdateAssignmentStatusDto })
    @ApiResponse({ status: 200, description: 'Shift assignment status updated successfully' })
    @ApiResponse({ status: 404, description: 'Shift assignment not found' })
    async updateShiftAssignmentStatus(@Param('id') id: string, @Body() body: UpdateAssignmentStatusDto) {
        // Authenticated admin ID mocked
        const adminId = 'mock-admin-id';
        return this.adminService.updateShiftAssignmentStatus(id, body.status, adminId);
    }

    @Delete('shifts/assignments/:id')
    @ApiOperation({
        summary: 'Delete/Cancel shift assignment',
        description: 'Cancel or permanently delete a shift assignment by ID',
        tags: ['Shift Assignment'],
    })
    @ApiParam({ name: 'id', description: 'Shift Assignment ID' })
    @ApiResponse({ status: 200, description: 'Shift assignment deleted successfully' })
    @ApiResponse({ status: 404, description: 'Shift assignment not found' })
    async deleteShiftAssignment(@Param('id') id: string) {
        // Authenticated admin ID mocked
        const adminId = 'mock-admin-id';
        return this.adminService.deleteShiftAssignment(id, adminId);
    }

    // ==================== ATTENDANCE CLASSIFICATION (FR-PAY-005) ====================

    @Post('attendance/:id/classify')
    @ApiOperation({
        summary: 'Manually classify attendance record',
        description: 'Classifies worked hours into PRESENT, HALF_DAY, or ABSENT status',
        tags: ['Attendance Classification'],
    })
    @ApiParam({ name: 'id', description: 'Attendance ID' })
    @ApiResponse({ status: 200, description: 'Attendance classified successfully' })
    @ApiResponse({ status: 404, description: 'Attendance record not found' })
    async classifyAttendanceRecord(@Param('id') id: string) {
        const adminId = 'mock-admin-id';
        return this.adminService.classifyAttendanceRecord(id, adminId);
    }

    @Post('attendance/classify-routine')
    @ApiOperation({
        summary: 'Run automated daily attendance classification routine',
        description: 'System routine to scan and classify all provider attendance status for a specific date',
        tags: ['Attendance Classification'],
    })
    @ApiResponse({ status: 200, description: 'Automated routine completed successfully' })
    async runClassifyRoutine(@Body('date') date: string) {
        const adminId = 'system-cron';
        // Validate date format, default to today if not provided
        const targetDate = date || new Date().toISOString().split('T')[0];
        return this.adminService.runClassifyRoutine(targetDate, adminId);
    }

    // ==================== SALARY CALCULATION (FR-PAY-006) ====================

    @Post('salary/calculate/:attendanceId')
    @ApiOperation({
        summary: 'Calculate salary for completed attendance',
        description: 'Applies dynamic bonus/penalty rules and overtime calculation for a completed attendance record',
        tags: ['Salary Calculation'],
    })
    @ApiParam({ name: 'attendanceId', description: 'Attendance ID' })
    @ApiResponse({ status: 200, description: 'Salary calculated and ledger updated successfully' })
    @ApiResponse({ status: 400, description: 'Shift not completed yet' })
    @ApiResponse({ status: 404, description: 'Attendance or Shift Type not found' })
    async calculateSalaryForAttendance(@Param('attendanceId') attendanceId: string) {
        const adminId = 'mock-admin-id';
        return this.adminService.calculateSalaryForAttendance(attendanceId, adminId);
    }

    @Post('salary/calculate-routine')
    @ApiOperation({
        summary: 'Run automated daily salary calculation routine',
        description: 'System routine to calculate and generate salary ledger records for all completed attendance on a specific date',
        tags: ['Salary Calculation'],
    })
    @ApiResponse({ status: 200, description: 'Automated daily salary routine completed successfully' })
    async runSalaryCalculationRoutine(@Body('date') date: string) {
        const adminId = 'system-cron';
        const targetDate = date || new Date().toISOString().split('T')[0];
        return this.adminService.runSalaryCalculationRoutine(targetDate, adminId);
    }

    // ==================== BONUS MANAGEMENT (FR-PAY-007) ====================

    @Post('bonus/apply/:providerId')
    @ApiOperation({
        summary: 'Apply performance bonus to provider wallet',
        description: 'Validates performance metric thresholds and credits provider wallet and daily salary ledger with bonuses',
        tags: ['Bonus Management'],
    })
    @ApiParam({ name: 'providerId', description: 'Service Provider ID' })
    @ApiResponse({ status: 200, description: 'Performance bonus successfully calculated and applied' })
    @ApiResponse({ status: 400, description: 'Provider does not qualify for bonus' })
    @ApiResponse({ status: 404, description: 'Provider or performance rules not found' })
    async applyPerformanceBonus(
        @Param('providerId') providerId: string,
        @Body('metricName') metricName: string
    ) {
        const adminId = 'mock-admin-id';
        const metric = metricName || 'COMPLETED_JOBS';
        return this.adminService.applyPerformanceBonus(providerId, metric, adminId);
    }

    // ==================== PENALTY MANAGEMENT (FR-PAY-008) ====================

    @Post('penalty/deduct/:providerId')
    @ApiOperation({
        summary: 'Apply penalty deduction to provider wallet for violations',
        description: 'Validates violation status and deducts penalty from provider wallet and daily salary ledger',
        tags: ['Penalty Management'],
    })
    @ApiParam({ name: 'providerId', description: 'Service Provider ID' })
    @ApiResponse({ status: 200, description: 'Penalty successfully calculated and deducted' })
    @ApiResponse({ status: 404, description: 'Provider or violation not found' })
    async applyPenaltyDeduction(
        @Param('providerId') providerId: string,
        @Body('violationRule') violationRule: string
    ) {
        const adminId = 'mock-admin-id';
        const violation = violationRule || 'LATE_ARRIVAL';
        return this.adminService.applyPenaltyDeduction(providerId, violation, adminId);
    }

    // ==================== PAYROLL SETTLEMENT (FR-PAY-009) ====================

    @Get('payroll/settlements')
    @ApiOperation({
        summary: 'Get all generated payroll settlements',
        description: 'Retrieve all payroll settlements with optional date and status filters',
        tags: ['Payroll Settlement'],
    })
    @ApiQuery({ name: 'startDate', required: false, description: 'Filter by cycle start date' })
    @ApiQuery({ name: 'endDate', required: false, description: 'Filter by cycle end date' })
    @ApiQuery({ name: 'status', required: false, description: 'Filter by status (PENDING, APPROVED, DISBURSED)' })
    @ApiResponse({ status: 200, description: 'Payroll settlements retrieved successfully' })
    async getPayrollSettlements(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('status') status?: string,
    ) {
        return this.adminService.findAllPayrollSettlements({ startDate, endDate, status });
    }

    @Post('payroll/settlements')
    @ApiOperation({
        summary: 'Generate payroll settlements',
        description: 'Scans salary ledger entries in the range and creates PENDING payroll settlements for each provider',
        tags: ['Payroll Settlement'],
    })
    @ApiResponse({ status: 201, description: 'Payroll settlements successfully generated' })
    @ApiResponse({ status: 400, description: 'Invalid dates or empty ledger range' })
    async generatePayrollSettlements(@Body() dto: GeneratePayrollSettlementDto) {
        const adminId = 'mock-admin-id';
        return this.adminService.generatePayrollSettlements(dto, adminId);
    }

    @Patch('payroll/settlement/:id/approve')
    @ApiOperation({
        summary: 'Approve payroll settlement',
        description: 'Approves the PENDING payroll settlement, preparing it for disbursement',
        tags: ['Payroll Settlement'],
    })
    @ApiParam({ name: 'id', description: 'Settlement ID' })
    @ApiResponse({ status: 200, description: 'Payroll settlement approved successfully' })
    @ApiResponse({ status: 400, description: 'Settlement must be in PENDING status' })
    @ApiResponse({ status: 404, description: 'Payroll settlement not found' })
    async approvePayrollSettlement(@Param('id') id: string) {
        const adminId = 'mock-admin-id';
        return this.adminService.approvePayrollSettlement(id, adminId);
    }

    @Post('payroll/settlement/:id/disburse')
    @ApiOperation({
        summary: 'Disburse payroll settlement',
        description: 'Disburses payout amount to the provider, crediting their wallet and creating a disbursed payout record',
        tags: ['Payroll Settlement'],
    })
    @ApiParam({ name: 'id', description: 'Settlement ID' })
    @ApiResponse({ status: 200, description: 'Payroll settlement disbursed successfully' })
    @ApiResponse({ status: 400, description: 'Settlement must be in APPROVED status' })
    @ApiResponse({ status: 404, description: 'Payroll settlement not found' })
    async disbursePayrollSettlement(@Param('id') id: string) {
        const adminId = 'mock-admin-id';
        return this.adminService.disbursePayrollSettlement(id, adminId);
    }

    // ==================== PAYROLL REPORTS (FR-PAY-011) ====================

    @Get('payroll/report')
    @ApiOperation({
        summary: 'Export payroll reports',
        description: 'Export structured payroll reports with total payout, base salary, overtime, bonuses, deductions, and provider ledger items within a date range',
        tags: ['Payroll Reports'],
    })
    @ApiResponse({ status: 200, description: 'Payroll reports exported successfully' })
    @ApiResponse({ status: 400, description: 'Invalid date range or parameters' })
    async exportPayrollReport(@Query() dto: ExportPayrollReportDto) {
        const adminId = 'mock-admin-id';
        return this.adminService.exportPayrollReport(dto, adminId);
    }

    // ==================== FRAUD PREVENTION (FR-PAY-012) ====================

    @Post('fraud/detect')
    @ApiOperation({
        summary: 'Detect GPS spoofing and suspicious attendance',
        description: 'Validates GPS data, checks mock location flags, analyzes velocity anomalies, and checks device sharing across service providers.',
        tags: ['Fraud Prevention'],
    })
    @ApiBody({ type: DetectFraudDto })
    @ApiResponse({ status: 200, description: 'Fraud detection successfully evaluated' })
    @ApiResponse({ status: 400, description: 'Invalid coordinates or input payload' })
    @ApiResponse({ status: 404, description: 'Service provider not found' })
    async detectFraud(@Body() dto: DetectFraudDto) {
        const adminId = 'system';
        return this.adminService.detectFraud(dto, adminId);
    }

    // ==================== SALARY LEDGER (FR-PAY-010) ====================

    @Get('salary-ledger')
    @ApiOperation({
        summary: 'Get all daily salary ledger records',
        description: 'Retrieves all daily salary ledger entries with filters for dates',
        tags: ['Salary Ledger'],
    })
    @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter by start date' })
    @ApiQuery({ name: 'dateTo', required: false, description: 'Filter by end date' })
    async getSalaryLedger(
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        return this.adminService.findSalaryLedger({ dateFrom, dateTo });
    }

    @Patch('salary-ledger/:id')
    @ApiOperation({
        summary: 'Adjust salary ledger entry',
        description: 'Updates a daily salary ledger record with manual base, bonus, penalty, or overtime adjustments',
        tags: ['Salary Ledger'],
    })
    @ApiParam({ name: 'id', description: 'Ledger record ID' })
    async updateSalaryLedger(
        @Param('id') id: string,
        @Body() body: any
    ) {
        const adminId = 'mock-admin-id';
        return this.adminService.updateSalaryLedger(id, body, adminId);
    }
}


