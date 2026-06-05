const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.coupon.findMany()
  .then(coupons => {
    console.log('Total coupons:', coupons.length);
    coupons.forEach(c => {
      console.log('---');
      console.log('ID:', c.id);
      console.log('Code:', c.code);
      console.log('isActive:', c.isActive);
      console.log('isVisibleOnHome:', c.isVisibleOnHome);
      console.log('expiryDate:', c.expiryDate);
      console.log('price:', c.price);
      console.log('allowedJobsCount:', c.allowedJobsCount);
      console.log('jobDurationMinutes:', c.jobDurationMinutes);
    });
  })
  .catch(e => console.error('ERROR:', e.message))
  .finally(() => p.$disconnect());
