const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
  console.log('VALID USER ID:', user ? user.id : 'NONE');
  if (user) {
    const service = await prisma.serviceItem.findFirst();
    console.log('VALID SERVICE ID:', service ? service.id : 'NONE');

    const res = await fetch(`https://gyors-backend-311476989793.us-central1.run.app/api/customer/${user.id}/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: service.id,
        scheduledAt: new Date().toISOString(),
        bookingType: 'Scheduled'
      })
    });
    const orderData = await res.json();
    console.log('RAZORPAY REAL ORDER RESPONSE:', JSON.stringify(orderData, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
