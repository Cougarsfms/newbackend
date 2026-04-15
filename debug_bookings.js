const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const variations = ['9918427885', '+919918427885', '919918427885'];
  console.log(`Checking search for variations of phone: ${variations}`);

  for (const phone of variations) {
    const user = await prisma.user.findFirst({
    where: { 
      OR: [
        { phoneNumber: phone },
        { phoneNumber: '+91' + phone },
        { phoneNumber: '+91-' + phone }
      ]
    },
    include: {
      bookings: {
        include: { service: true, provider: true }
      }
    }
  });

  if (user) {
    console.log(`USER found: ${user.id}, Phone in DB: ${user.phoneNumber}`);
    console.log(`Bookings count: ${user.bookings.length}`);
  } else {
    console.log('USER not found with standard variations');
  }

  const customer = await prisma.customer.findFirst({
    where: { 
       OR: [
        { phoneNumber: phone },
        { phoneNumber: '+91' + phone }
      ]
    }
  });

  if (customer) {
    console.log(`CUSTOMER found: ${customer.id}, Phone in DB: ${customer.phoneNumber}, UserID: ${customer.user_id}`);
  } else {
    console.log('CUSTOMER not found');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
