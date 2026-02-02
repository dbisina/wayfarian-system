// Quick test to check Railway database status
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const RAILWAY_URL = "postgresql://postgres:bQyhkychxbMdvTmVEUJtuBHtKbEqZynG@mainline.proxy.rlwy.net:52999/railway";

async function checkRailway() {
    const railway = new PrismaClient({ datasources: { db: { url: RAILWAY_URL } } });
    
    try {
        console.log('🔍 Testing Railway connection...');
        await railway.$queryRaw`SELECT 1`;
        console.log('✅ Railway connection OK!');
        
        console.log('\n📊 Checking existing data:');
        const userCount = await railway.user.count();
        const journeyCount = await railway.journey.count();
        const groupCount = await railway.group.count();
        
        console.log(`   Users: ${userCount}`);
        console.log(`   Journeys: ${journeyCount}`);
        console.log(`   Groups: ${groupCount}`);
        
        if (userCount > 0) {
            console.log('\n✅ Railway already has data! You can switch to it.');
        } else {
            console.log('\n⚠️ Railway is empty. Need to wait for Render to come back or restore from backup.');
        }
        
        await railway.$disconnect();
    } catch (e) {
        console.error('❌ Railway error:', e.message);
        await railway.$disconnect();
        process.exit(1);
    }
}

checkRailway();
