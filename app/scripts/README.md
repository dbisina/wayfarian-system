# Static Asset Management Scripts

This folder contains scripts to manage static assets from Codia.ai throughout your app.

## Overview

When using Codia.ai to generate UI components, images are hosted on `static.codia.ai`. These scripts help you:

1. **Download** all remote assets to local storage
2. **Replace** remote URLs with local `require()` statements
3. Improve app performance and reduce external dependencies

## Scripts

### 1. `download-static-assets.js`

**Purpose**: Scans your entire app and downloads all static.codia.ai images to local storage.

**What it does**:
- Scans: `app/`, `components/`, `scaf/`, `backup/`, `contexts/`, `hooks/`, `services/`
- Finds all URLs matching: `https://static.codia.ai/image/YYYY-MM-DD/filename.ext`
- Downloads to: `assets/images/YYYY-MM-DD/filename.ext`
- Creates manifest: `assets/images/static.codia.manifest.json`
- Skips already downloaded files

**Usage**:
```bash
cd app
node scripts/download-static-assets.js
```

**Output**:
```
Found 127 unique static assets.
Downloading https://static.codia.ai/image/2025-09-26/pvtm78LBD6.png -> assets/images/2025-09-26/pvtm78LBD6.png
Skip exists: assets/images/2025-09-26/MN0Tj1LcZr.png
...
Wrote manifest assets/images/static.codia.manifest.json
```

### 2. `replace-static-urls.js`

**Purpose**: Replaces remote URLs with local `require()` statements in your code.

**What it does**:
- Scans same directories as download script
- Finds URL patterns and replaces them with local requires
- Handles multiple patterns:
  - `source={{ uri: 'https://...' }}` → `source={require('../../assets/...')}`
  - `icon: 'https://...'` → `icon: require('../../assets/...')`
  - `iconSource="https://..."` → `iconSource={require('../../assets/...')}`
  - `photoURL || 'https://...'` → `photoURL || require('../../assets/...')`
- Calculates correct relative paths from each file

**Usage**:
```bash
cd app
node scripts/replace-static-urls.js
```

**Output**:
```
Updated: app/(tabs)/index.tsx
Updated: app/(tabs)/leaderboard.tsx
Updated: app/journey.tsx
...
Processed 89 files; updated 34.
```

## Recommended Workflow

### Initial Setup (One-time)

1. **Download all assets**:
   ```bash
   cd app
   npm run download-assets
   # or: node scripts/download-static-assets.js
   ```

2. **Review the downloads**:
   - Check `assets/images/` folders
   - Verify all images downloaded successfully
   - Review `static.codia.manifest.json`

3. **Replace URLs in code**:
   ```bash
   npm run replace-assets
   # or: node scripts/replace-static-urls.js
   ```

4. **Test your app**:
   ```bash
   npm start
   ```

5. **Commit changes**:
   ```bash
   git add assets/images/
   git add app/ components/ scaf/
   git commit -m "Replace remote assets with local requires"
   ```

### After Adding New Codia Components

When you paste new Codia-generated code:

```bash
# Download any new images
npm run download-assets

# Replace URLs
npm run replace-assets

# Test
npm start
```

## NPM Scripts

Add these to your `package.json` for convenience:

```json
{
  "scripts": {
    "download-assets": "node scripts/download-static-assets.js",
    "replace-assets": "node scripts/replace-static-urls.js",
    "sync-assets": "npm run download-assets && npm run replace-assets"
  }
}
```

## File Coverage

The scripts scan these directories:

```
app/
├── app/                  ✅ All screens and routes
├── components/           ✅ Reusable components  
├── scaf/                 ✅ Scaffold/template files
├── backup/               ✅ Backup components
├── contexts/             ✅ React contexts
├── hooks/                ✅ Custom hooks
└── services/             ✅ API and utility services
```

## Supported Patterns

The replacement script handles:

### Image Components
```tsx
// Before
<Image source={{ uri: 'https://static.codia.ai/image/2025-09-26/image.png' }} />

// After
<Image source={require('../../assets/images/2025-09-26/image.png')} />
```

### Object Properties
```tsx
// Before
const user = {
  avatar: 'https://static.codia.ai/image/2025-09-26/avatar.png'
};

// After
const user = {
  avatar: require('../../assets/images/2025-09-26/avatar.png')
};
```

