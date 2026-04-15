const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const bookingId = '10fee1a3-5eab-446f-927a-ddf11f3aeb91';
  const providerId = 'a34e48cf-d1c6-49bc-9615-83ce79ca53d5';

  console.log(`Fixing booking: ${bookingId} for provider: ${providerId}`);

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    console.log('Booking not found');
    return;
  }

  const existing = await prisma.spBooking.findFirst({
    where: { booking_id: bookingId, provider_id: providerId }
  });

  if (!existing) {
    const endDate = new Date(booking.date);
    endDate.setHours(endDate.getHours() + 1);

    const created = await prisma.spBooking.create({
      data: {
        provider_id: providerId,
        booking_id: bookingId,
        status: 'ACCEPTED',
        start_time: booking.date,
        end_time: endDate
      }
    });
    console.log('Created spBooking:', created.id);
  } else {
    console.log('Record already exists with status:', existing.status);
    if (existing.status !== 'ACCEPTED') {
        const updated = await prisma.spBooking.update({
            where: { id: existing.id },
            data: { status: 'ACCEPTED' }
        });
        console.log('Updated status to ACCEPTED');
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
