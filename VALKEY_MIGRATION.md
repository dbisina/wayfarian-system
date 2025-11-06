# Valkey Migration Guide

## What is Valkey?

**Valkey** is an open-source, high-performance key-value datastore that is fully compatible with Redis OSS APIs. It was created as a Linux Foundation project forked from Redis 7.2.4 and is backed by AWS, Google Cloud, Oracle, Ericsson, and Snap Inc.

## Why Valkey?

### Key Differences from Redis

1. **Licensing**: 
   - **Valkey**: BSD 3-Clause License (truly open source)
   - **Redis**: Source Available License (SSPLv1/RSALv2 since Redis 7.4+)

2. **Community Governance**:
   - **Valkey**: Linux Foundation project with multi-vendor governance
   - **Redis**: Controlled by Redis Ltd (formerly Redis Labs)

3. **Compatibility**:
   - **Valkey**: 100% API-compatible with Redis OSS up to 7.2.4
   - All Redis commands work identically in Valkey

4. **Performance**:
   - **Valkey**: Same or better performance than Redis (built on same codebase)
   - Active optimization work by contributors

5. **Features**:
   - **Valkey**: Committed to maintaining OSS features and adding new ones
   - **Redis**: Some features being moved to proprietary Redis Stack

### Why Use Valkey in Wayfarian?

1. **No Vendor Lock-in**: True open source means no risk of licensing changes
2. **Drop-in Replacement**: Works with existing `ioredis` client without code changes
3. **Cloud-Native**: First-class support from major cloud providers
4. **Community-Driven**: Faster feature development and bug fixes
5. **Future-Proof**: Won't face licensing restrictions as project grows

## Current Implementation

### Services Using Redis/Valkey

1. **RedisService** (`server/services/RedisService.js`)
   - General caching layer
   - Used for: user sessions, API response caching, leaderboard data
   
2. **ValkeyJobQueue** (`server/services/ValkeyJobQueue.js`)
   - Persistent job queue
   - Used for: background tasks, notifications, data processing

### Connection Configuration

Both services support flexible configuration:

```javascript
// Environment variables (in order of precedence)
const connectionUrl = 
  process.env.VALKEY_URL ||     // Valkey-specific URL
  process.env.REDIS_URL ||      // Redis-compatible URL
  'redis://localhost:6379';     // Local fallback
```

## Migration from Redis to Valkey

### Option 1: Drop-in Replacement (Recommended)

Since Valkey is 100% compatible with Redis, you can simply:

1. **Install Valkey** on your server:
   ```bash
   # Using Docker (easiest)
   docker run -d --name valkey -p 6379:6379 valkey/valkey:latest

   # Or using package manager (Ubuntu/Debian)
   sudo apt-get install valkey

   # Or download from https://valkey.io/download/
   ```

2. **Update environment variable** (optional):
   ```bash
   # Either use existing REDIS_URL
   REDIS_URL=redis://localhost:6379

   # Or use new VALKEY_URL (preferred for clarity)
   VALKEY_URL=redis://localhost:6379
   ```

3. **No code changes needed!** Both services already support Valkey.

### Option 2: Parallel Migration

Run Redis and Valkey side-by-side during transition:

1. **Start Valkey on different port**:
   ```bash
   docker run -d --name valkey -p 6380:6379 valkey/valkey:latest
   ```

2. **Point new services to Valkey**:
   ```env
   # Old services use Redis
   REDIS_URL=redis://localhost:6379

   # New services use Valkey
   VALKEY_URL=redis://localhost:6380
   ```

3. **Migrate data** (optional):
   ```bash
   # Export from Redis
   redis-cli --rdb /tmp/dump.rdb

   # Import to Valkey
   valkey-cli --pipe < /tmp/dump.rdb
   ```

## Cloud Deployment

### AWS ElastiCache Valkey

AWS now offers Valkey as a managed service:

```env
VALKEY_URL=rediss://valkey-cluster.xxxxx.cache.amazonaws.com:6379
```

**Benefits**:
- Automatic failover and replication
- Built-in monitoring and alerting
- VPC security and encryption at rest/in-transit
- Managed backups and snapshots

**Setup**:
1. Go to AWS Console → ElastiCache
2. Create cluster → Choose "Valkey"
3. Copy connection endpoint
4. Add to environment variables

### Google Cloud Memorystore Valkey

Google Cloud supports Valkey in Memorystore:

```env
VALKEY_URL=redis://10.0.0.3:6379
```

### Self-Hosted Docker Compose

For production self-hosting:

```yaml
# docker-compose.yml
version: '3.8'

services:
  valkey:
    image: valkey/valkey:latest
    container_name: wayfarian-valkey
    restart: always
    ports:
      - "6379:6379"
    volumes:
      - valkey-data:/data
      - ./valkey.conf:/usr/local/etc/valkey/valkey.conf
    command: valkey-server /usr/local/etc/valkey/valkey.conf
    environment:
      - VALKEY_PASSWORD=${VALKEY_PASSWORD}
    networks:
      - wayfarian-network

volumes:
  valkey-data:

networks:
  wayfarian-network:
    driver: bridge
```

**Production valkey.conf**:
```conf
# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Security
requirepass your-strong-password-here
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""

# Memory
maxmemory 2gb
maxmemory-policy allkeys-lru

# Performance
tcp-backlog 511
timeout 0
tcp-keepalive 300
```

