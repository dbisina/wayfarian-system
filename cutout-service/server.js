'use strict';
// Cut-out service. POST /cutout with the image as the request body and a bearer secret returns a
// transparent PNG. One photo is processed at a time so memory use stays flat; extra requests wait
// in a short queue and are turned away when it is full.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { resolveModel } = require('./models');

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

/** Where a model lives on disk. MODEL_PATH overrides it (for a model fetched some other way). */
const modelPathFor = (model) => process.env.MODEL_PATH || path.join(__dirname, 'models', model.file);

/**
 * Makes sure the model file is on disk and returns its path. A missing or too-small file is
 * downloaded: streamed to a temp name, checked against the published checksum, and only then
 * renamed into place, so a half-finished or tampered download is never used.
 * `fetchImpl` and `dest` exist so the download can be tested without the network.
 */
async function ensureModel(model = resolveModel(), { fetchImpl = fetch, dest = modelPathFor(model) } = {}) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > model.minBytes) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const url = process.env.MODEL_URL || model.url;
  console.log(`[cutout] downloading model ${model.name}`);
  const res = await fetchImpl(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);

  const tmp = `${dest}.part`;
  const hash = crypto.createHash('md5');
  let bytes = 0;
  try {
    await pipeline(
      Readable.fromWeb(res.body),
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk);
          bytes += chunk.length;
          yield chunk;
        }
      },
      fs.createWriteStream(tmp)
    );
    if (bytes < model.minBytes) throw new Error('Model download incomplete');
    // A custom MODEL_URL is the operator's own file, so only the published one is checked.
    if (!process.env.MODEL_URL && model.md5 && hash.digest('hex') !== model.md5) throw new Error('Model checksum mismatch');
    fs.renameSync(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return dest;
}

if (require.main === module) {
  const secret = process.env.CUTOUT_SECRET;
  if (!secret) {
    console.error('CUTOUT_SECRET is required');
    process.exit(1);
  }
  const model = resolveModel();
  console.log(`[cutout] model: ${model.name}`);
  let loading;
  const getCutout = () => {
    // Loaded once on the first photo (or at boot below) and reused; a failed load is retried.
    if (!loading) {
      loading = ensureModel(model)
        .then((p) => require('./cutout').createCutout(p, model))
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
