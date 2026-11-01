#!/usr/bin/env node
// scripts/store-art.js
// Store listing art: each screenshot is a designed poster (colour world, big headline with one italic
// word, feature chips, a tilted phone with the app screen in it). A route line runs across the whole
// set, so side by side in the store the eight read as one strip. Layout is HTML, rendered by headless
// Chrome, so fonts, blur and shadows are exact.
//
//   node scripts/store-art.js shots   <screens-dir> <out-dir>
//   node scripts/store-art.js feature <screens-dir> <out-file.png>
//
// <screens-dir> holds the app screens named in SHOTS (Journey.png, Map.png, ...), 1290x2792.
// Sizes: iPhone 1320x2868 and 1206x2622, Play phone 1440x2560, feature graphic 1024x500. No alpha.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const sharp = (() => {
  for (const p of ['sharp', path.join(root, 'server/node_modules/sharp'), path.join(root, 'cutout-service/node_modules/sharp')]) {
    try { return require(p); } catch { /* next */ }
  }
  throw new Error('sharp is not installed. Run npm install in server/ first.');
})();

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = (p) => 'file:///' + path.resolve(p).replace(/\\/g, '/');
const FONT = url(path.join(root, 'app/node_modules/@expo-google-fonts/overpass/900Black/Overpass_900Black.ttf'));
const FONT_BOLD = url(path.join(root, 'app/node_modules/@expo-google-fonts/overpass/700Bold/Overpass_700Bold.ttf'));
const LOGO = url(path.join(root, 'app/assets/logo.png'));

const TARGETS = [
  { dir: 'ios', w: 1320, h: 2868 },
  { dir: 'ios-medium', w: 1206, h: 2622 },
  { dir: 'android', w: 1440, h: 2560 },
];

// One entry per store screenshot, in store order. `accent` is the italic word in the headline.
// Chips name real features of the screen they sit on; no ratings, download counts or awards.
const SHOTS = [
  { file: 'Journey', eyebrow: 'Live ride', line1: 'Every ride,', accent: 'remembered.', tilt: -3, dark: true,
    bg: 'radial-gradient(120% 70% at 85% 8%, #6b4310 0%, transparent 55%), linear-gradient(180deg,#1b1813,#0e0d0b)',
    chips: [['Speed limit sign', 8, 52, 'l'], ['Live XP', 66, 61, 'r'], ['One-tap SOS', 10, 71, 'l']] },
  { file: 'Map', eyebrow: 'Map', line1: 'Find fuel, food', accent: 'and stays.', tilt: 3,
    bg: 'radial-gradient(90% 50% at 15% 0%, #ffe3a8 0%, transparent 60%), linear-gradient(180deg,#f6f1e6,#e9e2d2)',
    chips: [['Fuel', 8, 50, 'l'], ['Food', 74, 57, 'r'], ['Stays', 12, 66, 'l']] },
  { file: 'MapMemories', eyebrow: 'Memories', line1: 'Relive it', accent: 'on the map.', tilt: -3,
    bg: 'radial-gradient(70% 45% at 80% 12%, #ffd1b8 0%, transparent 60%), radial-gradient(80% 50% at 10% 40%, #cfc6ff 0%, transparent 65%), linear-gradient(180deg,#efeaff,#fbeee6)',
    chips: [['Photo pins', 9, 49, 'l'], ['Filter by year', 64, 64, 'r']] },
  { file: 'GalleryAlbum', eyebrow: 'Albums', line1: 'Every ride,', accent: 'in photos.', tilt: 3, accentColor: '#fff6e0',
    bg: 'radial-gradient(90% 55% at 90% 0%, #ffd77a 0%, transparent 60%), linear-gradient(180deg,#f5a524,#e58f0c)',
    chips: [['Cut-out bike photos', 8, 51, 'l'], ['Share to anywhere', 62, 66, 'r']] },
  { file: 'GroupLive', eyebrow: 'Group ride', line1: 'Ride together,', accent: 'live.', tilt: -3, dark: true,
    bg: 'radial-gradient(100% 60% at 20% 5%, #1d4a52 0%, transparent 60%), linear-gradient(180deg,#0f1f28,#0a1318)',
    chips: [['Everyone on one map', 8, 51, 'l'], ['Join with a code', 62, 64, 'r']] },
  { file: 'Quests', eyebrow: 'Quests', line1: 'Weekly quests', accent: 'and streaks.', tilt: 3,
    bg: 'radial-gradient(90% 50% at 80% 0%, #ffd9c2 0%, transparent 60%), linear-gradient(180deg,#faf2e8,#f0e2d0)',
    chips: [['Earn XP', 9, 50, 'l'], ['Keep your streak', 62, 65, 'r']] },
  { file: 'Leaderboard', eyebrow: 'Ranks', line1: 'Climb the', accent: 'ranks.', tilt: -3, dark: true,
    bg: 'radial-gradient(90% 55% at 80% 5%, #7a4a0e 0%, transparent 60%), linear-gradient(180deg,#201a12,#0e0c09)',
    chips: [['Friends and city', 8, 51, 'l'], ['Weekly reset', 66, 64, 'r']] },
  { file: 'Main', eyebrow: 'Your garage', line1: 'Your riding,', accent: 'at a glance.', tilt: 3,
    bg: 'radial-gradient(100% 55% at 50% 0%, #ffe1a0 0%, transparent 62%), linear-gradient(180deg,#fbf3e2,#f1e4c8)',
    chips: [['Distance and time', 8, 51, 'l'], ['Your bikes', 66, 64, 'r']] },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A route line that crosses all eight posters; each poster shows its own slice. */
function routeSvg(index, count, w, h) {
  const pts = [];
  for (let i = 0; i <= count * 2; i++) {
    const x = (i / 2) * 100;
    const y = 90 + Math.sin(i * 1.15) * 3 + (i % 2 ? -1.5 : 1.5);
    pts.push([x, y]);
  }
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    d += ` C ${px + 25} ${py}, ${cx - 25} ${cy}, ${cx} ${cy}`;
  }
  const u = w / 100;
  return `<svg class="route" width="${w}" height="${h}" viewBox="${index * 100} 0 100 100" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="#F5A524" stroke-width="${0.9}" stroke-dasharray="2.2 2.2" stroke-linecap="round" opacity="0.55" vector-effect="non-scaling-stroke" style="stroke-width:${u * 0.9}px;stroke-dasharray:${u * 2.4}px ${u * 2.4}px"/>
  </svg>`;
}

