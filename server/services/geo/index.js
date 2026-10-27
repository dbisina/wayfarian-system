// server/services/geo/index.js
// One entry point for places, addresses and routes. Each call goes cache → providers in order
// (Geoapify first by default, Google after). A provider is skipped while it is rate limited, over
// its daily budget or resting after errors, and a thin answer is topped up from the next one. The
// app gets the same response shape whichever provider answered.

const mapsService = require('../MapsService');
const { GeoapifyProvider } = require('./geoapify');
const { ProviderGuard } = require('./guard');
const { TtlCache, cell } = require('./cache');
const { GeoError, haversineKm } = require('./normalize');

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Google, behind the same interface as the other providers. */
const googleProvider = {
  name: 'google',
  get configured() {
    return !!mapsService.googleMapsApiKey;
  },
  credits: () => 1,
  canHandle: (op, args) => (op === 'details' ? !String(args.placeId).startsWith('geo:') : true),
  autocomplete: ({ input, latitude, longitude, radius, sessionToken }) =>
    mapsService.autocomplete(input, latitude, longitude, radius, sessionToken),
  nearby: ({ latitude, longitude, type, radius }) => mapsService.findNearbyPlaces(latitude, longitude, type, radius),
  details: ({ placeId, sessionToken }) => mapsService.getPlaceDetails(placeId, sessionToken),
  geocode: ({ address }) => mapsService.geocodeAddress(address),
  reverseGeocode: ({ latitude, longitude }) => mapsService.reverseGeocode(latitude, longitude),
  directions: ({ origin, destination, mode }) => mapsService.getDirections(origin, destination, mode),
};

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Lists shorter than this get topped up from the next provider.
const ENOUGH = { autocomplete: 3, nearby: 3 };

class GeoService {
  constructor({ providers, guards, cache, chains } = {}) {
    this.providers = providers || { geoapify: new GeoapifyProvider(), google: googleProvider };
    this.guards = guards || {
      // Free plan: 3,000 credits/day, 5 req/s. Keep a margin so a burst never earns a hard 429.
      geoapify: new ProviderGuard('geoapify', {
        ratePerSec: num(process.env.GEOAPIFY_RATE_PER_SEC, 4),
        dailyBudget: num(process.env.GEOAPIFY_DAILY_CREDITS, 2800),
      }),
      // A ceiling on paid calls; the maps routes are public, so this caps the worst-case bill.
      google: new ProviderGuard('google', { dailyBudget: num(process.env.GOOGLE_MAPS_DAILY_CAP, 1000) }),
    };
    this.cache = cache || new TtlCache(num(process.env.GEO_CACHE_ENTRIES, 5000));
    const parse = (raw, fallback) => (raw || fallback).split(',').map((s) => s.trim()).filter(Boolean);
    this.chains = chains || {
      places: parse(process.env.GEO_CHAIN_PLACES, 'geoapify,google'),
      routes: parse(process.env.GEO_CHAIN_ROUTES, 'geoapify,google'),
    };
  }

  chainFor(op) {
    return (op === 'directions' ? this.chains.routes : this.chains.places)
      .map((name) => this.providers[name])
      .filter(Boolean);
  }

  /** Runs `op` down the provider chain. List ops return [] for "nothing found"; others throw NO_RESULTS. */
  async run(op, args) {
    const isList = op in ENOUGH;
    let collected = [];
    let lastError = null;
    let sawNoResults = false;

    for (const provider of this.chainFor(op)) {
      if (!provider.configured || (provider.canHandle && !provider.canHandle(op, args))) continue;
      const guard = this.guards[provider.name];
      const credits = provider.credits ? provider.credits(op, args) : 1;
      if (guard && guard.blockReason(credits)) continue;
      try {
        const result = await provider[op](args);
        guard?.success(credits);
        if (!isList) return result;
        collected = mergePlaces(collected, result || []);
        if (collected.length >= ENOUGH[op]) return collected;
        if (!collected.length) sawNoResults = true;
      } catch (err) {
        if (err?.code === 'NO_RESULTS') {
          guard?.success(credits);
          sawNoResults = true;
        } else {
          guard?.failure(err);
          lastError = err;
          console.warn(`[geo] ${provider.name}.${op} failed: ${err?.code || ''} ${err?.message || err}`);
        }
      }
    }

    if (isList && (collected.length || sawNoResults)) return collected;
    if (sawNoResults) throw new GeoError('NO_RESULTS', 'Nothing found');
    throw new GeoError('UNAVAILABLE', lastError ? lastError.message : 'No map provider is available');
  }

