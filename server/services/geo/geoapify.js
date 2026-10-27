// server/services/geo/geoapify.js
// Geoapify provider (OpenStreetMap data). Free plan: 3,000 credits/day, 5 requests/second.
// Costs: autocomplete 1 credit, places 1 credit per 20 results, geocode 1, routing 1 per leg.
// IDs carry the coordinates ("geo:lat,lng:placeId"), so a tapped suggestion needs no details call.

const axios = require('axios');
const { GeoError, fromAxios, haversineKm, encodePolyline, formatKm, formatMin } = require('./normalize');

const BASE = 'https://api.geoapify.com';

// Google place types the app sends → Geoapify categories.
const CATEGORIES = {
  gas_station: 'service.vehicle.fuel',
  hospital: 'healthcare.hospital',
  restaurant: 'catering.restaurant,catering.fast_food',
  lodging: 'accommodation',
  atm: 'service.financial.atm',
  bank: 'service.financial.bank',
  pharmacy: 'healthcare.pharmacy',
  police: 'service.police',
  car_repair: 'service.vehicle.repair',
  tourist_attraction: 'tourism.attraction,tourism.sights',
  shopping_mall: 'commercial.shopping_mall',
  supermarket: 'commercial.supermarket',
  convenience_store: 'commercial.convenience',
  point_of_interest: 'tourism.attraction,catering.restaurant,service.vehicle.fuel,commercial.shopping_mall',
};

// App travel modes → Geoapify routing modes.
const MODES = { driving: 'drive', motorcycle: 'motorcycle', bicycling: 'bicycle', walking: 'walk' };

// Geoapify instruction types → Google-style maneuver names the app's turn icons understand.
const MANEUVERS = {
  Left: 'turn-left', SharpLeft: 'turn-sharp-left', SlightLeft: 'turn-slight-left',
  Right: 'turn-right', SharpRight: 'turn-sharp-right', SlightRight: 'turn-slight-right',
  TurnAroundLeft: 'uturn-left', TurnAroundRight: 'uturn-right',
  StayLeft: 'fork-left', ExitLeft: 'ramp-left', MergeLeft: 'merge',
  StayRight: 'fork-right', ExitRight: 'ramp-right', MergeRight: 'merge',
  Merge: 'merge', Roundabout: 'roundabout-right', Straight: 'straight',
};

const makeId = (lat, lon, placeId) => `geo:${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}:${placeId || ''}`;

/** Parses a "geo:" id back into coordinates. */
function parseId(id) {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?):?(.*)$/.exec(String(id));
  return m ? { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]), placeId: m[3] || null } : null;
}

const validLimit = (v) => (Number.isFinite(v) && v >= 5 && v <= 200 ? Math.round(v) : null);

/**
 * Turns Geoapify's route steps into one step per manoeuvre. With route details on, Geoapify also
 * splits the route wherever a road attribute (such as the speed limit) changes, and those pieces
 * have no instruction. They belong to the manoeuvre before them: they extend its distance and where
 * it ends, and the limit it carries is the one that holds for most of its length. Left as they
 * were, they would show up as blank turn cards.
 * Geoapify's docs do not state the unit of speed_limit; with the default (metric) request it is km/h.
 */
function buildSteps(raw, points) {
  const last = points.length - 1;
  const steps = [];
  let metresByLimit = null; // limit -> metres, for the manoeuvre being built

  const settle = () => {
    if (!steps.length || !metresByLimit) return;
    let best = null;
    for (const [limit, metres] of metresByLimit) if (!best || metres > best.metres) best = { limit, metres };
    steps[steps.length - 1].speedLimitKmh = best ? best.limit : null;
  };

  for (const s of raw) {
    const text = s.instruction?.text;
    const end = points[Math.min(last, s.to_index ?? last)];
    const metres = s.distance ?? 0;
    const limit = validLimit(s.speed_limit);
    if (text || !steps.length) {
      settle();
      steps.push({
        instruction: text || 'Continue',
        maneuver: MANEUVERS[s.instruction?.type] || null,
        distanceM: metres,
        end,
        speedLimitKmh: null,
      });
      metresByLimit = new Map();
    } else {
      const prev = steps[steps.length - 1];
      prev.distanceM += metres;
      prev.end = end;
    }
    if (limit != null) metresByLimit.set(limit, (metresByLimit.get(limit) || 0) + metres);
  }
  settle();
  return steps;
}

class GeoapifyProvider {
  constructor(apiKey = process.env.GEOAPIFY_API_KEY) {
    this.name = 'geoapify';
    this.apiKey = apiKey;
    this.http = axios.create({ baseURL: BASE, timeout: 6000 });
  }

  get configured() {
    return !!this.apiKey;
  }

  async get(path, params) {
    if (!this.apiKey) throw new GeoError('NOT_CONFIGURED', 'GEOAPIFY_API_KEY is not set');
    try {
      const res = await this.http.get(path, { params: { ...params, apiKey: this.apiKey } });
      return res.data;
    } catch (err) {
      throw fromAxios('geoapify', err);
    }
  }

