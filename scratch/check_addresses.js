const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const customerId = 'c2c02198-3c7d-4431-9ed5-3dd5df11a4e9';

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { customerAddresses: true }
    });

    console.log('Customer:', customer?.name);
    console.log('Saved Addresses Count:', customer?.customerAddresses.length);

    const services = await prisma.serviceItem.findMany({});
    console.log('\nAll Available Services:');
    services.forEach(s => {
      console.log(`- Service ID: ${s.id}, Name: "${s.name}", Price: ₹${s.price}`);
    });

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
