import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma, Role, BookingStatus, Booking } from '@prisma/client';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { CreateSurgeRuleDto } from './dto/create-surge-rule.dto';
import { CreateServiceProviderDto } from './dto/create-service-provider.dto';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto';
import { CreateServiceItemDto } from './dto/create-service-item.dto';

@Injectable()
export class AdminService {
    constructor(private prisma: PrismaService) { }

    // FR-UM-001, FR-UM-002: View and Search Users
    async findAllUsers(params: {
        name?: string;
        phone?: string;
        role?: Role;
        status?: string;
    }): Promise<User[]> {
        const { name, phone, role, status } = params;

        return this.prisma.user.findMany({
            where: {
                name: name ? { contains: name, mode: 'insensitive' } : undefined,
                phoneNumber: phone ? { contains: phone } : undefined,
                role: role ? role : undefined,
                status: status ? status : undefined,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    // FR-UM-003: Block/Unblock Users
    async updateUserStatus(
        userId: string,
        status: string,
        reason: string,
        adminId: string,
    ): Promise<User> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { status },
        });

        // Create Audit Log
        // Creating a placeholder admin if not exists logic is omitted for brevity, expecting valid adminId
        // In production, we'd ensure referential integrity strictly.
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `USER_STATUS_UPDATE_${status}`,
                    details: reason,
                }
            });
        } catch (e) {
            console.error("Audit log creation failed: ", e);
        }

        return updatedUser;
    }

    // FR-UM-004: User Activity History
    async getUserHistory(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                bookings: {
                    orderBy: { createdAt: 'desc' },
                    take: 5
                },
                // Assuming we might want to show login history if we had a table for it.
                // For now, listing bookings and status changes (from audit logs if linked, but audit logs link to admin).
                // This requirement usually implies a separate 'UserActivityLog' or we just show bookings.
            }
        });

        if (!user) throw new NotFoundException('User not found');

        return user;
    }

    // FR-KYC-001: Get Pending KYC
    async getPendingKyc() {
        return this.prisma.kYCRecord.findMany({
            where: { status: 'PENDING' },
            include: {
                user: true,
                kycdocuments: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    // FR-KYC-001: Get KYC Details
    async getKycDetails(id: string) {
        const kyc = await this.prisma.kYCRecord.findUnique({
            where: { id },
            include: {
                user: true,
                kycdocuments: true,
            },
        });
        if (!kyc) throw new NotFoundException('KYC Record not found');
        return kyc;
    }

    // FR-KYC-002: Approve/Reject KYC
    async updateKycStatus(
        id: string,
        status: string,
        remarks: string,
        adminId: string,
    ) {
        const kyc = await this.prisma.kYCRecord.findUnique({ where: { id } });
        if (!kyc) throw new NotFoundException('KYC Record not found');

        const updatedKyc = await this.prisma.kYCRecord.update({
            where: { id },
            data: {
                status,
                remarks: remarks ?? null,
            },
        });

        // Create Audit Log (FR-KYC-003)
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `KYC_STATUS_UPDATE_${status}`,
                    details: remarks,
                },
            });
        } catch (e) {
            console.error('Audit log creation failed: ', e);
        }

        return updatedKyc;
    }

    // FR-BKG-001: View Bookings
    async getBookings(params: { status?: BookingStatus; userId?: string; take?: number; skip?: number }) {
        const { status, userId, take, skip } = params;
        return this.prisma.booking.findMany({
            where: {
                status: status ? status : undefined,
                userId: userId ? userId : undefined,
            },
            include: {
                user: true,
                service: true,
                provider: true,
            },
            orderBy: { createdAt: 'desc' },
            take,
            skip,
        });
    }

    // FR-BKG-001: Get Booking Details
    async getBookingDetails(id: string) {
        const booking = await this.prisma.booking.findUnique({
            where: { id },
            include: {
                user: true,
                service: true,
                bookingOverrides: true,
            },
        });
        if (!booking) throw new NotFoundException('Booking not found');
        return booking;
    }

    // FR-BKG-003: Cancel/Update Booking
    async updateBookingStatus(
        id: string,
        status: BookingStatus,
        reason: string,
        adminId: string,
    ) {
        const booking = await this.prisma.booking.findUnique({ 
            where: { id },
            include: { payments: true }
        });
        if (!booking) throw new NotFoundException('Booking not found');

        const updateData: any = { status };

        if (status === 'CANCELLED') {
            updateData.cancellationReason = reason;
            updateData.cancelledAt = new Date();

            const paidPayment = booking.payments.find(p => p.status === 'PAID');
            if (paidPayment || booking.paymentStatus === 'PAID') {
                updateData.paymentStatus = 'REFUNDED';
            }
        }

        const updatedBooking = await this.prisma.booking.update({
            where: { id },
            data: updateData,
        });

        if (status === 'CANCELLED' && booking.payments?.length > 0) {
            const paidPayment = booking.payments.find(p => p.status === 'PAID');
            if (paidPayment) {
                await this.prisma.payment.update({
                    where: { id: paidPayment.id },
                    data: { status: 'REFUNDED' }
                });
                
                await this.prisma.refund.create({
                    data: {
                        payment_id: paidPayment.id,
                        amount: paidPayment.amount,
                        reason: `Booking cancelled: ${reason}`,
                        status: 'PENDING'
                    }
                });
            }
        }

        // Create Booking Override Log (FR-BKG-005)
        try {
            await this.prisma.bookingOverride.create({
                data: {
                    booking_id: id,
                    status: status,
                },
            });

            // Also create Audit Log
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `BOOKING_STATUS_UPDATE_${status}`,
                    details: reason
                }
            });

        } catch (e) {
            console.error('Audit/Override log creation failed: ', e);
        }

        return updatedBooking;
    }

    // FR-BKG-004: Assign Provider
    async assignProvider(bookingId: string, providerId: string, adminId: string) {
        const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
        if (!booking) throw new NotFoundException('Booking not found');

        const provider = await this.prisma.serviceProvider.findUnique({ where: { id: providerId } });
        if (!provider) throw new NotFoundException('Provider not found');

        const updatedBooking = await this.prisma.booking.update({
            where: { id: bookingId },
            data: { 
                providerId: providerId,
                status: 'CONFIRMED' // Admin manual assignment confirms the provider for the customer
            },
        });

        // Ensure there is an spBooking record so the provider app sees this job
        // Check if one already exists
        const existingSpJob = await this.prisma.spBooking.findFirst({
            where: { booking_id: bookingId, provider_id: providerId }
        });

        if (!existingSpJob) {
            const endDate = new Date(booking.date);
            endDate.setHours(endDate.getHours() + 1); // Mock 1 hour duration

            await this.prisma.spBooking.create({
                data: {
                    provider_id: providerId,
                    booking_id: bookingId,
                    status: 'PENDING',
                    start_time: booking.date,
                    end_time: endDate
                }
            });
        } else if (existingSpJob.status !== 'PENDING') {
            await this.prisma.spBooking.update({
                where: { id: existingSpJob.id },
                data: { status: 'PENDING' }
            });
        }

        // Provider notified instantly (Simulated push notification)
        console.log(`[Notification] Dispatching push to Provider ID: ${providerId} for new Booking: ${bookingId}`);

        // Customer sees assigned provider (Implicitly tracked in DB, emitting push notification to customer)
        console.log(`[Notification] Dispatching push to Customer ID: ${booking.userId} that Provider is assigned`);

        // Create Audit Log
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `BOOKING_PROVIDER_ASSIGNED`,
                    details: `Assigned provider ${providerId} to booking ${bookingId}`
                }
            });
        } catch (e) {
            console.error('Audit log creation failed: ', e);
        }

        return updatedBooking;
    }

    // FR-PRC-001: Create Pricing Rule
    async createPricingRule(data: CreatePricingRuleDto) {
        // Deactivate any existing active rule for this city & service type
        const existingActive = await this.prisma.pricingRule.findFirst({
            where: {
                service_type: data.service_type,
                city: data.city,
                isActive: true,
            }
        });

        const newVersion = existingActive ? existingActive.version + 1 : 1;

        if (existingActive) {
            await this.prisma.pricingRule.update({
                where: { id: existingActive.id },
                data: { isActive: false }
            });
        }

        return this.prisma.pricingRule.create({
            data: {
                service_type: data.service_type,
                city: data.city,
                base_price: data.base_price,
                version: newVersion,
                isActive: true,
            },
        });
    }

    async updatePricingRule(id: string, data: Partial<CreatePricingRuleDto>) {
        const existingRule = await this.prisma.pricingRule.findUnique({ where: { id } });
        if (!existingRule) throw new NotFoundException('Pricing rule not found');

        // Versioning: Mark current as inactive
        await this.prisma.pricingRule.update({
            where: { id },
            data: { isActive: false }
        });

        // Create new version
        return this.prisma.pricingRule.create({
            data: {
                service_type: data.service_type ?? existingRule.service_type,
                city: data.city ?? existingRule.city,
                base_price: data.base_price ?? existingRule.base_price,
                version: existingRule.version + 1,
                isActive: true,
            },
        });
    }

    async deletePricingRule(id: string) {
        // Versioning logic prefers soft delete for maintaining history of old bookings
        return this.prisma.pricingRule.update({
            where: { id },
            data: { isActive: false }
        });
    }

    // FR-PRC-001: Get Pricing Rules
    async getPricingRules(city?: string) {
        return this.prisma.pricingRule.findMany({
            where: {
                city: city ? city : undefined,
                isActive: true, // Only fetch active pricing rules
            },
            orderBy: {
                city: 'asc'
            }
        });
    }

    // FR-PRC-002: Create Surge Rule
    async createSurgeRule(data: CreateSurgeRuleDto) {
        return this.prisma.surgeRule.create({
            data: {
                PricingRuleid: data.pricingRuleId,
                multiplier: data.multiplier,
                condition: data.condition,
            },
        });
    }

    async updateSurgeRule(id: string, data: Partial<CreateSurgeRuleDto>) {
        const updateData: any = {};
        if (data.pricingRuleId) updateData.PricingRuleid = data.pricingRuleId;
        if (data.multiplier !== undefined) updateData.multiplier = data.multiplier;
        if (data.condition !== undefined) updateData.condition = data.condition;

        return this.prisma.surgeRule.update({
            where: { id },
            data: updateData,
        });
    }

    async deleteSurgeRule(id: string) {
        return this.prisma.surgeRule.delete({
            where: { id },
        });
    }

    // FR-PRC-002: Get Surge Rules
    async getSurgeRules() {
        return this.prisma.surgeRule.findMany();
    }

    // FR-FIN-001: Get All Wallets
    async getWallets() {
        return this.prisma.wallet.findMany({
            include: {
                user: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // FR-FIN-001: Get Wallet Ledger
    async getWalletLedger(walletId: string) {
        const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
        if (!wallet) throw new NotFoundException('Wallet not found');

        return this.prisma.walletLedger.findMany({
            where: { wallet_id: walletId },
            orderBy: { createdAt: 'desc' },
        });
    }

    // FR-FIN-002: Get All Settlements
    async getSettlements() {
        return this.prisma.settlement.findMany({
            include: {
                wallet: {
                    include: {
                        user: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // FR-FIN-002: Get Settlement Details
    async getSettlementDetails(id: string) {
        const settlement = await this.prisma.settlement.findUnique({
            where: { id },
            include: {
                wallet: {
                    include: {
                        user: true,
                    },
                },
            },
        });
        if (!settlement) throw new NotFoundException('Settlement not found');
        return settlement;
    }

    // Trigger Payout
    async triggerPayout(walletId: string, amount: number) {
        const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
        if (!wallet) throw new NotFoundException('Wallet not found');
        if (amount <= 0) throw new Error('Amount must be greater than 0');
        if (Number(wallet.balance) < amount) throw new Error('Payout cannot exceed wallet balance');

        const updatedWallet = await this.prisma.wallet.update({
            where: { id: walletId },
            data: { balance: { decrement: amount } }
        });

        await this.prisma.walletLedger.create({
            data: {
                wallet_id: walletId,
                entry_type: 'PAYOUT',
                amount: new Prisma.Decimal(-amount),
            }
        });

        const settlement = await this.prisma.settlement.create({
            data: {
                wallet_id: walletId,
                amount: amount,
                status: 'COMPLETED',
            }
        });

        return { wallet: updatedWallet, settlement };
    }

    // FR-ANA-001: Dashboard Statistics
    async getDashboardStats() {
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        // Current Month Data
        const currentMonthUsers = await this.prisma.user.count({ where: { createdAt: { gte: startOfCurrentMonth } } });
        const currentMonthBookings = await this.prisma.booking.count({ where: { createdAt: { gte: startOfCurrentMonth } } });
        const currentMonthRevenueAgg = await this.prisma.booking.aggregate({
            _sum: { totalAmount: true },
            where: { createdAt: { gte: startOfCurrentMonth }, status: 'COMPLETED' },
        });
        const currentMonthRevenue = Number(currentMonthRevenueAgg._sum.totalAmount || 0);

        // Last Month Data
        const lastMonthUsers = await this.prisma.user.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfCurrentMonth } } });
        const lastMonthBookings = await this.prisma.booking.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfCurrentMonth } } });
        const lastMonthRevenueAgg = await this.prisma.booking.aggregate({
            _sum: { totalAmount: true },
            where: { createdAt: { gte: startOfLastMonth, lt: startOfCurrentMonth }, status: 'COMPLETED' },
        });
        const lastMonthRevenue = Number(lastMonthRevenueAgg._sum.totalAmount || 0);

        // Global Overalls
        const totalUsers = await this.prisma.user.count();
        const activeUsers = await this.prisma.user.count({ where: { status: 'ACTIVE' } });
        const totalBookings = await this.prisma.booking.count();
        const totalRevenueAgg = await this.prisma.booking.aggregate({ _sum: { totalAmount: true }, where: { status: 'COMPLETED' } });
        const totalRevenue = Number(totalRevenueAgg._sum.totalAmount || 0);
        const pendingBookings = await this.prisma.booking.count({ where: { status: 'PENDING' } });
        const pendingKYC = await this.prisma.kYCRecord.count({ where: { status: 'PENDING' } });

        // Growth metrics (percentage change)
        const calcGrowth = (current: number, previous: number) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };

        return {
            totalUsers,
            activeUsers,
            totalBookings,
            pendingBookings,
            totalRevenue,
            pendingKYC,
            usersGrowth: calcGrowth(currentMonthUsers, lastMonthUsers),
            bookingsGrowth: calcGrowth(currentMonthBookings, lastMonthBookings),
            revenueGrowth: calcGrowth(currentMonthRevenue, lastMonthRevenue),
        };
    }

    // FR-ANA-002: User Analytics
    async getUserAnalytics() {
        const usersByRole = await this.prisma.user.groupBy({
            by: ['role'],
            _count: { id: true },
        });

        const usersByStatus = await this.prisma.user.groupBy({
            by: ['status'],
            _count: { id: true },
        });

        return {
            byRole: usersByRole.map(item => ({
                role: item.role,
                count: item._count.id,
            })),
            byStatus: usersByStatus.map(item => ({
                status: item.status,
                count: item._count.id,
            })),
        };
    }

    // FR-ANA-003: Booking Analytics
    async getBookingAnalytics() {
        const bookingsByStatus = await this.prisma.booking.groupBy({
            by: ['status'],
            _count: { id: true },
        });

        const recentBookings = await this.prisma.booking.count({
            where: {
                createdAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                },
            },
        });

        return {
            byStatus: bookingsByStatus.map(item => ({
                status: item.status,
                count: item._count.id,
            })),
            recentBookings,
        };
    }

    // FR-ANA-004: Revenue Analytics
    async getRevenueAnalytics() {
        // Return timeseries array for the last 7 days (used by the dashboard chart)
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            return d;
        }).reverse();

        const startDate = last7Days[0];

        const recentBookings = await this.prisma.booking.findMany({
            where: {
                createdAt: { gte: startDate },
                status: 'COMPLETED'
            },
            select: {
                createdAt: true,
                totalAmount: true,
            },
        });

        // Map into array of { period, bookings, revenue } expected by dashboard UI
        return last7Days.map(date => {
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);

            const dayBookings = recentBookings.filter(b => b.createdAt >= date && b.createdAt < nextDay);
            
            return {
                period: date.toISOString(),
                bookings: dayBookings.length,
                revenue: dayBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0),
            };
        });
    }

    // FR-KYC NOTIFY: Get admin notifications (unread first)
    async getNotifications(onlyUnread = true) {
        return this.prisma.adminNotification.findMany({
            where: onlyUnread ? { isRead: false } : undefined,
            orderBy: { createdAt: 'desc' },
        });
    }

    // Mark a notification as read
    async markNotificationRead(id: string) {
        return this.prisma.adminNotification.update({
            where: { id },
            data: { isRead: true },
        });
    }

    // ==================== SERVICE PROVIDERS ====================

    async getServiceProviders(params: { name?: string; city?: string; status?: string }) {
        const { name, city, status } = params;
        return this.prisma.serviceProvider.findMany({
            where: {
                name: name ? { contains: name, mode: 'insensitive' } : undefined,
                city: city ? { contains: city, mode: 'insensitive' } : undefined,
                status: status ? status : undefined,
            },
            include: { 
                user: true, 
                providerProfiles: true, 
                categories: true, 
                items: true 
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getServiceProviderById(id: string) {
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id },
            include: { 
                user: true, 
                providerProfiles: true, 
                availabilities: true, 
                categories: true, 
                items: true 
            },
        });
        if (!provider) throw new NotFoundException('Service provider not found');
        return provider;
    }

    async createServiceProvider(data: CreateServiceProviderDto) {
        // Verify user exists
        const user = await this.prisma.user.findUnique({ where: { id: data.user_id } });
        if (!user) throw new NotFoundException(`User with id ${data.user_id} not found`);

        return this.prisma.serviceProvider.create({
            data: {
                user_id: data.user_id,
                name: data.name,
                phoneNumber: data.phoneNumber,
                city: data.city,
                yearsOfExperience: data.yearsOfExperience ?? 0,
                status: data.status ?? 'PENDING',
                categories: data.categoryIds ? {
                    connect: data.categoryIds.map(id => ({ id }))
                } : undefined,
                items: data.itemIds ? {
                    connect: data.itemIds.map(id => ({ id }))
                } : undefined,
            },
            include: { user: true, categories: true, items: true },
        });
    }

    async updateServiceProvider(id: string, data: Partial<CreateServiceProviderDto>) {
        console.log(`[AdminService] Updating provider ${id} with data:`, JSON.stringify(data, null, 2));
        const provider = await this.prisma.serviceProvider.findUnique({ where: { id } });
        if (!provider) throw new NotFoundException('Service provider not found');

        return this.prisma.serviceProvider.update({
            where: { id },
            data: {
                name: data.name,
                phoneNumber: data.phoneNumber,
                city: data.city,
                yearsOfExperience: data.yearsOfExperience,
                status: data.status,
                categories: data.categoryIds ? {
                    set: data.categoryIds.map(id => ({ id }))
                } : undefined,
                items: data.itemIds ? {
                    set: data.itemIds.map(id => ({ id }))
                } : undefined,
            },
            include: { user: true, categories: true, items: true },
        });
    }

    async updateServiceProviderStatus(id: string, status: string, adminId: string) {
        const provider = await this.prisma.serviceProvider.findUnique({ where: { id } });
        if (!provider) throw new NotFoundException('Service provider not found');

        const updated = await this.prisma.serviceProvider.update({
            where: { id },
            data: { status },
        });

        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `PROVIDER_STATUS_UPDATE_${status}`,
                    details: `Provider ${id} status changed to ${status}`,
                },
            });
        } catch (e) {
            console.error('Audit log creation failed:', e);
        }

        return updated;
    }

    async deleteServiceProvider(id: string) {
        const provider = await this.prisma.serviceProvider.findUnique({ where: { id } });
        if (!provider) throw new NotFoundException('Service provider not found');
        return this.prisma.serviceProvider.delete({ where: { id } });
    }

    // ==================== SERVICE CATALOG MANAGEMENT ====================

    async createServiceCategory(data: CreateServiceCategoryDto) {
        return this.prisma.serviceCategory.create({
            data: {
                name: data.name,
                icon: data.icon,
                active: data.active ?? true,
            },
        });
    }

    async getServiceCategories(includeItems = false) {
        return this.prisma.serviceCategory.findMany({
            include: {
                items: includeItems,
            },
            orderBy: { name: 'asc' },
        });
    }

    async createServiceItem(data: CreateServiceItemDto) {
        // Verify category exists
        const category = await this.prisma.serviceCategory.findUnique({ where: { id: data.categoryId } });
        if (!category) throw new NotFoundException(`Category with ID ${data.categoryId} not found`);

        return this.prisma.serviceItem.create({
            data: {
                name: data.name,
                description: data.description,
                price: new Prisma.Decimal(data.price),
                categoryId: data.categoryId,
                durationMinutes: data.durationMinutes ?? 60,
            },
        });
    }

    async getServiceItems(categoryId?: string) {
        return this.prisma.serviceItem.findMany({
            where: categoryId ? { categoryId } : undefined,
            include: {
                category: true,
            },
            orderBy: { name: 'asc' },
        });
    }
}

