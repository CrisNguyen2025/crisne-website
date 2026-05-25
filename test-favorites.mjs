// Test script to verify favorites persistence
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  console.log('🔍 Testing Favorites System...\n');
  
  // 1. Check if Favorite table exists
  try {
    const count = await prisma.favorite.count();
    console.log(`✅ Favorite table exists with ${count} records`);
  } catch (err) {
    console.error('❌ Favorite table does not exist or migration not run');
    console.error(err.message);
    process.exit(1);
  }
  
  // 2. Get a real tag from database
  const realTag = await prisma.tag.findFirst();
  if (!realTag) {
    console.log('⚠️  No tags in database, skipping create test');
    await prisma.$disconnect();
    return;
  }
  
  const testUserId = 'test-user-' + Date.now();
  const testTagId = realTag.id;
  
  console.log(`📌 Using real tag: ${realTag.name} (${realTag.id})`);
  
  try {
    await prisma.favorite.create({
      data: {
        userId: testUserId,
        tagId: testTagId,
      },
    });
    console.log(`✅ Created favorite for user ${testUserId}`);
  } catch (err) {
    console.error('❌ Failed to create favorite');
    console.error(err.message);
  }
  
  // 3. Test reading favorites
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: testUserId },
    });
    console.log(`✅ Read ${favorites.length} favorites for user ${testUserId}`);
  } catch (err) {
    console.error('❌ Failed to read favorites');
    console.error(err.message);
  }
  
  // 4. Test deleting favorite
  try {
    await prisma.favorite.deleteMany({
      where: { userId: testUserId },
    });
    console.log(`✅ Deleted favorites for user ${testUserId}`);
  } catch (err) {
    console.error('❌ Failed to delete favorites');
    console.error(err.message);
  }
  
  // 5. Show all favorites in DB
  const allFavorites = await prisma.favorite.findMany({
    include: { tag: true },
  });
  
  console.log(`\n📊 Total favorites in database: ${allFavorites.length}`);
  if (allFavorites.length > 0) {
    console.log('\nFavorites by user:');
    const byUser = {};
    allFavorites.forEach(f => {
      if (!byUser[f.userId]) byUser[f.userId] = [];
      byUser[f.userId].push(f.tag?.name || f.tagId);
    });
    Object.entries(byUser).forEach(([userId, tags]) => {
      console.log(`  ${userId}: ${tags.join(', ')}`);
    });
  }
  
  await prisma.$disconnect();
}

test();
