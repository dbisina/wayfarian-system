const { SpeedLimitService, parseMaxspeed, pickLimit } = require('../speedLimit');
const { ProviderGuard } = require('../guard');
const { TtlCache } = require('../cache');
const { GeoapifyProvider } = require('../geoapify');

describe('parseMaxspeed', () => {
  test.each([
    ['100', 100],
    ['60 mph', 97],
    ['50 km/h', 50],
    ['80;60', 80],
    ['none', null],
    ['walk', null],
    ['NG:urban', null],
    ['', null],
    [undefined, null],
    ['999', null],
    ['2', null],
  ])('%s -> %s', (raw, expected) => {
    expect(parseMaxspeed(raw)).toBe(expected);
  });
});

describe('pickLimit', () => {
  const way = (kmh, lat, lon) => ({ tags: { maxspeed: String(kmh) }, center: { lat, lon } });

  test('takes the way whose middle is nearest the point', () => {
    expect(pickLimit([way(60, 6.502, 3.4), way(100, 6.5001, 3.4)], 6.5, 3.4)).toBe(100);
  });

  test('skips ways with no usable limit or no position', () => {
    expect(pickLimit([{ tags: { maxspeed: 'none' }, center: { lat: 6.5, lon: 3.4 } }, { tags: { maxspeed: '80' } }], 6.5, 3.4)).toBeNull();
    expect(pickLimit([], 6.5, 3.4)).toBeNull();
  });
});

