# Manual Migration Instructions

## When Local Connection Fails

If you see P1001 errors when running Prisma migrations, your network likely blocks Supabase. Follow these steps to apply the migration manually:

### Step 1: Open Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Log in and select your project: **bfuuqjswdtjyvmzlwhma**
3. Navigate to **SQL Editor** in the left sidebar

### Step 2: Run Complete Schema SQL

**IMPORTANT**: Your database is missing base tables. Use the complete schema:

1. Click **New Query**
2. Copy the entire contents of: `server/prisma/migrations/complete_schema.sql`
3. Paste into the SQL Editor
4. Click **Run** (or press Ctrl+Enter)

This creates ALL tables safely (won't fail if some already exist).

### Step 3: Verify

You should see a success message with "ride_events table created, row_count: 0"

If you see errors:
- **"relation already exists"**: Migration already ran, you're good!
- **"foreign key constraint"**: Check that `group_journeys`, `journey_instances`, and `users` tables exist

### Step 4: Update Prisma Client

Back in your local terminal:

```bash
cd server
npx prisma generate
```

This regenerates the Prisma client to recognize the new RideEvent model.

### Step 5: Restart and Test

```bash
# In server terminal
npm start

# In app terminal  
npm start
```

Open a group journey in the app → you should see the timeline button and message composer.

## Alternative: Use VPN or Hotspot

If you want to run migrations locally in the future:

- **Mobile Hotspot**: Connect your PC to your phone's hotspot (different network path)
- **VPN**: Use a VPN that doesn't block port 5432
- **Different Location**: Try from home/café with different ISP

## Verify Your Setup

After manual migration, test that it worked:

```bash
cd server
npx prisma db pull
```

This should update your local schema to match the database (no changes if migration succeeded).
