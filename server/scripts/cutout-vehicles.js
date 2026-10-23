// One-off: turns existing vehicle photos into transparent cut-outs through the cut-out service.
// Original photos are kept in storage (only the vehicle's photoURL changes), so nothing is lost if a
// cut-out looks wrong. Safe to run again: vehicles that already have a PNG cut-out are skipped.
//
//   node scripts/cutout-vehicles.js            dry run, lists what would be processed
//   node scripts/cutout-vehicles.js --apply    processes them
//
// Needs CUTOUT_URL and CUTOUT_SECRET (set on the server) and the Firebase storage variables.

const { v4: uuidv4 } = require('uuid');
const prisma = require('../prisma/client');
const { applyCutout } = require('../services/vehicleCutout');

async function main() {
  const apply = process.argv.includes('--apply');
  const vehicles = await prisma.vehicle.findMany({
    where: { photoURL: { not: null }, NOT: { photoURL: { contains: '.png' } } },
    select: { id: true, userId: true, name: true, photoURL: true },
  });
  console.log(`${vehicles.length} vehicle photo(s) without a cut-out${apply ? '' : ' (dry run, pass --apply to process)'}`);
  if (!apply) return vehicles.forEach((v) => console.log(` - ${v.id} ${v.name}`));

  if (!process.env.CUTOUT_URL) throw new Error('CUTOUT_URL is not set');
  const { uploadToStorage } = require('../services/Firebase');
  let done = 0;
  for (const v of vehicles) {
    try {
      const res = await fetch(v.photoURL);
      if (!res.ok) { console.log(`skip ${v.id}: photo not readable (${res.status})`); continue; }
      const jpeg = Buffer.from(await res.arrayBuffer());
      const ok = await applyCutout({
        prisma,
        storage: { upload: uploadToStorage, remove: async () => {} }, // keep the original files
        vehicleId: v.id,
        userId: v.userId,
        originalURL: v.photoURL,
        jpeg,
        newId: uuidv4,
      });
      console.log(`${ok ? 'done' : 'kept original'} ${v.id} ${v.name}`);
      if (ok) done++;
    } catch (e) {
      console.log(`failed ${v.id}: ${e.message}`);
    }
  }
  console.log(`${done} of ${vehicles.length} converted`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
