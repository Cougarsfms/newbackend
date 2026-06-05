import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const coupons = await prisma.coupon.findMany();
  console.log('COUPONS_DATA:', JSON.stringify(coupons, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
