const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const providers = await prisma.serviceProvider.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: true }
    });
    console.log('--- Latest 10 Service Providers ---');
    providers.forEach(p => {
        console.log(`ID: ${p.id}, Name: ${p.name}, UserID: ${p.user_id}, Phone: ${p.phoneNumber}`);
        console.log(`User FCM Token: ${p.user.fcmToken ? p.user.fcmToken.substring(0, 20) + '...' : 'NONE'}`);
        console.log('---');
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();
