'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { preprocess, postprocess, subjectBox, removeIslands, boxBlur, estimateForeground, NoSubjectError, OUT_SIDE } = require('../cutout');
const { MODELS, resolveModel } = require('../models');
const { createApp, ensureModel } = require('../server');

const ISNET = MODELS['isnet-general-use'];
const SILUETA = MODELS.silueta;
const solid = (w, h, rgb) => sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toBuffer();

/** A model-sized mask with a rectangle of 1s (x0..x1, y0..y1 as fractions of the side). */
function rectMask(size, x0, y0, x1, y1) {
  const m = new Float32Array(size * size);
  for (let y = Math.floor(y0 * size); y < Math.floor(y1 * size); y++) {
    for (let x = Math.floor(x0 * size); x < Math.floor(x1 * size); x++) m[y * size + x] = 1;
  }
  return m;
}

const alphaOf = async (png) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, info, at: (x, y) => data[(y * info.width + x) * 4 + 3] };
};

test('models: isnet is the default, silueta stays selectable, unknown names fail loudly', () => {
  assert.equal(resolveModel(undefined).name, 'isnet-general-use');
  assert.equal(resolveModel('silueta').size, 320);
  assert.equal(ISNET.size, 1024);
  assert.throws(() => resolveModel('nope'), /Unknown MODEL_NAME/);
});

test('preprocess builds a 3 x size x size tensor for each model and keeps the scaled-down photo', async () => {
  for (const model of [ISNET, SILUETA]) {
    const pre = await preprocess(await solid(2000, 1000, { r: 200, g: 100, b: 50 }), model);
    assert.equal(pre.size, model.size);
    assert.equal(pre.tensor.length, 3 * model.size * model.size);
    assert.equal(pre.width, 1600); // longest side capped at 1600
    assert.equal(pre.height, 800);
    assert.equal(pre.rgb.length, 1600 * 800 * 3);
  }
  // brightest channel is red, so after scaling by the max it is 1.0, then each model's own mean/std
  const pre = await preprocess(await solid(64, 64, { r: 200, g: 100, b: 50 }), ISNET);
  assert.ok(Math.abs(pre.tensor[0] - (1 - 0.5) / 1) < 1e-3);
  const old = await preprocess(await solid(64, 64, { r: 200, g: 100, b: 50 }), SILUETA);
  assert.ok(Math.abs(old.tensor[0] - (1 - 0.485) / 0.229) < 1e-3);
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
  const pre = await preprocess(await solid(width, height, { r: 30, g: 120, b: 200 }), SILUETA);
  const png = await postprocess(rectMask(SILUETA.size, 0.5, 0, 1, 1), pre);
  const meta = await sharp(png).metadata();
  assert.equal(meta.hasAlpha, true);
  assert.ok(meta.width < width, 'cropped to the subject');
  const { info, at } = await alphaOf(png);
  assert.ok(at(info.width - 5, Math.floor(info.height / 2)) > 240, 'subject is opaque');
});

test('postprocess rejects a mask with no subject', async () => {
  const pre = await preprocess(await solid(64, 64, { r: 1, g: 2, b: 3 }), SILUETA);
  await assert.rejects(postprocess(new Float32Array(SILUETA.size * SILUETA.size), pre), (e) => e instanceof NoSubjectError);
});

test('the edge is crisp: a hard-edged subject goes from clear to solid within a few pixels', async () => {
  const width = 600, height = 400;
  const pre = await preprocess(await solid(width, height, { r: 20, g: 90, b: 160 }), ISNET);
  // A model-sized mask with a rectangle whose edge is blurred over a few mask pixels, as a real model's is.
  const size = ISNET.size;
  const mask = new Float32Array(size * size);
  const edge = (v, lo, hi) => Math.min(1, Math.max(0, Math.min((v - lo) / 6, (hi - v) / 6)));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) mask[y * size + x] = Math.min(edge(x, 300, 780), edge(y, 200, 800));
  }
  const png = await postprocess(mask, pre);
  const { info, at } = await alphaOf(png);
  const y = Math.floor(info.height / 2);
  let soft = 0;
  for (let x = 0; x < info.width; x++) if (at(x, y) > 12 && at(x, y) < 243) soft++;
  assert.ok(soft <= 8, `edge band was ${soft}px`);
});

test('stray specks are removed but a second real part of the subject stays', () => {
  const w = 400, h = 300;
  const alpha = Buffer.alloc(w * h);
  const fill = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) alpha[y * w + x] = 255; };
  fill(20, 100, 220, 200); // the main body
  fill(260, 120, 340, 190); // a detached part that is a fair share of the body (mirror, second wheel)
  fill(370, 20, 380, 30); // a speck
  removeIslands(alpha, w, h);
  assert.equal(alpha[150 * w + 100], 255);
  assert.equal(alpha[150 * w + 300], 255, 'real second part kept');
  assert.equal(alpha[25 * w + 375], 0, 'speck removed');
});