function poster(shot, index, { w, h }, screen) {
  const u = w / 100; // 1% of the width
  const dark = !!shot.dark;
  const ink = dark ? '#f6f1e6' : '#161513';
  const phoneW = 80 * u;
  const phoneH = phoneW * (2792 / 1290);
  const phoneTop = h * 0.30;
  const chips = shot.chips
    .map(([label, x, y, side], i) => `<div class="chip ${dark ? 'chip-d' : ''}" style="left:${x * u}px;top:${(y / 100) * h * (h > w * 2 ? 1 : 1.0)}px;transform:rotate(${side === 'l' ? -2.5 : 2.5}deg)"><i></i>${esc(label)}</div>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Ov;src:url("${FONT}");font-weight:900}
@font-face{font-family:Ov;src:url("${FONT_BOLD}");font-weight:700}
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#000}
.p{position:relative;width:${w}px;height:${h}px;overflow:hidden;background:${shot.bg};font-family:Ov,sans-serif;color:${ink}}
.route{position:absolute;left:0;top:0}
.eyebrow{position:absolute;left:${7 * u}px;top:${h * 0.05}px;padding:${1.1 * u}px ${2.6 * u}px;border-radius:99px;font-weight:700;font-size:${2.6 * u}px;letter-spacing:${0.5 * u}px;text-transform:uppercase;background:${dark ? 'rgba(255,255,255,.10)' : 'rgba(22,21,19,.07)'};box-shadow:inset 0 0 0 ${0.18 * u}px ${dark ? 'rgba(255,255,255,.18)' : 'rgba(22,21,19,.12)'}}
.eyebrow b{display:inline-block;width:${1.6 * u}px;height:${1.6 * u}px;border-radius:50%;background:#F5A524;margin-right:${1.4 * u}px;vertical-align:middle}
h1{position:absolute;left:${7 * u}px;right:${7 * u}px;top:${h * 0.075}px;margin:0;font-weight:900;font-size:${11.2 * u}px;line-height:.98;letter-spacing:-${0.35 * u}px}
h1 em{display:block;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:400;letter-spacing:-${0.2 * u}px;color:${shot.accentColor || '#F5A524'};font-size:${12.4 * u}px;line-height:1.02}
.phone{position:absolute;left:${(100 - 80) / 2 * u}px;top:${phoneTop}px;width:${phoneW}px;height:${phoneH}px;border-radius:${9.6 * u}px;background:#0b0b0b;padding:${1.1 * u}px;box-sizing:border-box;
  transform:rotate(${shot.tilt}deg);transform-origin:50% 0;box-shadow:0 0 0 ${0.25 * u}px #3a3733,0 ${5 * u}px ${12 * u}px ${-2 * u}px rgba(0,0,0,${dark ? 0.7 : 0.38}),0 ${1.2 * u}px ${3 * u}px rgba(0,0,0,.25)}
.phone img{display:block;width:100%;height:100%;border-radius:${8.6 * u}px;object-fit:cover}
.phone:after{content:"";position:absolute;left:50%;top:${1.9 * u}px;width:${17 * u}px;height:${4.6 * u}px;margin-left:${-8.5 * u}px;border-radius:99px;background:#050505}
.chip{position:absolute;z-index:3;padding:${1.7 * u}px ${3.2 * u}px ${1.7 * u}px ${2.6 * u}px;border-radius:99px;font-weight:700;font-size:${3.1 * u}px;white-space:nowrap;color:#161513;background:rgba(255,255,255,.88);
  box-shadow:inset 0 ${0.2 * u}px 0 rgba(255,255,255,.9),0 ${1.4 * u}px ${4 * u}px rgba(22,21,19,.22)}
.chip-d{color:#f6f1e6;background:rgba(40,36,30,.78);box-shadow:inset 0 0 0 ${0.18 * u}px rgba(255,255,255,.16),0 ${1.4 * u}px ${4 * u}px rgba(0,0,0,.5)}
.chip i{display:inline-block;width:${2.2 * u}px;height:${2.2 * u}px;border-radius:50%;background:#F5A524;margin-right:${1.6 * u}px;vertical-align:-${0.2 * u}px}
</style></head><body><div class="p">
${routeSvg(index, SHOTS.length, w, h)}
<div class="eyebrow"><b></b>${esc(shot.eyebrow)}</div>
<h1>${esc(shot.line1)}<em>${esc(shot.accent)}</em></h1>
<div class="phone"><img src="${url(screen)}"></div>
${chips}
</div></body></html>`;
}

function render(html, w, h, outFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-art-'));
  const htmlFile = path.join(tmp, 'p.html');
  const raw = path.join(tmp, 'p.png');
  fs.writeFileSync(htmlFile, html);
  const r = spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--allow-file-access-from-files',
    `--window-size=${w},${h}`, '--force-device-scale-factor=1', '--virtual-time-budget=4000',
    `--screenshot=${raw}`, url(htmlFile),
  ], { encoding: 'utf8', timeout: 90000 });
  if (!fs.existsSync(raw)) throw new Error(`Chrome produced no image: ${String(r.stderr).slice(0, 200)}`);
  return { raw, tmp, outFile };
}

