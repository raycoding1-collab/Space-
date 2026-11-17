// Renders a film, frame by frame, from the live engine (headless Chromium).
//
//   node tools/render-film.js <shots.json> <outdir> [--w 1920] [--h 800] [--fps 24] [--q high]
//                             [--from 0] [--to N] [--every 1] [--offset 0] [--samples 4] [--shadow-every 2] [--query 'cullk=2&lodpx=4']
//
// shots.json: { "fps": 24, "t0": 120, "shots": [ { "name", "dur", "fov" | "fovs": [..],
//               "keys": [ { "pos": [x,y,z], "target": [x,y,z] }, ... ], "ease": 0..1 } ] }
// Each shot moves the camera along a Catmull-Rom spline through its keys (position and target both),
// with an ease-in-out blend of `ease` (0 = constant speed). Simulation time runs on continuously, one
// 1/fps step per frame, so traffic, lights and the Halo move as they would in real time.
// Frames already in <outdir> are skipped (resume); --every/--offset split a run across processes.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const shotsFile = argv[0], outdir = argv[1];
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const W = +opt('w', 1920), H = +opt('h', 800), Q = opt('q', 'high');
const SAMPLES = opt('samples', null), SHADOW_EVERY = +opt('shadow-every', 2), EXTRA = opt('query', '');
const film = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
const FPS = +opt('fps', film.fps || 24);
const every = +opt('every', 1), offset = +opt('offset', 0);

// ------------------------------------------------------------------ camera paths
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return p1.map((_, i) => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}
function along(pts, u) {
  if (pts.length === 1) return pts[0].slice();
  const n = pts.length - 1, s = Math.min(n - 1e-9, Math.max(0, u * n)), i = Math.floor(s), t = s - i;
  const P = (k) => pts[Math.max(0, Math.min(n, k))];
  // extrapolate the end tangents so the path does not stall at its ends
  const p0 = i === 0 ? P(0).map((v, j) => 2 * v - P(1)[j]) : P(i - 1);
  const p3 = i + 1 === n ? P(n).map((v, j) => 2 * v - P(n - 1)[j]) : P(i + 2);
  return catmull(p0, P(i), P(i + 1), p3, t);
}
const smooth = (t) => t * t * (3 - 2 * t);
function cameraAt(shot, t) {
  const u = (1 - (shot.ease ?? 0.6)) * t + (shot.ease ?? 0.6) * smooth(t);
  const pos = along(shot.keys.map((k) => k.pos), u);
  const target = along(shot.keys.map((k) => k.target), u);
  const fov = shot.fovs ? along(shot.fovs.map((f) => [f]), u)[0] : (shot.fov || 50);
  return { pos, target, fov };
}

// frame list
const frames = [];
let t0 = film.t0 ?? 100, fi = 0;
for (const shot of film.shots) {
  const n = Math.round(shot.dur * FPS);
  for (let k = 0; k < n; k++) {
    frames.push({ i: fi, shot: shot.name, time: (shot.time ?? 0) + t0 + fi / FPS, ...cameraAt(shot, n > 1 ? k / (n - 1) : 0) });
    fi++;
  }
}
const from = +opt('from', 0), to = Math.min(+opt('to', frames.length), frames.length);
if (argv.includes('--list')) { console.log(`${frames.length} frames, ${(frames.length / FPS).toFixed(1)} s`); process.exit(0); }

(async () => {
  fs.mkdirSync(outdir, { recursive: true });
  const todo = frames.slice(from, to).filter((f) => f.i % every === offset && !fs.existsSync(path.join(outdir, `f${String(f.i).padStart(5, '0')}.png`)));
  console.log(`${frames.length} frames in film; rendering ${todo.length} at ${W}×${H}`);
  if (!todo.length) return;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=12000'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  p.on('pageerror', (e) => { console.log(`[pageerror] ${e.message}`); });
  const tl = Date.now();
  await p.goto(`${process.env.BASE_URL || 'http://127.0.0.1:8765'}/index.html?still&ship=city&q=${Q}${SAMPLES !== null ? `&samples=${SAMPLES}` : ''}${EXTRA ? `&${EXTRA}` : ''}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.VESPERA && window.VESPERA.renderFrame, null, { timeout: 1800000, polling: 1000 });
  console.log(`ready ${((Date.now() - tl) / 1000).toFixed(1)}s`);
  let done = 0; const ts = Date.now();
  for (const f of todo) {
    const url = await p.evaluate(([W, H, f, se]) => {
      const V = window.VESPERA, T = V.camera.position.constructor;
      V.setView({ pos: new T(...f.pos), target: new T(...f.target), fov: f.fov });
      V.setSimTime(f.time);
      return V.renderFrame(W, H, 'image/png', 0.95, se);
    }, [W, H, f, SHADOW_EVERY]);
    fs.writeFileSync(path.join(outdir, `f${String(f.i).padStart(5, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    done++;
    if (done % 10 === 0 || done === todo.length) {
      const per = (Date.now() - ts) / 1000 / done;
      console.log(`${f.shot} f${f.i}  ${done}/${todo.length}  ${per.toFixed(1)} s/frame  eta ${((todo.length - done) * per / 60).toFixed(0)} min`);
    }
  }
  await b.close();
})();
