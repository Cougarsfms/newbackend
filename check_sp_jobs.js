const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const targetBookingId = '10fee1a3-5eab-446f-927a-ddf11f3aeb91';
  console.log(`Checking spBooking for Booking ID: ${targetBookingId}`);

  const spJobs = await prisma.spBooking.findMany({
    where: { booking_id: targetBookingId },
    include: {
      provider: true
    }
  });

  console.log(`Found ${spJobs.length} records in spBooking`);
  console.log(JSON.stringify(spJobs, null, 2));

  if (spJobs.length === 0) {
    console.log('\nChecking Booking table for direct assignment...');
    const directJobs = await prisma.booking.findMany({
      where: { providerId: providerId }
    });
    console.log(`Found ${directJobs.length} records in Booking table`);
    console.log(JSON.stringify(directJobs, null, 2));
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
