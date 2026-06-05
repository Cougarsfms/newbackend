const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
        where: { fcmToken: { not: null } },
        include: { serviceProviders: { include: { categories: true } } }
    });
    console.log('--- Users with FCM Tokens ---');
    users.forEach(u => {
        console.log(`User Phone: ${u.phoneNumber}`);
        console.log(`FCM: ${u.fcmToken.substring(0, 10)}...`);
        u.serviceProviders.forEach(p => {
            console.log(`  Provider Name: ${p.name}`);
            console.log(`  Provider ID: ${p.id}`);
            console.log(`  Categories: ${p.categories.map(c => c.name).join(', ')}`);
        });
        console.log('---');
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();
