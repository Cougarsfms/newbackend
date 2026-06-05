const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({
        where: { fcmToken: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, phoneNumber: true, name: true, fcmToken: true, updatedAt: true }
    });
    if (user) {
        console.log('--- Latest User with FCM Token ---');
        console.log(`User: ${user.name} (Phone: ${user.phoneNumber}, ID: ${user.id})`);
        console.log(`Updated At: ${user.updatedAt}`);
        console.log(`Full Token: ${user.fcmToken}`);
    } else {
        console.log('No users found with FCM tokens.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