  async autocomplete({ input, latitude, longitude, radius = 20000, sessionToken }) {
    const text = String(input).trim().toLowerCase().replace(/\s+/g, ' ');
    const hasPos = Number.isFinite(latitude) && Number.isFinite(longitude);
    const key = `ac:${text}:${hasPos ? cell(latitude, longitude, 2) : 'any'}`;
    const predictions = await this.cache.wrap(key, 10 * MIN, () =>
      this.run('autocomplete', { input: text, latitude, longitude, radius, sessionToken })
    );
    // Remember what a suggestion already knows, so tapping it needs no paid details call.
    return predictions.map(({ _details, ...p }) => {
      if (_details) this.cache.set(`pd:${p.placeId}`, _details, 7 * DAY);
      return p;
    });
  }

  async nearby({ latitude, longitude, type = 'point_of_interest', radius = 5000 }) {
    // ~1 km cells: riders a street apart share one lookup. Distances are worked out per request.
    const key = `nb:${type}:${radius}:${cell(latitude, longitude, 2)}`;
    const places = await this.cache.wrap(key, DAY, () => this.run('nearby', { latitude, longitude, type, radius }));
    return places
      .map((p) => ({ ...p, distance: haversineKm(latitude, longitude, p.location.latitude, p.location.longitude) }))
      .sort((a, b) => a.distance - b.distance);
  }

  details({ placeId, sessionToken }) {
    return this.cache.wrap(`pd:${placeId}`, 7 * DAY, () => this.run('details', { placeId, sessionToken }));
  }

  geocode({ address }) {
    const text = String(address).trim().toLowerCase();
    return this.cache.wrap(`gc:${text}`, 30 * DAY, () => this.run('geocode', { address }));
  }

  reverseGeocode({ latitude, longitude }) {
    return this.cache.wrap(`rg:${cell(latitude, longitude, 4)}`, 7 * DAY, () =>
      this.run('reverseGeocode', { latitude, longitude })
    );
  }

  directions({ origin, destination, mode = 'driving' }) {
    const key = `dir:${mode}:${cell(origin.latitude, origin.longitude, 4)}:${cell(destination.latitude, destination.longitude, 4)}`;
    return this.cache.wrap(key, 15 * MIN, () => this.run('directions', { origin, destination, mode }));
  }

  stats() {
    const providers = {};
    for (const [name, guard] of Object.entries(this.guards)) {
      providers[name] = { configured: !!this.providers[name]?.configured, ...guard.stats() };
    }
    return { chains: this.chains, providers, cache: this.cache.stats() };
  }
}

/** Adds `more` to `list`, dropping entries that are the same place (same name within ~60 m). */
function mergePlaces(list, more) {
  const out = [...list];
  for (const p of more) {
    const name = String(p.name || p.description || '').toLowerCase();
    const loc = p.location;
    const dupe = out.some((q) => {
      if (q.placeId && q.placeId === p.placeId) return true;
      const qName = String(q.name || q.description || '').toLowerCase();
      if (!name || qName !== name) return false;
      if (!loc || !q.location) return true;
      return haversineKm(loc.latitude, loc.longitude, q.location.latitude, q.location.longitude) < 0.06;
    });
    if (!dupe) out.push(p);
  }
  return out;
}

const geoService = new GeoService();

module.exports = { GeoService, geoService, googleProvider, mergePlaces };