  /** Credits a call will use, for the daily budget. */
  credits(op, args = {}) {
    if (op === 'nearby') return Math.max(1, Math.ceil((args.limit || 20) / 20));
    if (op === 'details') return 0; // answered from the id, no request made
    if (op === 'directions') return 2; // route_details (for speed limits) adds a credit per leg
    return 1;
  }

  canHandle(op, args) {
    if (op === 'details') return String(args.placeId).startsWith('geo:');
    if (op === 'nearby') return !!CATEGORIES[args.type];
    return true;
  }

  async autocomplete({ input, latitude, longitude }) {
    const params = { text: input, limit: 6, format: 'json' };
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) params.bias = `proximity:${longitude},${latitude}`;
    const data = await this.get('/v1/geocode/autocomplete', params);
    const results = data?.results ?? [];
    if (!results.length) throw new GeoError('NO_RESULTS', 'geoapify: no predictions');
    return results.map((r) => {
      const id = makeId(r.lat, r.lon, r.place_id);
      const main = r.name || r.address_line1 || r.formatted;
      const secondary = r.name ? r.address_line2 || r.formatted : r.address_line2;
      return {
        id,
        placeId: id,
        description: [main, secondary].filter(Boolean).join(', ') || r.formatted,
        structured: { main_text: main, secondary_text: secondary },
        types: [r.result_type, r.category].filter(Boolean),
        // Kept server-side so details for this id are free; stripped before the response.
        _details: {
          id,
          name: main,
          address: r.formatted,
          location: { latitude: r.lat, longitude: r.lon },
          photos: [],
        },
      };
    });
  }

  async nearby({ latitude, longitude, type, radius }) {
    const data = await this.get('/v2/places', {
      categories: CATEGORIES[type],
      filter: `circle:${longitude},${latitude},${radius}`,
      bias: `proximity:${longitude},${latitude}`,
      limit: 20,
    });
    const features = data?.features ?? [];
    if (!features.length) throw new GeoError('NO_RESULTS', 'geoapify: no places');
    return features
      .map((f) => f.properties || {})
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .map((p) => ({
        id: makeId(p.lat, p.lon, p.place_id),
        name: p.name || p.address_line1,
        vicinity: p.address_line2 || p.formatted,
        location: { latitude: p.lat, longitude: p.lon },
        rating: undefined,
        priceLevel: undefined,
        types: p.categories || [],
        openNow: undefined,
        photos: [],
        distance: haversineKm(latitude, longitude, p.lat, p.lon),
      }));
  }

  /** Details for a "geo:" id. The id itself holds the coordinates, so this costs nothing. */
  async details({ placeId }) {
    const parsed = parseId(placeId);
    if (!parsed) throw new GeoError('NO_RESULTS', 'geoapify: bad place id');
    return { id: placeId, name: undefined, address: undefined, location: { latitude: parsed.latitude, longitude: parsed.longitude }, photos: [] };
  }

  async geocode({ address }) {
    const data = await this.get('/v1/geocode/search', { text: address, limit: 1, format: 'json' });
    const r = data?.results?.[0];
    if (!r) throw new GeoError('NO_RESULTS', 'geoapify: address not found');
    return {
      location: { latitude: r.lat, longitude: r.lon },
      formattedAddress: r.formatted,
      addressComponents: [],
      placeId: makeId(r.lat, r.lon, r.place_id),
    };
  }

  async reverseGeocode({ latitude, longitude }) {
    const data = await this.get('/v1/geocode/reverse', { lat: latitude, lon: longitude, limit: 1, format: 'json' });
    const r = data?.results?.[0];
    if (!r) throw new GeoError('NO_RESULTS', 'geoapify: no address here');
    return { formattedAddress: r.formatted, addressComponents: [], placeId: makeId(r.lat, r.lon, r.place_id), types: [r.result_type].filter(Boolean) };
  }

  async directions({ origin, destination, mode }) {
    const data = await this.get('/v1/routing', {
      waypoints: `${origin.latitude},${origin.longitude}|${destination.latitude},${destination.longitude}`,
      mode: MODES[mode] || 'drive',
      // instruction_details: maneuver types; route_details: the posted speed limit of each step.
      details: 'instruction_details,route_details',
      format: 'json',
    });
    const route = data?.results?.[0];
    const leg = route?.legs?.[0];
    // JSON format: geometry is one array of {lat, lon} per leg.
    const geom = Array.isArray(route?.geometry?.[0]) ? route.geometry[0] : route?.geometry;
    if (!route || !leg || !Array.isArray(geom) || geom.length < 2) throw new GeoError('NO_RESULTS', 'geoapify: no route');
    const points = geom.map((p) => ({ latitude: p.lat, longitude: p.lon }));
    const steps = buildSteps(leg.steps ?? [], points);
    return {
      distance: { text: formatKm(route.distance), value: route.distance },
      duration: { text: formatMin(route.time), value: Math.round(route.time) },
      startAddress: undefined,
      endAddress: undefined,
      polyline: encodePolyline(points),
      steps,
    };
  }
}

module.exports = { GeoapifyProvider, parseId, CATEGORIES, buildSteps };
