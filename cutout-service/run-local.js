// Local check: node run-local.js <input.jpg> [more.jpg] writes <input>.cutout.png next to each file.
// MODEL_NAME picks the model (default isnet-general-use; silueta for the old one).
const fs = require('fs');
const { createCutout } = require('./cutout');
const { ensureModel } = require('./server');
const { resolveModel } = require('./models');
(async () => {
  const model = resolveModel();
  let t = Date.now();
  const c = await createCutout(await ensureModel(model), model);
  console.log(model.name, 'model load ms', Date.now() - t);
  for (const f of process.argv.slice(2)) {
    t = Date.now();
    const png = await c(fs.readFileSync(f));
    fs.writeFileSync(f.replace(/\.\w+$/, '') + `.${model.name}.cutout.png`, png);
    console.log(f, 'ms', Date.now() - t, 'bytes', png.length);
  }
  console.log('rss MB', Math.round(process.memoryUsage().rss / 1048576));
})().catch((e) => { console.error(e); process.exit(1); });
