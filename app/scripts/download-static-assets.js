#!/usr/bin/env node
/*
  Scans the app/ workspace for static.codia.ai references and downloads them
  into assets/images/{date}/{filename}. Also writes a manifest JSON for reference.
*/
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = process.cwd();
const SRC_DIRS = [
  path.join(ROOT, 'app'),
  path.join(ROOT, 'components'),
  path.join(ROOT, 'scaf'),
  path.join(ROOT, 'backup'),
  path.join(ROOT, 'contexts'),
  path.join(ROOT, 'hooks'),
  path.join(ROOT, 'services')
];
const ASSETS_DIR = path.join(ROOT, 'assets', 'images');

const URL_REGEX = /https:\/\/static\.codia\.ai\/image\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp))/g;

/** Recursively list files in a directory */
function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(p));
    } else if (/\.(t|j)sx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Ensure directory exists */
function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/** Download a file to disk */
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // handle redirect
          https.get(res.headers.location, (res2) => res2.pipe(file));
        } else if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`Failed ${url}: ${res.statusCode}`));
        } else {
          res.pipe(file);
        }
        file.on('finish', () => file.close(resolve));
      })
      .on('error', (err) => {
        file.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

(async () => {
  ensureDir(ASSETS_DIR);
  const seen = new Set();
  const matches = [];
  const files = SRC_DIRS.flatMap((d) => (fs.existsSync(d) ? listFiles(d) : []));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = URL_REGEX.exec(text))) {
      const [, date, filename] = m;
      const url = m[0];
      if (!seen.has(url)) {
        seen.add(url);
        matches.push({ url, date, filename });
      }
    }
  }

  console.log(`Found ${matches.length} unique static assets.`);
  const manifest = [];
  for (const { url, date, filename } of matches) {
    const dir = path.join(ASSETS_DIR, date);
    ensureDir(dir);
    const dest = path.join(dir, filename);
    if (fs.existsSync(dest)) {
      console.log(`Skip exists: ${path.relative(ROOT, dest)}`);
      manifest.push({ url, local: path.relative(ROOT, dest).replace(/\\/g, '/') });
      continue;
    }
    try {
      console.log(`Downloading ${url} -> ${path.relative(ROOT, dest)}`);
      await download(url, dest);
      manifest.push({ url, local: path.relative(ROOT, dest).replace(/\\/g, '/') });
    } catch (e) {
      console.warn(`Failed to download ${url}: ${e.message}`);
    }
  }
  const manifestPath = path.join(ASSETS_DIR, 'static.codia.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote manifest ${path.relative(ROOT, manifestPath)}`);
})();
