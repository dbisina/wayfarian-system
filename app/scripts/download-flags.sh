#!/bin/bash
# Script to download all country flags from flagcdn.com

cd "$(dirname "$0")/../assets/flags"

echo "Downloading country flags (64x64 PNG)..."
echo "Target directory: $(pwd)"

countries="af al dz ar am au at az bh bd by be bz bj bt bo ba bw br bn bg bf bi kh cm ca cv cf td cl cn co km cg cr hr cu cy cz dk dj do ec eg sv gq er ee et fj fi fr ga gm ge de gh gr gt gn gw gy ht hn hu is in id ir iq ie il it jm jp jo kz ke ki kw kg la lv lb ls lr ly li lt lu mg mw my mv ml mt mh mr mu mx fm md mc mn me ma mz mm na nr np nl nz ni ne ng kp mk no om pk pw ps pa pg py pe ph pl pt qa ro ru rw kn lc vc ws sm st sa sn rs sc sl sg sk si sb so za kr ss es lk sd sr se ch sy tw tj tz th tl tg to tt tn tr tm tv ug ua ae gb us uy uz vu va ve vn ye zm zw"

count=0
total=195

for code in $countries; do
  count=$((count + 1))
  echo "[$count/$total] Downloading ${code}.png..."
  curl -s -o "${code}.png" "https://flagcdn.com/64x64/${code}.png"
  
  if [ -f "${code}.png" ]; then
    size=$(wc -c < "${code}.png")
    if [ "$size" -lt 500 ]; then
      echo "  ⚠️  Warning: ${code}.png seems too small (${size} bytes)"
    fi
  else
    echo "  ❌ Failed to download ${code}.png"
  fi
  
  # Small delay to be nice to the server
  sleep 0.1
done

echo ""
echo "✅ Download complete!"
echo "Downloaded $(ls -1 *.png 2>/dev/null | wc -l) flag files"
echo ""
echo "Verifying downloads..."
missing=0
for code in $countries; do
  if [ ! -f "${code}.png" ]; then
    echo "Missing: ${code}.png"
    missing=$((missing + 1))
  fi
done

if [ $missing -eq 0 ]; then
  echo "✅ All flags downloaded successfully!"
else
  echo "⚠️  $missing flags are missing"
fi
