
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // Categories
    const categories = [
        { name: 'Appliance', icon: '❄️' },
        { name: 'Cleaning', icon: '🧹' },
        { name: 'Plumbing', icon: '🔧' },
        { name: 'Beauty', icon: '🌸' },
        { name: 'Electrician', icon: '⚡' },
        { name: 'Painting', icon: '🎨' },
        { name: 'Disinfection', icon: '🧴' },
    ];

    const categoryMap = new Map<string, string>();

    for (const cat of categories) {
        const upserted = await prisma.serviceCategory.upsert({
            where: { id: cat.name }, // Hack: using name as ID if possible? No, ID is UUID.
            // But we can find first by name? No findFirst in upsert update/create where clause must be unique.
            // We don't have unique constraint on name.
            // Let's check if exists first.
            update: {},
            create: {
                name: cat.name,
                icon: cat.icon,
            },
        } as any).catch(async () => {
            // Fallback for non-unique where
            const existing = await prisma.serviceCategory.findFirst({ where: { name: cat.name } });
            if (existing) return existing;
            return prisma.serviceCategory.create({ data: { name: cat.name, icon: cat.icon } });
        });

        // Better logic:
        let category = await prisma.serviceCategory.findFirst({ where: { name: cat.name } });
        if (!category) {
            category = await prisma.serviceCategory.create({ data: { name: cat.name, icon: cat.icon } });
        }
        categoryMap.set(cat.name, category.id);
    }

    // Services
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
