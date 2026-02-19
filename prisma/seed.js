
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    const categories = [
        { name: 'Appliance', icon: '❄️' },
        { name: 'Cleaning', icon: '🧹' },
        { name: 'Plumbing', icon: '🔧' },
        { name: 'Beauty', icon: '🌸' },
        { name: 'Electrician', icon: '⚡' },
        { name: 'Painting', icon: '🎨' },
        { name: 'Disinfection', icon: '🧴' },
    ];

    const categoryMap = new Map();

    for (const cat of categories) {
        let category = await prisma.serviceCategory.findFirst({ where: { name: cat.name } });
        if (!category) {
            category = await prisma.serviceCategory.create({ data: { name: cat.name, icon: cat.icon } });
            console.log(`Created category: ${cat.name}`);
        }
        categoryMap.set(cat.name, category.id);
    }

    const services = [
        { id: 'svc_1', name: 'Split AC Service & Repair', category: 'Appliance', price: 499, description: 'Professional AC servicing and repair' },
        { id: 'svc_2', name: 'Bathroom Deep Cleaning', category: 'Cleaning', price: 399, description: 'Thorough bathroom cleaning service' },
        { id: 'svc_3', name: 'Kitchen Deep Cleaning', category: 'Cleaning', price: 599, description: 'Complete kitchen deep cleaning' },
        { id: 'svc_4', name: 'Plumbing & Leak Repair', category: 'Plumbing', price: 349, description: 'Fix leaks and plumbing issues' },
        { id: 'svc_5', name: 'Salon at Home', category: 'Beauty', price: 599, description: 'Beauty and grooming at your doorstep' },
        { id: 'svc_6', name: 'Electrical Wiring & Repair', category: 'Electrician', price: 449, description: 'Expert electrical solutions' },
        { id: 'svc_7', name: 'Home Painting', category: 'Painting', price: 1299, description: 'Interior and exterior painting' },
        { id: 'svc_8', name: 'Disinfection & Sanitization', category: 'Disinfection', price: 799, description: 'Deep sanitization for your home' },
    ];

    for (const svc of services) {
        const categoryId = categoryMap.get(svc.category);
        if (!categoryId) {
            console.warn(`Category ${svc.category} not found for service ${svc.name}`);
            continue;
        }

        const exists = await prisma.serviceItem.findUnique({ where: { id: svc.id } });
        if (!exists) {
            await prisma.serviceItem.create({
                data: {
                    id: svc.id,
                    name: svc.name,
                    description: svc.description,
                    price: svc.price,
                    categoryId: categoryId,
                }
            });
            console.log(`Created service: ${svc.name}`);
        } else {
            console.log(`Service already exists: ${svc.name}`);
        }
    }

    // Seed Service Provider
    const providerPhone = '9876543210';
    let providerUser = await prisma.user.findUnique({ where: { phoneNumber: providerPhone } });
    if (!providerUser) {
        providerUser = await prisma.user.create({
            data: {
                phoneNumber: providerPhone,
                name: 'John Doe The Plumber',
                role: 'PROVIDER',
                status: 'ACTIVE'
            }
        });
        console.log('Created provider user: John Doe');
    }

    let provider = await prisma.serviceProvider.findFirst({ where: { user_id: providerUser.id } });
    if (!provider) {
        provider = await prisma.serviceProvider.create({
            data: {
                user_id: providerUser.id,
                name: 'John Doe',
                phoneNumber: providerPhone,
                status: 'ACTIVE', // Available
                rating: 5,
                Kyc_status: 'APPROVED'
            }
        });

        // Ensure availability
        await prisma.availability.create({
            data: {
                provider_id: provider.id,
                is_online: true
            }
        });
        console.log('Created service provider available: John Doe');
    }

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
