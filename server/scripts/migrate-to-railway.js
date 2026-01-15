// migrate-to-railway.js
// Quick migration script to copy all data from Render to Railway

const { PrismaClient } = require('@prisma/client');

const RENDER_URL = "postgresql://wayfarian_user:RGOMBsd5rJbjpN2GoM2e98Tpw5oPR1vD@dpg-d44ih72li9vc73bm35s0-a.frankfurt-postgres.render.com/wayfarian?sslmode=require";
const RAILWAY_URL = "postgresql://postgres:tEgGzoozBuUaiTcCoxYzKmSZUIOqSQgH@yamanote.proxy.rlwy.net:55095/railway";

async function checkRenderAvailable() {
    const render = new PrismaClient({ datasources: { db: { url: RENDER_URL } } });
    try {
        await render.$queryRaw`SELECT 1`;
        await render.$disconnect();
        return true;
    } catch (e) {
        console.log('Render not available:', e.message);
        await render.$disconnect().catch(() => { });
        return false;
    }
}

async function migrate() {
    console.log('🔍 Checking Render availability...');
    if (!await checkRenderAvailable()) {
        console.log('❌ Render database not available! Aborting.');
        process.exit(1);
    }
    console.log('✅ Render is available');

    const render = new PrismaClient({ datasources: { db: { url: RENDER_URL } } });
    const railway = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });

    try {
        // Fetch all data from Render
        console.log('\n📥 Fetching data from Render...');

        console.log('  - Fetching users...');
        const users = await render.user.findMany();
        console.log(`    Found ${users.length} users`);

        console.log('  - Fetching groups...');
        const groups = await render.group.findMany();
        console.log(`    Found ${groups.length} groups`);

        console.log('  - Fetching group members...');
        const groupMembers = await render.groupMember.findMany();
        console.log(`    Found ${groupMembers.length} group members`);

        console.log('  - Fetching journeys...');
        const journeys = await render.journey.findMany();
        console.log(`    Found ${journeys.length} journeys`);

        console.log('  - Fetching group journeys...');
        const groupJourneys = await render.groupJourney.findMany();
        console.log(`    Found ${groupJourneys.length} group journeys`);

        console.log('  - Fetching journey instances...');
        const journeyInstances = await render.journeyInstance.findMany();
        console.log(`    Found ${journeyInstances.length} journey instances`);

        console.log('  - Fetching photos...');
        const photos = await render.photo.findMany();
        console.log(`    Found ${photos.length} photos`);

        console.log('  - Fetching journey photos...');
        const journeyPhotos = await render.journeyPhoto.findMany();
        console.log(`    Found ${journeyPhotos.length} journey photos`);

        console.log('  - Fetching ride events...');
        const rideEvents = await render.rideEvent.findMany();
        console.log(`    Found ${rideEvents.length} ride events`);

        console.log('  - Fetching journey reminders...');
        const journeyReminders = await render.journeyReminder.findMany();
        console.log(`    Found ${journeyReminders.length} journey reminders`);

        // Check Render again before writing
        console.log('\n🔍 Checking Render availability again...');
        if (!await checkRenderAvailable()) {
            console.log('❌ Render became unavailable! Aborting.');
            process.exit(1);
        }
        console.log('✅ Render still available');

        // Clear Railway and insert data
        console.log('\n📤 Migrating data to Railway...');

        // Delete in reverse order of dependencies
        console.log('  - Clearing Railway database...');
        await railway.journeyReminder.deleteMany();
        await railway.rideEvent.deleteMany();
        await railway.journeyPhoto.deleteMany();
        await railway.journeyInstance.deleteMany();
        await railway.groupJourney.deleteMany();
        await railway.photo.deleteMany();
        await railway.journey.deleteMany();
        await railway.groupMember.deleteMany();
        await railway.group.deleteMany();
        await railway.user.deleteMany();
        console.log('    Cleared!');

        // Insert in order of dependencies
        if (users.length > 0) {
            console.log('  - Inserting users...');
            for (const user of users) {
                await railway.user.create({ data: user });
            }
        }

        if (groups.length > 0) {
            console.log('  - Inserting groups...');
            for (const group of groups) {
                await railway.group.create({ data: group });
            }
        }

        if (groupMembers.length > 0) {
            console.log('  - Inserting group members...');
            for (const gm of groupMembers) {
                await railway.groupMember.create({ data: gm });
            }
        }

        if (journeys.length > 0) {
            console.log('  - Inserting journeys...');
            for (const j of journeys) {
                await railway.journey.create({ data: j });
            }
        }

        if (groupJourneys.length > 0) {
            console.log('  - Inserting group journeys...');
            for (const gj of groupJourneys) {
                await railway.groupJourney.create({ data: gj });
            }
        }

        if (journeyInstances.length > 0) {
            console.log('  - Inserting journey instances...');
            for (const ji of journeyInstances) {
                await railway.journeyInstance.create({ data: ji });
            }
        }

        if (photos.length > 0) {
            console.log('  - Inserting photos...');
            for (const p of photos) {
                await railway.photo.create({ data: p });
            }
        }

        if (journeyPhotos.length > 0) {
            console.log('  - Inserting journey photos...');
            for (const jp of journeyPhotos) {
                await railway.journeyPhoto.create({ data: jp });
            }
        }

        if (rideEvents.length > 0) {
            console.log('  - Inserting ride events...');
            for (const re of rideEvents) {
                await railway.rideEvent.create({ data: re });
            }
        }

        if (journeyReminders.length > 0) {
            console.log('  - Inserting journey reminders...');
            for (const jr of journeyReminders) {
                await railway.journeyReminder.create({ data: jr });
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
        await render.$disconnect();
        await railway.$disconnect();
    }
}

migrate().catch((e) => {
    console.error(e);
    process.exit(1);
});
