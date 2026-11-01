# Store listing media

`live/` holds what the stores show today (fetched 1 November 2026, App Store 1.1.2 and Google Play, both last updated 17 June 2026). It is for reference, not for upload.

| | App Store (iPhone) | Google Play (phone) |
|---|---|---|
| Screenshots live | 5 at 1242x2688 | 5 (one 390x844, four 2160x3840) |
| Preview video | none | none |

Both live sets are the old v1 design. Play's use placeholder content ("LOGO", San Francisco map, "Alex Ryder"), and one App Store caption has a typo ("meia form").

## Making the new set

Capture real screenshots from the app on a phone or simulator (any size, portrait), put them in one folder, then:

```bash
node scripts/store-media.js shots store-listing/captions.json <folder-with-your-captures> store-listing/out
node scripts/store-media.js feature store-listing/out/feature-graphic.png
node scripts/store-media.js preview <screen-recording.mp4> store-listing/out/preview.mp4
```

`captions.json` lists the files in store order with a short caption each:

```json
[
  { "file": "ride.png", "caption": "Record every ride" },
  { "file": "navigation.png", "caption": "Turn by turn, no surprises" }
]
```

Output sizes (checked against Apple's and Google's pages on 1 November 2026):

| Output | Size | Store rule |
|---|---|---|
| `out/ios` | 1320x2868 | iPhone, Dynamic Island (large). PNG, no alpha, up to 10 |
| `out/ios-medium` | 1206x2622 | iPhone, Dynamic Island (medium). Apple needs this size or scales from the large one |
| `out/android` | 1440x2560 | Play phone: 320 to 3840 px, long side at most 2x the short side, 2 to 8 per device type |
| `feature-graphic.png` | 1024x500 | Play feature graphic. PNG, no alpha |
| `preview.mp4` | 886x1920 | App Store preview: 15 to 30 s, up to 30 fps, H.264 plus AAC stereo, up to 500 MB, up to 3 |

Google Play wants screenshots that show the real app; Apple rejects listings that do not match it. Use captures of the running app, not mock-ups.
