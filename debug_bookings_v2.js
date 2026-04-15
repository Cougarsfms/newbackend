const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const variations = ['9918427885', '+919918427885', '919918427885'];
  console.log(`Checking search for variations of phone: ${variations}`);

  for (const phone of variations) {
    console.log(`\nSearching for: ${phone}`);
    const user = await prisma.user.findFirst({
      where: { phoneNumber: phone },
      include: {
        bookings: true
      }
    });

    if (user) {
      console.log(`USER found: ${user.id}, Phone in DB: ${user.phoneNumber}`);
      console.log(`Bookings count: ${user.bookings.length}`);
    } else {
      console.log('USER not found');
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