test('the background colour is pulled out of semi-transparent edge pixels', () => {
  // Red subject on the left, blue background on the right, and one edge column that is half and half.
  const w = 9, h = 3;
  const rgb = Buffer.alloc(w * h * 3);
  const alpha = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const [r, g, b, a] = x < 4 ? [255, 0, 0, 255] : x === 4 ? [128, 0, 128, 128] : [0, 0, 255, 0];
      rgb.set([r, g, b], i * 3);
      alpha[i] = a;
    }
  }
  const out = estimateForeground(rgb, alpha, w, h);
  const edge = (y) => ({ r: out[(y * w + 4) * 4], b: out[(y * w + 4) * 4 + 2] });
  assert.ok(edge(1).r > 200, `red was ${edge(1).r}`);
  assert.ok(edge(1).b < 60, `blue was ${edge(1).b}`);
  assert.equal(out[(1 * w + 1) * 4], 255, 'solid pixels keep the photo colour');
  assert.equal(out[(1 * w + 4) * 4 + 3], 128, 'alpha is untouched');
});

test('boxBlur keeps a flat plane flat and spreads a point evenly', () => {
  const flat = boxBlur(new Float32Array(25).fill(0.5), 5, 5, 1);
  assert.ok(flat.every((v) => Math.abs(v - 0.5) < 1e-6));
  const point = new Float32Array(81);
  point[4 * 9 + 4] = 9;
  const out = boxBlur(point, 9, 9, 1);
  assert.ok(Math.abs(out[4 * 9 + 4] - 1) < 1e-6);
  assert.ok(Math.abs(out.reduce((a, b) => a + b, 0) - 9) < 1e-4, 'total is kept');
});

test('output keeps the subject’s shape and never exceeds the output size', async () => {
  const pre = await preprocess(await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 90, g: 90, b: 90 } } }).jpeg().toBuffer(), SILUETA);
  const png = await postprocess(rectMask(SILUETA.size, 0.1, 0.25, 0.9, 0.75), pre);
  const meta = await sharp(png).metadata();
  assert.ok(Math.max(meta.width, meta.height) <= OUT_SIDE);
  assert.equal(Math.max(meta.width, meta.height), OUT_SIDE);
  // The subject is 80% of the width and 50% of the height of a 3:2 photo: wider than tall.
  assert.ok(meta.width / meta.height > 1.8 && meta.width / meta.height < 2.6, `ratio ${meta.width / meta.height}`);
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

// A tiny pretend model so the download path can be tested without 170 MB.
const fakeModel = (bytes, md5) => ({ name: 'fake', file: 'fake.onnx', url: 'https://example.test/fake.onnx', md5, minBytes: 100, size: 8, mean: [0, 0, 0], std: [1, 1, 1] });
const bodyOf = (buf) => ({ ok: true, status: 200, body: new Response(buf).body });
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cutout-model-')), 'fake.onnx');

test('a downloaded model is checked against its checksum before it is used', async () => {
  const bytes = crypto.randomBytes(2048);
  const md5 = crypto.createHash('md5').update(bytes).digest('hex');
  const dest = tmpFile();
  assert.equal(await ensureModel(fakeModel(bytes, md5), { fetchImpl: async () => bodyOf(bytes), dest }), dest);
  assert.equal(fs.statSync(dest).size, 2048);

  const bad = tmpFile();
  await assert.rejects(ensureModel(fakeModel(bytes, 'f'.repeat(32)), { fetchImpl: async () => bodyOf(bytes), dest: bad }), /checksum mismatch/);
  assert.equal(fs.existsSync(bad), false, 'a model that fails the check is not left in place');
  assert.equal(fs.existsSync(`${bad}.part`), false, 'and neither is the temp file');
});

test('a truncated download is rejected, and an existing good file is not downloaded again', async () => {
  const small = tmpFile();
  await assert.rejects(ensureModel(fakeModel(null, null), { fetchImpl: async () => bodyOf(Buffer.alloc(10)), dest: small }), /incomplete/);

  const have = tmpFile();
  fs.writeFileSync(have, Buffer.alloc(500));
  let fetched = false;
  await ensureModel(fakeModel(null, null), { fetchImpl: async () => { fetched = true; return bodyOf(Buffer.alloc(500)); }, dest: have });
  assert.equal(fetched, false);
});
