const { prisma } = require('../lib/prisma');
async function main() {
  const count = await prisma.product.count({
    where: { vendorId: '331746cc-4a5a-4de9-9f86-e4a62fee2b42' }
  });
  console.log('Product count:', count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
