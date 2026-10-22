// Local check: node run-local.js <input.jpg> [more.jpg] writes <input>.cutout.png next to each file.
const fs = require('fs');
const { createCutout } = require('./cutout');
(async () => {
  let t = Date.now();
  const c = await createCutout(process.env.MODEL_PATH || './models/silueta.onnx');
  console.log('model load ms', Date.now() - t);
  for (const f of process.argv.slice(2)) {
    t = Date.now();
    const png = await c(fs.readFileSync(f));
    fs.writeFileSync(f.replace(/\.\w+$/, '') + '.cutout.png', png);
    console.log(f, 'ms', Date.now() - t, 'bytes', png.length);
  }
  console.log('rss MB', Math.round(process.memoryUsage().rss / 1048576));
})().catch((e) => { console.error(e); process.exit(1); });
