const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  console.log('Bootstrapping verification test...');

  let testUser = null;
  let testProvider = null;
  let ledger1 = null;
  let ledger2 = null;
  let auditLog = null;
  let notification = null;

  try {
    // 1. Setup temporary test data
    console.log('\nStep 1: Setting up mock data in DB...');
    
    // Create a mock Admin User if not exists, or check existing
    let admin = await prisma.adminUser.findFirst();
    if (!admin) {
      // Create admin role first
      let role = await prisma.adminRole.findFirst();
      if (!role) {
        role = await prisma.adminRole.create({
          data: {
            role_name: 'Super Admin',
            permissions: ['ALL']
          }
        });
      }
      admin = await prisma.adminUser.create({
        data: {
          id: 'mock-admin-id',
          name: 'Mock Administrator',
          role_id: role.id,
          email: 'admin@quickservice.test',
          phoneNumber: '+18888888888',
          passwordHash: 'dummy',
          adminRole: 'SUPER_ADMIN',
          status: 'ACTIVE'
        }
      });
      console.log('Created temporary AdminUser');
    } else {
      console.log(`Using existing AdminUser with ID: ${admin.id}`);
    }

    testUser = await prisma.user.create({
      data: {
        phoneNumber: '+19999999999',
        email: 'provider@quickservice.test',
        name: 'John Test Provider',
        role: 'PROVIDER',
        status: 'ACTIVE'
      }
    });
    console.log(`Created mock User (ID: ${testUser.id})`);

    testProvider = await prisma.serviceProvider.create({
      data: {
        user_id: testUser.id,
        name: 'John Test Provider',
        phoneNumber: '+19999999999',
        city: 'Budapest',
        status: 'ACTIVE',
        Kyc_status: 'APPROVED'
      }
    });
    console.log(`Created mock ServiceProvider (ID: ${testProvider.id})`);

    // Create 2 ledger records inside May 2026
    ledger1 = await prisma.provider_Salary_Ledger.create({
      data: {
        provider_id: testProvider.id,
        Shift_Date: new Date('2026-05-10T12:00:00.000Z'),
        Base_Salary: 100.00,
        Overtime_pay: 20.00,
        Bonus_Amount: 15.00,
        Penalty_Amount: 5.00,
        Total_pay: 130.00
      }
    });

    ledger2 = await prisma.provider_Salary_Ledger.create({
      data: {
        provider_id: testProvider.id,
        Shift_Date: new Date('2026-05-12T12:00:00.000Z'),
        Base_Salary: 150.00,
        Overtime_pay: 30.00,
        Bonus_Amount: 10.00,
        Penalty_Amount: 10.00,
        Total_pay: 180.00
      }
    });
    console.log('Created two provider salary ledger records');

    // 2. Run simulation of `exportPayrollReport` logic
    console.log('\nStep 2: Simulating exportPayrollReport business logic...');

    const startDateStr = '2026-05-01T00:00:00.000Z';
    const endDateStr = '2026-05-20T23:59:59.999Z';
    const adminId = admin.id;

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    // Validate
    if (start.getTime() > end.getTime()) {
      throw new Error('Validation failed: start > end');
    }
    console.log('Validation passed: Dates are valid and chronological');

    // Process
    const ledgerEntries = await prisma.provider_Salary_Ledger.findMany({
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

    const uniqueProviderIds = new Set();

    for (const entry of ledgerEntries) {
      totalBaseSalary += Number(entry.Base_Salary || 0);
      totalOvertimePay += Number(entry.Overtime_pay || 0);
      totalBonus += Number(entry.Bonus_Amount || 0);
      totalPenalty += Number(entry.Penalty_Amount || 0);
      totalPayout += Number(entry.Total_pay || 0);
      uniqueProviderIds.add(entry.provider_id);
    }

    const providerMap = new Map();
    if (uniqueProviderIds.size > 0) {
      const providers = await prisma.serviceProvider.findMany({
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
      startDate: startDateStr,
      endDate: endDateStr,
      totalBaseSalary,
      totalOvertimePay,
      totalBonus,
      totalPenalty,
      totalPayout,
      uniqueProvidersCount: uniqueProviderIds.size,
      recordsCount: ledgerEntries.length
    };

    const reportResult = {
      success: true,
      summary,
      details
    };

    console.log('Report generation completed successfully. Output structure:');
    console.log(JSON.stringify(reportResult, null, 2));

    // Assertions
    console.log('\nStep 3: Performing assertions...');
    if (reportResult.summary.recordsCount !== 2) throw new Error('Expected 2 records');
    if (reportResult.summary.totalBaseSalary !== 250) throw new Error('Expected Base Salary sum to be 250');
    if (reportResult.summary.totalOvertimePay !== 50) throw new Error('Expected Overtime sum to be 50');
    if (reportResult.summary.totalBonus !== 25) throw new Error('Expected Bonus sum to be 25');
    if (reportResult.summary.totalPenalty !== 15) throw new Error('Expected Penalty sum to be 15');
    if (reportResult.summary.totalPayout !== 310) throw new Error('Expected Total Pay sum to be 310');
    if (reportResult.summary.uniqueProvidersCount !== 1) throw new Error('Expected 1 unique provider');
    if (reportResult.details[0].providerName !== 'John Test Provider') throw new Error('Expected providerName to be John Test Provider');
    console.log('✅ Assertions passed: Math and mappings are 100% correct!');

    // Save: Audit Trail
    console.log('\nStep 4: Writing Audit Log...');
    auditLog = await prisma.auditLog.create({
      data: {
        admin_id: adminId,
        action: 'EXPORT_PAYROLL_REPORT',
        details: `Exported payroll report for period ${startDateStr} to ${endDateStr}. Summary: total payout=$${totalPayout.toFixed(2)}, unique providers=${uniqueProviderIds.size}, records count=${ledgerEntries.length}.`
      }
    });
    console.log(`✅ Saved AuditLog successfully (ID: ${auditLog.id})`);

    // Notify: Admin Notification
    console.log('\nStep 5: Writing Admin Notification...');
    notification = await prisma.adminNotification.create({
      data: {
        type: 'PAYROLL_REPORT_EXPORTED',
        title: 'Payroll Report Exported',
        body: `Admin successfully exported payroll report for ${startDateStr.split('T')[0]} to ${endDateStr.split('T')[0]}. Unique providers: ${uniqueProviderIds.size}. Total payout: $${totalPayout.toFixed(2)}.`,
        entityId: adminId,
        isRead: false,
      }
    });
    console.log(`✅ Saved adminNotification successfully (ID: ${notification.id})`);

  } catch (err) {
    console.error('❌ Test failed with error:', err);
  } finally {
    // 6. Cleanup
    console.log('\nStep 6: Cleaning up mock data...');
    if (notification) {
      await prisma.adminNotification.delete({ where: { id: notification.id } });
      console.log('Removed temporary adminNotification');
    }
    if (auditLog) {
      await prisma.auditLog.delete({ where: { id: auditLog.id } });
      console.log('Removed temporary AuditLog');
    }
    if (ledger1) {
      await prisma.provider_Salary_Ledger.delete({ where: { id: ledger1.id } });
    }
    if (ledger2) {
      await prisma.provider_Salary_Ledger.delete({ where: { id: ledger2.id } });
    }
    console.log('Removed temporary provider salary ledgers');
    if (testProvider) {
      await prisma.serviceProvider.delete({ where: { id: testProvider.id } });
      console.log('Removed temporary ServiceProvider');
    }
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } });
      console.log('Removed temporary User');
    }

    await prisma.$disconnect();
    console.log('\nVerification test completed!');
  }
}

main();