### Custom Props
```tsx
// Before
<CustomIcon iconSource="https://static.codia.ai/image/2025-09-26/icon.png" />

// After
<CustomIcon iconSource={require('../../assets/images/2025-09-26/icon.png')} />
```

### Fallback Values
```tsx
// Before
source={{ uri: user?.photoURL || 'https://static.codia.ai/image/2025-09-26/default.png' }}

// After
source={{ uri: user?.photoURL || require('../../assets/images/2025-09-26/default.png') }}
```

## Supported File Types

- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`
- Code files: `.ts`, `.tsx`, `.js`, `.jsx`

## Manifest File

`assets/images/static.codia.manifest.json` contains:

```json
[
  {
    "url": "https://static.codia.ai/image/2025-09-26/pvtm78LBD6.png",
    "local": "assets/images/2025-09-26/pvtm78LBD6.png"
  },
  ...
]
```

Use this for:
- Tracking downloaded assets
- Debugging missing images
- Reverting to remote URLs if needed

## Benefits

### Performance
- ✅ Faster image loading (bundled with app)
- ✅ No network requests for static assets
- ✅ Works offline immediately
- ✅ Better caching

### Reliability
- ✅ No dependency on external CDN
- ✅ No broken images if Codia.ai is down
- ✅ Version control for all assets
- ✅ Consistent across environments

### Developer Experience
- ✅ All assets tracked in Git
- ✅ TypeScript autocomplete for paths
- ✅ Clear asset organization by date
- ✅ Easy to audit what's being used

## Troubleshooting

### "Failed to download" errors

**Problem**: Some images fail to download
```
Failed to download https://static.codia.ai/image/2025-09-26/missing.png: 404
```

**Solution**: 
- Image might have been deleted from Codia
- Replace with a placeholder or regenerate component

### "Module not found" after replacement

**Problem**: App crashes with module not found error

**Solution**:
```bash
# Make sure you downloaded assets first
npm run download-assets

# Then replace URLs
npm run replace-assets

# Clear Metro bundler cache
npm start -- --clear
```

### Wrong relative paths

**Problem**: Images not loading after replacement

**Solution**: The script calculates relative paths automatically. If issues persist:
1. Check the file structure matches expectations
2. Verify assets are in `assets/images/DATE/file.ext`
3. Run from app root directory (`cd app`)

### Assets not found in certain directories

**Problem**: Some files still have remote URLs

**Solution**: Check if the directory is in the scan list:
```javascript
// In both scripts, verify these directories exist and are scanned:
const TARGET_DIRS = [
  path.join(SRC_ROOT, 'app'),
  path.join(SRC_ROOT, 'components'),
  path.join(SRC_ROOT, 'scaf'),
  // ... add your directory here
];
```

## Advanced Usage

### Dry Run (Preview Changes)

To see what would be replaced without modifying files:

```bash
# Temporarily modify replace-static-urls.js
# Comment out: fs.writeFileSync(f, content);
# Add: console.log('Would update:', path.relative(ROOT, f));

node scripts/replace-static-urls.js
```

### Selective Download

To download only specific date ranges:

```javascript
// In download-static-assets.js, filter matches:
for (const { url, date, filename } of matches) {
  if (date < '2025-09-01') continue; // Skip old assets
  // ... download logic
}
```

### Clean Up Old Assets

Remove unused images:

```bash
# Find assets not referenced in code
cd app/assets/images
find . -name "*.png" | while read img; do
  name=$(basename "$img")
  if ! grep -r "$name" ../../app ../../components; then
    echo "Unused: $img"
  fi
done
```

## Best Practices

1. **Download before replacing**: Always run `download-assets` before `replace-assets`
2. **Commit together**: Commit both code changes and downloaded assets in same PR
3. **Regular audits**: Periodically check for unused assets
4. **Optimize images**: Use tools like `sharp` or `imagemin` to compress downloads
5. **Git LFS**: For large asset collections, consider Git LFS

## Integration with CI/CD

Add to your build pipeline:

```yaml
# .github/workflows/build.yml
- name: Verify assets are local
  run: |
    cd app
    if grep -r "static.codia.ai" app/ components/ --exclude-dir=node_modules; then
      echo "Error: Found remote Codia URLs. Run npm run sync-assets"
      exit 1
    fi
```

## Questions?

- Check if scripts need directory updates for new folders
- Verify your project structure matches the expected layout
- Run scripts from the `app/` directory
- Check the manifest file to see what was downloaded
- Use `--clear` flag when starting Metro bundler after changes
