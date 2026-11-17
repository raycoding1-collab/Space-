// Propulsion and the ends of the city: the engine wall with seven colossal drives and twenty-four
// auxiliaries, sculpted lift vanes along the flanks with glowing leading edges, and at the bow the
// Lantern observatory and a crystalline beacon.
import * as THREE from 'three';
import { Shape, ShapeBatch, Z, rect, circle, regular } from './geo.js';
import { Batch, Instancer } from '../lib/geo.js';
import { RNG, TAU, smoothstep as sm } from '../lib/rng.js';
import { Z_STERN, Z_BOW, halfWidth } from './layout.js';
import { crossSection } from './foundation.js';
import { createEngineSystem, addEngine } from '../ship/engines.js';
import { LightSet, NAV } from '../ship/lights.js';
import { crystalMat } from './spire.js';

export function buildStern(M, ctx) {
  const root = new THREE.Group();
  root.name = 'engines-and-prow';
  const B = new ShapeBatch();
  const rng = new RNG(2468);
  const lights = new LightSet();

  // ---------------------------------------------------------------- engine wall
  const sys = createEngineSystem();
  const EM = { hullBlack: M.darkPlain, armorDark: M.darkPlain, glowThroat: M.glowThroat, chrome: M.steelPlain, hullDark: M.darkPlain, glowCyanSoft: M.glowCyan };
  const batch = new Batch();
  const darkI = new Instancer(new THREE.BoxGeometry(1, 1, 1), M.darkPlain);
  const plumes = new THREE.Group();
  plumes.name = 'plumes';
  const zW = Z_STERN;
  const mains = [];
  for (let k = 0; k < 7; k++) {
    const x = (k - 3) * 1230;
    const y = -1120 + Math.abs(k - 3) * 70;
    mains.push([x, y]);
    addEngine(sys, batch, root, plumes, lights, EM, darkI, { cx: x, cy: y, zThroat: zW - 40, rThroat: 170, rExit: 400, len: 640, coils: 4, plumeLen: 11000, segs: 72 });
    // housing ring set into the wall
    const hs = new Shape();
    hs.loft([circle(470, 72, x, y).map(([a, b]) => [a, b, zW + 2]), circle(470, 72, x, y).map(([a, b]) => [a, b, zW - 60]), circle(430, 72, x, y).map(([a, b]) => [a, b, zW - 70])], Z.METAL, { closed: true, crease: 50, orient: (p) => [p[0] - x, p[1] - y, 0] });
    hs.loft([circle(476, 72, x, y).map(([a, b]) => [a, b, zW - 20]), circle(476, 72, x, y).map(([a, b]) => [a, b, zW - 30])], Z.TRIM, { closed: true, orient: (p) => [p[0] - x, p[1] - y, 0] });
    B.get(M.engineHousing).add(hs);
  }
  // auxiliaries: a row high on the wall and a row between and outside the mains
  const aux = [];
  for (let k = 0; k < 12; k++) aux.push([(k - 5.5) * 760, -330]);
  for (let k = 0; k < 6; k++) aux.push([(k - 2.5) * 1230 + (k < 3 ? -615 : 615) * 0, -1820]);
  for (let k = 0; k < 6; k++) aux.push([(k < 3 ? -1 : 1) * (4300 - (k % 3) * 0) , -560 - (k % 3) * 360]);
  let nAux = 0;
  aux.slice(0, 24).forEach(([x, y]) => {
    const s = crossSection(Z_STERN);
    if (Math.abs(x) > s.X - 160) return;
    nAux++;
    addEngine(sys, batch, root, plumes, lights, EM, darkI, { cx: x, cy: y, zThroat: zW - 20, rThroat: 42, rExit: 105, len: 190, coils: 2, plumeLen: 2600, segs: 36 });
    const hs = new Shape();
    hs.loft([circle(128, 36, x, y).map(([a, b]) => [a, b, zW + 2]), circle(128, 36, x, y).map(([a, b]) => [a, b, zW - 26])], Z.METAL, { closed: true, orient: (p) => [p[0] - x, p[1] - y, 0] });
    B.get(M.engineHousing).add(hs);
  });
  console.log(`[city] auxiliaries: ${nAux}`);
  batch.build(root, { name: 'engines' });
  darkI.build(root, 'engine-ribs');
  root.add(plumes);
  ctx.animated.push((t) => sys.update(t));
  ctx.engines = mains;
  // ribbed buttresses between the drives, and a crown of lights along the top of the wall
  {
    const s = crossSection(Z_STERN);
    for (let k = 0; k < 8; k++) {
      const x = (k - 3.5) * 1230;
      if (Math.abs(x) > s.X - 200) continue;
      const sh = new Shape();
      sh.prism(rect(60, 120, x, zW - 50), -2000, -60, Z.CLAD, Z.METAL);
      sh.prism(rect(4, 2, x, zW - 111), -1900, -120, Z.TRIM, null);
      B.get(M.engineHousing).add(sh);
    }
    for (let x = -s.W + 100; x < s.W - 100; x += 160) lights.add(new THREE.Vector3(x, -20, zW - 6), NAV.red, { intensity: 6, size: 5, period: 3, phase: x / 9000, duty: 0.2 });
  }

  // ---------------------------------------------------------------- lift vanes along the flanks
  const vanes = [-12600, -9400, -5400, -1700, 2300, 6200];
  for (const zc of vanes) {
    for (const side of [-1, 1]) {
      const s = crossSection(zc);
      const yRoot = s.y3 - 520;
      // root x on the belly at that height
      let xr = s.X;
      for (const [bx, by] of s.belly) { if (by <= yRoot) { xr = bx; break; } }
      const root0 = [side * (xr - 40), yRoot, zc];
      const chordR = 1900, chordT = 640, span = 1500, drop = 520, sweep = -900;
      const N = 12, secs = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const ch = chordR + (chordT - chordR) * Math.pow(t, 0.8);
        const th = 60 * (1 - t) + 14;
        const cx = root0[0] + side * span * t, cy = root0[1] - drop * Math.pow(t, 1.4), cz = root0[2] + sweep * Math.pow(t, 1.3);
        // airfoil-ish section in the y/z plane (leading edge toward +z)
        const pts = [];
        const M2 = 10;
        for (let j = 0; j < M2; j++) {
          const a = (j / M2) * TAU;
          const u = (Math.cos(a) * 0.5 + 0.5); // 0 trailing .. 1 leading
          const thick = th * Math.sin(Math.PI * Math.pow(u, 0.7)) * Math.sign(Math.sin(a) || 1);
          pts.push([cx, cy + thick * 0.5, cz - ch / 2 + ch * u]);
        }
        secs.push(pts);
      }
      B.get(M.vaneMat).loft(secs, Z.CLAD, { closed: true, crease: 70, orient: (p) => {
        // outward from the section's chord line
        let best = secs[0], bd = 1e18;
        for (const sc of secs) { const d = Math.abs(sc[0][0] - p[0]); if (d < bd) { bd = d; best = sc; } }
        let cy = 0, cz = 0; for (const q of best) { cy += q[1] / best.length; cz += q[2] / best.length; }
        return [0, p[1] - cy, (p[2] - cz) * 0.05];
      } });
      // glowing leading edge
      const edge = [];
      for (let i = 0; i <= N; i++) {
        const p = secs[i][0];
        edge.push([[p[0], p[1] + 4, p[2] + 2], [p[0], p[1] - 4, p[2] + 2]]);
      }
      B.get(M.vaneMat).loft(edge, Z.TRIM, { closed: false, orient: [0, 0, 1] });
      lights.add(new THREE.Vector3(secs[N][0][0], secs[N][0][1], secs[N][0][2]), side > 0 ? NAV.green : NAV.red, { intensity: 16, size: 9, period: 1.8, phase: zc * 0.0001, duty: 0.12 });
    }
  }

  // ---------------------------------------------------------------- the Lantern observatory
  {
    const zc = 14300, base = 0;
    const sh = new Shape();
    sh.prism(circle(140, 48, 0, zc), base, base + 18, Z.STONE, Z.GARDEN);
    const H = 360;
    sh.tower([{ poly: circle(46, 32), y: base + 18, oz: zc }, { poly: circle(30, 32), y: base + H, oz: zc }], Z.FACADE, { crease: 80, cap: null });
    // stacked observation discs
    for (let k = 0; k < 6; k++) {
      const y = base + 60 + k * 46, r = 64 + 34 * Math.sin((k / 5) * Math.PI);
      sh.prism(circle(r, 48, 0, zc), y, y + 12, Z.GLASS, Z.GARDEN);
      sh.walls(circle(r + 0.5, 48, 0, zc), y - 1.2, y, Z.TRIM);
    }
    // the lantern: a gilded cage around a glowing glass prism
    const ly = base + H;
    sh.prism(regular(6, 70, 0, 0, zc), ly, ly + 8, Z.METAL, Z.STONE);
    sh.prism(regular(6, 56, 0, 0, zc), ly + 8, ly + 96, Z.GLASS, null);
    for (const [px, pz] of regular(6, 62, 0, 0, zc)) sh.beam([px, ly + 8, pz], [px * 0.4, ly + 150, zc + (pz - zc) * 0.4], 5, 5, Z.METAL);
    sh.cone(0, zc, 66, 2, ly + 96, ly + 150, Z.METAL, 6);
    B.get(M.lantern).add(sh);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(50, 50, 84, 6), M.glowWarm);
    glow.position.set(0, ly + 52, zc);
    root.add(glow);
    lights.add(new THREE.Vector3(0, ly + 160, zc), NAV.warm, { intensity: 20, size: 14, period: 4, duty: 0.6 });
    ctx.lantern = new THREE.Vector3(0, ly + 50, zc);
  }

  // ---------------------------------------------------------------- crystalline bow beacon
  {
    const s = crossSection(Z_BOW - 200);
    const y = -Math.max(120, s.K * 0.35);
    const g = new Shape();
    const ring = (t, r) => regular(6, r, 0.2).map(([a, b]) => [a, b + y, Z_BOW - 500 + 1400 * t]);
    // a long hexagonal bipyramid lying along the axis, pointing forward
    const rings = [ring(0, 4), ring(0.15, 70), ring(0.55, 58), ring(1, 1)].map((rr) => rr.map(([a, b, c]) => [a, b, c]));
    // loft along z: build sections perpendicular to z
    const secs = rings.map((rr) => rr.map(([a, b, c]) => [a, b, c]));
    const geoS = new Shape();
    geoS.loft(secs.map((sec) => sec.map(([a, b, c]) => [a, b - y, c - Z_BOW])), 0, { closed: true, crease: 20 });
    const mesh = new THREE.Mesh(geoS.toGeometry(), crystalMat(2.2));
    mesh.position.set(0, y, Z_BOW);
    root.add(mesh);
    void g;
    lights.add(new THREE.Vector3(0, y, Z_BOW + 920), new THREE.Color(1.0, 0.85, 0.6), { intensity: 40, size: 24, period: 3.0, duty: 0.35 });
    lights.add(new THREE.Vector3(0, y, Z_BOW + 920), new THREE.Color(1.0, 0.9, 0.75), { intensity: 6, size: 12 });
    ctx.bowBeacon = new THREE.Vector3(0, y, Z_BOW + 600);
    // the bow edge: a gilded stem from deck to keel
    const stem = new Shape();
    const zs = [Z_BOW - 1400, Z_BOW - 700, Z_BOW - 10];
    const sec = (z) => { const c = crossSection(z); return [[-6, 2, z], [6, 2, z], [6, -c.K, z], [-6, -c.K, z]].map(([a, b, cz]) => [a + 0 * halfWidth(z), b, cz]); };
    stem.loft(zs.map(sec), Z.METAL, { closed: true, crease: 30 });
    B.get(M.metal).add(stem);
  }

  B.build(root, { name: 'stern' });
  lights.build(root, { name: 'stern-lights' });
  void sm; void rng;
  return root;
}
