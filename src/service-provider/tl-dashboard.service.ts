import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignShiftDto, BulkAssignShiftDto } from './dto/tl-shift.dto';
import { RejectLeaveDto } from './dto/tl-leave.dto';
import { ResolveEscalationDto } from './dto/tl-escalation.dto';
import { BroadcastDto } from './dto/tl-broadcast.dto';
import { SendChatMessageDto } from './dto/tl-chat.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class TlDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly smsService: SmsService,
  ) {}

  async getDashboardKpis(userId: string) {
    // 1. Fetch online / duty status counts filtered by team leader
    const totalAgentsCount = await this.prisma.serviceProvider.count({
      where: {
        teamLeaderId: userId,
      },
    });

    const onDutyCount = await this.prisma.availability.count({
      where: {
        is_online: true,
        provider: {
          teamLeaderId: userId,
        },
      },
    });

    // 2. Fetch pending leave requests count filtered by team leader
    const pendingLeavesCount = await this.prisma.leaveRequest.count({
      where: {
        status: 'PENDING',
        user: {
          serviceProviders: {
            some: {
              teamLeaderId: userId,
            },
          },
        },
      },
    });

    // 3. Fetch active tasks in progress filtered by team leader
    const tasksInProgressCount = await this.prisma.spBooking.count({
      where: {
        status: 'IN_PROGRESS',
        provider: {
          teamLeaderId: userId,
        },
      },
    });

    // 4. Fetch team members list assigned to team leader
    const providers = await this.prisma.serviceProvider.findMany({
      where: {
        teamLeaderId: userId,
      },
      include: {
        user: true,
        categories: {
          take: 1,
        },
        availabilities: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    const team = providers.map((p) => {
      const isOnDuty = p.availabilities[0]?.is_online ?? false;
      const designation = p.categories[0]?.name ?? 'Field Agent';
      return {
        id: p.id,
        userId: p.user_id,
        name: p.name,
        phoneNumber: p.phoneNumber,
        designation,
        isOnDuty,
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.name)}`,
      };
    });

    // 5. Fetch recent pending leaves for assigned team members (limit 3)
    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        status: 'PENDING',
        user: {
          serviceProviders: {
            some: {
              teamLeaderId: userId,
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 3,
      include: {
        user: true,
      },
    });

    const pendingLeaves = leaves.map((l) => ({
      id: l.id,
      userId: l.userId,
      userName: l.user.name ?? 'Unknown Agent',
      userAvatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(l.user.name ?? 'UA')}`,
      type: l.type,
      fromDate: l.fromDate,
      toDate: l.toDate,
      reason: l.reason,
      status: l.status,
      appliedAt: l.createdAt,
    }));

    // 6. Log transaction for auditing
    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_DASHBOARD_VIEW',
        details: `Team Leader with User ID: ${userId} fetched dashboard metrics`,
      },
    });

    return {
      success: true,
      data: {
        metrics: {
          onDuty: onDutyCount,
          totalAgents: totalAgentsCount,
          tasksInProgress: tasksInProgressCount,
          pendingApprovalsCount: pendingLeavesCount,
        },
        team,
        pendingLeaves,
      },
    };
  }

  async getAssignedProviders(tlId: string) {
    const providers = await this.prisma.serviceProvider.findMany({
      where: {
        teamLeaderId: tlId,
      },
      include: {
        user: true,
        categories: {
          take: 1,
        },
        availabilities: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    const list = providers.map((p) => {
      const latestAvailability = p.availabilities[0];
      const isOnDuty = latestAvailability?.is_online ?? false;
      const designation = p.categories[0]?.name ?? 'Field Agent';

      return {
        id: p.id,
        userId: p.user_id,
        user: {
          id: p.user_id,
          name: p.name,
          phone: p.phoneNumber,
          email: p.user.email ?? undefined,
          role: 'AGENT' as const,
          designation,
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.name)}`,
          rating: p.rating,
          experienceYears: p.yearsOfExperience ?? 0,
        },
        point: {
          lat: latestAvailability?.currentLatitude ?? 0.0,
          lng: latestAvailability?.currentLongitude ?? 0.0,
        },
        updatedAt: latestAvailability?.updatedAt.toISOString() ?? p.updatedAt.toISOString(),
        isOnDuty,
      };
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_PROVIDERS_VIEW',
        details: `Team Leader with User ID: ${tlId} listed assigned providers`,
      },
    });

    return {
      success: true,
      data: list,
    };
  }

  async getAssignedProviderProfile(tlId: string, providerId: string) {
    const provider = await this.prisma.serviceProvider.findFirst({
      where: {
        id: providerId,
        teamLeaderId: tlId,
      },
      include: {
        user: true,
        categories: {
          take: 1,
        },
        availabilities: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
        spWallets: {
          take: 1,
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or not assigned to you');
    }

    const latestAvailability = provider.availabilities[0];
    const isOnDuty = latestAvailability?.is_online ?? false;
    const designation = provider.categories[0]?.name ?? 'Field Agent';

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_PROVIDER_PROFILE_VIEW',
        details: `Team Leader with User ID: ${tlId} viewed profile of Provider ID: ${providerId}`,
      },
    });

    return {
      success: true,
      data: {
        id: provider.id,
        userId: provider.user_id,
        name: provider.name,
        phoneNumber: provider.phoneNumber,
        city: provider.city,
        yearsOfExperience: provider.yearsOfExperience ?? 0,
        status: provider.status,
        rating: provider.rating,
        kycStatus: provider.Kyc_status,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt,
        designation,
        isOnDuty,
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(provider.name)}`,
        point: {
          lat: latestAvailability?.currentLatitude ?? 0.0,
          lng: latestAvailability?.currentLongitude ?? 0.0,
        },
        walletBalance: provider.spWallets[0]?.balance ?? 0.0,
      },
    };
  }

  async getShiftTypes(tlId: string) {
    const shiftTypes = await this.prisma.provider_Shift_Type.findMany({
      where: {
        status: 'ACTIVE',
      },
    });
    return {
      success: true,
      data: shiftTypes,
    };
  }

  async assignShift(tlId: string, dto: AssignShiftDto) {
    const { providerId, shiftTypeId, assignmentDate } = dto;

    const provider = await this.prisma.serviceProvider.findFirst({
      where: {
        id: providerId,
        teamLeaderId: tlId,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or not assigned to you');
    }

    const shiftType = await this.prisma.provider_Shift_Type.findUnique({
      where: {
        id: shiftTypeId,
      },
    });

    if (!shiftType) {
      throw new NotFoundException('Shift Type not found');
    }

    const date = assignmentDate ? new Date(assignmentDate) : new Date();
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingAssignment = await this.prisma.provider_Shift_Assignments.findFirst({
      where: {
        provider_id: providerId,
        assignment_date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    if (existingAssignment) {
      throw new BadRequestException('A shift is already assigned to this provider for the specified date');
    }

    const assignment = await this.prisma.provider_Shift_Assignments.create({
      data: {
        provider_id: providerId,
        shift_type_id: shiftTypeId,
        assignment_date: date,
        Status: 'APPROVED',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_SHIFT_ASSIGN_SUCCESS',
        details: `Team Leader with User ID: ${tlId} assigned Shift Type: ${shiftTypeId} to Provider: ${providerId} on Date: ${date.toISOString().slice(0, 10)}`,
      },
    });

    return {
      success: true,
      message: 'Shift assigned successfully',
      data: assignment,
    };
  }

  async bulkAssignShifts(tlId: string, dto: BulkAssignShiftDto) {
    const { providerIds, shiftTypeId, assignmentDate } = dto;

    const shiftType = await this.prisma.provider_Shift_Type.findUnique({
      where: {
        id: shiftTypeId,
      },
    });

    if (!shiftType) {
      throw new NotFoundException('Shift Type not found');
    }

    const date = assignmentDate ? new Date(assignmentDate) : new Date();
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const results: Array<{ providerId: string; status: 'SUCCESS' | 'FAILED'; message: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const providerId of providerIds) {
      try {
        const provider = await this.prisma.serviceProvider.findFirst({
          where: {
            id: providerId,
            teamLeaderId: tlId,
          },
        });

        if (!provider) {
          failedCount++;
          results.push({
            providerId,
            status: 'FAILED',
            message: 'Provider not found or not assigned to you',
          });
          continue;
        }

        const existingAssignment = await this.prisma.provider_Shift_Assignments.findFirst({
          where: {
            provider_id: providerId,
            assignment_date: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        });

        if (existingAssignment) {
          failedCount++;
          results.push({
            providerId,
            status: 'FAILED',
            message: 'A shift is already assigned to this provider for the specified date',
          });
          continue;
        }

        await this.prisma.provider_Shift_Assignments.create({
          data: {
            provider_id: providerId,
            shift_type_id: shiftTypeId,
            assignment_date: date,
            Status: 'APPROVED',
          },
        });

        successCount++;
        results.push({
          providerId,
          status: 'SUCCESS',
          message: 'Shift assigned successfully',
        });
      } catch (err: any) {
        failedCount++;
        results.push({
          providerId,
          status: 'FAILED',
          message: err.message || 'An error occurred during assignment',
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_SHIFT_BULK_ASSIGN_SUCCESS',
        details: `Team Leader with User ID: ${tlId} bulk assigned Shift Type: ${shiftTypeId} to ${successCount} providers on Date: ${date.toISOString().slice(0, 10)}. Failed: ${failedCount}.`,
      },
    });

    return {
      success: true,
      data: {
        totalProcessed: providerIds.length,
        successCount,
        failedCount,
        results,
      },
    };
  }

  async getAssignedAttendance(tlId: string, filters: { date?: string; providerId?: string }) {
    const whereClause: any = {
      provider: {
        teamLeaderId: tlId,
      },
    };

    if (filters.providerId) {
      whereClause.provider_id = filters.providerId;
    }

    if (filters.date) {
      const d = new Date(filters.date);
      const startOfDay = new Date(d);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(d);
      endOfDay.setUTCHours(23, 59, 59, 999);

      whereClause.attendance_date = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const records = await this.prisma.provider_Attendance.findMany({
      where: whereClause,
      include: {
        provider: true,
        shift_type: true,
      },
      orderBy: {
        attendance_date: 'desc',
      },
    });

    const list = records.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      providerName: r.provider.name,
      shiftTypeId: r.shift_type_id,
      shiftName: r.shift_type.Shift_Name,
      attendanceDate: r.attendance_date.toISOString().slice(0, 10),
      inTime: r.in_time.toISOString(),
      outTime: r.out_time ? r.out_time.toISOString() : null,
      totalHours: r.total_hours,
      status: r.Status,
    }));

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_ATTENDANCE_VIEW',
        details: `Team Leader with User ID: ${tlId} viewed attendance logs. Filters - Date: ${filters.date || 'none'}, Provider: ${filters.providerId || 'none'}.`,
      },
    });

    return {
      success: true,
      data: list,
    };
  }

  async resolveAttendanceException(tlId: string, attendanceId: string, dto: { status: string; remarks?: string }) {
    const attendance = await this.prisma.provider_Attendance.findUnique({
      where: { id: attendanceId },
      include: { provider: true },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found.');
    }

    if (attendance.provider.teamLeaderId !== tlId) {
      throw new BadRequestException('This attendance record belongs to a provider not assigned to you.');
    }

    const updated = await this.prisma.provider_Attendance.update({
      where: { id: attendanceId },
      data: {
        Status: dto.status,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_ATTENDANCE_EXCEPTION_RESOLVE',
        details: `Team Leader with User ID: ${tlId} resolved attendance exception for Attendance ID: ${attendanceId} (Provider: ${attendance.provider.name}) to status: ${dto.status}. Remarks: ${dto.remarks || 'none'}.`,
      },
    });

    return {
      success: true,
      data: updated,
    };
  }

  async getLiveTracking(tlId: string) {
    const providers = await this.prisma.serviceProvider.findMany({
      where: {
        teamLeaderId: tlId,
      },
      include: {
        user: true,
        categories: {
          take: 1,
        },
        availabilities: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    const list = providers.map((p) => {
      const latestAvailability = p.availabilities[0];
      const isOnDuty = latestAvailability?.is_online ?? false;
      const designation = p.categories[0]?.name ?? 'Field Agent';

      return {
        userId: p.user_id,
        user: {
          id: p.user_id,
          name: p.name,
          phone: p.phoneNumber,
          email: p.user.email ?? undefined,
          role: 'AGENT' as const,
          designation,
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.name)}`,
          rating: p.rating,
          experienceYears: p.yearsOfExperience ?? 0,
        },
        point: {
          lat: latestAvailability?.currentLatitude ?? 0.0,
          lng: latestAvailability?.currentLongitude ?? 0.0,
        },
        updatedAt: latestAvailability?.updatedAt.toISOString() ?? p.updatedAt.toISOString(),
        isOnDuty,
      };
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_LIVE_TRACKING_VIEW',
        details: `Team Leader with User ID: ${tlId} viewed live tracking map`,
      },
    });

    return {
      success: true,
      data: list,
    };
  }

  async getAssignedLeaves(tlId: string, filters: { status?: string; providerId?: string }) {
    const whereClause: any = {
      user: {
        serviceProviders: {
          some: {
            teamLeaderId: tlId,
          },
        },
      },
    };

    if (filters.status) {
      whereClause.status = filters.status;
    }

    if (filters.providerId) {
      const provider = await this.prisma.serviceProvider.findUnique({
        where: { id: filters.providerId },
        select: { user_id: true },
      });
      if (provider) {
        whereClause.userId = provider.user_id;
      } else {
        whereClause.userId = 'non-existent-user-id';
      }
    }

    const leaves = await this.prisma.leaveRequest.findMany({
      where: whereClause,
      include: {
        user: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const list = leaves.map((l) => ({
      id: l.id,
      userId: l.userId,
      userName: l.user.name ?? 'Unknown Agent',
      userAvatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(l.user.name ?? 'UA')}`,
      type: l.type,
      fromDate: l.fromDate.toISOString(),
      toDate: l.toDate.toISOString(),
      reason: l.reason,
      status: l.status,
      appliedAt: l.createdAt.toISOString(),
    }));

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_LEAVES_VIEW',
        details: `Team Leader with User ID: ${tlId} viewed leave requests. Filters - Status: ${filters.status || 'none'}, Provider: ${filters.providerId || 'none'}.`,
      },
    });

    return {
      success: true,
      data: list,
    };
  }

  async approveLeave(tlId: string, id: string) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            serviceProviders: true,
          },
        },
      },
    });

    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    const isManaged = leave.user.serviceProviders.some((sp) => sp.teamLeaderId === tlId);
    if (!isManaged) {
      throw new NotFoundException('Leave request not found or not assigned to you');
    }

    if (leave.status !== 'PENDING') {
      throw new BadRequestException(`Leave request cannot be approved. Current status: ${leave.status}`);
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_LEAVE_APPROVE_SUCCESS',
        details: `Team Leader with User ID: ${tlId} approved Leave Request ID: ${id} for User ID: ${leave.userId}`,
      },
    });

    return {
      success: true,
      message: 'Leave request approved successfully',
      data: {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    };
  }

  async rejectLeave(tlId: string, id: string, dto: RejectLeaveDto) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            serviceProviders: true,
          },
        },
      },
    });

    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    const isManaged = leave.user.serviceProviders.some((sp) => sp.teamLeaderId === tlId);
    if (!isManaged) {
      throw new NotFoundException('Leave request not found or not assigned to you');
    }

    if (leave.status !== 'PENDING') {
      throw new BadRequestException(`Leave request cannot be rejected. Current status: ${leave.status}`);
    }

    let newReason = leave.reason;
    if (dto.reason) {
      newReason = `${leave.reason} (Rejection reason: ${dto.reason})`;
    }

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reason: newReason,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_LEAVE_REJECT_SUCCESS',
        details: `Team Leader with User ID: ${tlId} rejected Leave Request ID: ${id} for User ID: ${leave.userId}. Reason: ${dto.reason || 'None provided'}`,
      },
    });

    return {
      success: true,
      message: 'Leave request rejected successfully',
      data: {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    };
  }

  async getAssignedEscalations(tlId: string, filters: { status?: string; priority?: string; providerId?: string }) {
    const whereClause: any = {
      provider: {
        teamLeaderId: tlId,
      },
    };

    if (filters.status) {
      whereClause.status = filters.status;
    }

    if (filters.priority) {
      whereClause.priority = filters.priority;
    }

    if (filters.providerId) {
      whereClause.provider_id = filters.providerId;
    }

    const records = await this.prisma.escalation.findMany({
      where: whereClause,
      include: {
        provider: true,
        customerbooking: {
          include: {
            customer: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const list = records.map((e) => ({
      id: e.id,
      providerId: e.provider_id,
      providerName: e.provider.name,
      customerbookingId: e.customerbooking_id,
      customerName: e.customerbooking?.customer.name ?? null,
      title: e.title,
      description: e.description,
      status: e.status,
      priority: e.priority,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_ESCALATIONS_VIEW',
        details: `Team Leader with User ID: ${tlId} viewed escalations. Filters - Status: ${filters.status || 'none'}, Priority: ${filters.priority || 'none'}, Provider: ${filters.providerId || 'none'}.`,
      },
    });

    return {
      success: true,
      data: list,
    };
  }

  async resolveEscalation(tlId: string, id: string, dto: ResolveEscalationDto) {
    const escalation = await this.prisma.escalation.findUnique({
      where: { id },
      include: {
        provider: true,
      },
    });

    if (!escalation) {
      throw new NotFoundException('Escalation not found');
    }

    if (escalation.provider.teamLeaderId !== tlId) {
      throw new NotFoundException('Escalation not found or not assigned to your team');
    }

    if (escalation.status === 'RESOLVED') {
      throw new BadRequestException('Escalation is already resolved');
    }

    let newDescription = escalation.description;
    if (dto.remarks) {
      newDescription = `${escalation.description} (Resolution remarks: ${dto.remarks})`;
    }

    const updated = await this.prisma.escalation.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        description: newDescription,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_ESCALATION_RESOLVE_SUCCESS',
        details: `Team Leader with User ID: ${tlId} resolved Escalation ID: ${id} for Provider ID: ${escalation.provider_id}. Remarks: ${dto.remarks || 'None provided'}`,
      },
    });

    return {
      success: true,
      message: 'Escalation resolved successfully',
      data: {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    };
  }

  async getTeamPerformance(tlId: string, filters: { providerId?: string }) {
    const whereClause: any = {
      teamLeaderId: tlId,
    };

    if (filters.providerId) {
      whereClause.id = filters.providerId;
    }

    const providers = await this.prisma.serviceProvider.findMany({
      where: whereClause,
      include: {
        categories: {
          take: 1,
        },
        violations: true,
        customerBookings: {
          where: {
            status: 'COMPLETED',
          },
        },
      },
    });

    let totalJobsCompleted = 0;
    let totalViolations = 0;
    let sumRating = 0;
    let ratedProvidersCount = 0;

    const leaderboard = providers.map((p) => {
      const jobsCompletedCount = p.customerBookings.length;
      const violationsCount = p.violations.length;
      totalJobsCompleted += jobsCompletedCount;
      totalViolations += violationsCount;
      if (p.rating > 0) {
        sumRating += p.rating;
        ratedProvidersCount++;
      }

      return {
        providerId: p.id,
        providerName: p.name,
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.name)}`,
        designation: p.categories[0]?.name ?? 'Field Agent',
        jobsCompleted: jobsCompletedCount,
        rating: p.rating,
        violations: violationsCount,
      };
    });

    // Sort leaderboard by completed jobs (desc) then by rating (desc)
    leaderboard.sort((a, b) => {
      if (b.jobsCompleted !== a.jobsCompleted) {
        return b.jobsCompleted - a.jobsCompleted;
      }
      return b.rating - a.rating;
    });

    const averageTeamRating = ratedProvidersCount > 0 ? Number((sumRating / ratedProvidersCount).toFixed(2)) : 0;

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_PERFORMANCE_VIEW',
        details: `Team Leader with User ID: ${tlId} viewed performance KPIs. Filters - Provider: ${filters.providerId || 'none'}.`,
      },
    });

    return {
      success: true,
      data: {
        summary: {
          averageTeamRating,
          totalJobsCompleted,
          totalViolations,
          totalAssignedAgents: providers.length,
        },
        leaderboard,
      },
    };
  }

  async sendBroadcast(tlId: string, dto: BroadcastDto) {
    const channels = dto.channels || ['PUSH'];

    const whereClause: any = {
      teamLeaderId: tlId,
    };
    if (dto.providerIds && dto.providerIds.length > 0) {
      whereClause.id = {
        in: dto.providerIds,
      };
    }

    const providers = await this.prisma.serviceProvider.findMany({
      where: whereClause,
      include: {
        user: true,
      },
    });

    if (providers.length === 0) {
      return {
        success: true,
        message: 'No target providers found for broadcast',
        data: {
          sentCount: 0,
        },
      };
    }

    const fcmTokens = providers
      .map((p) => p.user.fcmToken)
      .filter((token): token is string => !!token);

    let pushSuccessCount = 0;
    let smsSuccessCount = 0;

    if (channels.includes('PUSH') && fcmTokens.length > 0) {
      try {
        await this.notificationsService.sendToMultiple(
          fcmTokens,
          dto.title,
          dto.message,
          { type: 'BROADCAST' },
        );
        pushSuccessCount = fcmTokens.length;
      } catch (err) {
        console.error('[Broadcast] Push dispatch failed:', err);
      }
    }

    if (channels.includes('SMS')) {
      for (const p of providers) {
        try {
          await this.smsService.sendSms({
            to: p.phoneNumber,
            otp: '',
            message: `[Broadcast] ${dto.title}\n${dto.message}`,
          });
          smsSuccessCount++;
        } catch (err) {
          console.error(`[Broadcast] SMS dispatch failed for ${p.phoneNumber}:`, err);
        }
      }
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_BROADCAST_SUCCESS',
        details: `Team Leader with User ID: ${tlId} sent broadcast. Title: "${dto.title}". Targets: ${providers.length} providers. Channels: ${channels.join(', ')}.`,
      },
    });

    return {
      success: true,
      message: 'Broadcast sent successfully',
      data: {
        targetProvidersCount: providers.length,
        pushSent: pushSuccessCount,
        smsSent: smsSuccessCount,
      },
    };
  }

  async sendChatMessage(tlId: string, dto: SendChatMessageDto) {
    const provider = await this.prisma.serviceProvider.findFirst({
      where: {
        user_id: dto.receiverId,
        teamLeaderId: tlId,
      },
      include: {
        user: true,
      },
    });

    if (!provider) {
      throw new BadRequestException('Target receiver must be a service provider assigned to your team.');
    }

    const msg = await this.prisma.chatMessage.create({
      data: {
        senderId: tlId,
        receiverId: dto.receiverId,
        message: dto.message,
      },
    });

    if (provider.user.fcmToken) {
      try {
        await this.notificationsService.sendPushNotification(
          provider.user.fcmToken,
          'New Message',
          dto.message,
          {
            type: 'CHAT_MESSAGE',
            senderId: tlId,
            messageId: msg.id,
          },
        );
      } catch (err) {
        console.error('[Chat] Push notification failed:', err);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_CHAT_MESSAGE_SENT',
        details: `Team Leader with User ID: ${tlId} sent chat message to Provider ID: ${provider.id} (User ID: ${dto.receiverId}).`,
      },
    });

    return {
      success: true,
      data: msg,
    };
  }

  async getChatHistory(tlId: string, providerUserId: string) {
    const provider = await this.prisma.serviceProvider.findFirst({
      where: {
        user_id: providerUserId,
        teamLeaderId: tlId,
      },
    });

    if (!provider) {
      throw new BadRequestException('Target provider is not assigned to your team.');
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: tlId, receiverId: providerUserId },
          { senderId: providerUserId, receiverId: tlId },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return {
      success: true,
      data: messages,
    };
  }

  async getNotifications(tlId: string, filters: { isRead?: boolean }) {
    const whereClause: any = {
      userId: tlId,
    };

    if (filters.isRead !== undefined) {
      whereClause.isRead = filters.isRead;
    }

    const records = await this.prisma.notification.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_NOTIFICATIONS_VIEW',
        details: `Team Leader with User ID: ${tlId} viewed notifications list. Filters - isRead: ${filters.isRead !== undefined ? filters.isRead : 'none'}.`,
      },
    });

    return {
      success: true,
      data: records.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        type: r.type,
        isRead: r.isRead,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async markNotificationRead(tlId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    if (notification.userId !== tlId) {
      throw new BadRequestException('You do not have permission to update this notification.');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_NOTIFICATION_MARKED_READ',
        details: `Team Leader with User ID: ${tlId} marked notification ID: ${notificationId} as read.`,
      },
    });

    return {
      success: true,
      data: {
        id: updated.id,
        isRead: updated.isRead,
      },
    };
  }

  async markAllNotificationsRead(tlId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId: tlId,
        isRead: false,
      },
      data: { isRead: true },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_ALL_NOTIFICATIONS_MARKED_READ',
        details: `Team Leader with User ID: ${tlId} marked all notifications as read.`,
      },
    });

    return {
      success: true,
      message: 'All notifications marked as read.',
    };
  }


  async generateTeamReport(tlId: string, query: { type: string; startDate?: string; endDate?: string }) {
    const start = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = query.endDate ? new Date(query.endDate) : new Date();

    const providers = await this.prisma.serviceProvider.findMany({
      where: { teamLeaderId: tlId },
      include: {
        user: true,
      },
    });

    const providerIds = providers.map((p) => p.id);
    const userIds = providers.map((p) => p.user_id);

    let summary: any = {};
    let details: any[] = [];

    const type = query.type.toLowerCase();

    if (type === 'attendance') {
      const attendances = await this.prisma.provider_Attendance.findMany({
        where: {
          provider_id: { in: providerIds },
          attendance_date: {
            gte: start,
            lte: end,
          },
        },
      });

      const totalHours = attendances.reduce((acc, curr) => acc + curr.total_hours, 0);
      const lateCount = attendances.filter((a) => a.Status === 'LATE').length;

      summary = {
        totalRecords: attendances.length,
        totalHoursWorked: totalHours,
        totalLateCheckins: lateCount,
      };

      details = attendances.map((a) => {
        const p = providers.find((prov) => prov.id === a.provider_id);
        return {
          recordId: a.id,
          providerId: a.provider_id,
          providerName: p?.name ?? 'Unknown',
          date: a.attendance_date.toISOString(),
          inTime: a.in_time.toISOString(),
          outTime: a.out_time ? a.out_time.toISOString() : null,
          hoursWorked: a.total_hours,
          status: a.Status,
        };
      });
    } else if (type === 'jobs') {
      const bookings = await this.prisma.booking.findMany({
        where: {
          providerId: { in: providerIds },
          date: {
            gte: start,
            lte: end,
          },
        },
      });

      const completed = bookings.filter((b) => b.status === 'COMPLETED').length;
      const cancelled = bookings.filter((b) => b.status === 'CANCELLED').length;
      const totalRevenue = bookings.reduce((acc, curr) => acc + Number(curr.totalAmount), 0);

      summary = {
        totalBookings: bookings.length,
        completedCount: completed,
        cancelledCount: cancelled,
        totalRevenueGenerated: Number(totalRevenue.toFixed(2)),
      };

      details = bookings.map((b) => {
        const p = providers.find((prov) => prov.id === b.providerId);
        return {
          bookingId: b.id,
          providerId: b.providerId,
          providerName: p?.name ?? 'Unknown',
          date: b.date.toISOString(),
          status: b.status,
          amount: Number(b.totalAmount),
        };
      });
    } else if (type === 'performance') {
      const violations = await this.prisma.violation.findMany({
        where: {
          provider_id: { in: providerIds },
          createdAt: {
            gte: start,
            lte: end,
          },
        },
      });

      const ratings = providers.map((p) => p.rating).filter((r) => r > 0);
      const avgRating = ratings.length > 0 ? ratings.reduce((acc, curr) => acc + curr, 0) / ratings.length : 0;

      summary = {
        totalViolations: violations.length,
        averageTeamRating: Number(avgRating.toFixed(2)),
        totalAgentsScored: providers.length,
      };

      details = providers.map((p) => {
        const agentViolations = violations.filter((v) => v.provider_id === p.id).length;
        return {
          providerId: p.id,
          providerName: p.name,
          rating: p.rating,
          violationsCount: agentViolations,
        };
      });
    } else if (type === 'leaves') {
      const leaves = await this.prisma.leaveRequest.findMany({
        where: {
          userId: { in: userIds },
          fromDate: {
            gte: start,
          },
          toDate: {
            lte: end,
          },
        },
        include: {
          user: true,
        },
      });

      const pending = leaves.filter((l) => l.status === 'PENDING').length;
      const approved = leaves.filter((l) => l.status === 'APPROVED').length;
      const rejected = leaves.filter((l) => l.status === 'REJECTED').length;

      summary = {
        totalLeaveRequests: leaves.length,
        pendingCount: pending,
        approvedCount: approved,
        rejectedCount: rejected,
      };

      details = leaves.map((l) => ({
        leaveId: l.id,
        providerName: l.user.name ?? 'Unknown',
        fromDate: l.fromDate.toISOString(),
        toDate: l.toDate.toISOString(),
        reason: l.reason,
        status: l.status,
      }));
    } else {
      throw new BadRequestException(`Invalid report type: "${query.type}". Supported types: attendance, jobs, performance, leaves.`);
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_REPORTS_GENERATED',
        details: `Team Leader with User ID: ${tlId} generated "${type}" report for period ${start.toISOString()} to ${end.toISOString()}.`,
      },
    });

    return {
      success: true,
      data: {
        reportType: type,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        generatedAt: new Date().toISOString(),
        summary,
        details,
      },
    };
  }

  async getProviderSalaryPreview(tlId: string, providerId: string) {
    const provider = await this.prisma.serviceProvider.findFirst({
      where: { id: providerId, teamLeaderId: tlId },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found or not assigned to you');
    }

    const wallet = await this.prisma.spWallet.findFirst({
      where: { provider_id: providerId }
    });
    const currentBalance = wallet ? Number(wallet.balance) : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const ledgerEntries = await this.prisma.provider_Salary_Ledger.findMany({
      where: {
        provider_id: providerId,
        Shift_Date: { gte: thirtyDaysAgo }
      },
      orderBy: { Shift_Date: 'desc' }
    });

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

    const settlementHistory = await this.prisma.provider_payroll_settlement.findMany({
      where: { provider_id: providerId },
      orderBy: { Payout_Cycle: 'desc' },
      take: 12
    });

    let recentPayouts: any[] = [];
    if (wallet) {
      recentPayouts = await this.prisma.payout.findMany({
        where: { spwallet_id: wallet.id },
        orderBy: { createdAt: 'desc' },
        take: 10
      });
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_PROVIDER_SALARY_PREVIEW_VIEW',
        details: `Team Leader with User ID: ${tlId} viewed Salary Preview for Provider ID: ${providerId}.`,
      },
    });

    return {
      success: true,
      data: {
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
        dailyLedger: ledgerEntries.map(e => ({
          id: e.id,
          date: e.Shift_Date.toISOString(),
          baseSalary: Number(e.Base_Salary),
          overtimePay: Number(e.Overtime_pay),
          bonus: Number(e.Bonus_Amount),
          penalty: Number(e.Penalty_Amount),
          totalPay: Number(e.Total_pay),
        })),
        settlementHistory: settlementHistory.map(s => ({
          id: s.id,
          payoutCycle: s.Payout_Cycle.toISOString(),
          payoutDate: s.payout_date.toISOString(),
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
          date: p.createdAt.toISOString(),
        })),
      }
    };
  }

  async ensureInventoryItemsSeeded() {
    const count = await this.prisma.inventoryItem.count();
    if (count === 0) {
      await this.prisma.inventoryItem.createMany({
        data: [
          { name: 'Standard Cleaning Kit', description: 'Basic cleaning solutions, microfiber cloths, and brushes', totalQuantity: 50, availableQuantity: 50 },
          { name: 'Summer Uniform Set', description: 'Branded orange polo shirt and trousers (Size M/L)', totalQuantity: 100, availableQuantity: 100 },
          { name: 'Company Smartphone', description: 'Android device configured for the Agent App', totalQuantity: 30, availableQuantity: 30 },
          { name: 'Heavy Duty Vacuum', description: 'Industrial wet/dry vacuum cleaner', totalQuantity: 15, availableQuantity: 15 },
          { name: 'Safety Gear Set', description: 'High-visibility vest, steel-toed boots, protective gloves, and safety goggles', totalQuantity: 40, availableQuantity: 40 },
        ],
      });
    }
  }

  async getInventoryItems() {
    await this.ensureInventoryItemsSeeded();
    const items = await this.prisma.inventoryItem.findMany({
      orderBy: { name: 'asc' },
    });
    return {
      success: true,
      data: items,
    };
  }

  async getIssuedInventory(tlId: string) {
    const issued = await this.prisma.issuedInventory.findMany({
      where: {
        provider: {
          teamLeaderId: tlId,
        },
      },
      include: {
        provider: true,
        item: true,
      },
      orderBy: {
        issuedAt: 'desc',
      },
    });

    return {
      success: true,
      data: issued.map((i) => ({
        id: i.id,
        providerId: i.provider_id,
        providerName: i.provider.name,
        itemId: i.item_id,
        itemName: i.item.name,
        quantity: i.quantity,
        status: i.status,
        issuedAt: i.issuedAt.toISOString(),
        returnedAt: i.returnedAt ? i.returnedAt.toISOString() : null,
        remarks: i.remarks,
      })),
    };
  }

  async issueInventory(tlId: string, dto: { providerId: string; itemId: string; quantity: number; remarks?: string }) {
    const provider = await this.prisma.serviceProvider.findFirst({
      where: {
        id: dto.providerId,
        teamLeaderId: tlId,
      },
    });
    if (!provider) {
      throw new NotFoundException('Provider not found or not assigned to you');
    }

    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.itemId },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    if (item.availableQuantity < dto.quantity) {
      throw new BadRequestException('Not enough available stock');
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: dto.itemId },
        data: {
          availableQuantity: {
            decrement: dto.quantity,
          },
        },
      });

      const issued = await tx.issuedInventory.create({
        data: {
          provider_id: dto.providerId,
          item_id: dto.itemId,
          quantity: dto.quantity,
          remarks: dto.remarks,
          status: 'ISSUED',
        },
      });

      return issued;
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_INVENTORY_ISSUED',
        details: `Team Leader with User ID: ${tlId} issued ${dto.quantity}x "${item.name}" to Provider ID: ${dto.providerId}`,
      },
    });

    return {
      success: true,
      data: transaction,
    };
  }

  async returnInventory(tlId: string, issuedId: string, status: string, remarks?: string) {
    const issued = await this.prisma.issuedInventory.findUnique({
      where: { id: issuedId },
      include: {
        provider: true,
        item: true,
      },
    });
    if (!issued || issued.provider.teamLeaderId !== tlId) {
      throw new NotFoundException('Issued inventory record not found or not assigned to you');
    }

    if (issued.status !== 'ISSUED') {
      throw new BadRequestException('This item is already returned or resolved');
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.issuedInventory.update({
        where: { id: issuedId },
        data: {
          status: status,
          returnedAt: new Date(),
          remarks: remarks ?? issued.remarks,
        },
      });

      if (status === 'RETURNED') {
        await tx.inventoryItem.update({
          where: { id: issued.item_id },
          data: {
            availableQuantity: {
              increment: issued.quantity,
            },
          },
        });
      }

      return updated;
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'TEAM_LEADER_INVENTORY_RETURNED',
        details: `Team Leader with User ID: ${tlId} processed return of Issued ID: ${issuedId} with status "${status}"`,
      },
    });

    return {
      success: true,
      data: transaction,
    };
  }
}
