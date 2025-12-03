const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const SOURCE_DB_URL = process.env.DATABASE_URL;
const TARGET_DB_URL = process.env.TARGET_DATABASE_URL;

if (!SOURCE_DB_URL || !TARGET_DB_URL) {
  console.error('Error: DATABASE_URL and TARGET_DATABASE_URL must be defined in environment variables.');
  process.exit(1);
}

const prismaSource = new PrismaClient({
  datasources: {
    db: {
      url: SOURCE_DB_URL,
    },
  },
});

const prismaTarget = new PrismaClient({
  datasources: {
    db: {
      url: TARGET_DB_URL,
    },
  },
});

async function migrateTable(modelName, uniqueKey = 'id', dependencyOrder = []) {
  console.log(`Migrating ${modelName}...`);
  try {
    const sourceData = await prismaSource[modelName].findMany();
    console.log(`Found ${sourceData.length} records in source ${modelName}.`);

    if (sourceData.length === 0) {
      console.log(`No data to migrate for ${modelName}.`);
      return;
    }

    // Process in chunks to avoid memory issues and connection timeouts
    const chunkSize = 50;
    for (let i = 0; i < sourceData.length; i += chunkSize) {
      const chunk = sourceData.slice(i, i + chunkSize);
      
      await prismaTarget.$transaction(
        chunk.map((item) => {
            // Remove foreign keys that might not exist yet if we are not careful, 
            // but we are relying on order.
            // However, circular dependencies or self-relations might be tricky.
            // For simple migration, upsert is good.
            return prismaTarget[modelName].upsert({
                where: { [uniqueKey]: item[uniqueKey] },
                update: item,
                create: item,
            });
        })
      );
      console.log(`Processed ${Math.min(i + chunkSize, sourceData.length)}/${sourceData.length} records for ${modelName}`);
    }
    console.log(`Finished migrating ${modelName}.`);
  } catch (error) {
    console.error(`Error migrating ${modelName}:`, error);
    throw error;
  }
}

async function main() {
  console.log('Starting migration...');
  console.log('Source:', SOURCE_DB_URL.split('@')[1]); // Log masked URL
  console.log('Target:', TARGET_DB_URL.split('@')[1]); // Log masked URL

  try {
    // 1. Users (No dependencies)
    await migrateTable('user');

    // 2. Groups (Depends on User)
    await migrateTable('group');

    // 3. Journeys (Depends on User, Group)
    await migrateTable('journey');

    // 4. GroupJourneys (Depends on Group, User)
    await migrateTable('groupJourney');

    // 5. JourneyInstances (Depends on GroupJourney, User)
    await migrateTable('journeyInstance', 'id'); // Assuming id is unique, composite key handling might be needed if using upsert with composite

    // JourneyInstance has a unique constraint on [groupJourneyId, userId], but also has an ID.
    // Upsert requires a unique field. ID is unique.

    // 6. GroupMembers (Depends on User, Group)
    // GroupMember has unique [userId, groupId]. It also has an ID.
    await migrateTable('groupMember');

    // 7. Photos (Depends on User, Journey)
    await migrateTable('photo');

    // 8. JourneyPhotos (Depends on JourneyInstance, User)
    await migrateTable('journeyPhoto');

    // 9. RideEvents (Depends on GroupJourney, Instance, User)
    await migrateTable('rideEvent');

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prismaSource.$disconnect();
    await prismaTarget.$disconnect();
  }
}

main();
