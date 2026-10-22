'use strict';
// Cut-out service. POST /cutout with the image as the request body and a bearer secret returns a
// transparent PNG. One photo is processed at a time so memory use stays flat; extra requests wait
// in a short queue and are turned away when it is full.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MODEL_URL = process.env.MODEL_URL || 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx';
// The model is fetched during the build (see scripts/fetch-model.js) so a service that has been
// asleep starts straight away; if it is missing it is fetched on first use.
const MODEL_PATH = process.env.MODEL_PATH || path.join(__dirname, 'models', 'silueta.onnx');
const MIN_MODEL_BYTES = 30 * 1024 * 1024;

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > maxBytes) {
        over = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Image too large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Builds the request handler. `getCutout()` resolves to `cutout(buffer) -> png Buffer`. */
function createApp({ secret, getCutout, maxBytes = 10 * 1024 * 1024, maxQueue = 4 }) {
  let tail = Promise.resolve();
  let waiting = 0;

  const send = (res, status, body, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };

  return async function handler(req, res) {
    try {
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
      if (req.method !== 'POST' || req.url !== '/cutout') return send(res, 404, { error: 'not_found' });

      const header = req.headers.authorization || '';
      if (!secret || !header.startsWith('Bearer ') || !safeEqual(header.slice(7), secret)) {
        return send(res, 401, { error: 'unauthorized' });
      }
      if (waiting >= maxQueue) return send(res, 503, { error: 'busy' });

      const body = await readBody(req, maxBytes);
      if (!body.length) return send(res, 400, { error: 'empty_body' });

      waiting++;
      const job = tail.then(async () => {
        const cutout = await getCutout();
        return cutout(body);
      });
      tail = job.catch(() => {}); // a failed job must not block the next one
      let png;
      try {
        png = await job;
      } finally {
        waiting--;
      }
      return send(res, 200, png, 'image/png');
    } catch (err) {
      if (err.status === 413) {
        // Answer first, then drop the connection so the rest of the upload is not read.
        res.once('finish', () => req.destroy());
        return send(res, 413, { error: 'too_large' });
      }
      if (err.code === 'no_subject') return send(res, 422, { error: 'no_subject' });
      console.error('[cutout] failed:', err.message);
      return send(res, 500, { error: 'cutout_failed' });
    }
  };
}

/** Downloads the model on first start. Written to a temp name first so a half file is never used. */
async function ensureModel() {
  if (fs.existsSync(MODEL_PATH) && fs.statSync(MODEL_PATH).size > MIN_MODEL_BYTES) return MODEL_PATH;
  fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });
  console.log('[cutout] downloading model');
  const res = await fetch(MODEL_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_MODEL_BYTES) throw new Error('Model download incomplete');
  const tmp = `${MODEL_PATH}.part`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, MODEL_PATH);
  return MODEL_PATH;
}

if (require.main === module) {
  const secret = process.env.CUTOUT_SECRET;
  if (!secret) {
    console.error('CUTOUT_SECRET is required');
    process.exit(1);
  }
  let loading;
  const getCutout = () => {
    // Loaded once on the first photo (or at boot below) and reused; a failed load is retried.
    if (!loading) {
      loading = ensureModel()
        .then((p) => require('./cutout').createCutout(p))
        .catch((e) => { loading = null; throw e; });
    }
    return loading;
  };
  const server = http.createServer(createApp({ secret, getCutout }));
  server.requestTimeout = 60_000;
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '::', () => {
    console.log(`[cutout] listening on ${port}`);
    getCutout().then(() => console.log('[cutout] model ready')).catch((e) => console.error('[cutout] model not ready:', e.message));
  });
}

module.exports = { createApp, ensureModel };
