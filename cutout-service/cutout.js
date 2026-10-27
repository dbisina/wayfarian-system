'use strict';
// Background removal. The model (see models.js) produces a rough mask; this file turns it into a
// clean transparent PNG: a crisp edge, no stray blobs, no colour fringe from the old background.
// preprocess and postprocess are pure so they can be tested without the model.

const sharp = require('sharp');
const { MODELS, DEFAULT_MODEL } = require('./models');

const MAX_SIDE = 1600; // photos are scaled down to this before processing (the model sees its own size)
const OUT_SIDE = 1200; // longest side of the returned PNG
const MIN_COVERAGE = 0.02; // a mask covering less than 2% of the photo means no subject was found
const ISLAND_SHARE = 0.04; // a detached piece smaller than this share of the main subject is noise
const WORK_SIDE = 400; // size used to find the connected pieces of the subject

class NoSubjectError extends Error {
  constructor() {
    super('No subject found in the photo');
    this.code = 'no_subject';
  }
}

/** Decodes the photo (EXIF rotation applied), scales it down, and builds the model input. */
async function preprocess(input, model = MODELS[DEFAULT_MODEL]) {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const small = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .resize(model.size, model.size, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer();

  let max = 1;
  for (let i = 0; i < small.length; i++) if (small[i] > max) max = small[i];

  // NCHW float32, scaled by the brightest value and standardised, as the model was trained.
  const plane = model.size * model.size;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      tensor[c * plane + i] = (small[i * 3 + c] / max - model.mean[c]) / model.std[c];
    }
  }
  return { tensor, size: model.size, rgb: data, width: info.width, height: info.height };
}

/** Bounding box of the pixels that are clearly part of the subject, with a little padding. */
function subjectBox(alpha, width, height, threshold = 24) {
  let minX = width, minY = height, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > threshold) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = Math.round(Math.max(width, height) * 0.02);
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  return {
    left,
    top,
    width: Math.min(width, maxX + pad + 1) - left,
    height: Math.min(height, maxY + pad + 1) - top,
    coverage: count / (width * height),
  };
}

/**
 * Clears small detached pieces of the mask (specks, background bits the model half-liked) while
 * keeping every real part of the subject: a piece survives if it is at least ISLAND_SHARE of the
 * largest one, so a separate mirror or a second wheel stays. Works on a small copy to stay fast,
 * and edits `alpha` in place.
 */
function removeIslands(alpha, width, height) {
  const scale = Math.max(1, Math.max(width, height) / WORK_SIDE);
  const w = Math.max(1, Math.round(width / scale));
  const h = Math.max(1, Math.round(height / scale));
  const at = (x, y) => alpha[Math.min(height - 1, Math.floor(y * scale)) * width + Math.min(width - 1, Math.floor(x * scale))];

  const labels = new Int32Array(w * h); // 0 = background
  const sizes = [0];
  const stack = [];
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      if (labels[y0 * w + x0] || at(x0, y0) <= 96) continue;
      const id = sizes.length;
      sizes.push(0);
      labels[y0 * w + x0] = id;
      stack.push(x0, y0);
      while (stack.length) {
        const y = stack.pop();
        const x = stack.pop();
        sizes[id]++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || labels[ny * w + nx] || at(nx, ny) <= 96) continue;
          labels[ny * w + nx] = id;
          stack.push(nx, ny);
        }
      }
    }
  }
  const largest = Math.max(0, ...sizes);
  if (largest === 0) return;
  const dropped = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) if (labels[i] && sizes[labels[i]] < largest * ISLAND_SHARE) dropped[i] = 1;
  // Widen each dropped piece by a cell so its soft edge goes with it, but never into a kept piece.
  const clear = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dropped[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const l = labels[ny * w + nx];
          if (!l || dropped[ny * w + nx]) clear[ny * w + nx] = 1;
        }
      }
    }
  }
  if (!clear.includes(1)) return;
  for (let y = 0; y < height; y++) {
    const cy = Math.min(h - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x++) {
      if (clear[cy * w + Math.min(w - 1, Math.floor(x / scale))]) alpha[y * width + x] = 0;
    }
  }
}

