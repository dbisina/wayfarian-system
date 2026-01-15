const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../app/i18n/locales');
const enPath = path.join(localesDir, 'en.json');

if (!fs.existsSync(enPath)) {
    console.error('en.json not found!');
    process.exit(1);
}

const enContent = JSON.parse(fs.readFileSync(enPath, 'utf8'));

function deepMerge(target, source) {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                }
            }
        });
    }
    return output;
}

function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

// Function to recursively sort keys to match English structure order
function sortKeys(target, source) {
    const sorted = {};
    Object.keys(source).forEach(key => {
        if (key in target) {
            if (isObject(source[key]) && isObject(target[key])) {
                sorted[key] = sortKeys(target[key], source[key]);
            } else {
                sorted[key] = target[key];
            }
        } else {
            // Should have been merged already, but just in case
            sorted[key] = source[key];
        }
    });
    // Append any keys in target that are NOT in source (extra keys?)
    // In our case we want strict structure match to source (en), so maybe ignore extras or append at end.
    // Let's keep extras to avoid data loss, but put them at end.
    Object.keys(target).forEach(key => {
        if (!(key in source)) {
            sorted[key] = target[key];
        }
    });
    return sorted;
}

const files = fs.readdirSync(localesDir);

files.forEach(file => {
    if (file === 'en.json' || !file.endsWith('.json')) return;

    const filePath = path.join(localesDir, file);
    try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        // Merge missing keys from EN
        const merged = deepMerge(content, enContent);
        // Sort keys to match EN structure for clean diffs
        const sorted = sortKeys(merged, enContent);

        fs.writeFileSync(filePath, JSON.stringify(sorted, null, 4));
        console.log(`Updated ${file}`);
    } catch (e) {
        console.error(`Error processing ${file}:`, e);
    }
});
