const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const providers = await prisma.serviceProvider.findMany({
        where: { phoneNumber: { contains: '884522' } },
        include: { user: true, categories: true }
    });
    console.log('--- Providers with phone containing 884522 ---');
    providers.forEach(p => {
        console.log(`Name: ${p.name}`);
        console.log(`Phone: ${p.phoneNumber}`);
        console.log(`ID: ${p.id}`);
        console.log(`FCM: ${p.user?.fcmToken ? 'Yes' : 'No'}`);
        console.log(`Categories: ${p.categories.map(c => c.name).join(', ')}`);
        console.log('---');
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();
