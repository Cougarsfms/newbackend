const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const catCount = await prisma.$queryRaw`SELECT count(*) FROM "_ServiceCategoryToServiceProvider"`;
  const itemCount = await prisma.$queryRaw`SELECT count(*) FROM "_ServiceItemToServiceProvider"`;
  
  console.log('Category mapping count:', catCount);
  console.log('Item mapping count:', itemCount);
  
  const sampleCats = await prisma.$queryRaw`SELECT * FROM "_ServiceCategoryToServiceProvider" LIMIT 5`;
  console.log('Sample Category mappings:', sampleCats);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
