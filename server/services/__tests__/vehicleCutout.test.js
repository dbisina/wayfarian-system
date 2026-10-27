const { requestCutout, applyCutout } = require('../vehicleCutout');

const quiet = { warn: () => {} };
const res = (status, body = '') => ({ status, arrayBuffer: async () => Buffer.from(body) });

describe('requestCutout', () => {
  const opts = (fetchImpl) => ({ url: 'http://cutout.internal:3000/', secret: 's', fetchImpl, retryDelayMs: 1, log: quiet });

  test('does nothing when the service is not configured', async () => {
    const fetchImpl = jest.fn();
    expect(await requestCutout(Buffer.from('x'), { url: '', secret: '', fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('sends the photo with the secret and returns the png', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(res(200, 'PNG'));
    const out = await requestCutout(Buffer.from('jpg'), opts(fetchImpl));
    expect(out.toString()).toBe('PNG');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://cutout.internal:3000/cutout');
    expect(init.headers.authorization).toBe('Bearer s');
  });

  test('retries once when the service is waking up, then gives up', async () => {
    const waking = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(res(200, 'PNG'));
    expect((await requestCutout(Buffer.from('x'), opts(waking))).toString()).toBe('PNG');
    const down = jest.fn().mockRejectedValue(new Error('down'));
    expect(await requestCutout(Buffer.from('x'), opts(down))).toBeNull();
    expect(down).toHaveBeenCalledTimes(2);
  });

  test('does not retry when no subject was found or the secret is wrong', async () => {
    const none = jest.fn().mockResolvedValue(res(422));
    expect(await requestCutout(Buffer.from('x'), opts(none))).toBeNull();
    expect(none).toHaveBeenCalledTimes(1);
    const bad = jest.fn().mockResolvedValue(res(401));
    expect(await requestCutout(Buffer.from('x'), opts(bad))).toBeNull();
    expect(bad).toHaveBeenCalledTimes(1);
  });
});

describe('applyCutout', () => {
  const base = () => ({
    prisma: { vehicle: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } },
    storage: { upload: jest.fn().mockResolvedValue('https://cdn/v1.png'), remove: jest.fn().mockResolvedValue() },
    request: jest.fn().mockResolvedValue(Buffer.from('PNG')),
    vehicleId: 'v1', userId: 'u1', originalURL: 'https://cdn/v1.jpg', jpeg: Buffer.from('j'), newId: () => 'abc', log: quiet,
  });

  test('swaps in the cut-out only while the vehicle still shows the original photo', async () => {
    const a = base();
    expect(await applyCutout(a)).toBe(true);
    expect(a.storage.upload).toHaveBeenCalledWith(expect.any(Buffer), 'vehicles/u1/v1-abc.png', 'image/png');
    expect(a.prisma.vehicle.updateMany).toHaveBeenCalledWith({ where: { id: 'v1', photoURL: 'https://cdn/v1.jpg' }, data: { photoURL: 'https://cdn/v1.png' } });
    expect(a.storage.remove).toHaveBeenCalledWith('https://cdn/v1.jpg');
  });

  test('drops the cut-out when a newer photo was uploaded meanwhile', async () => {
    const a = base();
    a.prisma.vehicle.updateMany.mockResolvedValue({ count: 0 });
    expect(await applyCutout(a)).toBe(false);
    expect(a.storage.remove).toHaveBeenCalledWith('https://cdn/v1.png');
    expect(a.storage.remove).not.toHaveBeenCalledWith('https://cdn/v1.jpg');
  });

  test('keeps the original when there is no cut-out or storage fails', async () => {
    const none = base();
    none.request.mockResolvedValue(null);
    expect(await applyCutout(none)).toBe(false);
    expect(none.storage.upload).not.toHaveBeenCalled();
    const broken = base();
    broken.storage.upload.mockRejectedValue(new Error('storage down'));
    expect(await applyCutout(broken)).toBe(false);
    expect(broken.prisma.vehicle.updateMany).not.toHaveBeenCalled();
  });
});

describe('requestCutout timing', () => {
  test('gives the service 90 s per attempt, for the larger model and a cold start', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    const fetchImpl = jest.fn().mockResolvedValue({ status: 200, arrayBuffer: async () => Buffer.from('PNG') });
    await requestCutout(Buffer.from('x'), { url: 'http://c:3000', secret: 's', fetchImpl, retryDelayMs: 1, log: { warn: () => {} } });
    expect(spy).toHaveBeenCalledWith(90_000);
    spy.mockRestore();
  });
});
