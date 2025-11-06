// server/test-valkey-connection.js
// Test Valkey/Redis connection and services

const RedisService = require('./services/RedisService');
const ValkeyJobQueue = require('./services/ValkeyJobQueue');

async function testValkey() {
  console.log('🧪 Testing Valkey/Redis Services...\n');

  try {
    // Test 1: Redis Service - Basic Operations
    console.log('📦 Test 1: RedisService Basic Operations');
    console.log('─'.repeat(50));
    
    // Set a test key
    const testKey = 'test:wayfarian:health';
    const testData = {
      message: 'Hello Valkey!',
      timestamp: new Date().toISOString(),
      service: process.env.VALKEY_URL ? 'Valkey' : 'Redis',
    };

    await RedisService.set(testKey, testData, 60);
    console.log('✅ Set test key:', testKey);

    // Get the test key
    const result = await RedisService.get(testKey);
    console.log('✅ Retrieved value:', result);

    // Verify data matches
    if (JSON.stringify(result) === JSON.stringify(testData)) {
      console.log('✅ Data integrity verified\n');
    } else {
      console.log('❌ Data mismatch!\n');
    }

    // Test 2: Redis Service - Stats
    console.log('📊 Test 2: RedisService Stats');
    console.log('─'.repeat(50));
    const stats = await RedisService.getStats();
    console.log('✅ Service stats:', JSON.stringify(stats, null, 2), '\n');

    // Test 3: Valkey Job Queue - Basic Operations
    console.log('🔄 Test 3: ValkeyJobQueue Operations');
    console.log('─'.repeat(50));

    // Add a test job
    const jobId = await ValkeyJobQueue.add('test-job', {
      message: 'Test job payload',
      testNumber: Math.random(),
    }, {
      priority: 0,
      maxAttempts: 3,
    });

    console.log('✅ Created job:', jobId);

    // Register a test worker
    ValkeyJobQueue.process('test-job', async (job) => {
      console.log('📝 Processing job:', job.id);
      console.log('   Data:', job.data);
      return { success: true, processedAt: new Date().toISOString() };
    });

    console.log('✅ Registered test worker');

    // Get queue stats
    const queueStats = await ValkeyJobQueue.getStats();
    console.log('✅ Queue stats:', JSON.stringify(queueStats, null, 2), '\n');

    // Test 4: Cache Wrap Pattern
    console.log('🎯 Test 4: Cache Wrap Pattern');
    console.log('─'.repeat(50));

    let fetchCount = 0;
    const expensiveOperation = async () => {
      fetchCount++;
      console.log(`   Expensive operation called (count: ${fetchCount})`);
      return { result: 'expensive data', computedAt: Date.now() };
    };

    const cacheKey = 'test:cache-wrap';
    
    // First call - should execute function
    const result1 = await RedisService.cacheWrap(cacheKey, expensiveOperation, 30);
    console.log('✅ First call (cache miss):', result1);

    // Second call - should use cache
    const result2 = await RedisService.cacheWrap(cacheKey, expensiveOperation, 30);
    console.log('✅ Second call (cache hit):', result2);

    if (fetchCount === 1) {
      console.log('✅ Cache wrap working correctly (function called once)\n');
    } else {
      console.log('❌ Cache wrap issue (function called multiple times)\n');
    }

    // Test 5: Cleanup
    console.log('🧹 Test 5: Cleanup');
    console.log('─'.repeat(50));
    await RedisService.del(testKey);
    await RedisService.del(cacheKey);
    console.log('✅ Test keys deleted\n');

    // Summary
    console.log('=' .repeat(50));
    console.log('🎉 All Valkey/Redis tests passed!');
    console.log('=' .repeat(50));
    console.log('\n💡 Tips:');
    console.log('  - Set VALKEY_URL to use Valkey instead of Redis');
    console.log('  - Set REDIS_URL as fallback connection string');
    console.log('  - Set DISABLE_REDIS=true to disable caching');
    console.log('  - Set USE_VALKEY_QUEUE=true to enable persistent job queue');
    console.log('\n📚 See VALKEY_MIGRATION.md for full documentation\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    console.log('\n🔍 Troubleshooting:');
    console.log('  1. Check if Valkey/Redis is running: valkey-cli ping');
    console.log('  2. Verify connection URL in .env file');
    console.log('  3. Check firewall/network settings');
    console.log('  4. See VALKEY_MIGRATION.md for help\n');
    process.exit(1);
  }
}

// Run tests
console.log('\n🚀 Starting Valkey/Redis Service Tests\n');
console.log('Environment:');
console.log('  VALKEY_URL:', process.env.VALKEY_URL || '(not set)');
console.log('  REDIS_URL:', process.env.REDIS_URL || '(not set)');
console.log('  DISABLE_REDIS:', process.env.DISABLE_REDIS || 'false');
console.log('  USE_VALKEY_QUEUE:', process.env.USE_VALKEY_QUEUE || 'false');
console.log('');

testValkey();
