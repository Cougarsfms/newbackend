const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const today = new Date();
    today.setHours(0,0,0,0);
    const bookings = await prisma.booking.findMany({
        where: { createdAt: { gte: today } },
        include: { user: true, service: true }
    });
    console.log('--- Bookings Created Today ---');
    bookings.forEach(b => {
        console.log(`Booking ID: ${b.id}`);
        console.log(`Status: ${b.status}`);
        console.log(`User: ${b.user?.phoneNumber}`);
        console.log(`Service: ${b.service?.name}`);
        console.log('---');
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();
