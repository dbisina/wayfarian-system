// Runs after `npm install` so the model is part of the build. A failure here must not fail the
// build: the service retries the download when it starts.
require('../server')
  .ensureModel()
  .then((p) => console.log('[cutout] model ready at', p))
  .catch((e) => console.warn('[cutout] model not fetched at build:', e.message));
