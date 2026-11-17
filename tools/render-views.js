// Usage: node batch.js <outdir> <w> <h> <query> <viewsJSONfile>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [outdir, w, h, query, viewsFile] = process.argv.slice(2);
  const W = parseInt(w), H = parseInt(h);
  const views = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
  fs.mkdirSync(outdir, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=12000'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
  const t0 = Date.now();
  await p.goto(`${process.env.BASE_URL || 'http://127.0.0.1:8765'}/index.html?still&${query}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.VESPERA && window.VESPERA.renderStill, null, { timeout: 1800000, polling: 1000 }).catch(async () => {
    console.log('TIMEOUT'); console.log(logs.join('\n')); process.exit(1);
  });
  console.log(`ready ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const v of views) {
    const t1 = Date.now();
    const url = await p.evaluate(([W, H, v]) => {
      const T = window.VESPERA.camera.position.constructor;
      if (v.t !== undefined) window.VESPERA.setTime(v.t);
      if (v.id) window.VESPERA.setView(v.id);
      else window.VESPERA.setView({ pos: new T(...v.pos), target: new T(...v.target), fov: v.fov || 50, up: v.up ? new T(...v.up) : null, frame: v.frame });
      return window.VESPERA.renderStill(v.w || W, v.h || H);
    }, [W, H, v]);
    const ext = (v.jpg ? 'jpg' : 'png');
    fs.writeFileSync(`${outdir}/${v.name}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`${v.name}: ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  }
  const info = await p.evaluate(() => { const i = window.VESPERA.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; });
  console.log(JSON.stringify(info));
  const filtered = logs.filter((l) => !/GPU stall|Automatic fallback|swiftshader|GL Driver Message/i.test(l));
  if (filtered.length) console.log(filtered.slice(0, 30).join('\n'));
  await b.close();
})();
