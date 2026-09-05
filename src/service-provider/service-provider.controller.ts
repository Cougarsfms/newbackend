import { Controller, Post, Body, Get, Patch, Param, Query, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ServiceProviderService } from './service-provider.service';
import { RegisterProviderDto } from './dto/register-provider.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadKycDto } from './dto/upload-kyc.dto';
import { JobActionDto } from './dto/job-action.dto';
import { LocationUpdateDto } from './dto/location-update.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';

@ApiTags('Service Provider')
@Controller('service-provider')
export class ServiceProviderController {
    constructor(private readonly providerService: ServiceProviderService) { }

    // ==================== ONBOARDING ====================

    @Post('register')
    @ApiOperation({ summary: 'Register as a service provider' })
    @ApiResponse({ status: 201, description: 'OTP sent to mobile number' })
    async register(@Body() dto: RegisterProviderDto) {
        return this.providerService.register(dto);
    }

    @Post('verify-otp')
    @ApiOperation({ summary: 'Verify OTP and login' })
    @ApiResponse({ status: 200, description: 'Login successful, returns token' })
    async verifyOtp(@Body() dto: VerifyOtpDto) {
        return this.providerService.verifyOtp(dto.phoneNumber, dto.otp);
    }

    @Get(':id/profile')
    @ApiOperation({ summary: 'Get provider profile' })
    async getProfile(@Param('id') id: string) {
        return this.providerService.getProfile(id);
    }
    
    @Post(':id/fcm-token')
    @ApiOperation({ summary: 'Update FCM token for push notifications' })
    async updateFcmToken(@Param('id') id: string, @Body('fcmToken') fcmToken: string) {
        console.log(`FCM token update request - Provider ID: ${id}, Token: ${fcmToken}`);
        return this.providerService.updateFcmToken(id, fcmToken);
    }

    @Patch(':id/profile')
    @ApiOperation({ summary: 'Update provider profile' })
    async updateProfile(@Param('id') id: string, @Body() dto: UpdateProfileDto) {
        return this.providerService.updateProfile(id, dto);
    }

    @Post(':id/onboarding/complete')
    @ApiOperation({ summary: 'Complete onboarding process' })
    async completeOnboarding(@Param('id') id: string) {
        return this.providerService.completeOnboarding(id);
    }

    // ==================== KYC ====================

    @Post(':id/kyc/upload')
    @ApiOperation({ summary: 'Upload KYC document' })
    async uploadKyc(@Param('id') id: string, @Body() dto: UploadKycDto) {
        return this.providerService.uploadKyc(id, dto);
    }

    @Get(':id/kyc/status')
    @ApiOperation({ summary: 'Get KYC verification status' })
    async getKycStatus(@Param('id') id: string) {
        return this.providerService.getKycStatus(id);
    }

    // ==================== AVAILABILITY & JOBS ====================

    @Patch(':id/availability')
    @ApiOperation({ summary: 'Toggle online/offline status' })
    async toggleAvailability(@Param('id') id: string) {
        return this.providerService.toggleAvailability(id);
    }

    @Get(':id/availability')
    @ApiOperation({ summary: 'Get current online/offline status' })
    async getAvailability(@Param('id') id: string) {
        return this.providerService.getAvailability(id);
    }

    @Get(':id/jobs/nearby')
    @ApiOperation({ summary: 'Get nearby job requests' })
    async getNearbyJobs(@Param('id') id: string) {
        console.log(`[Controller] Fetching nearby jobs for Provider/User: ${id}`);
        return this.providerService.getNearbyJobs(id);
    }

    @Post(':id/jobs/:jobId/accept')
    @ApiOperation({ summary: 'Accept a job request' })
    async acceptJob(@Param('id') id: string, @Param('jobId') jobId: string) {
        console.log(`[Controller] Accept request - Provider/User: ${id}, Job: ${jobId}`);
        return this.providerService.acceptJob(id, jobId);
    }

    @Post(':id/jobs/:jobId/reject')
    @ApiOperation({ summary: 'Reject a job request' })
    async rejectJob(
        @Param('id') id: string,
        @Param('jobId') jobId: string,
        @Body() dto: JobActionDto,
    ) {
        console.log(`[Controller] Reject request - Provider/User: ${id}, Job: ${jobId}, Reason: ${dto.reason}`);
        return this.providerService.rejectJob(id, jobId, dto);
    }

    // ==================== EXECUTION ====================

    @Post(':id/jobs/:jobId/arrive')
    @ApiOperation({ summary: 'Mark arrival at customer location' })
    async markArrival(@Param('id') id: string, @Param('jobId') jobId: string) {
        return this.providerService.markArrival(id, jobId);
    }

    @Post(':id/jobs/:jobId/start')
    @ApiOperation({ summary: 'Start the job' })
    async startJob(@Param('id') id: string, @Param('jobId') jobId: string, @Body('otp') otp: string) {
        return this.providerService.startJob(id, jobId, otp);
    }

    @Post(':id/jobs/:jobId/complete')
    @ApiOperation({ summary: 'Complete the job' })
    async completeJob(@Param('id') id: string, @Param('jobId') jobId: string) {
        return this.providerService.completeJob(id, jobId);
    }

