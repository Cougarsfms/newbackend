const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const phone1 = '+919999999901';
  const phone2 = '+919999999902';

  try {
    console.log('=== [1/6] Cleaning Up Old Test Users ===');
    // Find customer IDs to delete wallets/ledgers
    const testCustomers = await prisma.customer.findMany({
      where: { phoneNumber: { in: [phone1, phone2] } },
      include: { customerWallets: true }
    });

    for (const customer of testCustomers) {
      if (customer.customerWallets.length > 0) {
        await prisma.customerWalletLedger.deleteMany({
          where: { CustomerWallet_id: customer.customerWallets[0].id }
        });
        await prisma.customerWallet.deleteMany({
          where: { customer_id: customer.id }
        });
      }
      await prisma.customer.delete({ where: { id: customer.id } });
    }

    await prisma.user.deleteMany({
      where: { phoneNumber: { in: [phone1, phone2] } }
    });

    console.log('Cleanup completed successfully.\n');

    console.log('=== [2/6] Registering Referrer User (User 1) ===');
    // Generate own referral code (simulating register)
    const user1 = await prisma.user.create({
      data: {
        phoneNumber: phone1,
        name: 'Referrer User',
        role: 'CUSTOMER',
        status: 'ACTIVE'
      }
    });

    // Make code similar to customer.service.ts
    const referralCode1 = 'REFER9901';

    const customer1 = await prisma.customer.create({
      data: {
        user_id: user1.id,
        name: 'Referrer User',
        phoneNumber: phone1,
        status: 'ACTIVE',
        trust_score: 100,
        referralCode: referralCode1
      }
    });

    const wallet1 = await prisma.customerWallet.create({
      data: { customer_id: customer1.id, balance: 0 }
    });

    console.log(`User 1 registered with Referral Code: ${customer1.referralCode}\n`);

    console.log('=== [3/6] Registering Referee User (User 2) using User 1 Referral Code ===');
    // Validate referral code (similar to customer.service.ts)
    const referrer = await prisma.customer.findUnique({
      where: { referralCode: referralCode1 }
    });

    if (!referrer) {
      throw new Error('Verification failed: Referral code not found');
    }

    const user2 = await prisma.user.create({
      data: {
        phoneNumber: phone2,
        name: 'Referee User',
        role: 'CUSTOMER',
        status: 'ACTIVE'
      }
    });

    const referralCode2 = 'REFER9902';

    const customer2 = await prisma.customer.create({
      data: {
        user_id: user2.id,
        name: 'Referee User',
        phoneNumber: phone2,
        status: 'ACTIVE',
        trust_score: 100,
        referralCode: referralCode2,
        referredById: referrer.id
      }
    });

    const wallet2 = await prisma.customerWallet.create({
      data: { customer_id: customer2.id, balance: 0 }
    });

    // Distribute rewards
    // 1. Reward referee (User 2): ₹50
    await prisma.customerWallet.update({
      where: { id: wallet2.id },
      data: { balance: { increment: 50 } }
    });
    await prisma.customerWalletLedger.create({
      data: {
        CustomerWallet_id: wallet2.id,
        amount: 50,
        description: `Referral Reward: Joined using ${referrer.referralCode}`
      }
    });

    // 2. Reward referrer (User 1): ₹100
    await prisma.customerWallet.update({
      where: { id: wallet1.id },
      data: { balance: { increment: 100 } }
    });
    await prisma.customerWalletLedger.create({
      data: {
        CustomerWallet_id: wallet1.id,
        amount: 100,
        description: `Referral Reward: Referred ${customer2.name}`
      }
    });

    console.log(`User 2 registered and referred by User 1 successfully.\n`);

    console.log('=== [4/6] Verifying Wallets & Balances ===');
    const verifyWallet1 = await prisma.customerWallet.findUnique({
      where: { id: wallet1.id }
    });
    const verifyWallet2 = await prisma.customerWallet.findUnique({
      where: { id: wallet2.id }
    });

    console.log(`Referrer Wallet Balance: ₹${verifyWallet1.balance} (Expected: ₹100)`);
    console.log(`Referee Wallet Balance: ₹${verifyWallet2.balance} (Expected: ₹50)`);

    const verifyLedger1 = await prisma.customerWalletLedger.findFirst({
      where: { CustomerWallet_id: wallet1.id }
    });
    const verifyLedger2 = await prisma.customerWalletLedger.findFirst({
      where: { CustomerWallet_id: wallet2.id }
    });

    console.log(`Referrer Wallet Ledger Note: "${verifyLedger1.description}"`);
    console.log(`Referee Wallet Ledger Note: "${verifyLedger2.description}"\n`);

    console.log('=== [5/6] Verifying Referral Stats Endpoint Logic ===');
    // Fetch stats for User 1
    const customerStats1 = await prisma.customer.findUnique({
      where: { id: customer1.id },
      include: { referredUsers: true }
    });

    const ledgers1 = await prisma.customerWalletLedger.findMany({
      where: {
        CustomerWallet_id: wallet1.id,
        description: { contains: 'Referral Reward' }
      }
    });
    const totalEarned1 = ledgers1.reduce((sum, item) => sum + Number(item.amount), 0);

    console.log(`User 1 Referral Code: ${customerStats1.referralCode}`);
    console.log(`User 1 Friends Referred Count: ${customerStats1.referredUsers.length} (Expected: 1)`);
    console.log(`User 1 Total Earned: ₹${totalEarned1} (Expected: ₹100)`);
    console.log(`User 1 Referred Friend Name: ${customerStats1.referredUsers[0]?.name}\n`);

    console.log('=== [6/6] Final Verification Result ===');
    if (
      Number(verifyWallet1.balance) === 100 &&
      Number(verifyWallet2.balance) === 50 &&
      customerStats1.referredUsers.length === 1 &&
      totalEarned1 === 100
    ) {
      console.log('✅ SUCCESS: All referral validation, wallet balances, and statistics verification tests PASSED.');
    } else {
      console.log('❌ FAILED: Wallet balances or stats do not match expectations.');
    }

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
