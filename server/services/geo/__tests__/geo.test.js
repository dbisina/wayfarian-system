// Provider chain: fallback, top-up, guards, caching. Providers are mocks; no network, no keys.

const { GeoService, mergePlaces } = require('..');
const { ProviderGuard } = require('../guard');
const { TtlCache } = require('../cache');
const { GeoError, encodePolyline, decodePolyline } = require('../normalize');
const { parseId } = require('../geoapify');

const place = (name, lat = 6.5, lng = 3.4) => ({ id: name, name, location: { latitude: lat, longitude: lng } });

function setup({ primary = {}, fallback = {}, guards = {} } = {}) {
  const mk = (name, impl) => ({
    name,
    configured: true,
    canHandle: () => true,
    credits: () => 1,
    nearby: jest.fn(impl.nearby || (async () => [])),
    autocomplete: jest.fn(impl.autocomplete || (async () => [])),
    geocode: jest.fn(impl.geocode || (async () => ({ formattedAddress: name }))),
    directions: jest.fn(impl.directions || (async () => ({ provider: name }))),
  });
  const a = mk('a', primary);
  const b = mk('b', fallback);
  const svc = new GeoService({
    providers: { a, b },
    guards: { a: guards.a || new ProviderGuard('a'), b: guards.b || new ProviderGuard('b') },
    cache: new TtlCache(100),
    chains: { places: ['a', 'b'], routes: ['a', 'b'] },
  });
  return { svc, a, b };
}

describe('GeoService chain', () => {
  test('falls back when the first provider is down', async () => {
    const { svc, b } = setup({ primary: { geocode: async () => { throw new GeoError('UNAVAILABLE', 'down'); } } });
    await expect(svc.geocode({ address: 'Lekki' })).resolves.toEqual({ formattedAddress: 'b' });
    expect(b.geocode).toHaveBeenCalledTimes(1);
  });

  test('tops up a thin list from the next provider and drops duplicates', async () => {
    const { svc } = setup({
      primary: { nearby: async () => [place('Total')] },
      fallback: { nearby: async () => [place('Total'), place('Mobil', 6.51), place('Oando', 6.52)] },
    });
    const out = await svc.nearby({ latitude: 6.5, longitude: 3.4, type: 'gas_station', radius: 5000 });
    expect(out.map((p) => p.name).sort()).toEqual(['Mobil', 'Oando', 'Total']);
  });

  test('a full answer from the first provider skips the second', async () => {
    const { svc, b } = setup({ primary: { nearby: async () => [place('A'), place('B', 6.6), place('C', 6.7)] } });
    await svc.nearby({ latitude: 6.5, longitude: 3.4, type: 'gas_station', radius: 5000 });
    expect(b.nearby).not.toHaveBeenCalled();
  });

  test('nothing anywhere is an empty list, not an error', async () => {
    const { svc } = setup();
    await expect(svc.nearby({ latitude: 1, longitude: 1, type: 'atm', radius: 1000 })).resolves.toEqual([]);
  });

  test('every provider failing is UNAVAILABLE', async () => {
    const down = async () => { throw new GeoError('UNAVAILABLE', 'down'); };
    const { svc } = setup({ primary: { directions: down }, fallback: { directions: down } });
    await expect(
      svc.directions({ origin: { latitude: 0, longitude: 0 }, destination: { latitude: 1, longitude: 1 } })
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });

  test('a provider over its daily budget is skipped', async () => {
    const { svc, a, b } = setup({ guards: { a: new ProviderGuard('a', { dailyBudget: 0 }) } });
    await svc.geocode({ address: 'x' });
    expect(a.geocode).not.toHaveBeenCalled();
    expect(b.geocode).toHaveBeenCalled();
  });

  test('a rate-limited provider rests, so the next calls go straight to the fallback', async () => {
    const { svc, a } = setup({ primary: { geocode: async () => { throw new GeoError('RATE_LIMITED', '429'); } } });
    await svc.geocode({ address: 'one' });
    await svc.geocode({ address: 'two' });
    expect(a.geocode).toHaveBeenCalledTimes(1);
  });

  test('repeat and concurrent lookups hit the provider once', async () => {
    const { svc, a } = setup();
    await Promise.all([svc.geocode({ address: 'Ikeja' }), svc.geocode({ address: 'ikeja ' })]);
    await svc.geocode({ address: 'IKEJA' });
    expect(a.geocode).toHaveBeenCalledTimes(1);
  });

  test('autocomplete strips internal fields and makes the tap free', async () => {
    const id = 'geo:6.500000,3.400000:abc';
    const { svc, a, b } = setup({
      primary: {
        autocomplete: async () => [
          { id, placeId: id, description: 'Cafe', _details: { id, name: 'Cafe', location: { latitude: 6.5, longitude: 3.4 } } },
          { id: 'x2', placeId: 'x2', description: 'Two' },
          { id: 'x3', placeId: 'x3', description: 'Three' },
        ],
      },
    });
    const preds = await svc.autocomplete({ input: 'caf', latitude: 6.5, longitude: 3.4 });
    expect(preds[0]._details).toBeUndefined();
    a.details = jest.fn();
    b.details = jest.fn();
    await expect(svc.details({ placeId: id })).resolves.toMatchObject({ name: 'Cafe' });
    expect(a.details).not.toHaveBeenCalled();
    expect(b.details).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  test('polyline round-trips', () => {
    const pts = [{ latitude: 6.52437, longitude: 3.37921 }, { latitude: 6.6018, longitude: 3.3515 }, { latitude: -1.2, longitude: 36.8 }];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
  });

  test('geo ids carry their coordinates', () => {
    expect(parseId('geo:6.524370,3.379210:51ab')).toEqual({ latitude: 6.52437, longitude: 3.37921, placeId: '51ab' });
    expect(parseId('ChIJabc')).toBeNull();
  });

  test('mergePlaces keeps same-named places far apart', () => {
    const out = mergePlaces([place('Shell', 6.5, 3.4)], [place('Shell', 6.6, 3.4)]);
    expect(out).toHaveLength(2);
  });
});
