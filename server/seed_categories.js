const { prisma } = require('./lib/prisma');

async function seedCategories() {
  const categories = [
    { name: 'Chinese', description: 'Fried Rice, Noodles, and more' },
    { name: 'Indian', description: 'North & South Indian Cuisines' },
    { name: 'Continental', description: 'Pasta, Pizzas, and European' },
    { name: 'Beverages', description: 'Cold drinks, Juices, and Tea/Coffee' },
    { name: 'Desserts', description: 'Ice creams, Cakes, and Sweets' },
    { name: 'Fast Food', description: 'Burgers, Fries, and quick bites' }
  ];

  console.log('🌱 Seeding Global Categories...');

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name }, // This assumes name is unique, otherwise use findFirst
      update: { vendorId: null }, // Ensure it stays a system category
      create: {
        name: cat.name,
        description: cat.description,
        vendorId: null // Global category
      }
    });
  }

  console.log('✅ Categories Restored!');
}

seedCategories()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
