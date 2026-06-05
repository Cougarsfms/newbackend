const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const records = await prisma.availability.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: { provider: true }
    });
    console.log('--- Recent Availability Updates ---');
    records.forEach(r => {
        console.log(`Provider: ${r.provider.name}`);
        console.log(`Updated At: ${r.updatedAt}`);
        console.log(`Lat: ${r.currentLatitude}, Lng: ${r.currentLongitude}`);
        console.log('---');
    });
  } finally {
    await prisma.$disconnect();
  }
}

main();
