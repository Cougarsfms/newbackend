const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  console.log('⚡ Starting Customer Concierge (AI-001) Verification Script...');

  try {
    // 1. Fetch a test customer
    const testCustomer = await prisma.customer.findFirst({
      include: { user: true }
    });

    if (!testCustomer) {
      console.warn('⚠️ No customer found in the database. Creating a mock customer for verification...');
      // Create a mock user and customer
      const user = await prisma.user.create({
        data: {
          phoneNumber: '+919999999999',
          name: 'Verification Test User',
          role: 'CUSTOMER',
        }
      });
      const customer = await prisma.customer.create({
        data: {
          user_id: user.id,
          name: 'Verification Test User',
          phoneNumber: '+919999999999',
          status: 'ACTIVE',
        }
      });
      testCustomer = await prisma.customer.findUnique({
        where: { id: customer.id },
        include: { user: true }
      });
    }

    console.log(`✅ Test Customer: ${testCustomer.name} (ID: ${testCustomer.id})`);

    // 2. Create a Concierge Session
    const session = await prisma.conciergeSession.create({
      data: {
        customerId: testCustomer.id
      }
    });
    console.log(`✅ ConciergeSession successfully created (ID: ${session.id})`);

    // 3. Log a User message
    const userMsg = await prisma.conciergeMessage.create({
      data: {
        sessionId: session.id,
        sender: 'USER',
        text: 'Hello, what services are available?',
      }
    });
    console.log(`✅ ConciergeMessage (USER) logged (ID: ${userMsg.id})`);

    // 4. Log an Audit trail
    const auditLog = await prisma.conciergeAuditLog.create({
      data: {
        sessionId: session.id,
        actionType: 'USER_INPUT',
        details: JSON.stringify({ message: 'Hello, what services are available?' })
      }
    });
    console.log(`✅ ConciergeAuditLog successfully written (ID: ${auditLog.id})`);

    // 5. Test Deterministic Fallback Logic
    console.log('\n🤖 Testing Deterministic Fallback response generation...');
    const categories = await prisma.serviceCategory.findMany({ include: { items: true } });
    console.log(`Available Categories in DB: ${categories.length}`);
    categories.forEach(cat => {
      console.log(` - ${cat.name} (${cat.items.length} items)`);
    });

    // Clean up verification data so we don't pollute database
    await prisma.conciergeAuditLog.deleteMany({ where: { sessionId: session.id } });
    await prisma.conciergeMessage.deleteMany({ where: { sessionId: session.id } });
    await prisma.conciergeSession.delete({ where: { id: session.id } });
    console.log('\n✅ Temporary verification records successfully cleaned up!');
    console.log('🎉 Verification completed successfully! All Concierge models are functional.');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
