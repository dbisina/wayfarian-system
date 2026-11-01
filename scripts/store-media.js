#!/usr/bin/env node
// scripts/store-media.js
// Turns real device screenshots and a screen recording into store-ready media, at the exact sizes the
// stores accept. It never invents app screens: every picture is one you captured from the app.
//
//   node scripts/store-media.js shots   <captions.json> <input-dir> <out-dir>
//   node scripts/store-media.js feature <out-file.png> ["Tagline"]
//   node scripts/store-media.js preview <recording.mp4> <out-file.mp4> [seconds]
//
// captions.json: [{ "file": "ride.png", "caption": "Record every ride" }, ...]  (order = store order)
//
// Sizes (checked against Apple's and Google's current pages, November 2026):
//   App Store iPhone, Dynamic Island large 1320x2868 and medium 1206x2622 (PNG, no alpha, up to 10)
//   Google Play phone 1440x2560 (PNG, no alpha, 2 to 8; longer side at most 2x the shorter)
//   Google Play feature graphic 1024x500 (PNG, no alpha)
//   App Store preview video 886x1920, 15-30 s, H.264 up to 30 fps, AAC stereo 256 kbps, up to 500 MB

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const sharp = (() => {
  for (const p of ['sharp', path.join(root, 'server/node_modules/sharp'), path.join(root, 'cutout-service/node_modules/sharp')]) {
    try { return require(p); } catch { /* try the next one */ }
  }
  throw new Error('sharp is not installed. Run npm install in server/ first.');
})();

const FONT_BLACK = path.join(root, 'app/node_modules/@expo-google-fonts/overpass/900Black/Overpass_900Black.ttf');
const FONT_BOLD = path.join(root, 'app/node_modules/@expo-google-fonts/overpass/700Bold/Overpass_700Bold.ttf');
const LOGO = path.join(root, 'app/assets/logo.png');

const INK = '#161513';
const AMBER = '#F5A524';
const CREAM = '#F2EEE5';

const TARGETS = {
  'ios-6.9': { w: 1320, h: 2868, dir: 'ios' },
  'ios-6.1-medium': { w: 1206, h: 2622, dir: 'ios-medium' },
  'android-phone': { w: 1440, h: 2560, dir: 'android' },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Text as an image, in the app's own font, wrapped to `width`. */
async function textImage(text, { font, size, width, color, align = 'center' }) {
  const buf = await sharp({
    text: {
      text: `<span foreground="${color}" font_size="${Math.round(size * 1024)}">${esc(text)}</span>`,
      fontfile: font,
      font: 'Overpass',
      width,
      align,
      rgba: true,
      spacing: Math.round(size * 0.12),
    },
  }).png().toBuffer();
  return buf;
}

const roundedMask = (w, h, r) =>
  Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);

