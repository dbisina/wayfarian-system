#!/usr/bin/env node
// Backfills legacy Journey / JourneyInstance rows into the v2 ride tables.
//
//   node scripts/backfill-v2.js                       dry run (reads only), writes a report
//   node scripts/backfill-v2.js --user <id>           dry run for one user
//   node scripts/backfill-v2.js --limit 50            first 50 users only
//   BACKFILL_CONFIRM_HOST=<db host> node scripts/backfill-v2.js --apply
//
// --apply writes, and only runs if BACKFILL_CONFIRM_HOST equals the database host in
// DATABASE_URL, so a stray shell cannot backfill the wrong database. Read the dry-run report
// first. Re-running --apply is safe: finished rides are skipped.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function dbHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function main() {
  const apply = flag('apply');
  const host = dbHost(process.env.DATABASE_URL);
  if (!host) throw new Error('DATABASE_URL is not set or not a URL');

  if (apply && process.env.BACKFILL_CONFIRM_HOST !== host) {
    console.error(`Refusing to write. Database host is "${host}".`);
    console.error('Set BACKFILL_CONFIRM_HOST to that exact host to confirm this is the database you mean.');
    process.exit(2);
  }

  const prisma = require('../prisma/client');
  const { createRideService } = require('../services/RideService');
  const { createBackfill } = require('../services/backfillV2');

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} against ${host}`);
  const rideService = createRideService({ prisma });
  const backfill = createBackfill({ prisma, rideService, log: flag('verbose') ? console.log : () => {} });
  const limit = value('limit') ? parseInt(value('limit'), 10) : undefined;
  const report = await backfill.run({ apply, userId: value('user'), limit });

  const out = path.resolve(value('out') || `backfill-report-${apply ? 'apply' : 'dry'}-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  const t = report.totals;
  console.log(`\nUsers: ${t.users}   flagged (>20% distance change): ${t.bigChange}`);
  console.log(`Rides: ${t.recomputed} recomputed from GPS, ${t.legacy} kept legacy totals, ${t.skipped} skipped as impossible`);
  console.log(`Total distance: ${t.oldDistanceKm} km (v1) -> ${t.newDistanceKm} km (v2)`);
  if (apply) console.log(`Ride failures: ${t.failures}`);
  const worst = [...report.users].sort((a, b) => Math.abs(b.distancePct) - Math.abs(a.distancePct)).slice(0, 10);
  console.log('\nLargest changes:');
  for (const u of worst) {
    console.log(`  ${u.userId}  ${u.old.distanceKm.toFixed(1)} km -> ${u.new.distanceKm.toFixed(1)} km  (${u.distancePct}%)  top ${u.old.topSpeedKmh.toFixed(0)} -> ${u.new.topSpeedKmh.toFixed(0)} km/h`);
  }
  console.log(`\nReport: ${out}`);

  if (apply) {
    try {
      const { createLeaderboardService } = require('../services/LeaderboardServiceV2');
      const { getRedis, closeRedis } = require('../services/redisV2');
      await createLeaderboardService({ redis: getRedis() }).invalidate();
      await closeRedis();
    } catch (err) {
      console.warn('Leaderboard cache invalidation failed (it will expire on its own):', err.message);
    }
  }
  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
