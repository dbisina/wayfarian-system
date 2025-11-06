# Database Connection Fix Guide

## Problem Summary
Your server was experiencing connection errors to the Render PostgreSQL database:
- **Error 10054**: Connection forcibly closed by remote host
- **ENOTFOUND**: Network connectivity issues
- Connection pool exhaustion
- Geographic latency (Frankfurt region)

## What We Fixed

### 1. Added Connection Pooling Parameters
Updated `server/.env` with optimized connection parameters:
```env
DATABASE_URL="postgresql://wayfarian_user:***@dpg-d44ih72li9vc73bm35s0-a.frankfurt-postgres.render.com/wayfarian?sslmode=require&connection_limit=10&pool_timeout=20&connect_timeout=10"

DIRECT_URL="postgresql://wayfarian_user:***@dpg-d44ih72li9vc73bm35s0-a.frankfurt-postgres.render.com/wayfarian?sslmode=require&connection_limit=5&connect_timeout=10"
```

**Parameters explained:**
- `connection_limit=10`: Max 10 concurrent connections (prevents pool exhaustion)
- `pool_timeout=20`: Wait max 20 seconds for connection from pool
- `connect_timeout=10`: Timeout after 10 seconds if can't connect

### 2. Created Resilient Prisma Client
Created `server/utils/prismaClient.js` with:
- **Automatic retry logic**: Retries failed connections up to 3 times
- **Exponential backoff**: Waits longer between each retry
- **Connection pooling**: Reuses connections efficiently
- **Graceful shutdown**: Properly closes connections on server stop
- **Error detection**: Identifies connection errors vs other errors

### 3. Updated Prisma Schema
Modified `server/prisma/schema.prisma`:
- Added `previewFeatures = ["tracing"]` for better error visibility
- Removed duplicate generator blocks

### 4. Created Connection Test Script
Added `server/test-db-connection.js` to verify database connectivity before starting the server.

## How to Apply the Fix

### Step 1: Stop Your Server
Close all running server instances to unlock Prisma files.

### Step 2: Regenerate Prisma Client
```bash
cd server
npx prisma generate
```

### Step 3: Test Database Connection
```bash
node test-db-connection.js
```

You should see:
```
🔍 Testing database connection...
✅ Test 1: Basic connection
   ✓ Connected successfully
✅ Test 2: Simple query
   ✓ Query result: ...
✅ Test 3: Count users
   ✓ Total users: X
✅ Test 4: Connection info
   ✓ Connection info: ...
🎉 All tests passed! Database is working correctly.
```

### Step 4: Update Your Controllers (Optional but Recommended)
To use the new resilient Prisma client in your controllers, replace:

**Old way:**
```javascript
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
```

**New way:**
```javascript
const { getPrismaClient, withRetry } = require('../utils/prismaClient');
const prisma = getPrismaClient();
```

**Wrap critical queries with retry:**
```javascript
// Before
const group = await prisma.group.findUnique({ where: { id } });

// After
const group = await withRetry(() => 
  prisma.group.findUnique({ where: { id } })
);
```

### Step 5: Start Your Server
```bash
npm start
# or
node index.js
```

## How the Retry Logic Works

When a connection fails, the system will:
1. Detect if it's a connection error (vs a query error)
2. Log the retry attempt with error details
3. Wait 1 second × attempt number (1s, 2s, 3s)
4. Try to reconnect to the database
5. Retry the original operation
6. After 3 failures, throw the error to your controller

**Connection errors that trigger retry:**
- P1001: Can't reach database server
- P1002: Connection timeout
- P1008: Operations timeout
- ECONNREFUSED, ENOTFOUND, "forcibly closed"

**Other errors throw immediately** (no retry):
- Data validation errors
- Unique constraint violations
- SQL syntax errors

## Monitoring Database Health

### Check Render Dashboard
1. Go to https://dashboard.render.com
2. Navigate to your PostgreSQL database
3. Check:
   - **Status**: Should be "Available" not "Degraded"
   - **Active Connections**: Should be < connection limit
   - **Memory/CPU**: Should not be maxed out
   - **Logs**: Check for connection errors

### Check Server Logs
Look for these patterns:
- ✅ **Good**: "Connected successfully", "All tests passed"
- ⚠️ **Warning**: "Database connection failed (attempt X/3), retrying..."
- ❌ **Bad**: "Can't reach database server", "Connection timeout"

### Network Issues
If you see `ENOTFOUND maps.googleapis.com` or similar:
- This is a local network/DNS issue
- Check your internet connection
- Try flushing DNS: `ipconfig /flushdns` (Windows)
- May be temporary ISP issues

## Troubleshooting

### Issue: Still getting connection errors
**Possible causes:**
1. Database is down → Check Render dashboard
2. Connection limit reached → Increase connection_limit in DATABASE_URL
3. Network routing issue → Try from different network
4. Geographic latency → Consider Render region closer to you

**Solutions:**
- Upgrade Render plan for more connections
- Reduce background job frequency
- Add connection_limit to DATABASE_URL (already done)
- Use DIRECT_URL for migrations only

### Issue: Prisma generate fails
**Error:** "EPERM: operation not permitted"
**Solution:** Stop all server instances, then run `npx prisma generate`

### Issue: Test passes but server still fails
**Possible cause:** Too many concurrent connections from background jobs
**Solution:** Look at `server/jobs/workers.js` and reduce job frequency:
```javascript
// Reduce cleanup job frequency
cron.schedule('0 */6 * * *', ... // Run every 6 hours instead of 1 hour
```

## What's Changed in Your Codebase

### New Files:
- ✅ `server/utils/prismaClient.js` - Resilient Prisma client with retry logic
- ✅ `server/test-db-connection.js` - Database connection test script
- ✅ `DATABASE_CONNECTION_FIX.md` - This guide

### Modified Files:
- ✅ `server/.env` - Added connection pooling parameters
- ✅ `server/prisma/schema.prisma` - Fixed duplicate generators, added tracing

### No Changes Needed:
- Your controllers still work as-is (backward compatible)
- You can optionally migrate to use `withRetry()` for critical queries
- Background jobs will automatically benefit from retry logic once you update them

## Next Steps

1. **Immediate**: Stop server → regenerate Prisma client → restart server
2. **Short-term**: Monitor connection errors in logs
3. **Long-term**: Consider migrating critical queries to use `withRetry()`

## Performance Impact

**Before:**
- Single connection failure = request fails immediately
- No retry mechanism
- Connection pool issues = cascading failures

**After:**
- Automatic retry with backoff (3 attempts)
- Connection pooling prevents pool exhaustion
- More resilient to transient network issues
- Graceful degradation under load

**Trade-offs:**
- Slightly higher latency on failures (due to retries)
- More database connection overhead (connection pooling)
- Better reliability overall

---

## Testing Checklist

- [ ] Stop all server instances
- [ ] Run `npx prisma generate` successfully
- [ ] Run `node test-db-connection.js` - all tests pass
- [ ] Start server - no connection errors on startup
- [ ] Click "play button" - group journey starts successfully
- [ ] Check logs - no "Can't reach database" errors
- [ ] Monitor for 5-10 minutes - connections remain stable

## Success Criteria

You'll know it's working when:
1. ✅ Test script passes all 4 tests
2. ✅ Server starts without connection errors
3. ✅ Group journey "play button" works
4. ✅ No more "Error 10054" in logs
5. ✅ Health check shows "healthy" or "degraded" (not "down")

---

**Created:** November 5, 2025  
**Last Updated:** November 5, 2025  
**Status:** Ready to apply