/** One store screenshot: caption on top, the real screenshot below it with rounded corners, bleeding off the bottom. */
async function frame(inputFile, caption, { w, h }) {
  const pad = Math.round(w * 0.07);
  const captionImg = await textImage(caption, { font: FONT_BLACK, size: Math.round(w * 0.075), width: w - pad * 2, color: CREAM });
  const capMeta = await sharp(captionImg).metadata();
  const capTop = Math.round(h * 0.045);
  const shotTop = capTop + capMeta.height + Math.round(h * 0.03);

  const shotW = Math.round(w * 0.86);
  const src = sharp(inputFile).rotate();
  const m = await src.metadata();
  const shotH = Math.round((m.height / m.width) * shotW);
  const radius = Math.round(shotW * 0.07);
  const visibleH = Math.min(shotH, h - shotTop); // the bottom of the phone runs off the canvas
  const resized = await src.resize(shotW, shotH).removeAlpha().toBuffer();
  const rounded = await sharp(resized)
    .composite([{ input: roundedMask(shotW, shotH, radius), blend: 'dest-in' }])
    .ensureAlpha()
    .png()
    .toBuffer();
  const left = Math.round((w - shotW) / 2);

  // A hairline around the screenshot so it reads against the dark background.
  // The picture runs off the bottom of the canvas, so the ring is cut off there too.
  const ringH = Math.min(shotH + 6, h - (shotTop - 3));
  const ring = Buffer.from(
    `<svg width="${shotW + 6}" height="${ringH}"><rect x="3" y="3" width="${shotW}" height="${shotH}" rx="${radius}" ry="${radius}" fill="none" stroke="${AMBER}" stroke-opacity="0.55" stroke-width="3"/></svg>`
  );

  const base = sharp({ create: { width: w, height: h, channels: 3, background: INK } });
  return base
    .composite([
      { input: captionImg, left: Math.round((w - capMeta.width) / 2), top: capTop },
      { input: ring, left: left - 3, top: shotTop - 3 },
      { input: await sharp(rounded).extract({ left: 0, top: 0, width: shotW, height: visibleH }).toBuffer(), left, top: shotTop },
    ])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function shots(captionsFile, inDir, outDir) {
  const items = JSON.parse(fs.readFileSync(captionsFile, 'utf8'));
  if (!Array.isArray(items) || !items.length) throw new Error('captions.json must be a non-empty list');
  const missing = items.filter((i) => !fs.existsSync(path.join(inDir, i.file))).map((i) => i.file);
  if (missing.length) throw new Error(`Not found in ${inDir}: ${missing.join(', ')}`);

  for (const [name, t] of Object.entries(TARGETS)) {
    fs.mkdirSync(path.join(outDir, t.dir), { recursive: true });
    for (let i = 0; i < items.length; i++) {
      const png = await frame(path.join(inDir, items[i].file), items[i].caption, t);
      const out = path.join(outDir, t.dir, `${String(i + 1).padStart(2, '0')}-${path.parse(items[i].file).name}.png`);
      fs.writeFileSync(out, png);
    }
    console.log(`${name}: ${items.length} screenshots at ${t.w}x${t.h} -> ${path.join(outDir, t.dir)}`);
  }
  if (items.length > 8) console.warn('Google Play takes at most 8 phone screenshots; upload the first 8 there.');
}

async function feature(outFile, tagline = 'Every ride, remembered.') {
  const W = 1024, H = 500;
  const logo = await sharp(LOGO).resize({ height: 230, fit: 'inside' }).png().toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const name = await textImage('Wayfarian', { font: FONT_BLACK, size: 92, width: 520, color: CREAM, align: 'left' });
  const sub = await textImage(tagline, { font: FONT_BOLD, size: 40, width: 520, color: AMBER, align: 'left' });
  const nameMeta = await sharp(name).metadata();
  const left = 80;
  const textLeft = left + logoMeta.width + 56;
  const blockH = nameMeta.height + 18 + (await sharp(sub).metadata()).height;
  const top = Math.round((H - blockH) / 2);
  const png = await sharp({ create: { width: W, height: H, channels: 3, background: INK } })
    .composite([
      { input: logo, left, top: Math.round((H - logoMeta.height) / 2) },
      { input: name, left: textLeft, top },
      { input: sub, left: textLeft, top: top + nameMeta.height + 18 },
    ])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, png);
  console.log(`feature graphic 1024x500 -> ${outFile}`);
}

/** Scales a screen recording to the App Store preview size, 30 fps, 15-30 s, with stereo AAC audio. */
function preview(input, output, seconds) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', input], { encoding: 'utf8' });
  const duration = parseFloat(probe.stdout);
  if (!Number.isFinite(duration)) throw new Error('ffprobe could not read the recording');
  if (duration < 15) throw new Error(`The recording is ${duration.toFixed(1)} s; App Store previews must be 15-30 s. Record a little longer.`);
  const length = Math.min(30, seconds ? Number(seconds) : duration);
  if (length < 15) throw new Error('Pass a length of at least 15 seconds.');
  const args = [
    '-y', '-i', input, '-t', String(length),
    // Fit inside 886x1920 and pad, so nothing is stretched.
    '-vf', 'scale=886:1920:force_original_aspect_ratio=decrease,pad=886:1920:(ow-iw)/2:(oh-ih)/2:color=0x161513,fps=30,format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-b:v', '10M', '-maxrate', '12M', '-bufsize', '24M',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', output,
  ];
  // A recording with no sound still needs an audio track: add silence.
  const hasAudio = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', input], { encoding: 'utf8' }).stdout.trim();
  if (!hasAudio) args.splice(2, 0, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-shortest');
  const res = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (res.status !== 0) throw new Error('ffmpeg failed');
  const size = fs.statSync(output).size;
  console.log(`preview 886x1920, ${length.toFixed(1)} s, ${(size / 1048576).toFixed(1)} MB -> ${output}${size > 500 * 1048576 ? '  (OVER 500 MB: lower -b:v)' : ''}`);
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'shots' && args.length === 3) return shots(...args);
  if (cmd === 'feature' && args.length >= 1) return feature(...args);
  if (cmd === 'preview' && args.length >= 2) return preview(...args);
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 11).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(cmd ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