async function finish({ raw, tmp, outFile }, w, h) {
  const png = await sharp(raw).extract({ left: 0, top: 0, width: w, height: h }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, png);
  fs.rmSync(tmp, { recursive: true, force: true });
}

async function shots(screensDir, outDir) {
  for (const f of SHOTS) if (!fs.existsSync(path.join(screensDir, `${f.file}.png`))) throw new Error(`Missing ${f.file}.png in ${screensDir}`);
  for (const t of TARGETS) {
    for (let i = 0; i < SHOTS.length; i++) {
      const s = SHOTS[i];
      const job = render(poster(s, i, t, path.join(screensDir, `${s.file}.png`)), t.w, t.h, path.join(outDir, t.dir, `${String(i + 1).padStart(2, '0')}-${s.file}.png`));
      await finish(job, t.w, t.h);
    }
    console.log(`${t.dir}: ${SHOTS.length} at ${t.w}x${t.h}`);
  }
}

async function feature(screensDir, outFile) {
  const W = 1024, H = 500;
  const screen = path.join(screensDir, 'Journey.png');
  const map = path.join(screensDir, 'Map.png');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Ov;src:url("${FONT}");font-weight:900}
@font-face{font-family:Ov;src:url("${FONT_BOLD}");font-weight:700}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}
.p{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:Ov,sans-serif;color:#f6f1e6;
 background:radial-gradient(70% 120% at 85% 0%,#7a4a0e 0%,transparent 60%),linear-gradient(120deg,#1b1813,#0e0d0b)}
svg{position:absolute;left:0;top:0}
.logo{position:absolute;left:64px;top:62px;width:84px;height:84px;border-radius:22px;box-shadow:0 12px 30px rgba(0,0,0,.5)}
h1{position:absolute;left:64px;top:170px;margin:0;font-weight:900;font-size:68px;line-height:.98;letter-spacing:-1.5px}
h1 em{display:block;font-family:Georgia,serif;font-style:italic;font-weight:400;color:#F5A524;font-size:74px}
.sub{position:absolute;left:66px;top:410px;font-weight:700;font-size:21px;letter-spacing:3px;text-transform:uppercase;opacity:.7}
.ph{position:absolute;width:210px;height:454px;border-radius:30px;background:#0b0b0b;padding:4px;box-sizing:border-box;box-shadow:0 0 0 1px #3a3733,0 30px 50px -10px rgba(0,0,0,.75)}
.ph img{width:100%;height:100%;border-radius:27px;object-fit:cover;display:block}
</style></head><body><div class="p">
<svg width="${W}" height="${H}"><path d="M-20 440 C 180 380, 300 470, 470 410 S 760 360, 1060 430" fill="none" stroke="#F5A524" stroke-width="3" stroke-dasharray="8 9" stroke-linecap="round" opacity=".55"/></svg>
<img class="logo" src="${LOGO}">
<h1>Every ride,<em>remembered.</em></h1>
<div class="sub">Rides · Maps · Memories · Groups</div>
<div class="ph" style="left:600px;top:70px;transform:rotate(-6deg)"><img src="${url(map)}"></div>
<div class="ph" style="left:790px;top:120px;transform:rotate(4deg)"><img src="${url(screen)}"></div>
</div></body></html>`;
  await finish(render(html, W, H, outFile), W, H);
  console.log(`feature graphic ${W}x${H} -> ${outFile}`);
}

/** App Store product page header: 3840x1646 (1024x439 laid out, rendered at 3.75x). */
async function header(screensDir, outFile) {
  const W = 1024, H = 439, S = 3840 / W;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Ov;src:url("${FONT}");font-weight:900}
@font-face{font-family:Ov;src:url("${FONT_BOLD}");font-weight:700}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}
.p{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:Ov,sans-serif;color:#f6f1e6;
 background:radial-gradient(70% 130% at 80% 0%,#7a4a0e 0%,transparent 60%),linear-gradient(120deg,#1b1813,#0e0d0b)}
svg{position:absolute;left:0;top:0}
.logo{position:absolute;left:64px;top:54px;width:72px;height:72px;border-radius:19px;box-shadow:0 10px 26px rgba(0,0,0,.5)}
h1{position:absolute;left:64px;top:148px;margin:0;font-weight:900;font-size:64px;line-height:.98;letter-spacing:-1.4px}
h1 em{display:block;font-family:Georgia,serif;font-style:italic;font-weight:400;color:#F5A524;font-size:70px}
.sub{position:absolute;left:66px;top:358px;font-weight:700;font-size:19px;letter-spacing:3px;text-transform:uppercase;opacity:.7}
.ph{position:absolute;width:196px;height:424px;border-radius:28px;background:#0b0b0b;padding:4px;box-sizing:border-box;box-shadow:0 0 0 1px #3a3733,0 28px 46px -10px rgba(0,0,0,.75)}
.ph img{width:100%;height:100%;border-radius:25px;object-fit:cover;display:block}
</style></head><body><div class="p">
<svg width="${W}" height="${H}"><path d="M-20 392 C 180 340, 300 420, 470 366 S 760 320, 1060 384" fill="none" stroke="#F5A524" stroke-width="3" stroke-dasharray="8 9" stroke-linecap="round" opacity=".55"/></svg>
<img class="logo" src="${LOGO}">
<h1>Every ride,<em>remembered.</em></h1>
<div class="sub">Rides · Maps · Memories · Groups</div>
<div class="ph" style="left:560px;top:48px;transform:rotate(-5deg)"><img src="${url(path.join(screensDir, 'Map.png'))}"></div>
<div class="ph" style="left:730px;top:86px;transform:rotate(3deg)"><img src="${url(path.join(screensDir, 'Journey.png'))}"></div>
<div class="ph" style="left:900px;top:60px;transform:rotate(7deg)"><img src="${url(path.join(screensDir, 'MapMemories.png'))}"></div>
</div></body></html>`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-art-'));
  const htmlFile = path.join(tmp, 'h.html');
  const raw = path.join(tmp, 'h.png');
  fs.writeFileSync(htmlFile, html);
  spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--allow-file-access-from-files',
    `--window-size=${W},${H}`, `--force-device-scale-factor=${S}`, '--virtual-time-budget=4000',
    `--screenshot=${raw}`, url(htmlFile),
  ], { encoding: 'utf8', timeout: 90000 });
  if (!fs.existsSync(raw)) throw new Error('Chrome produced no image');
  const png = await sharp(raw).resize(3840, 1646, { fit: 'cover', position: 'top' }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, png);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`header 3840x1646 -> ${outFile}`);
}

(async () => {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'header' && a && b) return header(a, b);
  if (cmd === 'shots' && a && b) return shots(a, b);
  if (cmd === 'feature' && a && b) return feature(a, b);
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 13).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(cmd ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(1); });
