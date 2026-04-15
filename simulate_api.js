const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const phone = '9918427885';
  
  const user = await prisma.user.findUnique({
    where: { phoneNumber: phone },
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    include: {
      service: true,
      provider: true
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Found ${bookings.length} bookings for API simulation`);
  console.log(JSON.stringify(bookings, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