## Testing the Migration

### 1. Verify Valkey Connection

```bash
# Test connection
valkey-cli ping
# Expected: PONG

# Check info
valkey-cli info server
```

### 2. Test Application Services

```javascript
// server/test-valkey-connection.js
const RedisService = require('./services/RedisService');
const ValkeyJobQueue = require('./services/ValkeyJobQueue');

async function testValkey() {
  try {
    // Test caching
    await RedisService.set('test:key', { hello: 'valkey' }, 60);
    const result = await RedisService.get('test:key');
    console.log('✅ Cache test passed:', result);

    // Test job queue
    await ValkeyJobQueue.add('test-job', { data: 'test' });
    const stats = await ValkeyJobQueue.getStats();
    console.log('✅ Job queue test passed:', stats);

    console.log('\n✅ All Valkey services working correctly!');
  } catch (error) {
    console.error('❌ Valkey test failed:', error.message);
  }
}

testValkey();
```

Run test:
```bash
cd server
node test-valkey-connection.js
```

## Performance Monitoring

### Key Metrics to Track

1. **Connection Health**:
   ```bash
   valkey-cli --stat
   ```

2. **Memory Usage**:
   ```bash
   valkey-cli INFO memory | grep used_memory_human
   ```

3. **Operations Per Second**:
   ```bash
   valkey-cli INFO stats | grep instantaneous_ops_per_sec
   ```

4. **Slow Queries**:
   ```bash
   valkey-cli SLOWLOG GET 10
   ```

### Application Monitoring

Both services include built-in logging:

```javascript
// Check service status
const redisStats = await RedisService.getStats();
console.log('Redis/Valkey Stats:', redisStats);

const queueStats = await ValkeyJobQueue.getStats();
console.log('Job Queue Stats:', queueStats);
```

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to Valkey
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution**:
1. Check Valkey is running: `ps aux | grep valkey`
2. Check port: `netstat -an | grep 6379`
3. Verify firewall rules
4. Check `VALKEY_URL` / `REDIS_URL` environment variable

### Authentication Failures

**Problem**: Authentication required
```
Error: NOAUTH Authentication required
```

**Solution**:
```env
# Add password to connection URL
VALKEY_URL=redis://:your-password@localhost:6379
```

### Memory Issues

**Problem**: Out of memory
```
Error: OOM command not allowed when used memory > 'maxmemory'
```

**Solution**:
1. Increase maxmemory in `valkey.conf`
2. Set eviction policy: `maxmemory-policy allkeys-lru`
3. Clear old data: Review TTL values in RedisService

## Environment Variables Summary

```env
# Valkey/Redis Connection (choose one approach)

# Approach 1: Valkey-specific (recommended for new deployments)
VALKEY_URL=redis://localhost:6379
# or with auth:
VALKEY_URL=redis://:password@localhost:6379
# or TLS (ElastiCache):
VALKEY_URL=rediss://valkey-cluster.xxxxx.amazonaws.com:6379

# Approach 2: Redis-compatible (for existing deployments)
REDIS_URL=redis://localhost:6379

# Optional: Disable caching entirely (dev/testing)
DISABLE_REDIS=false

# Job Queue Settings
USE_VALKEY_QUEUE=true
JOB_CONCURRENCY=5
```

## Best Practices

1. **Use Connection Pooling**: Already implemented in both services via `ioredis`
2. **Set Appropriate TTLs**: Use `RedisService.TTL` constants for consistency
3. **Monitor Memory**: Set `maxmemory` and eviction policy
4. **Enable Persistence**: Use AOF for job queue data (critical)
5. **Use TLS in Production**: Always use `rediss://` protocol in production
6. **Implement Graceful Shutdown**: Already implemented in ValkeyJobQueue
7. **Regular Backups**: Use Valkey's RDB snapshots for disaster recovery

## Migration Checklist

- [ ] Install Valkey (Docker/native/cloud)
- [ ] Configure persistence (AOF + RDB)
- [ ] Set security (password, rename dangerous commands)
- [ ] Update environment variables
- [ ] Test connection with `test-valkey-connection.js`
- [ ] Monitor application logs for Redis/Valkey errors
- [ ] Run load tests to verify performance
- [ ] Setup monitoring (CloudWatch/Datadog/etc)
- [ ] Configure automated backups
- [ ] Document connection details in team wiki
- [ ] (Optional) Migrate existing Redis data
- [ ] (Optional) Decommission old Redis instance

## Resources

- **Valkey Official Site**: https://valkey.io/
- **Valkey GitHub**: https://github.com/valkey-io/valkey
- **AWS ElastiCache Valkey**: https://aws.amazon.com/elasticache/valkey/
- **Valkey Docker Images**: https://hub.docker.com/r/valkey/valkey
- **Community**: https://github.com/valkey-io/valkey/discussions

## Need Help?

The Wayfarian codebase is already Valkey-ready. If you encounter issues:

1. Check logs: `tail -f server/logs/app.log`
2. Verify environment variables: `echo $VALKEY_URL`
3. Test direct connection: `valkey-cli ping`
4. Review this guide's troubleshooting section
5. Check Valkey GitHub issues: https://github.com/valkey-io/valkey/issues