    @Post(':id/jobs/:jobId/end')
    @ApiOperation({ summary: 'End the job early' })
    async endJob(@Param('id') id: string, @Param('jobId') jobId: string) {
        return this.providerService.endJob(id, jobId, true);
    }

    @Post(':id/jobs/:jobId/eta')
    @ApiOperation({ summary: 'Share ETA with customer' })
    async shareEta(@Param('id') id: string, @Param('jobId') jobId: string, @Body('etaMinutes') etaMinutes: number) {
        return this.providerService.shareEta(id, jobId, etaMinutes);
    }

    @Post(':id/location')
    @ApiOperation({ summary: 'Update live location' })
    async updateLocation(@Param('id') id: string, @Body() dto: LocationUpdateDto) {
        console.log(`[Controller] Location update for Provider: ${id}`);
        return this.providerService.updateLocation(id, dto);
    }

    // ==================== EARNINGS & WALLET ====================

    @Get(':id/earnings')
    @ApiOperation({ summary: 'Get earnings summary' })
    async getEarnings(@Param('id') id: string) {
        return this.providerService.getEarnings(id);
    }

    @Get(':id/wallet')
    @ApiOperation({ summary: 'Get wallet details' })
    async getWallet(@Param('id') id: string) {
        return this.providerService.getWallet(id);
    }

    @Post(':id/payout')
    @ApiOperation({ summary: 'Request payout' })
    async requestPayout(@Param('id') id: string, @Body() dto: PayoutRequestDto) {
        return this.providerService.requestPayout(id, dto);
    }

    // ==================== PERFORMANCE ====================

    @Get(':id/ratings')
    @ApiOperation({ summary: 'Get ratings and reviews' })
    async getRatings(@Param('id') id: string) {
        return this.providerService.getRatings(id);
    }

    @Get(':id/performance')
    @ApiOperation({ summary: 'Get performance metrics including rating and rates' })
    async getPerformance(@Param('id') id: string) {
        return this.providerService.getPerformance(id);
    }

    @Post(':id/support')
    @ApiOperation({ summary: 'Raise support ticket' })
    async raiseSupportTicket(
        @Param('id') id: string,
        @Body() body: { subject: string; message: string },
    ) {
        return this.providerService.raiseSupportTicket(id, body.subject, body.message);
    }

    // ==================== ADDRESS MANAGEMENT ====================

    @Get(':id/addresses')
    @ApiOperation({ summary: 'Get all saved addresses for a provider' })
    async getAddresses(@Param('id') id: string) {
        return this.providerService.getAddresses(id);
    }

    @Post(':id/addresses')
    @ApiOperation({ summary: 'Add a new address for a provider' })
    async addAddress(
        @Param('id') id: string,
        @Body() body: {
            address: string;
            city: string;
            state: string;
            country: string;
            zipcode: string;
            label: string;
            latitude?: number;
            longitude?: number;
        },
    ) {
        return this.providerService.addAddress(id, body);
    }

    @Post(':id/addresses/:addressId/delete')
    @ApiOperation({ summary: 'Delete a saved address' })
    async deleteAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
        return this.providerService.deleteAddress(id, addressId);
    }

    @Get(':id/jobs/active')
    @ApiOperation({ summary: 'Get current active job' })
    async getActiveJob(@Param('id') id: string) {
        console.log(`[Controller] Fetching active job for Provider: ${id}`);
        return this.providerService.getActiveJob(id);
    }

    @Get(':id/jobs/upcoming')
    @ApiOperation({ summary: 'Get all accepted upcoming jobs for provider (today & future)' })
    async getUpcomingJobs(@Param('id') id: string) {
        console.log(`[Controller] Fetching upcoming jobs for Provider: ${id}`);
        return this.providerService.getUpcomingJobs(id);
    }

    // ==================== CLOCK-IN & CLOCK-OUT (FR-PAY-003) ====================

    @Post(':id/clock-in')
    @ApiOperation({ 
        summary: 'Clock-in for assigned shift',
        description: 'Providers shall clock-in with GPS distance validation and device tracking'
    })
    @ApiResponse({ status: 201, description: 'Attendance started successfully' })
    @ApiResponse({ status: 400, description: 'Double clock-in, invalid GPS, or timezone mismatch' })
    @ApiResponse({ status: 404, description: 'Provider or Shift assignment not found' })
    async clockIn(@Param('id') id: string, @Body() dto: ClockInDto) {
        return this.providerService.clockIn(id, dto);
    }

    @Post(':id/clock-out/:attendanceId')
    @ApiOperation({ 
        summary: 'Clock-out of shift',
        description: 'Providers shall clock-out, calculating hours worked and updating ledger'
    })
    @ApiResponse({ status: 200, description: 'Clock-out completed successfully' })
    @ApiResponse({ status: 400, description: 'Already clocked out or invalid timestamp' })
    @ApiResponse({ status: 404, description: 'Attendance record not found' })
    async clockOut(
        @Param('id') id: string, 
        @Param('attendanceId') attendanceId: string,
        @Body() dto?: ClockOutDto
    ) {
        return this.providerService.clockOut(id, attendanceId, dto);
    }
}
