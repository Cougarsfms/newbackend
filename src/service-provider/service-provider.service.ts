import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService
    ) { }

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
        if (otp !== '1234') {
            throw new BadRequestException('Invalid OTP');
        }

        let user = await this.prisma.user.findUnique({
            where: { phoneNumber },
            include: { serviceProviders: true },
        });

        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    phoneNumber,
                    name: 'Provider ' + phoneNumber.slice(-4),
                    role: Role.PROVIDER,
                    status: 'PENDING',
                    serviceProviders: {
                        create: {
                            name: 'Provider ' + phoneNumber.slice(-4),
                            phoneNumber,
                            status: 'PENDING',
                        }
                    }
                },
                include: { serviceProviders: true }
            });

            const provider = user.serviceProviders[0];
            await this.prisma.providerProfile.create({
                data: { provider_id: provider.id, services: [], experiences: [] },
            });
            await this.prisma.spWallet.create({
                data: { provider_id: provider.id, balance: 0 },
            });
            await this.prisma.availability.create({
                data: { provider_id: provider.id, is_online: false },
            });
        }

        if (!user) throw new NotFoundException('User not found');

        const providerId = user.serviceProviders[0]?.id;
        // Generate JWT token
        const payload = {
            sub: user.id,
            phoneNumber: user.phoneNumber,
            role: user.role,
            providerId: providerId,
        };

        const token = this.jwtService.sign(payload);

        return {
            message: 'Login successful',
            token,
            providerId,
            user,
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

        // Update basic info on the provider record
        const providerData: any = {};
        if (dto.name) providerData.name = dto.name;
        if (dto.city !== undefined) providerData.city = dto.city;
        if (dto.yearsOfExperience !== undefined) providerData.yearsOfExperience = dto.yearsOfExperience;

        if (Object.keys(providerData).length > 0) {
            await this.prisma.serviceProvider.update({
                where: { id },
                data: providerData,
            });
        }

        // Update profile details (services & experiences)
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

        // 1. Find or create KYC Record — always set status to PENDING on new submission
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
        } else {
            // Reset to PENDING if re-submitting after a rejection
            await this.prisma.kYCRecord.update({
                where: { id: kycRecord.id },
                data: { status: 'PENDING' },
            });
        }

        // 2. Save the uploaded document
        await this.prisma.kYCDocument.create({
            data: {
                kyc_id: kycRecord.id,
                document_type: dto.documentType,
                file_url: dto.fileUrl,
            },
        });

        // 3. Mark provider KYC status as SUBMITTED
        await this.prisma.serviceProvider.update({
            where: { id },
            data: { Kyc_status: 'SUBMITTED' },
        });

        // 4. Create AdminNotification so the admin panel can surface this immediately
        try {
            await this.prisma.adminNotification.create({
                data: {
                    type: 'KYC_SUBMITTED',
                    title: 'New KYC Submission',
                    body: `Provider ${provider.name} (${provider.phoneNumber}) submitted a ${dto.documentType} document for review.`,
                    entityId: kycRecord.id,
                },
            });
        } catch (e) {
            // Non-critical — log but don't fail the upload
            console.error('[KYC] AdminNotification creation failed:', e);
        }

        console.log(`[KYC] New submission from provider ${id} (${provider.name}), kycRecordId: ${kycRecord.id}`);

        return {
            message: 'KYC document uploaded successfully',
            kycRecordId: kycRecord.id,
            status: 'PENDING',
        };
    }


    async getKycStatus(id: string) {
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id },
            select: { Kyc_status: true, status: true, name: true },
        });
        if (!provider) throw new NotFoundException('Provider not found');

        const kycRecord = await this.prisma.kYCRecord.findFirst({
            where: {
                user: { serviceProviders: { some: { id } } },
            },
            include: { kycdocuments: true },
            orderBy: { updatedAt: 'desc' },
        });

        return {
            kycStatus: provider.Kyc_status,
            providerStatus: provider.status,
            kycRecord: kycRecord
                ? {
                    id: kycRecord.id,
                    status: kycRecord.status,
                    remarks: kycRecord.remarks ?? null,
                    updatedAt: kycRecord.updatedAt,
                    createdAt: kycRecord.createdAt,
                }
                : null,
            documents: kycRecord?.kycdocuments.map((d) => ({
                id: d.id,
                documentType: d.document_type,
                fileUrl: d.file_url,
                createdAt: d.createdAt,
            })) ?? [],
        };
    }

    // ==================== AVAILABILITY & JOB ACCEPTANCE ====================

    /** Resolve the canonical ServiceProvider.id from either a provider_id or a user_id */
    private async resolveProviderId(id: string): Promise<string | null> {
        // Try direct provider lookup first
        const byProvider = await this.prisma.serviceProvider.findUnique({ where: { id } });
        if (byProvider) return byProvider.id;
        // Fall back: maybe a user_id was passed (old client sessions)
        const byUser = await this.prisma.serviceProvider.findFirst({ where: { user_id: id } });
        return byUser?.id ?? null;
    }

    async toggleAvailability(id: string) {
        const now = new Date();
        const providerId = await this.resolveProviderId(id);
        if (!providerId) throw new NotFoundException('Provider not found');

        let availability = await this.prisma.availability.findFirst({
            where: { provider_id: providerId },
        });

        if (!availability) {
            // First toggle: create record and go online
            availability = await this.prisma.availability.create({
                data: { provider_id: providerId, is_online: true, last_seen: now },
            });
            return { is_online: true, last_seen: now };
        }

        const newStatus = !availability.is_online;
        const updated = await this.prisma.availability.update({
            where: { id: availability.id },
            data: { is_online: newStatus, last_seen: now },
        });

        return { is_online: updated.is_online, last_seen: updated.last_seen };
    }

    async getAvailability(id: string) {
        const providerId = await this.resolveProviderId(id);
        if (!providerId) return { is_online: false, last_seen: null };

        const availability = await this.prisma.availability.findFirst({
            where: { provider_id: providerId },
        });
        return {
            is_online: availability?.is_online ?? false,
            last_seen: availability?.last_seen ?? null,
        };
    }

    async getNearbyJobs(id: string) {
        // Only show jobs when the provider is online
        const availability = await this.prisma.availability.findFirst({
            where: { provider_id: id },
        });

        if (!availability?.is_online) {
            return []; // Offline providers do not receive jobs
        }

        // Return only jobs explicitly assigned to this provider by the mapping algorithm
        const spBookings = await this.prisma.spBooking.findMany({
            where: {
                status: 'PENDING',
                provider_id: id
            },
        });

        const enriched: any[] = [];
        for (const sp of spBookings) {
            if (sp.booking_id) {
                const b = await this.prisma.booking.findUnique({ where: { id: sp.booking_id }, include: { user: true } });
                let addressStr = 'Not provided';
                let lat = 0; let lng = 0;
                if (b?.addressId) {
                    const custAddr = await this.prisma.customerAddress.findUnique({ where: { id: b.addressId } });
                    if (custAddr) { addressStr = custAddr.address; lat = custAddr.latitude; lng = custAddr.longitude; }
                }
                const svc = await this.prisma.serviceItem.findUnique({ where: { id: b?.serviceId ?? '' } });
                
                enriched.push({
                    id: sp.id,
                    bookingId: b?.id,
                    customerName: b?.user?.name || 'Customer',
                    address: addressStr,
                    latitude: lat,
                    longitude: lng,
                    serviceCategoryId: svc ? svc.categoryId : 'sweep',
                    scheduledAt: sp.start_time,
                    acceptExpiresAt: sp.end_time,
                    status: 'pending_accept',
                });
            } else {
                enriched.push({
                    id: sp.id,
                    customerName: 'Customer',
                    address: 'Mock Address',
                    latitude: 28.5,
                    longitude: 77.2,
                    serviceCategoryId: 'sweep',
                    scheduledAt: sp.start_time,
                    acceptExpiresAt: sp.end_time,
                    status: 'pending_accept',
                });
            }
        }
        return enriched;
    }

    async acceptJob(id: string, jobId: string) {
        const provider = await this.prisma.serviceProvider.findUnique({ where: { id } });
        if (!provider) throw new NotFoundException('Provider not found');

        // if (provider.Kyc_status !== 'APPROVED') {
        //     throw new BadRequestException('KYC verification required to accept jobs');
        // }

        const job = await this.prisma.spBooking.findUnique({ where: { id: jobId } });
        if (!job) throw new NotFoundException('Job not found');
        if (job.status !== 'PENDING') throw new BadRequestException('Job already taken or cancelled');

        const updatedSp = await this.prisma.spBooking.update({
            where: { id: jobId },
            data: {
                status: 'ACCEPTED',
                provider_id: id,
            },
        });

        if (updatedSp.booking_id) {
            await this.prisma.booking.update({
               where: { id: updatedSp.booking_id },
               data: { status: 'CONFIRMED', providerId: id }
            });
            console.log(`[Notification] To Customer: Your booking has been accepted by provider.`);
        }
        
        // Enrich returning object for the app
        const b = updatedSp.booking_id ? await this.prisma.booking.findUnique({ where: { id: updatedSp.booking_id }, include: { user: true } }) : null;
        return {
            id: updatedSp.id,
            bookingId: b?.id,
            customerName: b?.user?.name || 'Customer',
            status: 'accepted'
        };
    }

    async rejectJob(id: string, jobId: string, dto: JobActionDto) {
        const updated = await this.prisma.spBooking.update({
            where: { id: jobId },
            data: { status: 'REJECTED' },
        });

        if (updated.booking_id) {
            const booking = await this.prisma.booking.findUnique({ where: { id: updated.booking_id }});
            if (booking && booking.status === 'PENDING') {
                const availableProvider = await this.prisma.serviceProvider.findFirst({
                    where: { 
                      status: 'ACTIVE', 
                      id: { not: id }, 
                      availabilities: { some: { is_online: true } } 
                    }
                });
                if (availableProvider) {
                    const endDate = new Date(booking.date);
                    endDate.setHours(endDate.getHours() + 1);
                    await this.prisma.spBooking.create({
                        data: {
                            provider_id: availableProvider.id,
                            status: 'PENDING',
                            start_time: booking.date,
                            end_time: endDate,
                            booking_id: booking.id,
                        }
                    });
                    console.log(`[Notification] Job reassigned to Provider ${availableProvider.name}.`);
                }
            }
        }
        return updated;
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
        const now = new Date();
        const job = await this.prisma.spBooking.update({
            where: { id: jobId },
            data: { status: 'COMPLETED', end_time: now },
        });

        // Duration-based earnings: base ₹350 + ₹50 per extra hour
        const durationMs = now.getTime() - (job.start_time?.getTime() ?? now.getTime());
        const durationMinutes = Math.max(0, Math.round(durationMs / 60000));
        const earnings = 350 + Math.floor(durationMinutes / 60) * 50;

        // Credit wallet
        const wallet = await this.prisma.spWallet.findFirst({ where: { provider_id: id } });
        if (wallet) {
            await this.prisma.spWallet.update({
                where: { id: wallet.id },
                data: { balance: { increment: earnings } },
            });
        }

        // Log job completion as a notification (customer notification proxy)
        try {
            await (this.prisma as any).adminNotification.create({
                data: {
                    type: 'JOB_COMPLETED',
                    message: `Job ${jobId} completed by provider ${id}. Earnings: ₹${earnings}. Duration: ${durationMinutes} min.`,
                    is_read: false,
                },
            });
        } catch (_) { /* AdminNotification model may not be migrated yet */ }

        return { ...job, earnings, durationMinutes };
    }

    async shareEta(id: string, jobId: string, etaMinutes: number) {
        // Find active booking
        const booking = await this.prisma.spBooking.findFirst({
            where: { provider_id: id, id: jobId },
        });

        if (!booking) throw new NotFoundException('Job not found');

        // Note: For real time use, we would dispatch a WS event here to notify customer
        console.log(`[ServiceProvider API] Provider ${id} shared ETA of ${etaMinutes} mins for job ${jobId}`);

        return { success: true, message: 'ETA shared with customer', etaMinutes };
    }

    async updateLocation(id: string, dto: LocationUpdateDto) {
        // Find active booking
        const booking = await this.prisma.spBooking.findFirst({
            where: { 
               provider_id: id, 
               status: { in: ['ACCEPTED', 'IN_PROGRESS', 'ARRIVED'] } 
            },
        });

        if (booking) {
            await this.prisma.locationPing.create({
                data: {
                    provider_id: id,
                    booking_id: booking.booking_id || booking.id,
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

    // ==================== ADDRESS MANAGEMENT ====================

    async getAddresses(id: string) {
        const providerId = await this.resolveProviderId(id);
        if (!providerId) throw new NotFoundException('Provider not found');
        return this.prisma.providerAddress.findMany({
            where: { provider_id: providerId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async addAddress(id: string, dto: {
        address: string;
        city: string;
        state: string;
        country: string;
        zipcode: string;
        label: string;
        latitude?: number;
        longitude?: number;
    }) {
        const providerId = await this.resolveProviderId(id);
        if (!providerId) throw new NotFoundException('Provider not found');
        return this.prisma.providerAddress.create({
            data: {
                provider_id: providerId,
                address: dto.address,
                city: dto.city,
                state: dto.state,
                country: dto.country,
                zipcode: dto.zipcode,
                label: dto.label,
                latitude: dto.latitude ?? 0,
                longitude: dto.longitude ?? 0,
            },
        });
    }

    async deleteAddress(id: string, addressId: string) {
        const providerId = await this.resolveProviderId(id);
        if (!providerId) throw new NotFoundException('Provider not found');
        const record = await this.prisma.providerAddress.findFirst({
            where: { id: addressId, provider_id: providerId },
        });
        if (!record) throw new NotFoundException('Address not found');
        await this.prisma.providerAddress.delete({ where: { id: addressId } });
        return { message: 'Address deleted' };
    }
}
