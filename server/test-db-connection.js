// Test database connection with retry logic
require('dotenv').config();
const { getPrismaClient, withRetry } = require('./utils/prismaClient');

async function testConnection() {
  console.log('🔍 Testing database connection...');
  console.log('📍 Database URL:', process.env.DATABASE_URL?.replace(/:[^:]*@/, ':****@'));
  
  const prisma = getPrismaClient();
  
  try {
    // Test 1: Basic connection
    console.log('\n✅ Test 1: Basic connection');
    await withRetry(async () => {
      await prisma.$connect();
      console.log('   ✓ Connected successfully');
    });
    
    // Test 2: Simple query
    console.log('\n✅ Test 2: Simple query');
    const result = await withRetry(async () => {
      return await prisma.$queryRaw`SELECT NOW() as current_time`;
    });
    console.log('   ✓ Query result:', result);
    
    // Test 3: Count users
    console.log('\n✅ Test 3: Count users');
    const userCount = await withRetry(async () => {
      return await prisma.user.count();
    });
    console.log(`   ✓ Total users: ${userCount}`);
    
    // Test 4: Connection info
    console.log('\n✅ Test 4: Connection info');
    const connectionInfo = await withRetry(async () => {
      return await prisma.$queryRaw`
        SELECT 
          COUNT(*) as connection_count,
          current_database() as database,
          version() as postgres_version
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
    });
    console.log('   ✓ Connection info:', connectionInfo);
    
    console.log('\n🎉 All tests passed! Database is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Connection test failed:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
    });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testConnection();
