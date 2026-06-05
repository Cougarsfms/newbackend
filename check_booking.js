const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const bookingId = 'b45707c7-028d-418b-81cb-fbffcbd49fad';
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: true,
        service: {
            include: {
                category: true
            }
        },
        spBookings: {
          include: {
            provider: true
          }
        }
      }
    });

    console.log('--- Booking Info ---');
    if (!booking) {
        console.log('Booking not found!');
    } else {
        console.log('ID:', booking.id);
        console.log('Status:', booking.status);
        console.log('User:', booking.user?.name, booking.user?.phoneNumber);
        console.log('Service:', booking.service?.name);
        console.log('Category:', booking.service?.category?.name, `(ID: ${booking.service?.categoryId})`);

        console.log('\n--- SpBookings (Assignments) ---');
        booking.spBookings.forEach(spb => {
          console.log(`Provider: ${spb.provider.name} (ID: ${spb.provider.id})`);
          console.log(`Status: ${spb.status}`);
          console.log(`FCM Token: ${spb.provider.user?.fcmToken ? 'Yes' : 'No'}`); // Wait, fcmToken is on User
        });
    }

    // Check my provider specifically
    // In database, the provider ID might be different from mock ID 884522
    // I'll search by name "Anshika" or phone if I had it, but I'll search by any that has 884522 in phone
    const myProvider = await prisma.serviceProvider.findFirst({
        where: { OR: [{ id: '884522' }, { phoneNumber: { contains: '884522' } }] },
        include: { availabilities: true, user: true, categories: true, items: true }
    });

    console.log('\n--- My Provider Check ---');
    if (myProvider) {
        console.log('Name:', myProvider.name);
        console.log('ID:', myProvider.id);
        console.log('Online:', myProvider.availabilities[0]?.is_online);
        console.log('FCM Token (on User):', myProvider.user?.fcmToken ? 'Yes' : 'No');
        console.log('Last Location:', myProvider.availabilities[0]?.currentLatitude, myProvider.availabilities[0]?.currentLongitude);
        console.log('Categories:', myProvider.categories.map(c => c.name).join(', '));
        console.log('Items:', myProvider.items.map(i => i.name).join(', '));
    } else {
        console.log('Provider with 884522 not found in DB!');
    }

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
