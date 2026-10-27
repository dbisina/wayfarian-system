// server/utils/vehiclePhoto.js
// Prepares an uploaded vehicle photo: the small copy that is stored, and (when the cut-out service
// is configured) a larger copy for it to work from.

const sharp = require('sharp');

const STORED = { width: 800, height: 600, quality: 85 };
const CUTOUT = { side: 1600, quality: 90 };

/**
 * rotate() applies the phone's orientation first: resizing drops the EXIF tag, so without it a photo
 * taken in portrait would be stored on its side. The cut-out is only as sharp as the photo it is
 * given, so it gets a bigger copy than the stored one (which it replaces, so the stored one is only
 * the fallback).
 */
async function prepareVehiclePhotos(buffer, { forCutout = false } = {}) {
  const stored = await sharp(buffer)
    .rotate()
    .resize(STORED.width, STORED.height, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: STORED.quality })
    .toBuffer();
  const large = forCutout
    ? await sharp(buffer)
        .rotate()
        .resize(CUTOUT.side, CUTOUT.side, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: CUTOUT.quality })
        .toBuffer()
    : null;
  return { stored, forCutout: large };
}

module.exports = { prepareVehiclePhotos, STORED, CUTOUT };
