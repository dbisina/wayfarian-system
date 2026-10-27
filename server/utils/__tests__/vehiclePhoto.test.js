const sharp = require('sharp');
const { prepareVehiclePhotos } = require('../vehiclePhoto');

// A 3000x2000 landscape JPEG that a phone saved sideways: pixels 3000 wide, EXIF orientation 6
// ("rotate 90 degrees clockwise"), so it should be treated as 2000 wide x 3000 tall.
const sideways = () =>
  sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 120, g: 60, b: 30 } } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

const landscape = () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 10, g: 80, b: 140 } } }).jpeg().toBuffer();

describe('prepareVehiclePhotos', () => {
  test('stores a small copy and no large copy when there is no cut-out service', async () => {
    const out = await prepareVehiclePhotos(await landscape());
    const meta = await sharp(out.stored).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(533);
    expect(out.forCutout).toBeNull();
  });

  test('gives the cut-out service a larger copy, 1600 px on the long side', async () => {
    const out = await prepareVehiclePhotos(await landscape(), { forCutout: true });
    const big = await sharp(out.forCutout).metadata();
    expect(big.width).toBe(1600);
    expect(big.height).toBe(1067);
    const small = await sharp(out.stored).metadata();
    expect(small.width).toBe(800);
  });

  test('does not enlarge a photo that is already small', async () => {
    const tiny = await sharp({ create: { width: 500, height: 300, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const out = await prepareVehiclePhotos(tiny, { forCutout: true });
    expect((await sharp(out.stored).metadata()).width).toBe(500);
    expect((await sharp(out.forCutout).metadata()).width).toBe(500);
  });

  test('a photo saved sideways comes out upright in both copies', async () => {
    const out = await prepareVehiclePhotos(await sideways(), { forCutout: true });
    const small = await sharp(out.stored).metadata();
    const big = await sharp(out.forCutout).metadata();
    // Upright, the photo is taller than wide.
    expect(small.height).toBeGreaterThan(small.width);
    expect(big.height).toBeGreaterThan(big.width);
    expect(big.height).toBe(1600);
    expect(small.height).toBe(600);
  });
});
