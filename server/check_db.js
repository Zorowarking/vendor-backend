const { prisma } = require('./lib/prisma');

async function check() {
  try {
    const vendors = await prisma.vendor.findMany({
      include: { profile: true }
    });
    console.log(JSON.stringify(vendors, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
