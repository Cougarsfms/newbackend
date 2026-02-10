import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterProviderDto } from './dto/register-provider.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadKycDto } from './dto/upload-kyc.dto';
import { LocationUpdateDto } from './dto/location-update.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';
import { JobActionDto } from './dto/job-action.dto';
import { Role } from '@prisma/client';

@Injectable()
export class ServiceProviderService {
    constructor(private prisma: PrismaService) { }

    // ==================== ONBOARDING & AUTHENTICATION ====================

    async register(dto: RegisterProviderDto) {
        // 1. Check if user exists, if not create one
        let user = await this.prisma.user.findUnique({
            where: { phoneNumber: dto.phoneNumber },
        });

        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    phoneNumber: dto.phoneNumber,
                    name: dto.name,
                    role: Role.PROVIDER,
                    status: 'PENDING', // Wait for onboarding
                },
            });
        }

        // 2. Create Service Provider profile
        const existingProvider = await this.prisma.serviceProvider.findFirst({
            where: { user_id: user.id },
        });

        if (existingProvider) {
            return { message: 'Provider already registered', provider: existingProvider };
        }

        const provider = await this.prisma.serviceProvider.create({
            data: {
                user_id: user.id,
                name: dto.name,
                phoneNumber: dto.phoneNumber,
                status: 'PENDING', // Onboarding pending
            },
        });

        // 3. Create Provider Profile with services
        await this.prisma.providerProfile.create({
            data: {
                provider_id: provider.id,
                services: dto.serviceCategories,
                experiences: [],
            },
        });

        // 4. Initialize Wallet
        await this.prisma.spWallet.create({
            data: {
                provider_id: provider.id,
                balance: 0,
            },
        });

        // 5. Initialize Availability
        await this.prisma.availability.create({
            data: {
                provider_id: provider.id,
                is_online: false,
            },
        });

        // Trigger OTP generation here (mocked)
        return { message: 'OTP sent to mobile number', providerId: provider.id };
    }

    async verifyOtp(phoneNumber: string, otp: string) {
        // Mock OTP verification
        if (otp !== '123456') {
            throw new BadRequestException('Invalid OTP');
        }

        const user = await this.prisma.user.findUnique({
            where: { phoneNumber },
            include: { serviceProviders: true },
        });

        if (!user) throw new NotFoundException('User not found');

        // Generate JWT token here (mocked)
        return {
            message: 'Login successful',
            token: 'mock-jwt-token',
            providerId: user.serviceProviders[0]?.id,
        };
    }

    async getProfile(id: string) {
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id },
            include: {
                providerProfiles: true,
                availabilities: true,
                spWallets: true,
            },
        });
        if (!provider) throw new NotFoundException('Provider not found');
        return provider;
    }

    async updateProfile(id: string, dto: UpdateProfileDto) {
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id },
            include: { providerProfiles: true },
        });

        if (!provider) throw new NotFoundException('Provider not found');

        // Update basic info
        if (dto.name) {
            await this.prisma.serviceProvider.update({
                where: { id },
                data: { name: dto.name },
            });
        }

        // Update profile details
        if (dto.serviceCategories || dto.experiences) {
            const profileId = provider.providerProfiles[0]?.id;
            if (profileId) {
                await this.prisma.providerProfile.update({
                    where: { id: profileId },
                    data: {
                        services: dto.serviceCategories,
                        experiences: dto.experiences,
                    },
                });
            }
        }

        return this.getProfile(id);
    }

    async completeOnboarding(id: string) {
        // Check if all necessary details are filled
        const provider = await this.getProfile(id);

        // Update status
        await this.prisma.serviceProvider.update({
            where: { id },
            data: { status: 'ONBOARDING_COMPLETED' }, // Or Waiting for KYC
        });

        return { message: 'Onboarding completed successfully' };
    }

    // ==================== KYC & VERIFICATION ====================

    async uploadKyc(id: string, dto: UploadKycDto) {
        const provider = await this.prisma.serviceProvider.findUnique({ where: { id } });
        if (!provider) throw new NotFoundException('Provider not found');

        // Check/Create KYC Record for user
        let kycRecord = await this.prisma.kYCRecord.findFirst({
            where: { user_id: provider.user_id },
        });

        if (!kycRecord) {
            kycRecord = await this.prisma.kYCRecord.create({
                data: {
                    user_id: provider.user_id,
                    status: 'PENDING',
                },
            });
        }

        // Create Document
        await this.prisma.kYCDocument.create({
            data: {
                kyc_id: kycRecord.id,
                document_type: dto.documentType,
                file_url: dto.fileUrl,
            },
        });

        // Update Provider KYC Status
        await this.prisma.serviceProvider.update({
            where: { id },
            data: { Kyc_status: 'SUBMITTED' },
        });

        return { message: 'KYC document uploaded successfully' };
    }

    async getKycStatus(id: string) {
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id },
            select: { Kyc_status: true },
        });
        if (!provider) throw new NotFoundException('Provider not found');
        return { status: provider.Kyc_status };
    }

    // ==================== AVAILABILITY & JOB ACCEPTANCE ====================

    async toggleAvailability(id: string) {
        const availability = await this.prisma.availability.findFirst({
            where: { provider_id: id },
        });

        if (!availability) throw new NotFoundException('Availability record not found');

        const newStatus = !availability.is_online;
        await this.prisma.availability.update({
            where: { id: availability.id },
            data: {
                is_online: newStatus,
                last_seen: new Date(),
            },
        });

        return { is_online: newStatus };
    }

    async getNearbyJobs(id: string) {
        // Mock logic: return pending bookings in the system
        return this.prisma.spBooking.findMany({
            where: { status: 'PENDING' },
        });
    }

    async acceptJob(id: string, jobId: string) {
        const provider = await this.prisma.serviceProvider.findUnique({ where: { id } });
        if (!provider) throw new NotFoundException('Provider not found');

        if (provider.Kyc_status !== 'APPROVED') {
            throw new BadRequestException('KYC verification required to accept jobs');
        }

        const job = await this.prisma.spBooking.findUnique({ where: { id: jobId } });
        if (!job) throw new NotFoundException('Job not found');
        if (job.status !== 'PENDING') throw new BadRequestException('Job already taken or cancelled');

        return this.prisma.spBooking.update({
            where: { id: jobId },
            data: {
                status: 'ACCEPTED',
                provider_id: id,
            },
        });
    }

    async rejectJob(id: string, jobId: string, dto: JobActionDto) {
        return this.prisma.spBooking.update({
            where: { id: jobId },
            data: { status: 'REJECTED' },
        });
    }

    // ==================== NAVIGATION & JOB EXECUTION ====================

    async markArrival(id: string, jobId: string) {
        return this.prisma.spBooking.update({
            where: { id: jobId },
            data: { status: 'ARRIVED' },
        });
    }

    async startJob(id: string, jobId: string) {
        return this.prisma.spBooking.update({
            where: { id: jobId },
            data: {
                status: 'IN_PROGRESS',
                start_time: new Date(),
            },
        });
    }

    async completeJob(id: string, jobId: string) {
        const job = await this.prisma.spBooking.update({
            where: { id: jobId },
            data: {
                status: 'COMPLETED',
                end_time: new Date(),
            },
        });

        // Calculate earnings and update wallet (simplified)
        const amount = 500; // Mock amount
        const wallet = await this.prisma.spWallet.findFirst({ where: { provider_id: id } });

        if (wallet) {
            await this.prisma.spWallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: amount } },
            });
        }

        return job;
    }

    async updateLocation(id: string, dto: LocationUpdateDto) {
        // Find active booking
        const booking = await this.prisma.spBooking.findFirst({
            where: { provider_id: id, status: 'IN_PROGRESS' },
        });

        if (booking) {
            await this.prisma.locationPing.create({
                data: {
                    provider_id: id,
                    booking_id: booking.id,
                    latitude: dto.latitude,
                    longitude: dto.longitude,
                },
            });
        }
        return { message: 'Location updated' };
    }

    // ==================== EARNINGS & WALLET ====================

    async getEarnings(id: string) {
        // Aggregate completed jobs
        const jobs = await this.prisma.spBooking.findMany({
            where: { provider_id: id, status: 'COMPLETED' },
        });
        // Mock calculation
        const total = jobs.length * 500;
        return { totalEarnings: total, jobCount: jobs.length };
    }

    async getWallet(id: string) {
        return this.prisma.spWallet.findFirst({
            where: { provider_id: id },
            include: { payouts: true },
        });
    }

    async requestPayout(id: string, dto: PayoutRequestDto) {
        const wallet = await this.prisma.spWallet.findFirst({ where: { provider_id: id } });
        if (!wallet || wallet.balance.toNumber() < dto.amount) {
            throw new BadRequestException('Insufficient balance');
        }

        await this.prisma.spWallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: dto.amount } },
        });

        return this.prisma.payout.create({
            data: {
                spwallet_id: wallet.id,
                amount: dto.amount,
                status: 'REQUESTED',
            },
        });
    }

    // ==================== RATINGS & PERFORMANCE ====================

    async getRatings(id: string) {
        return this.prisma.rating.findMany({
            where: { provider_id: id },
            include: { booking: true },
        });
    }

    async getPerformance(id: string) {
        return this.prisma.performancemetric.findMany({
            where: { provider_id: id },
        });
    }

    async raiseSupportTicket(id: string, subject: string, message: string) {
        // Mock support ticket creation
        return { message: 'Support ticket created', ticketId: 'TICK-123' };
    }
}
