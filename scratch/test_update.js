const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const provider = await prisma.serviceProvider.findFirst();
  const category = await prisma.serviceCategory.findFirst();
  const item = await prisma.serviceItem.findFirst();
  
  if (!provider || !category || !item) {
    console.log('Missing data:', { provider: !!provider, category: !!category, item: !!item });
    return;
  }
  
  console.log('Using IDs:', { providerId: provider.id, categoryId: category.id, itemId: item.id });
  
  const updated = await prisma.serviceProvider.update({
    where: { id: provider.id },
    data: {
      categories: {
        set: [{ id: category.id }]
      },
      items: {
        set: [{ id: item.id }]
      }
    },
    include: { categories: true, items: true }
  });
  
  console.log('Update result:', {
    catCount: updated.categories.length,
    itemCount: updated.items.length
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
