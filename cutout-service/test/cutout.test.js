'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const sharp = require('sharp');
const { preprocess, postprocess, subjectBox, MODEL_SIZE, NoSubjectError } = require('../cutout');
const { createApp } = require('../server');

const solid = (w, h, rgb) => sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toBuffer();

test('preprocess builds a 3 x 320 x 320 tensor and keeps the scaled-down photo', async () => {
  const pre = await preprocess(await solid(2000, 1000, { r: 200, g: 100, b: 50 }));
  assert.equal(pre.tensor.length, 3 * MODEL_SIZE * MODEL_SIZE);
  assert.equal(pre.width, 1024); // longest side capped
  assert.equal(pre.height, 512);
  assert.equal(pre.rgb.length, 1024 * 512 * 3);
  // brightest channel is red, so after scaling by the max it is 1.0 and standardised with the red mean/std
  assert.ok(Math.abs(pre.tensor[0] - (1 - 0.485) / 0.229) < 1e-3);
});

test('subjectBox finds the subject and pads it', () => {
  const w = 100, h = 80;
  const alpha = Buffer.alloc(w * h);
  for (let y = 20; y < 60; y++) for (let x = 30; x < 70; x++) alpha[y * w + x] = 255;
  const box = subjectBox(alpha, w, h);
  assert.ok(box.left <= 30 && box.left >= 26);
  assert.ok(box.left + box.width >= 70);
  assert.ok(Math.abs(box.coverage - 0.2) < 0.001);
  assert.equal(subjectBox(Buffer.alloc(w * h), w, h), null);
});

test('postprocess cuts out the masked side and crops to it', async () => {
  const width = 200, height = 100;
  const pre = await preprocess(await solid(width, height, { r: 30, g: 120, b: 200 }));
  // mask: right half is the subject
  const mask = new Float32Array(MODEL_SIZE * MODEL_SIZE);
  for (let y = 0; y < MODEL_SIZE; y++) for (let x = MODEL_SIZE / 2; x < MODEL_SIZE; x++) mask[y * MODEL_SIZE + x] = 1;
  const png = await postprocess(mask, pre);
  const meta = await sharp(png).metadata();
  assert.equal(meta.hasAlpha, true);
  assert.ok(meta.width < width, 'cropped to the subject');
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.ok(alphaAt(info.width - 5, Math.floor(info.height / 2)) > 240, 'subject is opaque');
});

test('postprocess rejects a mask with no subject', async () => {
  const pre = await preprocess(await solid(64, 64, { r: 1, g: 2, b: 3 }));
  await assert.rejects(postprocess(new Float32Array(MODEL_SIZE * MODEL_SIZE), pre), (e) => e instanceof NoSubjectError);
});

function serve(opts) {
  const server = http.createServer(createApp(opts));
  return new Promise((resolve) => server.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}
const post = (url, body, headers = {}) => fetch(`${url}/cutout`, { method: 'POST', body, headers });

test('rejects missing or wrong secrets and answers health', async () => {
  const { server, url } = await serve({ secret: 's3cret', getCutout: async () => async (b) => b });
  try {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await post(url, Buffer.from('x'))).status, 401);
    assert.equal((await post(url, Buffer.from('x'), { authorization: 'Bearer nope' })).status, 401);
    const ok = await post(url, Buffer.from('hello'), { authorization: 'Bearer s3cret' });
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), 'hello');
  } finally { server.close(); }
});

test('rejects oversize bodies and maps no_subject to 422', async () => {
  const { server, url } = await serve({
    secret: 's', maxBytes: 10,
    getCutout: async () => async () => { throw new NoSubjectError(); },
  });
  try {
    const big = await post(url, Buffer.alloc(100), { authorization: 'Bearer s' });
    assert.equal(big.status, 413);
    const none = await post(url, Buffer.from('tiny'), { authorization: 'Bearer s' });
    assert.equal(none.status, 422);
  } finally { server.close(); }
});

test('runs one photo at a time and turns requests away when the queue is full', async () => {
  let running = 0, peak = 0;
  const release = [];
  const getCutout = async () => async () => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => release.push(r));
    running--;
    return Buffer.from('png');
  };
  const { server, url } = await serve({ secret: 's', getCutout, maxQueue: 2 });
  try {
    const h = { authorization: 'Bearer s' };
    const a = post(url, Buffer.from('1'), h);
    const b = post(url, Buffer.from('2'), h);
    await new Promise((r) => setTimeout(r, 100));
    const c = await post(url, Buffer.from('3'), h);
    assert.equal(c.status, 503);
    while (release.length < 1) await new Promise((r) => setTimeout(r, 10));
    release.shift()();
    while (release.length < 1) await new Promise((r) => setTimeout(r, 10));
    release.shift()();
    assert.equal((await a).status, 200);
    assert.equal((await b).status, 200);
    assert.equal(peak, 1);
  } finally { server.close(); }
});
