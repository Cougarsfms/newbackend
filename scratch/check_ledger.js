const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const totalCount = await prisma.provider_Salary_Ledger.count();
    console.log(`Total provider salary ledger entries: ${totalCount}`);

    const latestEntries = await prisma.provider_Salary_Ledger.findMany({
      orderBy: { Shift_Date: 'desc' },
      take: 10
    });

    console.log('\n--- Latest 10 Salary Ledgers ---');
    latestEntries.forEach(entry => {
      console.log(`ID: ${entry.id}`);
      console.log(`ProviderID: ${entry.provider_id}`);
      console.log(`Shift Date: ${entry.Shift_Date}`);
      console.log(`Base: ${entry.Base_Salary}, OT: ${entry.Overtime_pay}, Bonus: ${entry.Bonus_Amount}, Penalty: ${entry.Penalty_Amount}, Total: ${entry.Total_pay}`);
      console.log('---');
    });

    // Also get unique date ranges if any
    if (totalCount > 0) {
      const dates = await prisma.provider_Salary_Ledger.findMany({
        select: { Shift_Date: true },
        distinct: ['Shift_Date'],
        orderBy: { Shift_Date: 'asc' }
      });
      console.log('\n--- Distinct Shift Dates Available ---');
      dates.forEach(d => console.log(d.Shift_Date));
    }
  } catch (err) {
    console.error('Error checking ledger:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
