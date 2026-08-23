const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('⚡ Running Service Filter Verification...');

  // Test Case 1: Search by Category (e.g. "Cleaning")
  console.log('\n🔍 Test Case 1: Category = Cleaning');
  const catResults = await prisma.serviceItem.findMany({
    where: {
      category: {
        name: { contains: 'Cleaning', mode: 'insensitive' }
      }
    },
    include: { category: true }
  });
  console.log(`Found ${catResults.length} items:`);
  catResults.forEach(item => console.log(` - [${item.category.name}] ${item.name} (Price: ₹${item.price})`));

  // Test Case 2: Search by term "AC"
  console.log('\n🔍 Test Case 2: Search = AC');
  const searchResults = await prisma.serviceItem.findMany({
    where: {
      OR: [
        { name: { contains: 'AC', mode: 'insensitive' } },
        { description: { contains: 'AC', mode: 'insensitive' } }
      ]
    },
    include: { category: true }
  });
  console.log(`Found ${searchResults.length} items:`);
  searchResults.forEach(item => console.log(` - [${item.category.name}] ${item.name} (Price: ₹${item.price})`));

  // Test Case 3: Filter by Category = Repairs AND Search = Plumbing
  console.log('\n🔍 Test Case 3: Category = Repairs, Search = Plumbing');
  const combinedResults = await prisma.serviceItem.findMany({
    where: {
      category: {
        name: { contains: 'Repairs', mode: 'insensitive' }
      },
      OR: [
        { name: { contains: 'Plumbing', mode: 'insensitive' } },
        { description: { contains: 'Plumbing', mode: 'insensitive' } }
      ]
    },
    include: { category: true }
  });
  console.log(`Found ${combinedResults.length} items:`);
  combinedResults.forEach(item => console.log(` - [${item.category.name}] ${item.name} (Price: ₹${item.price})`));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