describe('SpeedLimitService', () => {
  const ok = (kmh) => ({ data: { elements: [{ tags: { maxspeed: String(kmh) }, center: { lat: 6.5, lon: 3.4 } }] } });
  const build = (post, guard = new ProviderGuard('t', { ratePerSec: 100 })) => {
    const http = { post: jest.fn(post) };
    return { http, svc: new SpeedLimitService({ http, cache: new TtlCache(50), guard, endpoint: 'https://overpass.test' }) };
  };

  test('looks a limit up once for riders in the same cell', async () => {
    const { svc, http } = build(async () => ok(100));
    await expect(svc.lookup(6.5, 3.4)).resolves.toEqual({ kmh: 100 });
    await expect(svc.lookup(6.5003, 3.4002)).resolves.toEqual({ kmh: 100 });
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  test('"no limit tagged here" is remembered too, so the service is not asked again', async () => {
    const { svc, http } = build(async () => ({ data: { elements: [] } }));
    await expect(svc.lookup(6.5, 3.4)).resolves.toEqual({ kmh: null });
    await svc.lookup(6.5, 3.4);
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  test('a failure answers "unknown" and is not remembered, so the next ride tries again', async () => {
    let calls = 0;
    const { svc } = build(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return ok(80);
    });
    await expect(svc.lookup(6.5, 3.4)).resolves.toEqual({ kmh: null });
    await expect(svc.lookup(6.5, 3.4)).resolves.toEqual({ kmh: 80 });
  });

  test('a rate-limited reply rests the service so later lookups skip the network', async () => {
    const err = Object.assign(new Error('429'), { response: { status: 429 } });
    const { svc, http } = build(async () => { throw err; });
    await svc.lookup(1, 1);
    await expect(svc.lookup(2, 2)).resolves.toEqual({ kmh: null });
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  test('sends the query as a form field to the configured endpoint', async () => {
    const { svc, http } = build(async () => ok(60));
    await svc.lookup(6.5, 3.4);
    const [url, body] = http.post.mock.calls[0];
    expect(url).toBe('https://overpass.test');
    expect(decodeURIComponent(body)).toContain('way(around:25,6.500000,3.400000)[highway][maxspeed]');
  });
});

describe('Geoapify route step limits', () => {
  test('carries each step’s speed limit and asks for route details', async () => {
    const provider = new GeoapifyProvider('key');
    let asked;
    provider.get = async (path, params) => {
      asked = params;
      return {
        results: [{
          distance: 1000, time: 60,
          geometry: [[{ lat: 6.5, lon: 3.4 }, { lat: 6.51, lon: 3.4 }, { lat: 6.52, lon: 3.4 }]],
          legs: [{ steps: [
            { distance: 600, to_index: 1, speed_limit: 80, instruction: { text: 'Head north', type: 'Straight' } },
            { distance: 400, to_index: 2, speed_limit: 0, instruction: { text: 'Arrive', type: 'DestinationReached' } },
          ] }],
        }],
      };
    };
    const route = await provider.directions({ origin: { latitude: 6.5, longitude: 3.4 }, destination: { latitude: 6.52, longitude: 3.4 }, mode: 'driving' });
    expect(asked.details).toBe('instruction_details,route_details');
    expect(route.steps.map((s) => s.speedLimitKmh)).toEqual([80, null]);
  });

  test('a directions call now costs two credits (route details add one)', () => {
    expect(new GeoapifyProvider('k').credits('directions')).toBe(2);
    expect(new GeoapifyProvider('k').credits('autocomplete')).toBe(1);
  });
});

describe('SpeedLimitService with several Overpass servers', () => {
  const ok = (kmh) => ({ data: { elements: [{ tags: { maxspeed: String(kmh) }, center: { lat: 6.5, lon: 3.4 } }] } });
  const busy = Object.assign(new Error('502'), { response: { status: 502 } });

  test('moves on to the next server when one is at capacity', async () => {
    const http = { post: jest.fn(async (url) => { if (url.includes('first')) throw busy; return ok(80); }) };
    const svc = new SpeedLimitService({ http, cache: new TtlCache(10), guard: new ProviderGuard('t', { ratePerSec: 100 }), endpoints: ['https://first.test', 'https://second.test'] });
    await expect(svc.lookup(6.5, 3.4)).resolves.toEqual({ kmh: 80 });
    expect(http.post.mock.calls.map((c) => c[0])).toEqual(['https://first.test', 'https://second.test']);
  });

  test('every server failing is one failure and answers "unknown"', async () => {
    const http = { post: jest.fn(async () => { throw busy; }) };
    const guard = new ProviderGuard('t', { ratePerSec: 100 });
    const svc = new SpeedLimitService({ http, cache: new TtlCache(10), guard, endpoints: ['https://a.test', 'https://b.test', 'https://c.test'] });
    await expect(svc.lookup(6.5, 3.4)).resolves.toEqual({ kmh: null });
    expect(http.post).toHaveBeenCalledTimes(3);
    expect(guard.stats().errors).toBe(1);
  });
});

describe('Geoapify buildSteps', () => {
  const { buildSteps } = require('../geoapify');
  const pts = Array.from({ length: 10 }, (_, i) => ({ latitude: 6 + i * 0.01, longitude: 3 }));
  const text = (t, type) => ({ text: t, type });

  test('pieces with no instruction extend the manoeuvre before them instead of becoming blank cards', () => {
    const steps = buildSteps(
      [
        { distance: 100, to_index: 2, speed_limit: 50, instruction: text('Head north.', 'StartAt') },
        { distance: 400, to_index: 5, speed_limit: 50, instruction: text('Turn left onto Admiralty Way.', 'Left') },
        { distance: 30, to_index: 6, speed_limit: 50 },
        { distance: 900, to_index: 9, speed_limit: 100 },
      ],
      pts
    );
    expect(steps.map((s) => s.instruction)).toEqual(['Head north.', 'Turn left onto Admiralty Way.']);
    expect(steps[1].distanceM).toBe(1330);
    expect(steps[1].end).toEqual(pts[9]);
    expect(steps[1].maneuver).toBe('turn-left');
  });

  test('the step carries the limit that holds for most of its length', () => {
    const steps = buildSteps(
      [
        { distance: 400, to_index: 3, speed_limit: 50, instruction: text('Merge onto the expressway.', 'Merge') },
        { distance: 5000, to_index: 9, speed_limit: 100 },
      ],
      pts
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].speedLimitKmh).toBe(100);
  });

  test('a route that starts with an unlabelled piece still gets a first step, and unknown limits stay unknown', () => {
    const steps = buildSteps([{ distance: 50, to_index: 4 }, { distance: 80, to_index: 9, instruction: text('Turn right.', 'Right') }], pts);
    expect(steps.map((s) => s.instruction)).toEqual(['Continue', 'Turn right.']);
    expect(steps[0].speedLimitKmh).toBeNull();
  });
});
