const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const providers = await prisma.serviceProvider.findMany({
        select: { id: true, name: true, phoneNumber: true }
    });
    console.log('--- All Providers ---');
    providers.forEach(p => console.log(`${p.name} (Phone: ${p.phoneNumber}, ID: ${p.id})`));
  } finally {
    await prisma.$disconnect();
  }
}

main();
