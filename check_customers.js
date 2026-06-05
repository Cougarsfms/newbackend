const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const customers = await prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: true }
    });
    console.log('--- Latest 10 Customers ---');
    customers.forEach(c => {
        console.log(`ID: ${c.id}, Name: ${c.name}, UserID: ${c.user_id}, Phone: ${c.phoneNumber}`);
        console.log(`User FCM Token: ${c.user.fcmToken ? c.user.fcmToken.substring(0, 20) + '...' : 'NONE'}`);
        console.log('---');
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();
