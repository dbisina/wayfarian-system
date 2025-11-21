// server/scripts/clearAllData.js
// Script to clear all data from the database
// WARNING: This will delete ALL data including users, journeys, groups, etc.
// Usage: node server/scripts/clearAllData.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearAllData() {
  console.log('⚠️  WARNING: This will delete ALL data from the database!');
  console.log('Starting data deletion...\n');

  try {
    // Delete in order to respect foreign key constraints
    
    // 1. Delete ride events (depends on journey instances)
    console.log('Deleting ride events...');
    await prisma.rideEvent.deleteMany({});
    console.log('✓ Ride events deleted');

    // 2. Delete journey photos (depends on journey instances)
    console.log('Deleting journey photos...');
    await prisma.journeyPhoto.deleteMany({});
    console.log('✓ Journey photos deleted');

    // 3. Delete journey instances (depends on group journeys and users)
    console.log('Deleting journey instances...');
    await prisma.journeyInstance.deleteMany({});
    console.log('✓ Journey instances deleted');

    // 4. Delete group journeys (depends on groups)
    console.log('Deleting group journeys...');
    await prisma.groupJourney.deleteMany({});
    console.log('✓ Group journeys deleted');

    // 5. Delete photos (depends on journeys and users)
    console.log('Deleting photos...');
    await prisma.photo.deleteMany({});
    console.log('✓ Photos deleted');

    // 6. Delete journeys (depends on users and groups)
    console.log('Deleting journeys...');
    await prisma.journey.deleteMany({});
    console.log('✓ Journeys deleted');

    // 7. Delete group members (depends on groups and users)
    console.log('Deleting group members...');
    await prisma.groupMember.deleteMany({});
    console.log('✓ Group members deleted');

    // 8. Delete groups (depends on users)
    console.log('Deleting groups...');
    await prisma.group.deleteMany({});
    console.log('✓ Groups deleted');

    // 9. Delete users (last, as many things depend on it)
    console.log('Deleting users...');
    await prisma.user.deleteMany({});
    console.log('✓ Users deleted');

    console.log('\n✅ All data cleared successfully!');
    console.log('Database is now empty and ready for fresh start.');

  } catch (error) {
    console.error('❌ Error clearing data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
clearAllData()
  .then(() => {
    console.log('\nScript completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });

