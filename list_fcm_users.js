const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
        where: { fcmToken: { not: null } },
        select: { id: true, phoneNumber: true, name: true, fcmToken: true }
    });
    console.log('--- Users with FCM Tokens ---');
    users.forEach(u => {
        console.log(`User: ${u.name} (Phone: ${u.phoneNumber}, ID: ${u.id})`);
        console.log(`Token: ${u.fcmToken.substring(0, 20)}...`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();
