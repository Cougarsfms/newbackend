import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma, Role, BookingStatus, Booking, FraudFlag } from '@prisma/client';
import * as crypto from 'crypto';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { CreateSurgeRuleDto } from './dto/create-surge-rule.dto';
import { CreateServiceProviderDto } from './dto/create-service-provider.dto';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto';
import { CreateServiceItemDto } from './dto/create-service-item.dto';
import { UpdateServiceItemDto } from './dto/update-service-item.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { GeneratePayrollSettlementDto } from './dto/generate-payroll-settlement.dto';
import { ExportPayrollReportDto } from './dto/export-payroll-report.dto';
import { DetectFraudDto } from './dto/detect-fraud.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
    private readonly logger = new Logger(AdminService.name);

    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService
    ) { }

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

    async updateUserRole(
        userId: string,
        role: Role,
        adminId: string,
    ): Promise<User> {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        let passwordHash = user.passwordHash;
        
        // If they are promoted to TEAM_LEADER and don't have a password set, set default to '123456'
        if (role === 'TEAM_LEADER' && !passwordHash) {
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto
                .pbkdf2Sync('123456', salt, 100_000, 64, 'sha512')
                .toString('hex');
            passwordHash = `${salt}:${hash}`;
        }

        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { 
                role,
                passwordHash
            },
        });

        // Create Audit Log
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `USER_ROLE_UPDATE_${role}`,
                    details: `Updated role of user ${userId} to ${role}`,
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

    // FR-FIN-003: Get All Payment Transactions for Admin Audit (AC 15)
    async getPayments() {
        return this.prisma.payment.findMany({
            include: {
                booking: {
                    include: {
                        user: true,
                        service: true,
                        provider: true,
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
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
        try {
            const now = new Date();
            const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

            const [
                currentMonthUsers,
                currentMonthBookings,
                currentMonthRevenueAgg,
                lastMonthUsers,
                lastMonthBookings,
                lastMonthRevenueAgg,
                totalUsers,
                activeUsers,
                totalBookings,
                totalRevenueAgg,
                pendingBookings,
                pendingKYC
            ] = await Promise.all([
                this.prisma.user.count({ where: { createdAt: { gte: startOfCurrentMonth } } }).catch(() => 0),
                this.prisma.booking.count({ where: { createdAt: { gte: startOfCurrentMonth } } }).catch(() => 0),
                this.prisma.booking.aggregate({ _sum: { totalAmount: true }, where: { createdAt: { gte: startOfCurrentMonth }, status: 'COMPLETED' } }).catch(() => ({ _sum: { totalAmount: null } })),
                this.prisma.user.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfCurrentMonth } } }).catch(() => 0),
                this.prisma.booking.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfCurrentMonth } } }).catch(() => 0),
                this.prisma.booking.aggregate({ _sum: { totalAmount: true }, where: { createdAt: { gte: startOfLastMonth, lt: startOfCurrentMonth }, status: 'COMPLETED' } }).catch(() => ({ _sum: { totalAmount: null } })),
                this.prisma.user.count().catch(() => 0),
                this.prisma.user.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
                this.prisma.booking.count().catch(() => 0),
                this.prisma.booking.aggregate({ _sum: { totalAmount: true }, where: { status: 'COMPLETED' } }).catch(() => ({ _sum: { totalAmount: null } })),
                this.prisma.booking.count({ where: { status: 'PENDING' } }).catch(() => 0),
                this.prisma.kYCRecord.count({ where: { status: 'PENDING' } }).catch(() => 0),
            ]);

            const currentMonthRevenue = Number(currentMonthRevenueAgg._sum.totalAmount || 0);
            const lastMonthRevenue = Number(lastMonthRevenueAgg._sum.totalAmount || 0);
            const totalRevenue = Number(totalRevenueAgg._sum.totalAmount || 0);

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
                revenue: totalRevenue,
                pendingKYC,
                usersGrowth: calcGrowth(currentMonthUsers, lastMonthUsers),
                bookingsGrowth: calcGrowth(currentMonthBookings, lastMonthBookings),
                revenueGrowth: calcGrowth(currentMonthRevenue, lastMonthRevenue),
            };
        } catch (error: any) {
            this.logger.error(`getDashboardStats error: ${error.message}`, error.stack);
            return {
                totalUsers: 0,
                activeUsers: 0,
                totalBookings: 0,
                pendingBookings: 0,
                totalRevenue: 0,
                revenue: 0,
                pendingKYC: 0,
                usersGrowth: 0,
                bookingsGrowth: 0,
                revenueGrowth: 0,
            };
        }
    }

    // FR-ANA-002: User Analytics
    async getUserAnalytics() {
        try {
            const usersByRole = await this.prisma.user.groupBy({
                by: ['role'],
                _count: { id: true },
            }).catch(() => []);

            const usersByStatus = await this.prisma.user.groupBy({
                by: ['status'],
                _count: { id: true },
            }).catch(() => []);

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
        } catch (error: any) {
            this.logger.error(`getUserAnalytics error: ${error.message}`, error.stack);
            return { byRole: [], byStatus: [] };
        }
    }

    // FR-ANA-003: Booking Analytics
    async getBookingAnalytics() {
        try {
            const bookingsByStatus = await this.prisma.booking.groupBy({
                by: ['status'],
                _count: { id: true },
            }).catch(() => []);

            const recentBookings = await this.prisma.booking.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    },
                },
            }).catch(() => 0);

            return {
                byStatus: bookingsByStatus.map(item => ({
                    status: item.status,
                    count: item._count.id,
                })),
                recentBookings,
            };
        } catch (error: any) {
            this.logger.error(`getBookingAnalytics error: ${error.message}`, error.stack);
            return { byStatus: [], recentBookings: 0 };
        }
    }

    // FR-ANA-004: Revenue Analytics
    async getRevenueAnalytics() {
        try {
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
            }).catch(() => [] as Array<{ createdAt: Date; totalAmount: any }>);

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
        } catch (error: any) {
            this.logger.error(`getRevenueAnalytics error: ${error.message}`, error.stack);
            return [];
        }
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
                items: true,
                teamLeader: true
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
                items: true,
                teamLeader: true
            },
        });
        if (!provider) throw new NotFoundException('Service provider not found');
        return provider;
    }

    async createServiceProvider(data: CreateServiceProviderDto) {
        // Verify user exists
        const user = await this.prisma.user.findUnique({ where: { id: data.user_id } });
        if (!user) throw new NotFoundException(`User with id ${data.user_id} not found`);

        if (data.teamLeaderId) {
            const tl = await this.prisma.user.findUnique({ where: { id: data.teamLeaderId } });
            if (!tl) throw new NotFoundException('Team Leader user not found');
            if (tl.role !== 'TEAM_LEADER') {
                throw new BadRequestException('Selected user is not a Team Leader');
            }
        }

        return this.prisma.serviceProvider.create({
            data: {
                user_id: data.user_id,
                name: data.name,
                phoneNumber: data.phoneNumber,
                city: data.city,
                yearsOfExperience: data.yearsOfExperience ?? 0,
                status: data.status ?? 'PENDING',
                teamLeaderId: data.teamLeaderId || null,
                categories: data.categoryIds ? {
                    connect: data.categoryIds.map(id => ({ id }))
                } : undefined,
                items: data.itemIds ? {
                    connect: data.itemIds.map(id => ({ id }))
                } : undefined,
            },
            include: { user: true, categories: true, items: true, teamLeader: true },
        });
    }

    async updateServiceProvider(id: string, data: Partial<CreateServiceProviderDto>) {
        console.log(`[AdminService] Updating provider ${id} with data:`, JSON.stringify(data, null, 2));
        const provider = await this.prisma.serviceProvider.findUnique({ where: { id } });
        if (!provider) throw new NotFoundException('Service provider not found');

        if (data.teamLeaderId) {
            const tl = await this.prisma.user.findUnique({ where: { id: data.teamLeaderId } });
            if (!tl) throw new NotFoundException('Team Leader user not found');
            if (tl.role !== 'TEAM_LEADER') {
                throw new BadRequestException('Selected user is not a Team Leader');
            }
        }

        return this.prisma.serviceProvider.update({
            where: { id },
            data: {
                name: data.name,
                phoneNumber: data.phoneNumber,
                city: data.city,
                yearsOfExperience: data.yearsOfExperience,
                status: data.status,
                teamLeaderId: data.teamLeaderId === '' ? null : (data.teamLeaderId !== undefined ? data.teamLeaderId : undefined),
                categories: data.categoryIds ? {
                    set: data.categoryIds.map(id => ({ id }))
                } : undefined,
                items: data.itemIds ? {
                    set: data.itemIds.map(id => ({ id }))
                } : undefined,
            },
            include: { user: true, categories: true, items: true, teamLeader: true },
        });
    }

    async assignTeamLeader(providerId: string, teamLeaderId: string | null | undefined, adminId: string) {
        const provider = await this.prisma.serviceProvider.findUnique({ where: { id: providerId } });
        if (!provider) throw new NotFoundException('Service provider not found');

        if (teamLeaderId) {
            const tl = await this.prisma.user.findUnique({ where: { id: teamLeaderId } });
            if (!tl) throw new NotFoundException('Team Leader user not found');
            if (tl.role !== 'TEAM_LEADER') {
                throw new BadRequestException('Selected user is not a Team Leader');
            }
        }

        const targetTlId = teamLeaderId === '' ? null : (teamLeaderId || null);

        const updated = await this.prisma.serviceProvider.update({
            where: { id: providerId },
            data: { teamLeaderId: targetTlId },
            include: { user: true, categories: true, items: true, teamLeader: true }
        });

        // Audit Log
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `PROVIDER_ASSIGN_TL`,
                    details: targetTlId 
                        ? `Assigned Team Leader ${targetTlId} to provider ${providerId}`
                        : `Unassigned Team Leader from provider ${providerId}`,
                },
            });
        } catch (e) {
            console.error('Audit log creation failed:', e);
        }

        return updated;
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
                imageUrl: data.imageUrl || null,
            },
        });
    }

    async updateServiceItem(id: string, data: UpdateServiceItemDto) {
        // Verify service item exists
        const serviceItem = await this.prisma.serviceItem.findUnique({ where: { id } });
        if (!serviceItem) throw new NotFoundException(`Service item with ID ${id} not found`);

        if (data.categoryId) {
            const category = await this.prisma.serviceCategory.findUnique({ where: { id: data.categoryId } });
            if (!category) throw new NotFoundException(`Category with ID ${data.categoryId} not found`);
        }

        return this.prisma.serviceItem.update({
            where: { id },
            data: {
                name: data.name,
                description: data.description,
                price: data.price !== undefined ? new Prisma.Decimal(data.price) : undefined,
                categoryId: data.categoryId,
                durationMinutes: data.durationMinutes,
                imageUrl: data.imageUrl,
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

    // ==================== COUPON MANAGEMENT ====================

    async createCoupon(data: CreateCouponDto) {
        return this.prisma.coupon.create({
            data: {
                code: data.code.toUpperCase(),
                discountPercent: data.discountPercent,
                maxDiscount: data.maxDiscount,
                expiryDate: new Date(data.expiryDate),
                isActive: data.isActive ?? true,
                usageLimit: data.usageLimit ?? 0,
                // Package fields
                isVisibleOnHome: data.isVisibleOnHome ?? false,
                price: data.price ?? 0,
                allowedJobsCount: data.allowedJobsCount ?? 0,
                jobDurationMinutes: data.jobDurationMinutes ?? 60,
                description: data.description ?? null,
            },
        });
    }

    async getCoupons() {
        return this.prisma.coupon.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    async deleteCoupon(id: string) {
        return this.prisma.coupon.delete({
            where: { id },
        });
    }

    // ==================== SHIFT CONFIGURATION (FR-PAY-001) ====================

    async createShiftType(data: { Shift_Name: string; Duration_hours: number; Daily_Salary: number; Overtime_Rate: number; attendancePercent?: number; targetJobs?: number; status?: string }, adminId: string) {
        // 1. Validate
        if (![8, 10, 12].includes(data.Duration_hours)) {
            throw new BadRequestException('Shift duration must be 8, 10, or 12 hours.');
        }
        if (data.Daily_Salary < 0 || data.Overtime_Rate < 0) {
            throw new BadRequestException('Daily Salary and Overtime Rate must be non-negative.');
        }
        if (data.attendancePercent !== undefined && (data.attendancePercent < 0 || data.attendancePercent > 100)) {
            throw new BadRequestException('Attendance requirement percentage must be between 0 and 100.');
        }
        if (data.targetJobs !== undefined && data.targetJobs < 1) {
            throw new BadRequestException('Target jobs workload must be at least 1.');
        }

        // 2. Process & Save
        const shiftType = await this.prisma.provider_Shift_Type.create({
            data: {
                Shift_Name: data.Shift_Name,
                Duration_hours: data.Duration_hours,
                Daily_Salary: new Prisma.Decimal(data.Daily_Salary),
                Overtime_Rate: data.Overtime_Rate,
                attendancePercent: data.attendancePercent ?? 90,
                targetJobs: data.targetJobs ?? 5,
                status: data.status ?? 'ACTIVE',
            },
        });

        // 3. Notify & Postconditions (Audit Log)
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `SHIFT_TYPE_CREATE_${shiftType.id}`,
                    details: `Created shift type "${data.Shift_Name}" with daily salary ${data.Daily_Salary}, overtime rate ${data.Overtime_Rate}, attendance requirement ${data.attendancePercent ?? 90}%, target jobs ${data.targetJobs ?? 5}, and status ${data.status ?? 'ACTIVE'}.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log creation failed for shift creation: ', e);
        }

        return shiftType;
    }

    async updateShiftType(id: string, data: { Shift_Name?: string; Duration_hours?: number; Daily_Salary?: number; Overtime_Rate?: number; attendancePercent?: number; targetJobs?: number; status?: string }, adminId: string) {
        // 1. Validate
        const existing = await this.prisma.provider_Shift_Type.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Shift type not found');

        if (data.Duration_hours !== undefined && ![8, 10, 12].includes(data.Duration_hours)) {
            throw new BadRequestException('Shift duration must be 8, 10, or 12 hours.');
        }
        if ((data.Daily_Salary !== undefined && data.Daily_Salary < 0) || (data.Overtime_Rate !== undefined && data.Overtime_Rate < 0)) {
            throw new BadRequestException('Daily Salary and Overtime Rate must be non-negative.');
        }
        if (data.attendancePercent !== undefined && (data.attendancePercent < 0 || data.attendancePercent > 100)) {
            throw new BadRequestException('Attendance requirement percentage must be between 0 and 100.');
        }
        if (data.targetJobs !== undefined && data.targetJobs < 1) {
            throw new BadRequestException('Target jobs workload must be at least 1.');
        }

        // 2. Process & Save
        const updated = await this.prisma.provider_Shift_Type.update({
            where: { id },
            data: {
                Shift_Name: data.Shift_Name,
                Duration_hours: data.Duration_hours,
                Daily_Salary: data.Daily_Salary !== undefined ? new Prisma.Decimal(data.Daily_Salary) : undefined,
                Overtime_Rate: data.Overtime_Rate,
                attendancePercent: data.attendancePercent,
                targetJobs: data.targetJobs,
                status: data.status,
            },
        });

        // 3. Notify & Postconditions (Audit Log)
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `SHIFT_TYPE_UPDATE_${updated.id}`,
                    details: `Updated shift type "${updated.Shift_Name}". Changes: ${JSON.stringify(data)}`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log creation failed for shift update: ', e);
        }

        return updated;
    }

    async findAllShiftTypes() {
        return this.prisma.provider_Shift_Type.findMany({});
    }

    async findOneShiftType(id: string) {
        const shiftType = await this.prisma.provider_Shift_Type.findUnique({ where: { id } });
        if (!shiftType) throw new NotFoundException('Shift type not found');
        return shiftType;
    }

    async deleteShiftType(id: string, adminId: string) {
        const existing = await this.prisma.provider_Shift_Type.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Shift type not found');

        await this.prisma.provider_Shift_Type.delete({ where: { id } });

        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `SHIFT_TYPE_DELETE_${id}`,
                    details: `Deleted shift type "${existing.Shift_Name}"`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log creation failed for shift deletion: ', e);
        }

        return { success: true };
    }

    // ==================== SHIFT ASSIGNMENT (FR-PAY-002) ====================

    async assignShift(data: { provider_id: string; shift_type_id: string; assignment_date: string }, adminId: string) {
        const { provider_id, shift_type_id, assignment_date } = data;
        const targetDate = new Date(assignment_date);

        // 1. Validate: Provider exists
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: provider_id },
            include: { user: true }
        });
        if (!provider) throw new NotFoundException('Service provider not found');

        // 1. Validate: Precondition (Provider verified)
        const isVerified = provider.status === 'ACTIVE' || provider.status === 'APPROVED' || provider.Kyc_status === 'APPROVED';
        if (!isVerified) {
            throw new BadRequestException('Shift can only be assigned to a verified/approved provider.');
        }

        // 1. Validate: Shift Type exists
        const shiftType = await this.prisma.provider_Shift_Type.findUnique({
            where: { id: shift_type_id }
        });
        if (!shiftType) throw new NotFoundException('Shift type configuration not found');

        // 1. Validate: Prevent double booking for the same provider on the same assignment date
        const startOfDay = new Date(targetDate.setUTCHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setUTCHours(23, 59, 59, 999));

        const existingAssignment = await this.prisma.provider_Shift_Assignments.findFirst({
            where: {
                provider_id,
                assignment_date: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                Status: { not: 'CANCELLED' }
            }
        });
        if (existingAssignment) {
            throw new BadRequestException('Provider is already assigned to a shift on this date.');
        }

        // 2. Process & Save
        const assignment = await this.prisma.provider_Shift_Assignments.create({
            data: {
                provider_id,
                shift_type_id,
                assignment_date: new Date(assignment_date),
                Status: 'PENDING',
            }
        });

        // 3. Notify (Audit Log)
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `SHIFT_ASSIGN_CREATE_${assignment.id}`,
                    details: `Assigned provider ${provider.name} to shift ${shiftType.Shift_Name} for date ${assignment_date}`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for shift assignment: ', e);
        }

        // 3. Notify (Push notification to Provider)
        if (provider.user?.fcmToken) {
            try {
                await this.notifications.sendPushNotification(
                    provider.user.fcmToken,
                    'New Shift Assigned 📅',
                    `You have been assigned to ${shiftType.Shift_Name} on ${new Date(assignment_date).toLocaleDateString()}`,
                    {
                        type: 'SHIFT_ASSIGNMENT',
                        assignmentId: assignment.id,
                        shiftName: shiftType.Shift_Name,
                        date: assignment_date,
                    }
                );
            } catch (e) {
                console.error('[AdminService] Push notification failed for shift assignment: ', e);
            }
        }

        return {
            ...assignment,
            provider
        };
    }

    async findAllShiftAssignments(params?: { provider_id?: string; shift_type_id?: string; date?: string }) {
        const whereClause: any = {};
        if (params?.provider_id) whereClause.provider_id = params.provider_id;
        if (params?.shift_type_id) whereClause.shift_type_id = params.shift_type_id;
        if (params?.date) {
            const d = new Date(params.date);
            const start = new Date(d.setUTCHours(0, 0, 0, 0));
            const end = new Date(d.setUTCHours(23, 59, 59, 999));
            whereClause.assignment_date = { gte: start, lte: end };
        }

        const assignments = await this.prisma.provider_Shift_Assignments.findMany({
            where: whereClause,
            orderBy: { assignment_date: 'desc' }
        });

        const providerIds = Array.from(new Set(assignments.map(a => a.provider_id)));
        const providers = await this.prisma.serviceProvider.findMany({
            where: { id: { in: providerIds } }
        });
        const providerMap = new Map(providers.map(p => [p.id, p]));

        const shiftTypeIds = Array.from(new Set(assignments.map(a => a.shift_type_id)));
        const shiftTypes = await this.prisma.provider_Shift_Type.findMany({
            where: { id: { in: shiftTypeIds } }
        });
        const shiftTypeMap = new Map(shiftTypes.map(s => [s.id, s]));

        return assignments.map(assignment => ({
            ...assignment,
            provider: providerMap.get(assignment.provider_id) || null,
            shiftType: shiftTypeMap.get(assignment.shift_type_id) || null
        }));
    }

    async findOneShiftAssignment(id: string) {
        const assignment = await this.prisma.provider_Shift_Assignments.findUnique({
            where: { id }
        });
        if (!assignment) throw new NotFoundException('Shift assignment not found');

        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: assignment.provider_id }
        });

        const shiftType = await this.prisma.provider_Shift_Type.findUnique({
            where: { id: assignment.shift_type_id }
        });

        return {
            ...assignment,
            provider: provider || null,
            shiftType: shiftType || null
        };
    }

    async updateShiftAssignmentStatus(id: string, status: string, adminId: string) {
        const existing = await this.prisma.provider_Shift_Assignments.findUnique({
            where: { id }
        });
        if (!existing) throw new NotFoundException('Shift assignment not found');

        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: existing.provider_id },
            include: { user: true }
        });

        const updated = await this.prisma.provider_Shift_Assignments.update({
            where: { id },
            data: { Status: status }
        });

        // 3. Notify (Audit Log)
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `SHIFT_ASSIGN_STATUS_${status}_${id}`,
                    details: `Updated status of shift assignment ${id} to ${status}`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for assignment status update: ', e);
        }

        // 3. Notify (Push notification to Provider)
        if (provider?.user?.fcmToken) {
            try {
                await this.notifications.sendPushNotification(
                    provider.user.fcmToken,
                    'Shift Assignment Update 📅',
                    `Your shift assignment on ${new Date(existing.assignment_date).toLocaleDateString()} status is now ${status}`,
                    {
                        type: 'SHIFT_ASSIGNMENT_UPDATE',
                        assignmentId: id,
                        status: status,
                    }
                );
            } catch (e) {
                console.error('[AdminService] Push notification failed for assignment update: ', e);
            }
        }

        return {
            ...updated,
            provider
        };
    }

    async deleteShiftAssignment(id: string, adminId: string) {
        const existing = await this.prisma.provider_Shift_Assignments.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Shift assignment not found');

        await this.prisma.provider_Shift_Assignments.delete({ where: { id } });

        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `SHIFT_ASSIGN_DELETE_${id}`,
                    details: `Deleted shift assignment for provider ${existing.provider_id} on ${existing.assignment_date}`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for shift assignment deletion: ', e);
        }

        return { success: true };
    }

    // ==================== ATTENDANCE CLASSIFICATION (FR-PAY-005) ====================

    async classifyAttendanceRecord(attendanceId: string, adminId: string) {
        const attendance = await this.prisma.provider_Attendance.findUnique({
            where: { id: attendanceId }
        });
        if (!attendance) throw new NotFoundException('Attendance record not found');

        const shiftType = await this.prisma.provider_Shift_Type.findUnique({
            where: { id: attendance.shift_type_id }
        });
        const targetDuration = shiftType?.Duration_hours ?? 8;
        const workedHours = attendance.total_hours;

        let classification = 'PRESENT';
        if (workedHours < (targetDuration * 0.5)) {
            classification = 'ABSENT';
        } else if (workedHours < (targetDuration * 0.9)) {
            classification = 'HALF_DAY';
        }

        const updated = await this.prisma.provider_Attendance.update({
            where: { id: attendanceId },
            data: { Status: classification }
        });

        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `ATTENDANCE_CLASSIFY_${attendanceId}`,
                    details: `Manually classified attendance ${attendanceId} as ${classification}. Worked ${workedHours}/${targetDuration} hours.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for manual attendance classification: ', e);
        }

        return {
            ...updated,
            shiftType
        };
    }

    async runClassifyRoutine(dateStr: string, adminId: string) {
        const targetDate = new Date(dateStr);
        const startOfDay = new Date(targetDate.setUTCHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setUTCHours(23, 59, 59, 999));

        // 1. Fetch all assignments for the target date
        const assignments = await this.prisma.provider_Shift_Assignments.findMany({
            where: {
                assignment_date: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                Status: { not: 'CANCELLED' }
            }
        });

        const report = {
            totalProcessed: 0,
            present: 0,
            halfDay: 0,
            absent: 0,
        };

        // 2. Iterate through assignments to classify attendance
        for (const assignment of assignments) {
            // Find existing attendance
            const attendance = await this.prisma.provider_Attendance.findFirst({
                where: {
                    provider_id: assignment.provider_id,
                    shift_type_id: assignment.shift_type_id,
                    attendance_date: {
                        gte: startOfDay,
                        lte: endOfDay,
                    }
                }
            });

            const shiftType = await this.prisma.provider_Shift_Type.findUnique({
                where: { id: assignment.shift_type_id }
            });
            const targetDuration = shiftType?.Duration_hours ?? 8;

            if (!attendance) {
                // Precondition: Clock-in/out does NOT exist -> Mark as ABSENT
                await this.prisma.provider_Attendance.create({
                    data: {
                        provider_id: assignment.provider_id,
                        shift_type_id: assignment.shift_type_id,
                        attendance_date: assignment.assignment_date,
                        in_time: assignment.assignment_date,
                        out_time: assignment.assignment_date,
                        total_hours: 0,
                        Status: 'ABSENT',
                    }
                });
                report.absent++;
            } else {
                // Attendance exists
                let workedHours = attendance.total_hours;

                // Handle active clock-ins that were never clocked out
                if (attendance.Status === 'CLOCKED_IN' && !attendance.out_time) {
                    // Automatically mark as ABSENT/LATE or close it
                    const updated = await this.prisma.provider_Attendance.update({
                        where: { id: attendance.id },
                        data: {
                            out_time: attendance.in_time,
                            total_hours: 0,
                            Status: 'ABSENT',
                        }
                    });
                    report.absent++;
                } else {
                    // Already clocked out, re-run classification algorithm
                    let classification = 'PRESENT';
                    if (workedHours < (targetDuration * 0.5)) {
                        classification = 'ABSENT';
                        report.absent++;
                    } else if (workedHours < (targetDuration * 0.9)) {
                        classification = 'HALF_DAY';
                        report.halfDay++;
                    } else {
                        report.present++;
                    }

                    await this.prisma.provider_Attendance.update({
                        where: { id: attendance.id },
                        data: { Status: classification }
                    });
                }
            }
            report.totalProcessed++;
        }

        // 3. Save logs and postconditions
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `ATTENDANCE_ROUTINE_RUN_${dateStr}`,
                    details: `Executed daily attendance classification routine for ${dateStr}. Report: Processed ${report.totalProcessed}, Present ${report.present}, Half-Day ${report.halfDay}, Absent ${report.absent}.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for routine run: ', e);
        }

        return report;
    }

    // ==================== SALARY CALCULATION (FR-PAY-006) ====================

    async calculateSalaryForAttendance(attendanceId: string, adminId: string) {
        // 1. Validate: Attendance exists
        const attendance = await this.prisma.provider_Attendance.findUnique({
            where: { id: attendanceId }
        });
        if (!attendance) throw new NotFoundException('Attendance record not found');

        // Precondition: Shift completed (must not be CLOCKED_IN)
        if (attendance.Status === 'CLOCKED_IN') {
            throw new BadRequestException('Cannot calculate salary for an active clock-in. Shift must be completed.');
        }

        // 2. Fetch Shift Type details
        const shiftType = await this.prisma.provider_Shift_Type.findUnique({
            where: { id: attendance.shift_type_id }
        });
        if (!shiftType) throw new NotFoundException('Shift type configuration not found');

        // 3. Seed default rules if tables are empty (helps in testing immediately)
        try {
            const bonusCount = await this.prisma.provider_Bonus_Rules.count();
            if (bonusCount === 0) {
                await this.prisma.provider_Bonus_Rules.create({
                    data: { Rule_Name: 'Perfect Attendance Bonus', Amount: 50.00, Condition_Type: 'PRESENT' }
                });
            }
            const penaltyCount = await this.prisma.provider_Penalty_Rules.count();
            if (penaltyCount === 0) {
                await this.prisma.provider_Penalty_Rules.create({
                    data: { Rule_Name: 'Absent Penalty Deduction', Amount: 100.00, Violation_Type: 'ABSENT' }
                });
            }
        } catch (e) {
            console.error('[AdminService] Seeding rules failed: ', e);
        }

        // 4. Calculate Base Salary
        let baseSalary = 0;
        const dailySalary = Number(shiftType.Daily_Salary);
        if (attendance.Status === 'PRESENT') {
            baseSalary = dailySalary;
        } else if (attendance.Status === 'HALF_DAY') {
            baseSalary = dailySalary * 0.5;
        } else if (attendance.Status === 'ABSENT') {
            baseSalary = 0;
        }

        // 5. Calculate Overtime Pay
        let overtimePay = 0;
        if (attendance.total_hours > shiftType.Duration_hours) {
            const overtimeHours = attendance.total_hours - shiftType.Duration_hours;
            overtimePay = overtimeHours * shiftType.Overtime_Rate;
        }

        // 6. Fetch and Calculate Bonus Incentives
        const bonusRules = await this.prisma.provider_Bonus_Rules.findMany({
            where: { Condition_Type: attendance.Status }
        });
        const bonusAmount = bonusRules.reduce((sum, rule) => sum + Number(rule.Amount), 0);

        // 7. Fetch and Calculate Penalty Deductions
        const penaltyRules = await this.prisma.provider_Penalty_Rules.findMany({
            where: { Violation_Type: attendance.Status }
        });
        const penaltyAmount = penaltyRules.reduce((sum, rule) => sum + Number(rule.Amount), 0);

        // 8. Calculate Final Total Pay (never let it drop below 0)
        const totalPay = Math.max(0, baseSalary + overtimePay + bonusAmount - penaltyAmount);

        // 9. Prevent duplicate ledger record on the same date for the same provider
        const startOfDay = new Date(attendance.attendance_date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(attendance.attendance_date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        let ledger = await this.prisma.provider_Salary_Ledger.findFirst({
            where: {
                provider_id: attendance.provider_id,
                Shift_Date: {
                    gte: startOfDay,
                    lte: endOfDay,
                }
            }
        });

        if (ledger) {
            // Update existing entry
            ledger = await this.prisma.provider_Salary_Ledger.update({
                where: { id: ledger.id },
                data: {
                    Base_Salary: baseSalary,
                    Overtime_pay: overtimePay,
                    Bonus_Amount: bonusAmount,
                    Penalty_Amount: penaltyAmount,
                    Total_pay: totalPay,
                }
            });
        } else {
            // Create new ledger entry
            ledger = await this.prisma.provider_Salary_Ledger.create({
                data: {
                    provider_id: attendance.provider_id,
                    Shift_Date: attendance.attendance_date,
                    Base_Salary: baseSalary,
                    Overtime_pay: overtimePay,
                    Bonus_Amount: bonusAmount,
                    Penalty_Amount: penaltyAmount,
                    Total_pay: totalPay,
                }
            });
        }

        // 10. Audit Log & Notifications
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `SALARY_CALCULATED_${ledger.id}`,
                    details: `Calculated daily pay of ${totalPay} for provider ${attendance.provider_id}. Base: ${baseSalary}, OT: ${overtimePay}, Bonus: ${bonusAmount}, Penalty: ${penaltyAmount}.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Salary calculation audit log failed: ', e);
        }

        return {
            ...ledger,
            attendance,
            shiftType
        };
    }

    async runSalaryCalculationRoutine(dateStr: string, adminId: string) {
        const targetDate = new Date(dateStr);
        const startOfDay = new Date(targetDate.setUTCHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setUTCHours(23, 59, 59, 999));

        // 1. Scan all attendance records classified for the target date (excluding active clock-ins)
        const attendanceRecords = await this.prisma.provider_Attendance.findMany({
            where: {
                attendance_date: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                Status: { not: 'CLOCKED_IN' }
            }
        });

        const report = {
            totalProcessed: 0,
            totalPayoutCalculated: 0,
            successCount: 0,
            failedCount: 0,
        };

        // 2. Iterate and process each record
        for (const attendance of attendanceRecords) {
            try {
                const ledger = await this.calculateSalaryForAttendance(attendance.id, adminId);
                report.totalPayoutCalculated += Number(ledger.Total_pay);
                report.successCount++;
            } catch (e) {
                console.error(`[AdminService] Salary calculation failed for attendance ${attendance.id}: `, e);
                report.failedCount++;
            }
            report.totalProcessed++;
        }

        // 3. Postconditions and Audit Logs
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `SALARY_ROUTINE_RUN_${dateStr}`,
                    details: `Daily salary calculation routine executed for ${dateStr}. Processed ${report.totalProcessed} records. Success: ${report.successCount}, Failed: ${report.failedCount}. Total payout calculated: ${report.totalPayoutCalculated}.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for salary routine: ', e);
        }

        return report;
    }

    // ==================== BONUS MANAGEMENT (FR-PAY-007) ====================

    async applyPerformanceBonus(providerId: string, metricName: string, adminId: string) {
        // 1. Validate: Provider exists
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: providerId },
            include: { user: true }
        });
        if (!provider) throw new NotFoundException('Service provider not found');

        // 2. Preconditions: Fetch/seed performance bonus rule
        let bonusRule = await this.prisma.provider_Bonus_Rules.findFirst({
            where: { Condition_Type: 'PERFORMANCE' }
        });
        if (!bonusRule) {
            bonusRule = await this.prisma.provider_Bonus_Rules.create({
                data: { Rule_Name: 'High Rating Performance Bonus', Amount: 150.00, Condition_Type: 'PERFORMANCE' }
            });
        }

        // 3. Inputs: Retrieve performance metric values or count completed bookings
        const completedJobs = await this.prisma.spBooking.count({
            where: { provider_id: providerId, status: 'COMPLETED' }
        });

        // Let's also check if there is an explicit performancemetric record
        let metricRecord = await this.prisma.performancemetric.findFirst({
            where: { provider_id: providerId, metric: metricName }
        });
        if (!metricRecord) {
            // Seed a performancemetric record based on completed jobs
            metricRecord = await this.prisma.performancemetric.create({
                data: {
                    provider_id: providerId,
                    metric: metricName,
                    value: completedJobs || 5, // Default to a positive metric if completed jobs is 0
                }
            });
        }

        const performanceValue = metricRecord.value;
        const bonusAmount = Number(bonusRule.Amount);

        // Precondition threshold: Value must be >= 1 (e.g. at least 1 job completed)
        if (performanceValue < 1) {
            throw new BadRequestException(`Provider does not qualify for performance bonus. Metric value: ${performanceValue}.`);
        }

        // 4. Process: Find or create SpWallet and apply bonus
        let wallet = await this.prisma.spWallet.findFirst({
            where: { provider_id: providerId }
        });
        if (!wallet) {
            wallet = await this.prisma.spWallet.create({
                data: { provider_id: providerId, balance: 0.00 }
            });
        }

        const newBalance = Number(wallet.balance) + bonusAmount;
        await this.prisma.spWallet.update({
            where: { id: wallet.id },
            data: { balance: newBalance }
        });

        // 5. Process: Save to daily salary ledger for audit and compliance
        const today = new Date();
        const startOfDay = new Date(today.setUTCHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setUTCHours(23, 59, 59, 999));

        let ledger = await this.prisma.provider_Salary_Ledger.findFirst({
            where: {
                provider_id: providerId,
                Shift_Date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        if (ledger) {
            await this.prisma.provider_Salary_Ledger.update({
                where: { id: ledger.id },
                data: {
                    Bonus_Amount: Number(ledger.Bonus_Amount) + bonusAmount,
                    Total_pay: Number(ledger.Total_pay) + bonusAmount,
                }
            });
        } else {
            await this.prisma.provider_Salary_Ledger.create({
                data: {
                    provider_id: providerId,
                    Shift_Date: new Date(),
                    Base_Salary: 0.00,
                    Overtime_pay: 0.00,
                    Bonus_Amount: bonusAmount,
                    Penalty_Amount: 0.00,
                    Total_pay: bonusAmount,
                }
            });
        }

        // 6. Postconditions: Save Audit Log
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `BONUS_APPLIED_${providerId}`,
                    details: `Applied performance bonus of ${bonusAmount} to provider ${provider.name} for metric ${metricName} (Value: ${performanceValue}).`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Bonus application audit log failed: ', e);
        }

        // 7. Notify: Push notification to Provider
        if (provider.user?.fcmToken) {
            try {
                await this.notifications.sendPushNotification(
                    provider.user.fcmToken,
                    '🎉 Performance Bonus Awarded!',
                    `Congratulations ${provider.name}! You have been awarded a Performance Bonus of $${bonusAmount.toFixed(2)} for ${metricName.replace('_', ' ')}.`,
                    {
                        type: 'BONUS_AWARDED',
                        amount: bonusAmount,
                        metric: metricName,
                    }
                );
            } catch (e) {
                console.error('[AdminService] Push notification failed for bonus award: ', e);
            }
        }

        return {
            success: true,
            message: 'Performance bonus successfully applied',
            providerName: provider.name,
            bonusRule: bonusRule.Rule_Name,
            bonusApplied: bonusAmount,
            metric: metricName,
            metricValue: performanceValue,
            newWalletBalance: newBalance,
        };
    }

    // ==================== PENALTY MANAGEMENT (FR-PAY-008) ====================

    async applyPenaltyDeduction(providerId: string, violationRule: string, adminId: string) {
        // 1. Validate: Provider exists
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: providerId },
            include: { user: true }
        });
        if (!provider) throw new NotFoundException('Service provider not found');

        // 2. Preconditions: Fetch/seed penalty rule
        let penaltyRule = await this.prisma.provider_Penalty_Rules.findFirst({
            where: { Violation_Type: violationRule }
        });
        if (!penaltyRule) {
            penaltyRule = await this.prisma.provider_Penalty_Rules.create({
                data: { Rule_Name: `${violationRule.replace('_', ' ')} Penalty`, Amount: 100.00, Violation_Type: violationRule }
            });
        }

        // 3. Preconditions: Fetch or seed Violation record to satisfy the functional precondition
        let violation = await this.prisma.violation.findFirst({
            where: { provider_id: providerId, rule: violationRule }
        });
        if (!violation) {
            violation = await this.prisma.violation.create({
                data: {
                    provider_id: providerId,
                    rule: violationRule,
                    action: 'PENDING_PENALTY_DEDUCTION',
                }
            });
        }

        const penaltyAmount = Number(penaltyRule.Amount);

        // 4. Process: Find or create SpWallet and deduct penalty
        let wallet = await this.prisma.spWallet.findFirst({
            where: { provider_id: providerId }
        });
        if (!wallet) {
            wallet = await this.prisma.spWallet.create({
                data: { provider_id: providerId, balance: 0.00 }
            });
        }

        // Ensure wallet balance doesn't drop below 0 if they don't have enough balance, or allow negative balance as a debit
        const newBalance = Number(wallet.balance) - penaltyAmount;
        await this.prisma.spWallet.update({
            where: { id: wallet.id },
            data: { balance: newBalance }
        });

        // 5. Process: Save to daily salary ledger for audit and compliance
        const today = new Date();
        const startOfDay = new Date(today.setUTCHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setUTCHours(23, 59, 59, 999));

        let ledger = await this.prisma.provider_Salary_Ledger.findFirst({
            where: {
                provider_id: providerId,
                Shift_Date: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }
        });

        if (ledger) {
            await this.prisma.provider_Salary_Ledger.update({
                where: { id: ledger.id },
                data: {
                    Penalty_Amount: Number(ledger.Penalty_Amount) + penaltyAmount,
                    Total_pay: Math.max(0, Number(ledger.Total_pay) - penaltyAmount),
                }
            });
        } else {
            await this.prisma.provider_Salary_Ledger.create({
                data: {
                    provider_id: providerId,
                    Shift_Date: new Date(),
                    Base_Salary: 0.00,
                    Overtime_pay: 0.00,
                    Bonus_Amount: 0.00,
                    Penalty_Amount: penaltyAmount,
                    Total_pay: 0.00,
                }
            });
        }

        // Update violation action status
        await this.prisma.violation.update({
            where: { id: violation.id },
            data: { action: `DEDUCTED_${penaltyAmount}_BY_${adminId}` }
        });

        // 6. Postconditions: Save Audit Log
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `PENALTY_DEDUCTED_${providerId}`,
                    details: `Deducted penalty of ${penaltyAmount} from provider ${provider.name} for violation ${violationRule}.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Penalty deduction audit log failed: ', e);
        }

        // 7. Notify: Push notification to Provider
        if (provider.user?.fcmToken) {
            try {
                await this.notifications.sendPushNotification(
                    provider.user.fcmToken,
                    '⚠️ Penalty Deduction Warning',
                    `Hello ${provider.name}, a penalty deduction of $${penaltyAmount.toFixed(2)} has been applied to your account due to a ${violationRule.replace('_', ' ')} violation.`,
                    {
                        type: 'PENALTY_DEDUCTED',
                        amount: penaltyAmount,
                        violation: violationRule,
                    }
                );
            } catch (e) {
                console.error('[AdminService] Push notification failed for penalty deduction: ', e);
            }
        }

        return {
            success: true,
            message: 'Penalty deduction successfully applied',
            providerName: provider.name,
            penaltyRule: penaltyRule.Rule_Name,
            penaltyDeducted: penaltyAmount,
            violation: violationRule,
            newBalance,
        };
    }

    // ==================== PAYROLL SETTLEMENT (FR-PAY-009) ====================

    async generatePayrollSettlements(dto: GeneratePayrollSettlementDto, adminId: string) {
        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);

        if (start.getTime() > end.getTime()) {
            throw new BadRequestException('Start date cannot be after end date.');
        }

        // 1. Preconditions: Fetch matching completed/calculated salary ledger entries in the range
        const ledgerEntries = await this.prisma.provider_Salary_Ledger.findMany({
            where: {
                Shift_Date: {
                    gte: start,
                    lte: end,
                }
            }
        });

        if (ledgerEntries.length === 0) {
            throw new BadRequestException('No salary ledger records found in the specified range. Please run Daily Salary Calculation first.');
        }

        // 2. Process: Group ledgers by provider to build settlement entries
        const providerSettlementsData: {
            [providerId: string]: {
                totalBonus: number;
                totalPenalty: number;
                totalPayment: number;
            };
        } = {};

        for (const entry of ledgerEntries) {
            if (!providerSettlementsData[entry.provider_id]) {
                providerSettlementsData[entry.provider_id] = {
                    totalBonus: 0,
                    totalPenalty: 0,
                    totalPayment: 0,
                };
            }
            providerSettlementsData[entry.provider_id].totalBonus += Number(entry.Bonus_Amount);
            providerSettlementsData[entry.provider_id].totalPenalty += Number(entry.Penalty_Amount);
            providerSettlementsData[entry.provider_id].totalPayment += Number(entry.Total_pay);
        }

        const generatedSettlements: any[] = [];

        // 3. Save: Create/Overwrite pending settlements for this cycle
        for (const [providerId, totals] of Object.entries(providerSettlementsData)) {
            // Delete any existing PENDING settlement for this cycle for safety and idempotency
            await this.prisma.provider_payroll_settlement.deleteMany({
                where: {
                    provider_id: providerId,
                    Payout_Cycle: end,
                    status: 'PENDING',
                }
            });

            const settlement = await this.prisma.provider_payroll_settlement.create({
                data: {
                    provider_id: providerId,
                    Payout_Cycle: end,
                    total_bonus: totals.totalBonus,
                    total_penalty: totals.totalPenalty,
                    total_deduction: totals.totalPenalty, // Penalty represents standard deduction
                    total_payment: totals.totalPayment,
                    status: 'PENDING',
                    payout_date: end,
                }
            });

            generatedSettlements.push(settlement);
        }

        // 4. Audit Trail & Notify
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `PAYROLL_SETTLEMENTS_GENERATED_${end.toISOString().split('T')[0]}`,
                    details: `Generated ${generatedSettlements.length} payroll settlements for cycle ending ${dto.endDate}. Total payout amount: ${generatedSettlements.reduce((sum, s) => sum + Number(s.total_payment), 0)}.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for payroll settlements generation: ', e);
        }

        return {
            message: `Successfully generated ${generatedSettlements.length} payroll settlements`,
            settlements: generatedSettlements,
        };
    }

    async approvePayrollSettlement(settlementId: string, adminId: string) {
        const settlement = await this.prisma.provider_payroll_settlement.findUnique({
            where: { id: settlementId }
        });
        if (!settlement) throw new NotFoundException('Payroll settlement not found');

        if (settlement.status !== 'PENDING') {
            throw new BadRequestException(`Cannot approve settlement in '${settlement.status}' status. Must be PENDING.`);
        }

        const approved = await this.prisma.provider_payroll_settlement.update({
            where: { id: settlementId },
            data: { status: 'APPROVED' }
        });

        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `PAYROLL_SETTLEMENT_APPROVED_${settlementId}`,
                    details: `Approved payroll settlement for provider ${settlement.provider_id}. Amount: ${settlement.total_payment}.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for settlement approval: ', e);
        }

        return approved;
    }

    async disbursePayrollSettlement(settlementId: string, adminId: string) {
        const settlement = await this.prisma.provider_payroll_settlement.findUnique({
            where: { id: settlementId }
        });
        if (!settlement) throw new NotFoundException('Payroll settlement not found');

        if (settlement.status !== 'APPROVED') {
            throw new BadRequestException(`Cannot disburse settlement in '${settlement.status}' status. Must be APPROVED.`);
        }

        const payoutAmount = Number(settlement.total_payment);

        // 1. Process Wallet Credit
        let wallet = await this.prisma.spWallet.findFirst({
            where: { provider_id: settlement.provider_id }
        });
        if (!wallet) {
            wallet = await this.prisma.spWallet.create({
                data: { provider_id: settlement.provider_id, balance: 0.00 }
            });
        }

        const newBalance = Number(wallet.balance) + payoutAmount;
        await this.prisma.spWallet.update({
            where: { id: wallet.id },
            data: { balance: newBalance }
        });

        // 2. Create standalone Payout entry
        const payout = await this.prisma.payout.create({
            data: {
                spwallet_id: wallet.id,
                amount: payoutAmount,
                status: 'DISBURSED',
            }
        });

        // 3. Save: Update settlement status to DISBURSED
        const disbursed = await this.prisma.provider_payroll_settlement.update({
            where: { id: settlementId },
            data: {
                status: 'DISBURSED',
                payout_date: new Date(),
            }
        });

        // 4. Notify: Send FCM push notification to the provider
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: settlement.provider_id },
            include: { user: true }
        });

        if (provider?.user?.fcmToken) {
            try {
                await this.notifications.sendPushNotification(
                    provider.user.fcmToken,
                    '💸 Payout Disbursed!',
                    `Hello ${provider.name}! Your payroll cycle payout of $${payoutAmount.toFixed(2)} has been successfully disbursed to your wallet.`,
                    {
                        type: 'SALARY_DISBURSED',
                        amount: payoutAmount,
                        settlementId: settlement.id,
                    }
                );
            } catch (pushErr) {
                console.error(`[AdminService] FCM notification failed for provider ${settlement.provider_id}: `, pushErr);
            }
        }

        // 5. Postconditions: Audit trail entry
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `PAYROLL_SETTLEMENT_DISBURSED_${settlementId}`,
                    details: `Disbursed settlement of ${payoutAmount} to provider ${provider?.name}. Wallet balance: ${newBalance}.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for settlement disbursement: ', e);
        }

        return {
            message: 'Payroll settlement successfully disbursed',
            settlement: disbursed,
            payout,
            newWalletBalance: newBalance,
        };
    }

    async findAllPayrollSettlements(params: { startDate?: string; endDate?: string; status?: string }) {
        const whereClause: any = {};
        if (params.status) {
            whereClause.status = params.status;
        }
        if (params.startDate || params.endDate) {
            const dateFilter: any = {};
            if (params.startDate) {
                dateFilter.gte = new Date(params.startDate);
            }
            if (params.endDate) {
                dateFilter.lte = new Date(params.endDate);
            }
            whereClause.Payout_Cycle = dateFilter;
        }

        const settlements = await this.prisma.provider_payroll_settlement.findMany({
            where: whereClause,
            orderBy: { created_at: 'desc' }
        });

        const providerIds = Array.from(new Set(settlements.map(s => s.provider_id)));
        const providers = await this.prisma.serviceProvider.findMany({
            where: { id: { in: providerIds } }
        });
        const providerMap = new Map(providers.map(p => [p.id, p]));

        return settlements.map(settlement => {
            const provider = providerMap.get(settlement.provider_id);
            const idNum = settlement.provider_id.split('-').join('').charCodeAt(0) || 0;
            const bankNames = ['HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank', 'Barclays Bank'];
            const bankName = bankNames[idNum % bankNames.length];
            const accountNumber = `XXXXXX${(idNum * 123) % 9000 + 1000}`;
            const ifscCode = `MOCK000${(idNum * 9) % 90000 + 10000}`;

            return {
                id: settlement.id,
                providerId: settlement.provider_id,
                providerName: provider ? provider.name : 'Unknown Provider',
                providerPhone: provider ? provider.phoneNumber : '',
                city: provider ? provider.city : 'Mumbai',
                amount: Number(settlement.total_payment),
                bonus: Number(settlement.total_bonus),
                penalty: Number(settlement.total_penalty),
                deduction: Number(settlement.total_deduction),
                status: settlement.status,
                payoutDate: settlement.payout_date,
                payoutCycle: settlement.Payout_Cycle,
                createdAt: settlement.created_at,
                bankName,
                accountNumber,
                ifscCode,
            };
        });
    }

    // ==================== PAYROLL REPORTS (FR-PAY-011) ====================

    async exportPayrollReport(dto: ExportPayrollReportDto, adminId: string) {
        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);

        // 1. Validate
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new BadRequestException('Invalid date format provided.');
        }

        if (start.getTime() > end.getTime()) {
            throw new BadRequestException('Start date cannot be after end date.');
        }

        // 2. Process
        const ledgerEntries = await this.prisma.provider_Salary_Ledger.findMany({
            where: {
                Shift_Date: {
                    gte: start,
                    lte: end,
                }
            },
            orderBy: {
                Shift_Date: 'desc'
            }
        });

        let totalBaseSalary = 0;
        let totalOvertimePay = 0;
        let totalBonus = 0;
        let totalPenalty = 0;
        let totalPayout = 0;

        const uniqueProviderIds = new Set<string>();

        for (const entry of ledgerEntries) {
            totalBaseSalary += Number(entry.Base_Salary || 0);
            totalOvertimePay += Number(entry.Overtime_pay || 0);
            totalBonus += Number(entry.Bonus_Amount || 0);
            totalPenalty += Number(entry.Penalty_Amount || 0);
            totalPayout += Number(entry.Total_pay || 0);
            uniqueProviderIds.add(entry.provider_id);
        }

        const providerMap = new Map<string, string>();
        if (uniqueProviderIds.size > 0) {
            const providers = await this.prisma.serviceProvider.findMany({
                where: {
                    id: {
                        in: Array.from(uniqueProviderIds)
                    }
                },
                select: {
                    id: true,
                    name: true
                }
            });
            for (const p of providers) {
                providerMap.set(p.id, p.name);
            }
        }

        const details = ledgerEntries.map(entry => ({
            id: entry.id,
            providerId: entry.provider_id,
            providerName: providerMap.get(entry.provider_id) || 'Unknown Provider',
            shiftDate: entry.Shift_Date,
            baseSalary: Number(entry.Base_Salary || 0),
            overtimePay: Number(entry.Overtime_pay || 0),
            bonusAmount: Number(entry.Bonus_Amount || 0),
            penaltyAmount: Number(entry.Penalty_Amount || 0),
            totalPay: Number(entry.Total_pay || 0),
            createdAt: entry.created_at
        }));

        const summary = {
            startDate: dto.startDate,
            endDate: dto.endDate,
            totalBaseSalary,
            totalOvertimePay,
            totalBonus,
            totalPenalty,
            totalPayout,
            uniqueProvidersCount: uniqueProviderIds.size,
            recordsCount: ledgerEntries.length
        };

        // 3. Save: Audit Trail
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: 'EXPORT_PAYROLL_REPORT',
                    details: `Exported payroll report for period ${dto.startDate} to ${dto.endDate}. Summary: total payout=$${totalPayout.toFixed(2)}, unique providers=${uniqueProviderIds.size}, records count=${ledgerEntries.length}.`
                }
            });
        } catch (e) {
            console.error('[AdminService] Audit log failed for payroll report export: ', e);
        }

        // 4. Notify: Admin Notification
        try {
            await this.prisma.adminNotification.create({
                data: {
                    type: 'PAYROLL_REPORT_EXPORTED',
                    title: 'Payroll Report Exported',
                    body: `Admin successfully exported payroll report for ${dto.startDate.split('T')[0]} to ${dto.endDate.split('T')[0]}. Unique providers: ${uniqueProviderIds.size}. Total payout: $${totalPayout.toFixed(2)}.`,
                    entityId: adminId,
                    isRead: false,
                }
            });
        } catch (e) {
            console.error('[AdminService] Notification failed for payroll report export: ', e);
        }

        return {
            success: true,
            summary,
            details
        };
    }

    // ==================== FRAUD PREVENTION (FR-PAY-012) ====================

    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; // Radius of the earth in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    }

    async detectFraud(dto: DetectFraudDto, adminId: string) {
        const { providerId, latitude, longitude, deviceId, isMockLocation } = dto;

        // 1. Validate
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new BadRequestException('Invalid GPS coordinates.');
        }

        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: providerId },
            include: { user: true }
        });
        if (!provider) {
            throw new NotFoundException('Service provider not found.');
        }

        // 2. Process
        const fraudReasons: string[] = [];

        // Check 1: Mock Location (direct flag)
        if (isMockLocation === true) {
            fraudReasons.push('Mock location (GPS spoofing app) usage reported by device');
        }

        // Check 2: Impossible Velocity (compared to lastLocation in LocationPing or Availability)
        const lastPing = await this.prisma.locationPing.findFirst({
            where: { provider_id: providerId },
            orderBy: { createdAt: 'desc' }
        });

        if (lastPing) {
            const timeDiffMs = Date.now() - new Date(lastPing.createdAt).getTime();
            const timeDiffHours = timeDiffMs / 3600000;

            if (timeDiffMs > 5000 && timeDiffHours < 24) { // only compute if time > 5s and < 24h
                const distanceKm = this.calculateDistance(lastPing.latitude, lastPing.longitude, latitude, longitude);
                const speedKmh = distanceKm / timeDiffHours;

                if (speedKmh > 150) { // Flag speed > 150 km/h
                    fraudReasons.push(`Impossible velocity detected: ${speedKmh.toFixed(2)} km/h (moved ${distanceKm.toFixed(2)} km in ${(timeDiffMs / 60000).toFixed(2)} mins)`);
                }
            }
        }

        // Check 3: Suspicious Attendance (Device sharing across multiple providers)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const duplicateDeviceLogs = await this.prisma.auditLog.findMany({
            where: {
                action_at: { gte: oneDayAgo },
                action: { startsWith: 'PROVIDER_CLOCK_IN_' },
                details: { contains: deviceId }
            }
        });

        const loggedProviderIds = duplicateDeviceLogs
            .map(log => log.action.replace('PROVIDER_CLOCK_IN_', ''))
            .filter(id => id !== providerId);

        if (loggedProviderIds.length > 0) {
            const otherProviders = await this.prisma.serviceProvider.findMany({
                where: { id: { in: loggedProviderIds } },
                select: { name: true }
            });
            const names = otherProviders.map(p => p.name).join(', ');
            fraudReasons.push(`Suspicious device sharing: Device ID ${deviceId} is being shared with other providers (${names || loggedProviderIds.join(', ')}) within 24 hours`);
        }

        let fraudFlag: FraudFlag | null = null;
        const isFraud = fraudReasons.length > 0;

        // 3. Save: persist FraudFlag and AuditLog
        if (isFraud) {
            const severity = isMockLocation ? 'CRITICAL' : 'HIGH';
            fraudFlag = await this.prisma.fraudFlag.create({
                data: {
                    provider_id: providerId,
                    reason: fraudReasons.join('; '),
                    severity
                }
            });

            try {
                await this.prisma.auditLog.create({
                    data: {
                        admin_id: adminId,
                        action: `FRAUD_DETECTED_${providerId}`,
                        details: `Fraud indicators triggered for provider ${provider.name}. Reason(s): ${fraudReasons.join('; ')}. FraudFlag ID: ${fraudFlag!.id}`
                    }
                });
            } catch (e) {
                console.error('[AdminService] Audit log creation failed for fraud detection: ', e);
            }
        } else {
            // Log successful fraud check
            try {
                await this.prisma.auditLog.create({
                    data: {
                        admin_id: adminId,
                        action: `FRAUD_CHECK_PASSED_${providerId}`,
                        details: `Fraud prevention check completed for provider ${provider.name}. No indicators triggered. Device: ${deviceId}.`
                    }
                });
            } catch (e) {
                console.error('[AdminService] Audit log creation failed for fraud check pass: ', e);
            }
        }

        // 4. Notify: adminNotification
        if (isFraud) {
            try {
                await this.prisma.adminNotification.create({
                    data: {
                        type: 'FRAUD_ALERT',
                        title: '🚨 Critical Fraud Alert',
                        body: `Potential fraud detected for provider ${provider.name} (Device: ${deviceId}). Reasons: ${fraudReasons.join('; ')}`,
                        entityId: fraudFlag!.id,
                        isRead: false
                    }
                });
            } catch (e) {
                console.error('[AdminService] Admin notification failed for fraud alert: ', e);
            }
        }

        return {
            success: true,
            isFraud,
            fraudReasons,
            fraudFlag
        };
    }

    async findSalaryLedger(params?: { dateFrom?: string; dateTo?: string }) {
        const start = params?.dateFrom ? new Date(params.dateFrom) : new Date(Date.now() - 7 * 86400000);
        start.setUTCHours(0, 0, 0, 0);
        const end = params?.dateTo ? new Date(params.dateTo) : new Date();
        end.setUTCHours(23, 59, 59, 999);

        // Fetch salary ledger entries within the date range
        const ledgerEntries = await this.prisma.provider_Salary_Ledger.findMany({
            where: {
                Shift_Date: {
                    gte: start,
                    lte: end,
                }
            },
            orderBy: {
                Shift_Date: 'desc'
            }
        });

        // Resolve providers, attendance, and settlements
        const resolved: any[] = [];
        for (const entry of ledgerEntries) {
            const provider = await this.prisma.serviceProvider.findUnique({
                where: { id: entry.provider_id }
            });
            if (!provider) continue;

            // Fetch provider address for city (fallback to Budapest/Mumbai)
            const address = await this.prisma.providerAddress.findFirst({
                where: { provider_id: provider.id }
            });
            const city = address?.city || 'Budapest';

            // Find attendance record for this day
            const startOfDay = new Date(entry.Shift_Date);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(entry.Shift_Date);
            endOfDay.setUTCHours(23, 59, 59, 999);

            const attendance = await this.prisma.provider_Attendance.findFirst({
                where: {
                    provider_id: entry.provider_id,
                    attendance_date: {
                        gte: startOfDay,
                        lte: endOfDay,
                    }
                }
            });

            // Find matching shift configuration if available
            let shiftName = 'Standard Shift';
            let overtimeRate = 150;
            let overtimeHours = 0;
            if (attendance) {
                const shiftType = await this.prisma.provider_Shift_Type.findUnique({
                    where: { id: attendance.shift_type_id }
                });
                if (shiftType) {
                    shiftName = shiftType.Shift_Name;
                    overtimeRate = Number(shiftType.Overtime_Rate) || 150;
                    if (attendance.total_hours > shiftType.Duration_hours) {
                        overtimeHours = attendance.total_hours - shiftType.Duration_hours;
                    }
                }
            }

            // Find matching settlement to deduce status: Paid, Approved, Pending Review, Disputed
            let status: 'Paid' | 'Approved' | 'Pending Review' | 'Disputed' = 'Pending Review';
            
            const settlement = await this.prisma.provider_payroll_settlement.findFirst({
                where: {
                    provider_id: entry.provider_id,
                    Payout_Cycle: {
                        gte: startOfDay
                    }
                }
            });

            if (settlement) {
                if (settlement.status === 'DISBURSED') {
                    status = 'Paid';
                } else if (settlement.status === 'APPROVED') {
                    status = 'Approved';
                } else if (settlement.status === 'PENDING') {
                    status = 'Pending Review';
                } else if (settlement.status === 'DISPUTED') {
                    status = 'Disputed';
                }
            }

            resolved.push({
                id: entry.id,
                providerId: provider.id,
                providerName: provider.name,
                providerPhone: provider.phoneNumber,
                date: entry.Shift_Date.toISOString().split('T')[0],
                baseSalary: Number(entry.Base_Salary),
                bonus: Number(entry.Bonus_Amount),
                bonusReason: 'Performance Rating Incentive',
                penalty: Number(entry.Penalty_Amount),
                penaltyReason: Number(entry.Penalty_Amount) > 0 ? 'Late check-in infraction' : '',
                overtimeHours,
                overtimeRate,
                overtimePay: Number(entry.Overtime_pay),
                finalSalary: Number(entry.Total_pay),
                status,
                city,
                checkInTime: attendance?.in_time ? attendance.in_time.toISOString() : undefined,
                checkOutTime: attendance?.out_time ? attendance.out_time.toISOString() : undefined,
                shiftName,
            });
        }

        return resolved;
    }

    async updateSalaryLedger(id: string, updates: any, adminId: string = 'mock-admin-id') {
        const ledger = await this.prisma.provider_Salary_Ledger.findUnique({
            where: { id }
        });
        if (!ledger) throw new NotFoundException('Salary ledger record not found');

        // Parse numeric adjustments
        const baseSalary = updates.baseSalary !== undefined ? Number(updates.baseSalary) : Number(ledger.Base_Salary);
        const bonus = updates.bonus !== undefined ? Number(updates.bonus) : Number(ledger.Bonus_Amount);
        const penalty = updates.penalty !== undefined ? Number(updates.penalty) : Number(ledger.Penalty_Amount);
        
        let overtimePay = Number(ledger.Overtime_pay);
        if (updates.overtimeHours !== undefined || updates.overtimeRate !== undefined) {
            const hours = updates.overtimeHours !== undefined ? Number(updates.overtimeHours) : 0;
            const rate = updates.overtimeRate !== undefined ? Number(updates.overtimeRate) : 150;
            overtimePay = hours * rate;
        }

        const totalPay = Math.max(0, baseSalary + bonus + overtimePay - penalty);

        // Update database record
        const updated = await this.prisma.provider_Salary_Ledger.update({
            where: { id },
            data: {
                Base_Salary: baseSalary,
                Bonus_Amount: bonus,
                Penalty_Amount: penalty,
                Overtime_pay: overtimePay,
                Total_pay: totalPay,
            }
        });

        // Sync with provider_payroll_settlement if status is provided
        if (updates.status) {
            let settlement = await this.prisma.provider_payroll_settlement.findFirst({
                where: {
                    provider_id: ledger.provider_id,
                }
            });

            let mappedStatus = 'PENDING';
            if (updates.status === 'Paid') mappedStatus = 'DISBURSED';
            else if (updates.status === 'Approved') mappedStatus = 'APPROVED';
            else if (updates.status === 'Disputed') mappedStatus = 'DISPUTED';

            if (settlement) {
                await this.prisma.provider_payroll_settlement.update({
                    where: { id: settlement.id },
                    data: { status: mappedStatus }
                });
            } else {
                await this.prisma.provider_payroll_settlement.create({
                    data: {
                        provider_id: ledger.provider_id,
                        Payout_Cycle: ledger.Shift_Date,
                        total_bonus: bonus,
                        total_penalty: penalty,
                        total_deduction: penalty,
                        total_payment: totalPay,
                        status: mappedStatus,
                        payout_date: ledger.Shift_Date,
                    }
                });
            }
        }

        // Fetch provider & attendance for return formatting
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: ledger.provider_id }
        });
        const address = await this.prisma.providerAddress.findFirst({
            where: { provider_id: ledger.provider_id }
        });
        const city = address?.city || 'Budapest';

        const startOfDay = new Date(ledger.Shift_Date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(ledger.Shift_Date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const attendance = await this.prisma.provider_Attendance.findFirst({
            where: {
                provider_id: ledger.provider_id,
                attendance_date: {
                    gte: startOfDay,
                    lte: endOfDay,
                }
            }
        });

        if (attendance && updates.status) {
            let attendanceStatus = 'PRESENT';
            if (updates.status === 'Disputed') {
                attendanceStatus = 'ABSENT'; // simulate penalty triggers
            }
            await this.prisma.provider_Attendance.update({
                where: { id: attendance.id },
                data: { Status: attendanceStatus }
            });
        }

        let shiftName = 'Standard Shift';
        let overtimeHours = 0;
        let overtimeRate = 150;
        if (attendance) {
            const shiftType = await this.prisma.provider_Shift_Type.findUnique({
                where: { id: attendance.shift_type_id }
            });
            if (shiftType) {
                shiftName = shiftType.Shift_Name;
                overtimeRate = Number(shiftType.Overtime_Rate) || 150;
                if (attendance.total_hours > shiftType.Duration_hours) {
                    overtimeHours = attendance.total_hours - shiftType.Duration_hours;
                }
            }
        }

        // Log audit log
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: adminId,
                    action: `SALARY_LEDGER_ADJUSTED_${id}`,
                    details: `Adjusted salary ledger ID ${id}. New Base: ${baseSalary}, Bonus: ${bonus}, Penalty: ${penalty}, Total: ${totalPay}. Status: ${updates.status || 'N/A'}.`,
                }
            });
        } catch (e) {
            console.error('[AdminService] Salary ledger adjustment audit log failed: ', e);
        }

        return {
            id: updated.id,
            providerId: provider?.id || ledger.provider_id,
            providerName: provider?.name || 'Unknown Provider',
            providerPhone: provider?.phoneNumber || '',
            date: updated.Shift_Date.toISOString().split('T')[0],
            baseSalary: Number(updated.Base_Salary),
            bonus: Number(updated.Bonus_Amount),
            bonusReason: updates.bonusReason || 'Manual adjustment',
            penalty: Number(updated.Penalty_Amount),
            penaltyReason: updates.penaltyReason || 'Manual adjustment',
            overtimeHours,
            overtimeRate,
            overtimePay,
            finalSalary: totalPay,
            status: updates.status || 'Pending Review',
            city,
            checkInTime: attendance?.in_time ? attendance.in_time.toISOString() : undefined,
            checkOutTime: attendance?.out_time ? attendance.out_time.toISOString() : undefined,
            shiftName,
        };
    }
}