/** Average of each pixel's (2r+1) x (2r+1) neighbourhood, edges repeated. Works on a w*h plane. */
function boxBlur(src, w, h, r) {
  const d = 2 * r + 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / d;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / d;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Pulls the colour of semi-transparent edge pixels back to the subject's own colour, so the old
 * background does not show as a halo (a white fringe on a car photographed against the sky).
 * Blur-fusion foreground estimation (Germer et al., "Approximate Fast Foreground Colour
 * Estimation"): the foreground colour near an edge is the blurred subject colour plus a
 * correction for what the pixel actually shows. `rgb` is interleaved 8-bit, `alpha` 8-bit.
 * Returns interleaved RGBA.
 */
function estimateForeground(rgb, alpha, width, height) {
  const n = width * height;
  const eps = 1e-5;
  const a = new Float32Array(n);
  const planes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    a[i] = alpha[i] / 255;
    for (let c = 0; c < 3; c++) planes[c][i] = rgb[i * 3 + c] / 255;
  }
  const side = Math.max(width, height);
  const passes = [Math.max(2, Math.round(side / 40)), 3];

  let F = planes.map((p) => Float32Array.from(p));
  let B = planes.map((p) => Float32Array.from(p));
  for (const r of passes) {
    const blurA = boxBlur(a, width, height, r);
    const oneMinusA = new Float32Array(n);
    for (let i = 0; i < n; i++) oneMinusA[i] = 1 - a[i];
    const blurInvA = boxBlur(oneMinusA, width, height, r);
    const nextF = [], nextB = [];
    for (let c = 0; c < 3; c++) {
      const fa = new Float32Array(n), ba = new Float32Array(n);
      for (let i = 0; i < n; i++) { fa[i] = F[c][i] * a[i]; ba[i] = B[c][i] * oneMinusA[i]; }
      const blurFA = boxBlur(fa, width, height, r);
      const blurBA = boxBlur(ba, width, height, r);
      const f = new Float32Array(n), b = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const fb = blurFA[i] / (blurA[i] + eps);
        const bb = blurBA[i] / (blurInvA[i] + eps);
        b[i] = Math.min(1, Math.max(0, bb));
        f[i] = Math.min(1, Math.max(0, fb + a[i] * (planes[c][i] - a[i] * fb - oneMinusA[i] * bb)));
      }
      nextF.push(f);
      nextB.push(b);
    }
    F = nextF;
    B = nextB;
  }

  const rgba = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const solid = alpha[i] >= 250; // inside the subject the photo's own colour is already right
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = solid ? rgb[i * 3 + c] : Math.round(F[c][i] * 255);
    rgba[i * 4 + 3] = alpha[i];
  }
  return rgba;
}

/** The mask's values stretched to 0..1, then a steep S-curve: firm inside the subject, a crisp short edge. */
function maskToAlpha(mask) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < lo) lo = mask[i];
    if (mask[i] > hi) hi = mask[i];
  }
  const range = hi - lo || 1;
  const out = Buffer.alloc(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const v = (mask[i] - lo) / range; // 0..1
    const s = Math.min(1, Math.max(0, (v - 0.3) / 0.4));
    out[i] = Math.round(s * s * (3 - 2 * s) * 255);
  }
  return out;
}

// Removes faint dust left by resampling and makes the near-solid pixels solid.
const CLEAN = (() => {
  const lut = Buffer.alloc(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(Math.min(255, Math.max(0, ((v - 12) * 255) / (255 - 24))));
  return lut;
})();

/**
 * Turns the model's mask into a transparent PNG of the original photo, cropped to the subject.
 * `mask` is the model output (size x size floats; size comes from `pre`).
 */
async function postprocess(mask, { rgb, width, height, size = Math.round(Math.sqrt(mask.length)) }) {
  const small = maskToAlpha(mask);
  const alpha = await sharp(small, { raw: { width: size, height: size, channels: 1 } })
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' }) // stretch back to the photo's shape, never crop
    .toColourspace('b-w') // keep a single channel; sharp otherwise hands back 3
    .raw()
    .toBuffer();
  if (alpha.length !== width * height) throw new Error('Unexpected mask size');
  for (let i = 0; i < alpha.length; i++) alpha[i] = CLEAN[alpha[i]];

  removeIslands(alpha, width, height);

  const box = subjectBox(alpha, width, height);
  if (!box || box.coverage < MIN_COVERAGE) throw new NoSubjectError();

  // Work on the crop only: less to fix, and the fringe fix does not care about the empty rest.
  const cw = box.width, ch = box.height;
  const cropRgb = Buffer.alloc(cw * ch * 3);
  const cropAlpha = Buffer.alloc(cw * ch);
  for (let y = 0; y < ch; y++) {
    const src = (box.top + y) * width + box.left;
    rgb.copy(cropRgb, y * cw * 3, src * 3, (src + cw) * 3);
    alpha.copy(cropAlpha, y * cw, src, src + cw);
  }
  const rgba = estimateForeground(cropRgb, cropAlpha, cw, ch);

  return sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } })
    .resize(OUT_SIDE, OUT_SIDE, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
    .png({ compressionLevel: 9, adaptiveFiltering: true }) // lossless, about 15% smaller than level 9 alone
    .toBuffer();
}

/** Loads the model once and returns `cutout(buffer) -> png Buffer`. */
async function createCutout(modelPath, model = MODELS[DEFAULT_MODEL]) {
  const ort = require('onnxruntime-node');
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    intraOpNumThreads: Math.max(1, require('os').cpus().length),
  });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  return async function cutout(input) {
    const pre = await preprocess(input, model);
    const feeds = { [inputName]: new ort.Tensor('float32', pre.tensor, [1, 3, pre.size, pre.size]) };
    const out = await session.run(feeds);
    // isnet returns [batch, 1, h, w] and silueta the same; the first plane is the mask either way.
    return postprocess(out[outputName].data.subarray(0, pre.size * pre.size), pre);
  };
}

module.exports = {
  preprocess, postprocess, subjectBox, removeIslands, boxBlur, estimateForeground, maskToAlpha,
  createCutout, NoSubjectError, MAX_SIDE, OUT_SIDE,
};
