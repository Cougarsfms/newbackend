const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { RazorpayService } = require('./dist/customer/razorpay.service');
const { CustomerService } = require('./dist/customer/customer.service');

async function testLocal() {
  const rzp = new RazorpayService();
  const customerService = new CustomerService(prisma, null, rzp, null);

  const user = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
  const service = await prisma.serviceItem.findFirst();

  console.log('Testing createPaymentOrder for user:', user.id, 'service:', service.id);
  const result = await customerService.createPaymentOrder(user.id, {
    serviceId: service.id,
    scheduledAt: new Date().toISOString(),
    bookingType: 'Scheduled'
  });

  console.log('🎉 SUCCESSFUL REAL RAZORPAY ORDER CREATED:', JSON.stringify(result, null, 2));
}

testLocal().catch(console.error).finally(() => prisma.$disconnect());
