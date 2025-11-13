# Custom Fonts Setup

## Required Fonts

### 1. Space Grotesk (Main UI Font)
**Source:** https://fonts.google.com/specimen/Space+Grotesk

**Download Instructions:**
1. Visit the Google Fonts link above
2. Click "Download family"
3. Extract the ZIP file
4. Copy these files to this directory:
   - `SpaceGrotesk-Regular.ttf` → Rename to `SpaceGrotesk-Regular.ttf`
   - `SpaceGrotesk-Medium.ttf` → Rename to `SpaceGrotesk-Medium.ttf`
   - `SpaceGrotesk-SemiBold.ttf` → Rename to `SpaceGrotesk-SemiBold.ttf`
   - `SpaceGrotesk-Bold.ttf` → Rename to `SpaceGrotesk-Bold.ttf`

### 2. Digital Numbers Font (Stats Display)
Choose ONE of these digital calculator-style fonts:

**Option A: Digital-7 (Recommended)**
- **Source:** https://www.dafont.com/digital-7.font
- **File name:** `digital-7.ttf` → Rename to `DigitalNumbers.ttf`
- **License:** Free for personal use

**Option B: DS-Digital**
- **Source:** https://www.dafont.com/ds-digital.font
- **File name:** Download and rename to `DigitalNumbers.ttf`
- **License:** Free

**Option C: Segment7**
- **Source:** https://www.fontspace.com/segment7-font-f12573
- **File name:** Download and rename to `DigitalNumbers.ttf`
- **License:** Free for personal use

## Installation Steps

1. **Download the fonts** from the sources above
2. **Place the font files** in this directory (`app/assets/fonts/`)
3. **Expected file structure:**
   ```
   app/assets/fonts/
   ├── SpaceGrotesk-Regular.ttf
   ├── SpaceGrotesk-Medium.ttf
   ├── SpaceGrotesk-SemiBold.ttf
   ├── SpaceGrotesk-Bold.ttf
   └── DigitalNumbers.ttf
   ```

4. **Load fonts in app** - Add to `app/_layout.tsx`:
   ```tsx
   import { useFonts } from 'expo-font';
   import * as SplashScreen from 'expo-splash-screen';

   // Prevent splash screen from auto-hiding
   SplashScreen.preventAutoHideAsync();

   export default function RootLayout() {
     const [fontsLoaded] = useFonts({
       'Space Grotesk': require('../assets/fonts/SpaceGrotesk-Regular.ttf'),
       'Digital Numbers': require('../assets/fonts/DigitalNumbers.ttf'),
     });

     useEffect(() => {
       if (fontsLoaded) {
         SplashScreen.hideAsync();
       }
     }, [fontsLoaded]);

     if (!fontsLoaded) {
       return null;
     }

     // ... rest of component
   }
   ```

5. **Restart Expo** with `npx expo start -c` to clear cache

## Quick Download Commands

For Space Grotesk (if you have `curl` or `wget`):
```bash
# Using Google Fonts API (may require additional processing)
# It's easier to download manually from the website
```

## Troubleshooting

- **Fonts not loading?** Make sure file names match exactly
- **Still showing default font?** Clear Expo cache with `npx expo start -c`
- **Build errors?** Ensure all font files are .ttf format (not .otf)

## Current Usage

The app currently uses these fonts in:
- **Space Grotesk**: Main UI text, labels, titles
- **Digital Numbers**: Stat values (distance, time, speed) on Home screen, Profile, and stat cards
