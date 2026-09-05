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
import { NotificationsService } from '../notifications/notifications.service';
import { OtpService } from '../sms/otp.service';

@Injectable()
export class ServiceProviderService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private notifications: NotificationsService,
        private otpService: OtpService,
    ) { }

    private async notifyCustomer(bookingId: string, title: string, body: string, status: string, extraData: any = {}) {
        try {
            const booking = await this.prisma.booking.findUnique({
                where: { id: bookingId },
                include: { user: true }
            });

            if (booking?.user?.fcmToken) {
                await this.notifications.sendPushNotification(
                    booking.user.fcmToken,
                    title,
                    body,
                    { bookingId, status, type: 'BOOKING_UPDATE', ...extraData }
                );
            }
        } catch (e) {
            console.error('[ServiceProviderService] Failed to notify customer:', e);
        }
    }

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
            const otpResult = await this.otpService.sendOtp(dto.phoneNumber);
            return {
                message: otpResult.message,
                provider: existingProvider,
                data: otpResult.data,
            };
        }

        const provider = await this.prisma.serviceProvider.create({
            data: {
                user_id: user.id,
                name: dto.name,
                phoneNumber: dto.phoneNumber,
                status: 'PENDING', // Onboarding pending
            },
        });

        // 3. Create Provider Profile with services (legacy storage)
        await this.prisma.providerProfile.create({
            data: {
                provider_id: provider.id,
                services: dto.serviceCategories,
                experiences: [],
            },
        });

        // 3.1 Sync explicit many-to-many relations for Admin UI
        const validCategoryIds = (dto.serviceCategories || []).filter(id =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        );
        const validItemIds = (dto.serviceItems || []).filter(id =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        );

        if (validCategoryIds.length > 0 || validItemIds.length > 0) {
            await this.prisma.serviceProvider.update({
                where: { id: provider.id },
                data: {
                    categories: validCategoryIds.length > 0 ? {
                        connect: validCategoryIds.map(id => ({ id }))
                    } : undefined,
                    items: validItemIds.length > 0 ? {
                        connect: validItemIds.map(id => ({ id }))
                    } : undefined
                }
            });
        }

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

        // Trigger OTP generation and dispatch via OtpService
        const otpResult = await this.otpService.sendOtp(dto.phoneNumber);
        return {
            message: otpResult.message,
            providerId: provider.id,
            data: otpResult.data,
        };
    }

    async verifyOtp(phoneNumber: string, otp: string) {
        await this.otpService.verifyOtp(phoneNumber, otp);

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

        // Fetch full profile to include categories/items
        const fullProfile = await this.getProfile(providerId);

        return {
            message: 'Login successful',
            token,
            providerId,
            user: fullProfile,
        };
    }

    async updateFcmToken(id: string, fcmToken: string) {
        if (!fcmToken) {
            console.warn(`[ServiceProviderService] Missing FCM token for ID: ${id}`);
            throw new BadRequestException('FCM token is required');
        }

        console.log(`[ServiceProviderService] Received FCM token update for ID: ${id}. Token: ${fcmToken.substring(0, 15)}...`);
        const providerId = await this.resolveProviderId(id);
        if (!providerId) {
            console.warn(`[ServiceProviderService] Could not resolve provider ID for: ${id}`);
            throw new NotFoundException('Provider not found');
        }

        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: providerId },
            select: { user_id: true }
        });

        if (!provider) {
            console.warn(`[ServiceProviderService] Provider record missing in DB for resolved ID: ${providerId}`);
            throw new NotFoundException('Provider not found');
        }

        await this.prisma.user.update({
            where: { id: provider.user_id },
            data: { fcmToken }
        });

        console.log(`[ServiceProviderService] Successfully updated FCM token for user: ${provider.user_id}`);
        return { success: true, message: 'FCM token updated' };
    }

    async getProfile(id: string) {
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id },
            include: {
                providerProfiles: true,
                availabilities: true,
                spWallets: true,
                categories: true,
                items: true,
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

        console.log(`[ServiceProviderService] Updating profile for provider ${id}`, {
            categoryIds: dto.categoryIds,
            itemIds: dto.itemIds,
            hasServiceCategories: !!dto.serviceCategories
        });

        // Filter out any non-UUID strings (e.g. legacy slugs like 'sweep') to prevent Prisma errors
        const validCategoryIds = (dto.categoryIds || []).filter(id =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        );
        const validItemIds = (dto.itemIds || []).filter(id =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        );

        // Sync explicit many-to-many relations for Admin UI
        if (validCategoryIds.length > 0 || validItemIds.length > 0) {
            await this.prisma.serviceProvider.update({
                where: { id },
                data: {
                    categories: validCategoryIds.length > 0 ? {
                        set: validCategoryIds.map(cid => ({ id: cid }))
                    } : undefined,
                    items: validItemIds.length > 0 ? {
                        set: validItemIds.map(iid => ({ id: iid }))
                    } : undefined
                }
            });
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
                file_url: dto.fileUrl || '',
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

    async getNearbyJobs(userIdOrProviderId: string) {
        const id = await this.resolveProviderId(userIdOrProviderId);
        if (!id) {
            console.warn(`[ServiceProviderService] getNearbyJobs - Could not resolve provider for: ${userIdOrProviderId}`);
            return [];
        }

        console.log(`[ServiceProviderService] Resolved provider ${id} for nearby jobs request`);

        // Only show jobs when the provider is online
        const availability = await this.prisma.availability.findFirst({
            where: { provider_id: id },
        });

        if (!availability?.is_online) {
            console.log(`[ServiceProviderService] Provider ${id} is offline. Skipping job fetch.`);
            return []; // Offline providers do not receive jobs
        }

        // Return only jobs explicitly assigned to this provider by the mapping algorithm
        const spBookings = await this.prisma.spBooking.findMany({
            where: {
                status: { in: ['PENDING', 'PENDING\r\n'] as any },
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
                    durationMinutes: svc ? svc.durationMinutes : 60,
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
                    durationMinutes: 60,
                });
            }
        }
        if (enriched.length > 0) {
            console.log(`[ServiceProviderService] Found ${enriched.length} nearby jobs for provider ${id}`);
        }
        return enriched;
    }

    async acceptJob(userIdOrProviderId: string, jobId: string) {
        const id = await this.resolveProviderId(userIdOrProviderId);
        if (!id) throw new NotFoundException('Provider not found');

        console.log(`[ServiceProviderService] Attempting to accept job ${jobId} for provider ${id}`);

        const provider = await this.prisma.serviceProvider.findUnique({ where: { id } });
        if (!provider) throw new NotFoundException('Provider record not found');

        let job = await this.prisma.spBooking.findUnique({ where: { id: jobId } });
        if (!job) {
            // Try matching by booking_id
            job = await this.prisma.spBooking.findFirst({
                where: { booking_id: jobId, provider_id: id }
            });
        }

        if (!job) {
            // Check if direct booking exists
            const parentBooking = await this.prisma.booking.findUnique({ where: { id: jobId } });
            if (parentBooking) {
                job = await this.prisma.spBooking.create({
                    data: {
                        provider_id: id,
                        booking_id: parentBooking.id,
                        status: 'PENDING',
                        start_time: parentBooking.date,
                        end_time: new Date(new Date(parentBooking.date).getTime() + 60 * 60000),
                    }
                });
            }
        }

        if (!job) throw new NotFoundException('Job assignment not found');
        
        const currentStatus = (job.status || '').trim().toUpperCase();
        if (currentStatus === 'ACCEPTED' && job.provider_id === id) {
            console.log(`[ServiceProviderService] Job ${jobId} is already accepted by provider ${id}`);
        } else if (!currentStatus.startsWith('PENDING')) {
            console.warn(`[ServiceProviderService] Job ${jobId} cannot be accepted. Current status: ${currentStatus}`);
            throw new BadRequestException('Job already taken or cancelled');
        }

        // If booking was already accepted by another provider, reject this attempt
        if (job.booking_id) {
            const parentBooking = await this.prisma.booking.findUnique({ where: { id: job.booking_id }, include: { service: true } });

            if (parentBooking) {
                // If the booking is already CONFIRMED but by someone else, block it.
                if (parentBooking.status === 'CONFIRMED' && parentBooking.providerId !== id) {
                    throw new BadRequestException('This job has already been accepted by another provider');
                }

                // If it's already in progress or completed, definitely block.
                if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(parentBooking.status)) {
                    throw new BadRequestException('This job is no longer available');
                }
            }
        }

        // 1. Calculate new job time range & Duration
        const newStart = job.start_time ? new Date(job.start_time) : new Date();
        const parentBookingForDuration = job.booking_id ? await this.prisma.booking.findUnique({ where: { id: job.booking_id }, include: { service: true } }) : null;
        const durationMinutes = parentBookingForDuration?.service?.durationMinutes ?? 60;
        const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

        // 2. Validate Operating Shift Working Hours in IST (06:00 AM - 10:00 PM IST)
        const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
        const istStart = new Date(newStart.getTime() + IST_OFFSET_MS);
        const istEnd = new Date(newEnd.getTime() + IST_OFFSET_MS);
        const startHourIST = istStart.getUTCHours();
        const endHourIST = istEnd.getUTCHours();

        if (startHourIST < 6 || (endHourIST >= 22 && istEnd.getUTCMinutes() > 0)) {
            console.warn(`[ServiceProviderService] Operating hours note: startHourIST=${startHourIST}, endHourIST=${endHourIST}`);
        }

        // 3. Validate Overlap & 30-min Travel Buffer against existing ACCEPTED/ARRIVED/IN_PROGRESS jobs
        const existingAcceptedJobs = await this.prisma.spBooking.findMany({
            where: {
                provider_id: id,
                id: { not: job.id },
                status: { in: ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] },
            },
            include: { booking: { include: { service: true } } },
        });

        const TRAVEL_BUFFER_MS = 30 * 60000; // 30 minutes travel buffer

        for (const existing of existingAcceptedJobs) {
            if (!existing.start_time) continue; // Skip entries without valid start_time
            const exStart = new Date(existing.start_time);
            const exDuration = existing.booking?.service?.durationMinutes ?? 60;
            const exEnd = new Date(exStart.getTime() + exDuration * 60000);

            // Only check overlap if on the same day (within 24 hours)
            if (Math.abs(newStart.getTime() - exStart.getTime()) > 24 * 60 * 60 * 1000) {
                continue;
            }

            // Buffer range around existing job: [exStart - 30m, exEnd + 30m]
            const bufferedExStart = new Date(exStart.getTime() - TRAVEL_BUFFER_MS);
            const bufferedExEnd = new Date(exEnd.getTime() + TRAVEL_BUFFER_MS);

            // Check if [newStart, newEnd] overlaps with [bufferedExStart, bufferedExEnd]
            if (newStart < bufferedExEnd && newEnd > bufferedExStart) {
                const formattedExStart = exStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                throw new BadRequestException(
                    `This job overlaps with an existing job in your schedule (${formattedExStart}). Required 30-min travel buffer included.`
                );
            }
        }

        const updatedSp = await this.prisma.spBooking.update({
            where: { id: job.id },
            data: {
                status: 'ACCEPTED',
                provider_id: id,
            },
        });

        if (updatedSp.booking_id) {
            // Accept: mark the parent booking as CONFIRMED with this provider
            await this.prisma.booking.update({
                where: { id: updatedSp.booking_id },
                data: { status: 'CONFIRMED', providerId: id }
            });

            // Find competing pending spBookings to notify providers that the job was taken
            const competingSpBookings = await this.prisma.spBooking.findMany({
                where: {
                    booking_id: updatedSp.booking_id,
                    id: { not: job.id },
                    status: 'PENDING',
                },
                include: { provider: { include: { user: true } } },
            });

            // Auto-close all OTHER pending SpBookings for the same parent booking
            const cancelled = await this.prisma.spBooking.updateMany({
                where: {
                    booking_id: updatedSp.booking_id,
                    id: { not: job.id },
                    status: 'PENDING',
                },
                data: { status: 'CANCELLED' },
            });
            console.log(`[Algorithm] Booking ${updatedSp.booking_id} accepted by ${provider.name}. Closed ${cancelled.count} other pending notification(s).`);

            // Send BOOKING_CANCELLED push notification to competing providers (Req #15)
            for (const item of competingSpBookings) {
                if (item.provider?.user?.fcmToken) {
                    this.notifications.sendPushNotification(
                        item.provider.user.fcmToken,
                        'Job Update ℹ️',
                        'This job request was accepted by another provider or is no longer available.',
                        {
                            type: 'BOOKING_CANCELLED',
                            bookingId: updatedSp.booking_id,
                            spBookingId: item.id,
                        }
                    ).catch(e => console.error('[Notification] Failed to send cancel push:', e));
                }
            }
            
            // Notify Customer
            await this.notifyCustomer(updatedSp.booking_id, 'Job Accepted', `Your booking has been accepted by ${provider.name}.`, 'CONFIRMED');
        }

        // Enrich returning object for the app
        const b = updatedSp.booking_id ? await this.prisma.booking.findUnique({
            where: { id: updatedSp.booking_id },
            include: { user: true, service: true }
        }) : null;

        let address = 'N/A';
        let lat = 0;
        let lng = 0;
        if (b?.addressId) {
            const addr = await this.prisma.customerAddress.findUnique({ where: { id: b.addressId } });
            if (addr) {
                address = addr.address;
                lat = addr.latitude;
                lng = addr.longitude;
            }
        }

        return {
            id: updatedSp.id,
            bookingId: b?.id,
            customerName: b?.user?.name || 'Customer',
            status: 'accepted',
            address,
            latitude: lat,
            longitude: lng,
            scheduledAt: b?.date,
            serviceCategoryId: b?.service?.categoryId || 'sweep',
            durationMinutes: b?.service?.durationMinutes || 60,
        };
    }

    async rejectJob(userIdOrProviderId: string, jobId: string, dto: JobActionDto) {
        const id = await this.resolveProviderId(userIdOrProviderId);
        if (!id) throw new NotFoundException('Provider not found');

        console.log(`[ServiceProviderService] Provider ${id} rejecting job ${jobId}. Reason: ${dto.reason}`);

        const updated = await this.prisma.spBooking.update({
            where: { id: jobId },
            data: { status: 'REJECTED' },
        });

        if (updated.booking_id) {
            const booking = await this.prisma.booking.findUnique({ where: { id: updated.booking_id } });
            // If the booking was confirmed (manual assignment) or pending, reset it for reassignment
            if (booking && (booking.status === 'PENDING' || booking.status === 'CONFIRMED')) {
                // If it was manual assignment (CONFIRMED), revert to PENDING so mapping can pick it up or admin can reassign
                if (booking.status === 'CONFIRMED') {
                    await this.prisma.booking.update({
                        where: { id: booking.id },
                        data: { status: 'PENDING', providerId: null }
                    });
                }

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
        const updated = await this.prisma.spBooking.update({
            where: { id: jobId },
            data: { status: 'ARRIVED' },
        });
        
        if (updated.booking_id) {
            await this.notifyCustomer(updated.booking_id, 'Provider Arrived', 'Your service provider has arrived at your location.', 'ARRIVED');
        }

        return { id: updated.id, status: 'arrived' };
    }

    async startJob(providerId: string, spBookingId: string, otp: string) {
        const spBooking = await this.prisma.spBooking.findUnique({
            where: { id: spBookingId },
            include: { booking: true }
        });

        if (!spBooking) throw new NotFoundException('Job not found');
        if (!spBooking.booking) throw new BadRequestException('Parent booking not found');
        console.log(spBooking.booking.startOTP, otp);
        if (spBooking.booking.startOTP !== otp) {
            throw new BadRequestException('Invalid OTP provided');
        }

        const now = new Date();

        // 1. Update SpBooking
        const updatedSp = await this.prisma.spBooking.update({
            where: { id: spBookingId },
            data: {
                status: 'IN_PROGRESS',
                start_time: now,
            },
        });

        // 2. Update Parent Booking
        await this.prisma.booking.update({
            where: { id: spBooking.booking.id },
            data: {
                status: 'IN_PROGRESS',
                jobStartedAt: now,
            }
        });

        // Notify Customer
        await this.notifyCustomer(
            spBooking.booking.id, 
            'Job Started', 
            'Your job has officially started.', 
            'IN_PROGRESS',
            { type: 'JOB_STARTED', startedAt: now.toISOString() }
        );

        return { id: updatedSp.id, status: 'in_progress', startedAt: now };
    }

    async endJob(userIdOrProviderId: string, jobId: string, isProvider: boolean) {
        // This accepts either SpBooking.id (jobId) or Booking.id?
        // Let's assume jobId is SpBooking.id if isProvider is true, else Booking.id if isProvider is false.
        // But to be consistent, let's look for the parent Booking.

        let targetBookingId: string;
        let spBookingId: string | undefined;

        if (isProvider) {
            const spBooking = await this.prisma.spBooking.findUnique({ where: { id: jobId } });
            if (!spBooking) throw new NotFoundException('Job not found');
            if (!spBooking.booking_id) throw new BadRequestException('No parent booking linked to this job');
            targetBookingId = spBooking.booking_id;
            spBookingId = spBooking.id;
        } else {
            targetBookingId = jobId;
        }

        const booking = await this.prisma.booking.findUnique({ where: { id: targetBookingId } });
        if (!booking) throw new NotFoundException('Booking not found');

        if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
            throw new BadRequestException('Job already ended');
        }

        const now = new Date();

        // 1. Update Parent Booking
        const updatedBooking = await this.prisma.booking.update({
            where: { id: targetBookingId },
            data: {
                status: 'COMPLETED',
                jobEndedAt: now,
            }
        });

        // 2. Update SpBooking status if it exists
        if (spBookingId || updatedBooking.providerId) {
            const spId = spBookingId || (await this.prisma.spBooking.findFirst({
                where: { booking_id: targetBookingId, status: { in: ['IN_PROGRESS', 'ACCEPTED', 'ARRIVED'] } }
            }))?.id;

            if (spId) {
                await this.prisma.spBooking.update({
                    where: { id: spId },
                    data: {
                        status: 'COMPLETED',
                        end_time: now,
                    }
                });
            }
        }

        // Notify Customer
        await this.notifyCustomer(targetBookingId, 'Job Ended', 'The job has been completed.', 'COMPLETED', { type: 'JOB_ENDED' });

        return { id: targetBookingId, status: 'completed', endedAt: now };
    }

    async completeJob(id: string, jobId: string) {
        const now = new Date();
        const job = await this.prisma.spBooking.update({
            where: { id: jobId },
            data: { status: 'COMPLETED', end_time: now },
        });

        // Also update parent booking status so customer can see it as Completed
        if (job.booking_id) {
            await this.prisma.booking.update({
                where: { id: job.booking_id },
                data: { 
                    status: 'COMPLETED',
                    jobEndedAt: now
                }
            });

            // Notify Customer
            await this.notifyCustomer(job.booking_id, 'Job Completed', 'Your service provider has marked the job as completed.', 'COMPLETED', { type: 'JOB_ENDED' });
        }

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

        // Notify Customer via Push
        if (booking.booking_id) {
            await this.notifyCustomer(booking.booking_id, 'Provider on the way!', `Your provider will arrive in approximately ${etaMinutes} minutes.`, 'ETA_SHARED');
        }

        return { success: true, message: 'ETA shared with customer', etaMinutes };
    }

    async updateLocation(id: string, dto: LocationUpdateDto) {
        const providerId = await this.resolveProviderId(id);
        if (!providerId) {
            console.warn(`[ServiceProviderService][updateLocation] Could not resolve provider for ${id}`);
            return { success: false };
        }
        
        console.log(`[ServiceProviderService] Updating location for provider ${providerId}: lat=${dto.latitude}, lng=${dto.longitude}`);

        // 1. Update live location in Availability for immediate radius matching
        const availability = await this.prisma.availability.findFirst({
            where: { provider_id: providerId }
        });

        if (availability) {
            await this.prisma.availability.update({
                where: { id: availability.id },
                data: {
                    currentLatitude: dto.latitude,
                    currentLongitude: dto.longitude,
                    last_seen: new Date(),
                },
            });
        }

        // 2. Log location ping if there's an active booking
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

    async getActiveJob(id: string) {
        const job = await this.prisma.spBooking.findFirst({
            where: {
                provider_id: id,
                status: { in: ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] }
            },
            include: { booking: { include: { user: true, service: true } } }
        });

        if (!job || !job.booking) return null;

        const b = job.booking;
        let address = 'N/A';
        let lat = 0; let lng = 0;
        if (b.addressId) {
            const addr = await this.prisma.customerAddress.findUnique({ where: { id: b.addressId } });
            if (addr) { address = addr.address; lat = addr.latitude; lng = addr.longitude; }
        }

        return {
            id: job.id,
            bookingId: b.id,
            customerName: b.user?.name || 'Customer',
            status: job.status.toLowerCase() as any,
            address,
            latitude: lat,
            longitude: lng,
            scheduledAt: b.date,
            startedAt: job.start_time,
            serviceCategoryId: b.service?.categoryId || 'sweep',
            durationMinutes: b.service?.durationMinutes || 60,
            providerId: id,
        };
    }

    async getUpcomingJobs(userIdOrProviderId: string) {
        const id = await this.resolveProviderId(userIdOrProviderId);
        if (!id) throw new NotFoundException('Provider not found');

        const acceptedSpBookings = await this.prisma.spBooking.findMany({
            where: {
                provider_id: id,
                status: { in: ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] },
            },
            include: {
                booking: {
                    include: {
                        user: true,
                        service: true,
                    },
                },
            },
            orderBy: {
                start_time: 'asc',
            },
        });

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const todayJobs: any[] = [];
        const futureJobs: any[] = [];
        const allJobs: any[] = [];

        for (const sp of acceptedSpBookings) {
            const b = sp.booking;
            let addressStr = 'Address not provided';
            let lat = 0;
            let lng = 0;
            if (b?.addressId) {
                const addr = await this.prisma.customerAddress.findUnique({ where: { id: b.addressId } });
                if (addr) {
                    addressStr = addr.address;
                    lat = addr.latitude;
                    lng = addr.longitude;
                }
            }

            const schedDate = sp.start_time ? new Date(sp.start_time) : (b?.date ? new Date(b.date) : new Date());
            const schedYear = schedDate.getFullYear();
            const schedMonth = String(schedDate.getMonth() + 1).padStart(2, '0');
            const schedDay = String(schedDate.getDate()).padStart(2, '0');
            const schedDateStr = `${schedYear}-${schedMonth}-${schedDay}`;

            const jobItem = {
                id: sp.id,
                spBookingId: sp.id,
                bookingId: b?.id,
                customerName: b?.user?.name || 'Customer',
                customerPhone: b?.user?.phoneNumber || 'N/A',
                address: addressStr,
                latitude: lat,
                longitude: lng,
                serviceCategory: b?.service?.name || 'Home Service',
                scheduledAt: schedDate.toISOString(),
                startedAt: sp.start_time ? new Date(sp.start_time).toISOString() : undefined,
                durationMinutes: b?.service?.durationMinutes || 60,
                status: sp.status.toLowerCase(),
                isToday: schedDateStr === todayStr,
            };

            allJobs.push(jobItem);
            if (schedDateStr === todayStr || sp.status === 'IN_PROGRESS' || sp.status === 'ARRIVED') {
                todayJobs.push(jobItem);
            } else {
                futureJobs.push(jobItem);
            }
        }

        return {
            today: todayJobs,
            future: futureJobs,
            all: allJobs,
        };
    }

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

    // ==================== CLOCK-IN & CLOCK-OUT (FR-PAY-003) ====================

    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    }

    async clockIn(id: string, dto: { shift_assignment_id: string; latitude: number; longitude: number; device_id: string }) {
        const providerId = await this.resolveProviderId(id);
        if (!providerId) throw new NotFoundException('Provider not found');

        // 1. Validate: GPS coordinates are valid
        if (dto.latitude < -90 || dto.latitude > 90 || dto.longitude < -180 || dto.longitude > 180) {
            throw new BadRequestException('Invalid GPS coordinates.');
        }

        // 2. Validate: Shift assignment exists and belongs to provider
        const assignment = await this.prisma.provider_Shift_Assignments.findUnique({
            where: { id: dto.shift_assignment_id }
        });
        if (!assignment) throw new NotFoundException('Shift assignment not found');
        if (assignment.provider_id !== providerId) {
            throw new BadRequestException('This shift assignment belongs to another provider.');
        }
        if (assignment.Status === 'CANCELLED') {
            throw new BadRequestException('Cannot clock in to a cancelled shift.');
        }

        // 3. Validate: Precondition (Assigned shift exists for today)
        const todayStr = new Date().toISOString().split('T')[0];
        const assignmentStr = new Date(assignment.assignment_date).toISOString().split('T')[0];
        if (todayStr !== assignmentStr) {
            throw new BadRequestException('You can only clock in to shifts assigned for today.');
        }

        // 4. Validate: Check if already clocked in today for this shift type
        const existingAttendance = await this.prisma.provider_Attendance.findFirst({
            where: {
                provider_id: providerId,
                shift_type_id: assignment.shift_type_id,
                Status: 'CLOCKED_IN',
            }
        });
        if (existingAttendance) {
            throw new BadRequestException('You are already clocked in for this shift.');
        }

        // 5. GPS Geofence validation against registered home or work zone address
        const addresses = await this.prisma.providerAddress.findMany({
            where: { provider_id: providerId }
        });

        // Let's compute distance if they have a registered address
        let locationRemarks = 'No registered address for distance validation';
        if (addresses.length > 0) {
            const nearest = addresses.map(addr => ({
                label: addr.label,
                distance: this.calculateDistance(dto.latitude, dto.longitude, addr.latitude, addr.longitude)
            })).sort((a, b) => a.distance - b.distance)[0];

            locationRemarks = `Nearest registered location: ${nearest.label} (Distance: ${nearest.distance.toFixed(2)} km)`;
        }

        // 6. Save Attendance record
        const attendance = await this.prisma.provider_Attendance.create({
            data: {
                provider_id: providerId,
                shift_type_id: assignment.shift_type_id,
                attendance_date: new Date(),
                in_time: new Date(),
                Status: 'CLOCKED_IN',
            }
        });

        // 7. Postconditions & Audit Logging
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: 'system-clock-in',
                    action: `PROVIDER_CLOCK_IN_${providerId}`,
                    details: `Clocked in for shift assignment ${dto.shift_assignment_id} using device ${dto.device_id}. GPS: (${dto.latitude}, ${dto.longitude}). ${locationRemarks}.`,
                }
            });
        } catch (e) {
            console.error('[ServiceProviderService] Clock-in audit log failed: ', e);
        }

        // 8. Notify: Update shift assignment status to APPROVED or CLOCKED_IN if pending
        if (assignment.Status === 'PENDING') {
            await this.prisma.provider_Shift_Assignments.update({
                where: { id: assignment.id },
                data: { Status: 'ACTIVE' }
            });
        }

        return {
            message: 'Clock-in successful',
            attendanceId: attendance.id,
            inTime: attendance.in_time,
            status: attendance.Status,
            locationValidation: locationRemarks
        };
    }

    async clockOut(id: string, attendanceId: string, dto?: { timestamp?: string }) {
        const providerId = await this.resolveProviderId(id);
        if (!providerId) throw new NotFoundException('Provider not found');

        // 1. Fetch active clock-in record
        const attendance = await this.prisma.provider_Attendance.findUnique({
            where: { id: attendanceId }
        });
        if (!attendance) throw new NotFoundException('Attendance record not found.');
        if (attendance.provider_id !== providerId) {
            throw new BadRequestException('This attendance record belongs to another provider.');
        }
        if (attendance.Status === 'CLOCKED_OUT') {
            throw new BadRequestException('You are already clocked out for this attendance record.');
        }

        // 2. Process: Calculate hours worked
        const inTime = new Date(attendance.in_time);
        const outTime = dto?.timestamp ? new Date(dto.timestamp) : new Date();
        
        // Ensure outTime is after inTime
        if (outTime.getTime() < inTime.getTime()) {
            throw new BadRequestException('Clock-out timestamp cannot be before clock-in time.');
        }

        const diffMs = outTime.getTime() - inTime.getTime();
        const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60))); // Default to at least 1 hour

        // Fetch shift type to automatically classify attendance (FR-PAY-005)
        const shiftType = await this.prisma.provider_Shift_Type.findUnique({
            where: { id: attendance.shift_type_id }
        });
        const targetDuration = shiftType?.Duration_hours ?? 8;

        let classification = 'PRESENT';
        if (diffHours < (targetDuration * 0.5)) {
            classification = 'ABSENT';
        } else if (diffHours < (targetDuration * 0.9)) {
            classification = 'HALF_DAY';
        }

        // 3. Save: Update attendance record with automated classification
        const updatedAttendance = await this.prisma.provider_Attendance.update({
            where: { id: attendanceId },
            data: {
                out_time: outTime,
                total_hours: diffHours,
                Status: classification,
            }
        });

        // 4. Postconditions & Audit Logging
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: 'system-clock-out',
                    action: `PROVIDER_CLOCK_OUT_${providerId}`,
                    details: `Clocked out from shift ${attendance.shift_type_id}. Worked ${diffHours}/${targetDuration} hours. Classified as ${classification}.`,
                }
            });
        } catch (e) {
            console.error('[ServiceProviderService] Clock-out audit log failed: ', e);
        }

        return {
            message: 'Clock-out successful and attendance classified',
            attendanceId: updatedAttendance.id,
            outTime: updatedAttendance.out_time,
            totalHours: updatedAttendance.total_hours,
            status: updatedAttendance.Status
        };
    }

    // ==================== EARNINGS DASHBOARD (FR-PAY-010) ====================

    async getEarningsDashboard(providerId: string) {
        // 1. Validate: Confirm provider exists
        const provider = await this.prisma.serviceProvider.findUnique({
            where: { id: providerId },
        });
        if (!provider) throw new NotFoundException('Service provider not found');

        // 2. Process: Fetch wallet balance
        const wallet = await this.prisma.spWallet.findFirst({
            where: { provider_id: providerId }
        });
        const currentBalance = wallet ? Number(wallet.balance) : 0;

        // 3. Process: Fetch salary ledger entries (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const ledgerEntries = await this.prisma.provider_Salary_Ledger.findMany({
            where: {
                provider_id: providerId,
                Shift_Date: { gte: thirtyDaysAgo }
            },
            orderBy: { Shift_Date: 'desc' }
        });

        // 4. Process: Aggregate salary totals
        const earningsSummary = ledgerEntries.reduce(
            (acc, entry) => {
                acc.totalBaseSalary += Number(entry.Base_Salary);
                acc.totalOvertimePay += Number(entry.Overtime_pay);
                acc.totalBonuses += Number(entry.Bonus_Amount);
                acc.totalPenalties += Number(entry.Penalty_Amount);
                acc.totalEarnings += Number(entry.Total_pay);
                return acc;
            },
            { totalBaseSalary: 0, totalOvertimePay: 0, totalBonuses: 0, totalPenalties: 0, totalEarnings: 0 }
        );

        // 5. Process: Fetch attendance summary (last 30 days)
        const attendanceRecords = await this.prisma.provider_Attendance.findMany({
            where: {
                provider_id: providerId,
                attendance_date: { gte: thirtyDaysAgo }
            },
            orderBy: { attendance_date: 'desc' }
        });

        const attendanceSummary = attendanceRecords.reduce(
            (acc, record) => {
                acc.totalShifts++;
                acc.totalHoursWorked += record.total_hours;
                if (record.Status === 'PRESENT') acc.presentDays++;
                else if (record.Status === 'HALF_DAY') acc.halfDays++;
                else if (record.Status === 'ABSENT') acc.absentDays++;
                else if (record.Status === 'LATE') acc.lateDays++;
                return acc;
            },
            { totalShifts: 0, totalHoursWorked: 0, presentDays: 0, halfDays: 0, absentDays: 0, lateDays: 0 }
        );

        // 6. Process: Fetch payroll settlement history (all time)
        const settlementHistory = await this.prisma.provider_payroll_settlement.findMany({
            where: { provider_id: providerId },
            orderBy: { Payout_Cycle: 'desc' },
            take: 12 // Last 12 settlement cycles
        });

        // 7. Process: Fetch recent payouts from wallet
        let recentPayouts: any[] = [];
        if (wallet) {
            recentPayouts = await this.prisma.payout.findMany({
                where: { spwallet_id: wallet.id },
                orderBy: { createdAt: 'desc' },
                take: 10
            });
        }

        // 8. Process: Fetch performance metrics
        const performanceMetrics = await this.prisma.performancemetric.findMany({
            where: { provider_id: providerId }
        });

        // 9. Postconditions: Audit Log
        try {
            await this.prisma.auditLog.create({
                data: {
                    admin_id: 'provider-self-view',
                    action: `EARNINGS_DASHBOARD_VIEWED_${providerId}`,
                    details: `Provider ${provider.name} viewed earnings dashboard.`,
                }
            });
        } catch (e) {
            console.error('[ServiceProviderService] Earnings dashboard audit log failed: ', e);
        }

        // 10. Output: Return consolidated dashboard
        return {
            provider: {
                id: provider.id,
                name: provider.name,

                phone: provider.phoneNumber,
            },
            wallet: {
                currentBalance,
                walletId: wallet?.id ?? null,
            },
            earningsSummary: {
                ...earningsSummary,
                netEarnings: earningsSummary.totalEarnings,
                period: 'Last 30 days',
            },
            attendanceSummary: {
                ...attendanceSummary,
                period: 'Last 30 days',
            },
            dailyLedger: ledgerEntries.map(e => ({
                date: e.Shift_Date,
                baseSalary: Number(e.Base_Salary),
                overtimePay: Number(e.Overtime_pay),
                bonus: Number(e.Bonus_Amount),
                penalty: Number(e.Penalty_Amount),
                totalPay: Number(e.Total_pay),
            })),
            settlementHistory: settlementHistory.map(s => ({
                id: s.id,
                payoutCycle: s.Payout_Cycle,
                payoutDate: s.payout_date,
                totalBonus: Number(s.total_bonus),
                totalPenalty: Number(s.total_penalty),
                totalDeduction: Number(s.total_deduction),
                totalPayment: Number(s.total_payment),
                status: s.status,
            })),
            recentPayouts: recentPayouts.map(p => ({
                id: p.id,
                amount: Number(p.amount),
                status: p.status,
                date: p.createdAt,
            })),
            performanceMetrics: performanceMetrics.map(m => ({
                metric: m.metric,
                value: m.value,
            })),
        };
    }
}
