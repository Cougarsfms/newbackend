
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Services ---');
    const services = await prisma.serviceItem.findMany();
    if (services.length === 0) {
        console.log('NO SERVICES FOUND! Seeding required.');
    } else {
        services.forEach(s => console.log(`Service: ${s.id} - ${s.name} (${s.categoryId})`));
    }

    console.log('\n--- Checking Users ---');
    const users = await prisma.user.findMany();
    users.forEach(u => console.log(`User: ${u.id} - ${u.phoneNumber}`));

    console.log('\n--- Checking Categories ---');
    const cats = await prisma.serviceCategory.findMany();
    cats.forEach(c => console.log(`Category: ${c.id} - ${c.name}`));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
