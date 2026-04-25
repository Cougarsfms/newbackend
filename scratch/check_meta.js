const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.serviceCategory.findMany();
  const items = await prisma.serviceItem.findMany();
  console.log('Categories:', JSON.stringify(categories, null, 2));
  console.log('Items:', JSON.stringify(items, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
