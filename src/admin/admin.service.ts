import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma, Role, BookingStatus, Booking } from '@prisma/client';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { CreateSurgeRuleDto } from './dto/create-surge-rule.dto';

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
            data: { status },
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
    async getBookings(params: { status?: BookingStatus; userId?: string }) {
        const { status, userId } = params;
        return this.prisma.booking.findMany({
            where: {
                status: status ? status : undefined,
                userId: userId ? userId : undefined,
            },
            include: {
                user: true,
                service: true,
            },
            orderBy: { createdAt: 'desc' },
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
        const booking = await this.prisma.booking.findUnique({ where: { id } });
        if (!booking) throw new NotFoundException('Booking not found');

        const updatedBooking = await this.prisma.booking.update({
            where: { id },
            data: { status },
        });

        // Create Booking Override Log (FR-BKG-005)
        // Assuming BookingOverride is used to track manual changes
        try {
            await this.prisma.bookingOverride.create({
                data: {
                    booking_id: id,
                    status: status,
                    // 'reason' is not in BookingOverride schema currently, but implied by logs.
                    // We should create an AuditLog as well for generic auditing.
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

    // FR-PRC-001: Create Pricing Rule
    async createPricingRule(data: CreatePricingRuleDto) {
        return this.prisma.pricingRule.create({
            data: {
                service_type: data.service_type,
                city: data.city,
                base_price: data.base_price,
            },
        });
    }

    // FR-PRC-001: Get Pricing Rules
    async getPricingRules(city?: string) {
        return this.prisma.pricingRule.findMany({
            where: {
                city: city ? city : undefined,
            },
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

    // FR-ANA-001: Dashboard Statistics
    async getDashboardStats() {
        const totalUsers = await this.prisma.user.count();
        const totalBookings = await this.prisma.booking.count();
        const totalRevenue = await this.prisma.booking.aggregate({
            _sum: { totalAmount: true },
        });

        const activeUsers = await this.prisma.user.count({
            where: { status: 'ACTIVE' },
        });

        const pendingBookings = await this.prisma.booking.count({
            where: { status: 'PENDING' },
        });

        return {
            totalUsers,
            activeUsers,
            totalBookings,
            pendingBookings,
            totalRevenue: totalRevenue._sum.totalAmount || 0,
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
        const revenueByCity = await this.prisma.booking.groupBy({
            by: ['city'],
            _sum: { totalAmount: true },
            _count: { id: true },
        });

        const totalRevenue = await this.prisma.booking.aggregate({
            _sum: { totalAmount: true },
        });

        return {
            byCity: revenueByCity.map(item => ({
                city: item.city,
                revenue: item._sum.totalAmount || 0,
                bookingCount: item._count.id,
            })),
            totalRevenue: totalRevenue._sum.totalAmount || 0,
        };
    }
}
