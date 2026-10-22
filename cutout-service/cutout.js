'use strict';
// Background removal with the silueta model (a compressed U2-Net, MIT licensed).
// preprocess and postprocess are pure so they can be tested without the model.

const sharp = require('sharp');

const MODEL_SIZE = 320; // the model's fixed input size
const MAX_SIDE = 1024; // photos are scaled down to this before processing
const OUT_SIDE = 800; // longest side of the returned PNG
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const MIN_COVERAGE = 0.02; // a mask covering less than 2% of the photo means no subject was found

class NoSubjectError extends Error {
  constructor() {
    super('No subject found in the photo');
    this.code = 'no_subject';
  }
}

/** Decodes the photo (EXIF rotation applied), scales it down, and builds the model input. */
async function preprocess(input) {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const small = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .resize(MODEL_SIZE, MODEL_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer();

  let max = 1;
  for (let i = 0; i < small.length; i++) if (small[i] > max) max = small[i];

  // NCHW float32, scaled by the brightest value and standardised, as the model was trained.
  const plane = MODEL_SIZE * MODEL_SIZE;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      tensor[c * plane + i] = (small[i * 3 + c] / max - MEAN[c]) / STD[c];
    }
  }
  return { tensor, size: MODEL_SIZE, rgb: data, width: info.width, height: info.height };
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
 * Turns the model's mask into a transparent PNG of the original photo, cropped to the subject.
 * `mask` is the model output (MODEL_SIZE x MODEL_SIZE floats).
 */
async function postprocess(mask, { rgb, width, height }) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < lo) lo = mask[i];
    if (mask[i] > hi) hi = mask[i];
  }
  const range = hi - lo || 1;
  const small = Buffer.alloc(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const v = (mask[i] - lo) / range; // 0..1
    // A gentle contrast curve: firm inside the subject, soft at the edge.
    const s = Math.min(1, Math.max(0, (v - 0.15) / 0.7));
    small[i] = Math.round(s * s * (3 - 2 * s) * 255);
  }

  const alpha = await sharp(small, { raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 1 } })
    .resize(width, height, { fit: 'fill', kernel: 'cubic' }) // stretch back to the photo's shape, never crop
    .toColourspace('b-w') // keep a single channel; sharp otherwise hands back 3
    .raw()
    .toBuffer();
  if (alpha.length !== width * height) throw new Error('Unexpected mask size');

  const box = subjectBox(alpha, width, height);
  if (!box || box.coverage < MIN_COVERAGE) throw new NoSubjectError();

  const png = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  return sharp(png)
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(OUT_SIDE, OUT_SIDE, { fit: 'inside', withoutEnlargement: true }) // same size the app already stores
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Loads the model once and returns `cutout(buffer) -> png Buffer`. */
async function createCutout(modelPath) {
  const ort = require('onnxruntime-node');
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  return async function cutout(input) {
    const pre = await preprocess(input);
    const feeds = { [inputName]: new ort.Tensor('float32', pre.tensor, [1, 3, pre.size, pre.size]) };
    const out = await session.run(feeds);
    return postprocess(out[outputName].data, pre);
  };
}

module.exports = { preprocess, postprocess, subjectBox, createCutout, NoSubjectError, MODEL_SIZE };
