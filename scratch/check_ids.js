const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const providers = await prisma.serviceProvider.findMany({
    take: 1,
    include: {
      categories: true,
      items: true
    }
  });
  
  console.log('Sample Provider:', JSON.stringify(providers[0], null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
