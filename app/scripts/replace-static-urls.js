#!/usr/bin/env node
/*
  Replaces occurrences of static.codia.ai image URLs with local require('../assets/images/{date}/{file}')
  Handles:
    - <Image source={{ uri: 'https://static.codia.ai/image/DATE/FILE.png' }} .../>
    - object props: flag: 'https://static.codia.ai/image/DATE/FILE.png'
*/
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT);
const TARGET_DIRS = [
  path.join(SRC_ROOT, 'app'),
  path.join(SRC_ROOT, 'components'),
  path.join(SRC_ROOT, 'scaf'),
  path.join(SRC_ROOT, 'backup'),
  path.join(SRC_ROOT, 'contexts'),
  path.join(SRC_ROOT, 'hooks'),
  path.join(SRC_ROOT, 'services')
];

const URL_REGEX = /https:\/\/static\.codia\.ai\/image\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp))/g;

function listFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else if (/\.(t|j)sx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

function toRequire(date, filename, fromFile) {
  // Calculate relative path from file to assets/images
  // Files are under app/app/... or app/components/... so '../assets' should work from those
  // We'll compute a safe relative path to app/assets/images
  const assetsImages = path.join(ROOT, 'assets', 'images', date, filename);
  // relative from the file's directory to ROOT/assets/images/date/file
  const rel = path.relative(path.dirname(fromFile), assetsImages).replace(/\\/g, '/');
  return `require('${rel}')`;
}

function transform(content, filePath) {
  let changed = false;

  // Replace Image source uri objects: source={{ uri: 'https://...' }}
  content = content.replace(/source={{\s*uri:\s*'(https:\/\/static\.codia\.ai\/image\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp))'\s*}}/g, (m, url) => {
    const m2 = URL_REGEX.exec(url);
    URL_REGEX.lastIndex = 0;
    if (!m2) return m;
    const [, date, filename] = m2;
    changed = true;
    return `source={${toRequire(date, filename, filePath)}}`;
  });

  // Replace Image source uri objects with double quotes: source={{ uri: "https://..." }}
  content = content.replace(/source={{\s*uri:\s*"(https:\/\/static\.codia\.ai\/image\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp))"\s*}}/g, (m, url) => {
    const m2 = URL_REGEX.exec(url);
    URL_REGEX.lastIndex = 0;
    if (!m2) return m;
    const [, date, filename] = m2;
    changed = true;
    return `source={${toRequire(date, filename, filePath)}}`;
  });

  // Replace plain string assignments like flag: 'https://static.codia.ai/image/DATE/FILE'
  content = content.replace(/([\w$]+)\s*:\s*'(https:\/\/static\.codia\.ai\/image\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp))'/g, (m, key, url) => {
    const m2 = URL_REGEX.exec(url);
    URL_REGEX.lastIndex = 0;
    if (!m2) return m;
    const [, date, filename] = m2;
    changed = true;
    return `${key}: ${toRequire(date, filename, filePath)}`;
  });

  // Replace plain string assignments with double quotes like flag: "https://static.codia.ai/image/DATE/FILE"
  content = content.replace(/([\w$]+)\s*:\s*"(https:\/\/static\.codia\.ai\/image\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp))"/g, (m, key, url) => {
    const m2 = URL_REGEX.exec(url);
    URL_REGEX.lastIndex = 0;
    if (!m2) return m;
    const [, date, filename] = m2;
    changed = true;
    return `${key}: ${toRequire(date, filename, filePath)}`;
  });

  // Replace iconSource prop assignments: iconSource="https://..."
  content = content.replace(/iconSource\s*=\s*"(https:\/\/static\.codia\.ai\/image\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp))"/g, (m, url) => {
    const m2 = URL_REGEX.exec(url);
    URL_REGEX.lastIndex = 0;
    if (!m2) return m;
    const [, date, filename] = m2;
    changed = true;
    return `iconSource={${toRequire(date, filename, filePath)}}`;
  });

  // Replace iconSource prop assignments with single quotes: iconSource='https://...'
  content = content.replace(/iconSource\s*=\s*'(https:\/\/static\.codia\.ai\/image\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp))'/g, (m, url) => {
    const m2 = URL_REGEX.exec(url);
    URL_REGEX.lastIndex = 0;
    if (!m2) return m;
    const [, date, filename] = m2;
    changed = true;
    return `iconSource={${toRequire(date, filename, filePath)}}`;
  });

  // Replace ternary/conditional expressions: photoURL || 'https://...'
  content = content.replace(/\|\|\s*'(https:\/\/static\.codia\.ai\/image\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp))'/g, (m, url) => {
    const m2 = URL_REGEX.exec(url);
    URL_REGEX.lastIndex = 0;
    if (!m2) return m;
    const [, date, filename] = m2;
    changed = true;
    return `|| ${toRequire(date, filename, filePath)}`;
  });

  return { content, changed };
}

(function main() {
  const files = TARGET_DIRS.flatMap((d) => listFiles(d));
  let total = 0, changedCount = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const { content, changed } = transform(text, f);
    total++;
    if (changed) {
      fs.writeFileSync(f, content);
      changedCount++;
      console.log(`Updated: ${path.relative(ROOT, f)}`);
    }
  }
  console.log(`Processed ${total} files; updated ${changedCount}.`);
})();
