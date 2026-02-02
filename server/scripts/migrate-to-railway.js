// migrate-to-railway.js
// Quick migration script to copy all data from Render to Railway

const { PrismaClient } = require('@prisma/client');

// Old Railway database (source)
const SOURCE_URL = "postgresql://postgres:tEgGzoozBuUaiTcCoxYzKmSZUIOqSQgH@yamanote.proxy.rlwy.net:55095/railway";
// New Railway database in same project (target)
const TARGET_URL = "postgresql://postgres:bQyhkychxbMdvTmVEUJtuBHtKbEqZynG@mainline.proxy.rlwy.net:52999/railway";

async function checkSourceAvailable() {
    const source = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
    try {
        await source.$queryRaw`SELECT 1`;
        await source.$disconnect();
        return true;
    } catch (e) {
        console.log('Source not available:', e.message);
        await source.$disconnect().catch(() => { });
        return false;
    }
}

async function migrate() {
    console.log('🔍 Checking source DB availability...');
    if (!await checkSourceAvailable()) {
        console.log('❌ Source database not available! Aborting.');
        process.exit(1);
    }
    console.log('✅ Source is available');

    const source = new PrismaClient({ datasources: { db: { url: SOURCE_URL } } });
    const target = new PrismaClient({ datasources: { db: { url: TARGET_URL } } });

    try {
        // Fetch all data from Render
        console.log('\n📥 Fetching data from source...');

        console.log('  - Fetching users...');
        const users = await source.user.findMany();
        console.log(`    Found ${users.length} users`);

        console.log('  - Fetching groups...');
        const groups = await source.group.findMany();
        console.log(`    Found ${groups.length} groups`);

        console.log('  - Fetching group members...');
        const groupMembers = await source.groupMember.findMany();
        console.log(`    Found ${groupMembers.length} group members`);

        console.log('  - Fetching journeys...');
        const journeys = await source.journey.findMany();
        console.log(`    Found ${journeys.length} journeys`);

        console.log('  - Fetching group journeys...');
        const groupJourneys = await source.groupJourney.findMany();
        console.log(`    Found ${groupJourneys.length} group journeys`);

        console.log('  - Fetching journey instances...');
        const journeyInstances = await source.journeyInstance.findMany();
        console.log(`    Found ${journeyInstances.length} journey instances`);

        console.log('  - Fetching photos...');
        const photos = await source.photo.findMany();
        console.log(`    Found ${photos.length} photos`);

        console.log('  - Fetching journey photos...');
        const journeyPhotos = await source.journeyPhoto.findMany();
        console.log(`    Found ${journeyPhotos.length} journey photos`);

        console.log('  - Fetching ride events...');
        const rideEvents = await source.rideEvent.findMany();
        console.log(`    Found ${rideEvents.length} ride events`);

        console.log('  - Fetching journey reminders...');
        const journeyReminders = await source.journeyReminder.findMany();
        console.log(`    Found ${journeyReminders.length} journey reminders`);

        // Check source again before writing
        console.log('\n🔍 Checking source availability again...');
        if (!await checkSourceAvailable()) {
            console.log('❌ Source became unavailable! Aborting.');
            process.exit(1);
        }
        console.log('✅ Source still available');

        // Clear target and insert data
        console.log('\n📤 Migrating data to target...');

        // Delete in reverse order of dependencies
        console.log('  - Clearing target database...');
        await target.journeyReminder.deleteMany();
        await target.rideEvent.deleteMany();
        await target.journeyPhoto.deleteMany();
        await target.journeyInstance.deleteMany();
        await target.groupJourney.deleteMany();
        await target.photo.deleteMany();
        await target.journey.deleteMany();
        await target.groupMember.deleteMany();
        await target.group.deleteMany();
        await target.user.deleteMany();
        console.log('    Cleared!');

        // Insert in order of dependencies
        if (users.length > 0) {
            console.log('  - Inserting users...');
            for (const user of users) {
                await target.user.create({ data: user });
            }
        }

        if (groups.length > 0) {
            console.log('  - Inserting groups...');
            for (const group of groups) {
                await target.group.create({ data: group });
            }
        }

        if (groupMembers.length > 0) {
            console.log('  - Inserting group members...');
            for (const gm of groupMembers) {
                await target.groupMember.create({ data: gm });
            }
        }

        if (journeys.length > 0) {
            console.log('  - Inserting journeys...');
            for (const j of journeys) {
                await target.journey.create({ data: j });
            }
        }

        if (groupJourneys.length > 0) {
            console.log('  - Inserting group journeys...');
            for (const gj of groupJourneys) {
                await target.groupJourney.create({ data: gj });
            }
        }

        if (journeyInstances.length > 0) {
            console.log('  - Inserting journey instances...');
            for (const ji of journeyInstances) {
                await target.journeyInstance.create({ data: ji });
            }
        }

        if (photos.length > 0) {
            console.log('  - Inserting photos...');
            for (const p of photos) {
                await target.photo.create({ data: p });
            }
        }

        if (journeyPhotos.length > 0) {
            console.log('  - Inserting journey photos...');
            for (const jp of journeyPhotos) {
                await target.journeyPhoto.create({ data: jp });
            }
        }

        if (rideEvents.length > 0) {
            console.log('  - Inserting ride events...');
            for (const re of rideEvents) {
                await target.rideEvent.create({ data: re });
            }
        }

        if (journeyReminders.length > 0) {
            console.log('  - Inserting journey reminders...');
            for (const jr of journeyReminders) {
                await target.journeyReminder.create({ data: jr });
            }
        }

        console.log('\n✅ Migration complete!');
        console.log(`   Users: ${users.length}`);
        console.log(`   Groups: ${groups.length}`);
        console.log(`   Group Members: ${groupMembers.length}`);
        console.log(`   Journeys: ${journeys.length}`);
        console.log(`   Group Journeys: ${groupJourneys.length}`);
        console.log(`   Journey Instances: ${journeyInstances.length}`);
        console.log(`   Photos: ${photos.length}`);
        console.log(`   Journey Photos: ${journeyPhotos.length}`);
        console.log(`   Ride Events: ${rideEvents.length}`);
        console.log(`   Journey Reminders: ${journeyReminders.length}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await source.$disconnect();
        await target.$disconnect();
    }
}

migrate().catch((e) => {
    console.error(e);
    process.exit(1);
});
