#!/usr/bin/env bash
# The server deploys from its own folder (Railway root directory is /server), so it cannot see
# packages/ride-core at build time. This builds ride-core and copies the compiled output into
# server/vendor/ride-core, which the server depends on. Run it after changing ride-core and commit
# the result. CI fails if the vendored copy is out of date.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/packages/ride-core"
npm install --no-audit --no-fund --silent
npm run build --silent
dest="$root/server/vendor/ride-core"
rm -rf "$dest"
mkdir -p "$dest"
cp -r dist "$dest/dist"
# Paths are resolved by node relative to this folder so it works with Git Bash on Windows too.
node -e "
const fs = require('fs');
const path = require('path');
const p = require('./package.json');
const out = path.join(process.cwd(), '..', '..', 'server', 'vendor', 'ride-core', 'package.json');
fs.writeFileSync(out, JSON.stringify({ name: p.name, version: p.version, description: p.description, main: p.main, types: p.types, files: ['dist'] }, null, 2) + '\n');
"
echo "vendored ride-core into server/vendor/ride-core"
