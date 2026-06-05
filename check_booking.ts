import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const bookingId = 'b45707c7-028d-418b-81cb-fbffcbd49fad';
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: true,
        serviceItem: true,
        assignments: {
          include: {
            serviceProvider: true
          }
        }
      }
    });

    console.log('--- Booking Info ---');
    console.log('ID:', booking?.id);
    console.log('Status:', booking?.status);
    console.log('Customer:', booking?.customer?.firstName, booking?.customer?.mobileNumber);
    console.log('Service:', booking?.serviceItem?.name);
    console.log('Category ID:', booking?.serviceItem?.categoryId);

    console.log('\n--- Assignments ---');
    booking?.assignments.forEach(a => {
      console.log(`Provider: ${a.serviceProvider.firstName} (ID: ${a.serviceProvider.id})`);
      console.log(`Status: ${a.status}`);
      console.log(`FCM Token: ${a.serviceProvider.fcmToken ? 'Yes' : 'No'}`);
    });

    // Check my provider specifically
    const myProvider = await prisma.serviceProvider.findFirst({
        where: { OR: [{ id: '884522' }, { mobileNumber: '884522' }] },
        include: { availabilities: true }
    });

    console.log('\n--- My Provider (884522) ---');
    if (myProvider) {
        console.log('Name:', myProvider.firstName);
        console.log('ID:', myProvider.id);
        console.log('Online:', myProvider.isOnline);
        console.log('FCM Token:', myProvider.fcmToken ? 'Yes' : 'No');
        console.log('Last Location:', myProvider.availabilities[0]?.currentLatitude, myProvider.availabilities[0]?.currentLongitude);
    } else {
        console.log('Provider 884522 not found!');
    }

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
