// server/services/vehicleCutout.js
// Turns a vehicle's uploaded photo into a transparent cut-out. The work happens in a separate
// Railway service (cutout-service/) so the model never uses this server's memory or CPU. Anything
// that goes wrong leaves the original photo in place.

// The sharper model takes a few seconds per photo and the service loads it after a sleep, so one
// attempt gets 90 s before it is given up on.
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Sends a JPEG to the cut-out service and returns the PNG, or null if the service is not set up,
 * is busy or found no subject. One retry covers the service waking from sleep.
 */
async function requestCutout(jpeg, { url = process.env.CUTOUT_URL, secret = process.env.CUTOUT_SECRET, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch, retryDelayMs = 3000, log = console } = {}) {
  if (!url || !secret) return null;
  const endpoint = `${String(url).replace(/\/$/, '')}/cutout`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/octet-stream' },
        body: jpeg,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 200) return Buffer.from(await res.arrayBuffer());
      if (res.status === 422) return null; // no vehicle found: keep the photo as it is
      if (res.status !== 503) {
        log.warn?.(`[cutout] service answered ${res.status}`);
        return null;
      }
    } catch (err) {
      log.warn?.(`[cutout] request failed: ${err.message}`);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, retryDelayMs));
  }
  return null;
}

/**
 * Replaces a vehicle's photo with its cut-out. The swap only happens if the vehicle still shows the
 * photo that was sent, so a newer upload is never overwritten.
 */
async function applyCutout({ prisma, storage, request = requestCutout, vehicleId, userId, originalURL, jpeg, newId, log = console }) {
  try {
    const png = await request(jpeg);
    if (!png) return false;
    const url = await storage.upload(png, `vehicles/${userId}/${vehicleId}-${newId()}.png`, 'image/png');
    const res = await prisma.vehicle.updateMany({ where: { id: vehicleId, photoURL: originalURL }, data: { photoURL: url } });
    if (res.count === 0) {
      await storage.remove(url).catch(() => {}); // a newer photo won; drop the cut-out
      return false;
    }
    await storage.remove(originalURL).catch(() => {});
    return true;
  } catch (err) {
    log.warn?.(`[cutout] kept the original photo: ${err.message}`);
    return false;
  }
}

module.exports = { requestCutout, applyCutout };
