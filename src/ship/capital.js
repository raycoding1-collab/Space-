// VESPERA — capital starship. Assembles hull, armour, trench, tower, nacelles, engines and lights.
import * as THREE from 'three';
import { lathe, beamMatrix, Batch, Instancer, tiledCylinderZ, tiledBox, scaleUV, splitGroups } from '../lib/geo.js';
import { RNG, TAU, DEG, clamp } from '../lib/rng.js';
import {
  HULL, hullParams, hullPolygon, N_POLY, rightEdge, facetStrip, armourPlate, plateLayout, sternCap, facetFrame, QuadBuilder,
} from './hull.js';
import { makeConduitMaterial } from './conduit.js';
import { LightSet, NAV } from './lights.js';
import { GREEBLE_TONES } from './greebles.js';
import { createEngineSystem, addEngine } from './engines.js';

const { zStern: ZS, zProw: ZP } = HULL;

// Facet treatment for the right half (the left half mirrors it).
const EDGES = [
  { mat: 'armorDark', plate: { mats: ['armorDark', 'armor'], lift: 2.5 } }, // 0 keel
  { mat: 'armorDark', plate: { mats: ['armor', 'armor', 'armorLight'], lift: 3 } }, // 1 lower flank
  { mat: 'habDark' }, // 2 lower window band
  { mat: 'armorLight' }, // 3 chine bevel
  { mat: 'armorDark' }, // 4 channel lip
  { mat: 'channel' }, // 5 channel floor
  { mat: 'armorDark' }, // 6 channel lip
  { mat: 'habDark' }, // 7 upper window band
  { mat: 'armorDark', plate: { mats: ['armor', 'armorLight', 'armor'], lift: 3 } }, // 8 upper flank
  { mat: 'armorDark', plate: { mats: ['armorLight', 'armor'], lift: 3 } }, // 9 dorsal shoulder
  { mat: 'armorDark', plate: { mats: ['armorLight', 'armor', 'armorLight', 'armorLight'], lift: 3 } }, // 10 dorsal deck
  { mat: 'habDark' }, // 11 trench wall
  { mat: 'trench' }, // 12 trench floor
];

const BAYS = [[-640, -490], [-405, -255], [-170, -20]];
const BAY_F = [0.2, 0.8];
const TOWER = { z0: -1840, z1: -980 };
const GALLERIES = [[-420, -120], [1150, 1420]];
export const TRENCH = { z0: -1800, z1: 1240 };

export function buildCapitalShip(M, ctx) {
  const root = new THREE.Group();
  root.name = 'VESPERA';
  const batch = new Batch();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const darkI = new Instancer(box, M.trussDark);
  const trussI = new Instancer(box, M.truss);
  const greebleI = new Instancer(box, M.greeble, { colors: true });
  const lights = new LightSet();
  const m4 = new THREE.Matrix4();
  const rng = new RNG(2024);
  const channelMat = makeConduitMaterial({ color: new THREE.Vector3(0.28, 0.72, 1.0), speed: 320, base: 0.9, packet: 4.5, spacing: 220 });
  const mat = (k) => (k === 'channel' ? channelMat : M[k]);
  ctx.bays = [];

  // ============================================================== hull facets & armour
  for (let e = 0; e < N_POLY; e++) {
    const re = rightEdge(e);
    const def = EDGES[re];
    const isLowerFlank = re === 1;
    if (isLowerFlank) {
      // cut openings for the hangar bays
      const zs = [ZS, ...BAYS.flat(), ZP];
      for (let i = 0; i < zs.length - 1; i++) {
        const a = zs[i], b = zs[i + 1];
        const inBay = BAYS.some(([x, y]) => x === a && y === b);
        if (inBay) {
          // left/right margins either side of the opening
          const lo = e === 1 ? BAY_F : [1 - BAY_F[1], 1 - BAY_F[0]];
          batch.add(facetStrip(e, a, b, { f0: 0, f1: lo[0] }).geometry, mat(def.mat));
          batch.add(facetStrip(e, a, b, { f0: lo[1], f1: 1 }).geometry, mat(def.mat));
        } else {
          batch.add(facetStrip(e, a, b).geometry, mat(def.mat));
        }
      }
    } else {
      batch.add(facetStrip(e, ZS, ZP).geometry, mat(def.mat));
    }
    if (!def.plate) continue;
    const prng = new RNG(1000 + re * 17); // same layout both sides → symmetric armour
    const exclude = [];
    if (re === 1) exclude.push([BAYS[0][0] - 20, BAYS[2][1] + 20]);
    if (re === 10) exclude.push([TOWER.z0, TOWER.z1]);
    if (re === 8) for (const g of GALLERIES) exclude.push([g[0] - 12, g[1] + 12]);
    const segs = plateLayout(prng, ZS + 6, 2650, { min: re === 10 ? 120 : 160, max: re === 10 ? 260 : 340, gap: 10, exclude });
    segs.forEach(([a, b], i) => {
      const pm = def.plate.mats[i % def.plate.mats.length];
      const plate = armourPlate(e, a, b, { lift: def.plate.lift, inset: 3 });
      batch.add(plate.top, M[pm]);
      batch.add(plate.sides, M.armorDark);
      // second, narrower layer on some plates
      if (prng.chance(0.4) && b - a > 140) {
        const pad = prng.range(18, 40);
        const p2 = armourPlate(e, a + pad, b - pad, { lift: def.plate.lift + 3.5, inset: prng.range(10, 22) });
        batch.add(p2.top, M[pm === 'armorLight' ? 'armor' : 'armorLight']);
        batch.add(p2.sides, M.armorDark);
      }
      // glowing seam in the gap after this plate
      const next = segs[i + 1];
      if (next && next[0] - b < 14 && prng.chance(0.55)) {
        batch.add(facetStrip(e, b + 3.5, next[0] - 3.5, { lift: 0.5, insetA: 5, insetB: 5 }).geometry, re === 0 ? M.seamWarm : M.seam);
      }
    });
  }
  batch.add(sternCap(), M.armorDark);

  // ============================================================== exposed rib galleries (upper flanks)
  for (const e of [8, 17]) {
    for (const [za, zb] of GALLERIES) {
      // glowing machinery behind the ribs
      batch.add(facetStrip(e, za, zb, { lift: 0.4, insetA: 10, insetB: 10 }).geometry, M.seamWarm);
      batch.add(facetStrip(e, za, zb, { lift: 0.8, insetA: 22, insetB: 22 }).geometry, M.trench);
      for (let z = za; z <= zb + 0.1; z += 11) {
        const a = facetFrame(e, z, 0.02), b = facetFrame(e, z, 0.98);
        const pa = a.p.clone().addScaledVector(a.normal, 4), pb = b.p.clone().addScaledVector(b.normal, 4);
        beamMatrix(pa, pb, 3.2, 8, a.normal, m4, 0);
        darkI.add(m4);
      }
      // longitudinal stringers over the ribs
      for (const f of [0.2, 0.5, 0.8]) {
        const pts = [];
        for (const z of [za, zb]) { const q = facetFrame(e, z, f); pts.push(q.p.addScaledVector(q.normal, 8.5)); }
        beamMatrix(pts[0], pts[1], 2, 2, null, m4, 0);
        trussI.add(m4);
      }
      for (let z = za + 15; z < zb; z += 40) lights.add(facetFrame(e, z, 0.5).p.addScaledVector(facetFrame(e, z, 0.5).normal, 10), NAV.warm, { intensity: 3, size: 1.2 });
    }
  }

  // ============================================================== crimson livery stripe toward the prow
  for (const e of [9, 16]) {
    for (let z = 520; z < 2560; z += 260) {
      batch.add(facetStrip(e, z, z + 236, { lift: 3.4, f0: e === 9 ? 0.62 : 0.3, f1: e === 9 ? 0.7 : 0.38 }).geometry, M.armorAccent);
    }
  }

  // ============================================================== hangar bays (ventral flanks)
  for (const e of [1, 24]) {
    for (const [za, zb] of BAYS) {
      const zc = (za + zb) / 2;
      const f = e === 1 ? BAY_F : [1 - BAY_F[1], 1 - BAY_F[0]];
      const fr = facetFrame(e, zc, 0.5);
      const corner = (z, ff) => { const q = facetFrame(e, z, ff); return q.p; };
      const depth = 16;
      const P = [corner(za, f[0]), corner(za, f[1]), corner(zb, f[1]), corner(zb, f[0])];
      const Q = P.map((p) => p.clone().addScaledVector(fr.normal, -depth));
      const qb = new QuadBuilder();
      const centre = P.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(0.25);
      const inward = (a, b) => centre.clone().sub(a.clone().add(b).multiplyScalar(0.5)).normalize();
      for (let i = 0; i < 4; i++) qb.quad(P[i], P[(i + 1) % 4], Q[(i + 1) % 4], Q[i], inward(P[i], P[(i + 1) % 4]));
      batch.add(qb.geometry(), M.armorDark);
      // glowing interior
      const w = P[0].distanceTo(P[1]), h = P[0].distanceTo(P[3]);
      const basis = new THREE.Matrix4().makeBasis(fr.across, fr.along, fr.normal);
      const back = new THREE.PlaneGeometry(w, h);
      batch.add(back, M.bay, basis.clone().setPosition(centre.clone().addScaledVector(fr.normal, -depth + 0.2)));
      const field = new THREE.PlaneGeometry(w, h);
      batch.add(field, M.bayField, basis.clone().setPosition(centre.clone().addScaledVector(fr.normal, 0.6)));
      // frame
      for (let i = 0; i < 4; i++) {
        beamMatrix(P[i].clone().addScaledVector(fr.normal, 1.5), P[(i + 1) % 4].clone().addScaledVector(fr.normal, 1.5), 5, 4, fr.normal, m4, 5);
        darkI.add(m4);
      }
      // approach lights chasing toward the opening
      for (let j = 0; j < 12; j++) {
        const t = j / 11;
        for (const ff of [f[0] - 0.04, f[1] + 0.04]) {
          const p = facetFrame(e, za + t * (zb - za), ff).p.addScaledVector(fr.normal, 2);
          lights.add(p, NAV.amber, { period: 1.4, phase: -t * 0.8, duty: 0.14, size: 1.6, intensity: 9 });
        }
      }
      ctx.bays.push({ centre: centre.clone(), normal: fr.normal.clone(), tangent: fr.across.clone(), phi: Math.atan2(fr.normal.y, fr.normal.x), zc });
    }
  }

  // ============================================================== dorsal trench
  {
    const conduitMat = makeConduitMaterial({ color: new THREE.Vector3(0.25, 0.7, 1.0), speed: 280, base: 0.45, packet: 3.2, spacing: 180 });
    const warmMat = makeConduitMaterial({ color: new THREE.Vector3(1.0, 0.55, 0.22), speed: -160, base: 0.3, packet: 2.2, spacing: 260 });
    const floorY = (z) => { const p = hullParams(z); return p.Ht - p.td; };
    const lanes = [[0, 4.5, conduitMat], [-15, 2.6, warmMat], [15, 2.6, warmMat], [-24, 1.6, conduitMat], [24, 1.6, conduitMat]];
    for (const [x, r, cm] of lanes) {
      const pts = [];
      for (let z = TRENCH.z0; z <= TRENCH.z1; z += 60) pts.push(new THREE.Vector3(x, floorY(z) + r + 1.5, z));
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, r, 10, false);
      const mesh = new THREE.Mesh(tube, cm);
      root.add(mesh);
    }
    // machinery on the floor, gantry bridges, wall ribs and lights
    for (let i = 0; i < 520; i++) {
      const z = rng.range(TRENCH.z0 + 30, TRENCH.z1 - 30);
      const p = hullParams(z);
      if (p.tw < 20) continue;
      const side = rng.sign();
      const x = side * rng.range(6, p.tw - 3);
      if (Math.abs(Math.abs(x) - 15) < 4 || Math.abs(x) < 6.5) continue;
      const h = rng.range(1.5, 7), w = rng.range(2, 6), d = rng.range(3, 18);
      m4.makeScale(w, h, d).setPosition(x, p.Ht - p.td + h / 2, z);
      greebleI.add(m4, GREEBLE_TONES[rng.pick([2, 3, 3, 4, 4, 5])]);
    }
    for (let z = TRENCH.z0 + 80; z < TRENCH.z1 - 40; z += 230) {
      const p = hullParams(z);
      const half = p.tw + p.tl + 6;
      beamMatrix(new THREE.Vector3(-half, p.Ht + 1, z), new THREE.Vector3(half, p.Ht + 1, z), 6, 5, new THREE.Vector3(0, 1, 0), m4);
      trussI.add(m4);
      beamMatrix(new THREE.Vector3(-half, p.Ht + 1, z + 9), new THREE.Vector3(half, p.Ht + 1, z + 9), 3, 3, new THREE.Vector3(0, 1, 0), m4);
      darkI.add(m4);
      for (let k = -1; k <= 1; k += 2) {
        beamMatrix(new THREE.Vector3(k * p.tw * 0.95, p.Ht - p.td, z), new THREE.Vector3(k * (p.tw + p.tl * 0.5), p.Ht, z), 2.5, 2.5, null, m4);
        darkI.add(m4);
      }
      lights.add(new THREE.Vector3(0, p.Ht - 3, z + 4), NAV.warm, { intensity: 5, size: 1.8 });
      lights.add(new THREE.Vector3(-half, p.Ht + 4, z), NAV.amber, { period: 2.0, phase: z * 0.001, duty: 0.08, size: 1.6, intensity: 9 });
      lights.add(new THREE.Vector3(half, p.Ht + 4, z), NAV.amber, { period: 2.0, phase: z * 0.001, duty: 0.08, size: 1.6, intensity: 9 });
    }
    for (let z = TRENCH.z0 + 20; z < TRENCH.z1; z += 45) {
      const p = hullParams(z);
      if (p.tw < 15) continue;
      for (const s of [-1, 1]) {
        const a = new THREE.Vector3(s * (p.tw + 0.6), p.Ht - p.td + 1, z), b = new THREE.Vector3(s * (p.tw + p.tl + 0.6), p.Ht - 1, z);
        beamMatrix(a, b, 2.2, 2.2, null, m4);
        darkI.add(m4);
        lights.add(new THREE.Vector3(s * (p.tw - 1.5), p.Ht - p.td + 1.2, z + 20), NAV.warm, { intensity: 2.6, size: 1.0 });
      }
    }
  }

  // ============================================================== command tower
  {
    const y0 = hullParams(-1400).Ht - 2;
    const tier = (zA, zB, h, width, front, back, yb, sideMat = M.habDark, topMat = M.armor, xc = 0) => {
      const s = new THREE.Shape();
      s.moveTo(zA, 0); s.lineTo(zB, 0); s.lineTo(zB - front, h); s.lineTo(zA + back, h); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2.5, bevelSegments: 1, steps: 1 });
      scaleUV(g, 1 / HULL.tile);
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(xc + width / 2, yb, 0);
      const parts = splitGroups(g);
      if (parts[0]) batch.add(parts[0], sideMat, basis);
      if (parts[1]) batch.add(parts[1], topMat, basis);
      return { zA, zB, h, width, front, back, yb };
    };
    const t1 = tier(TOWER.z0, TOWER.z1, 74, 300, 170, 44, y0, M.habDark, M.armor);
    const t2 = tier(-1770, -1110, 66, 204, 150, 40, y0 + 74, M.habDark, M.armorLight);
    const t3 = tier(-1700, -1230, 56, 132, 124, 30, y0 + 140, M.habDark, M.armor);
    tier(-1690, -1380, 240, 14, 270, 16, y0 + 196, M.armorDark, M.armorLight); // sail fin
    tier(-1560, -1286, 30, 72, 80, 20, y0 + 196, M.habDark, M.armorLight); // flag bridge cap
    // stepped superstructure flanking the trench fore and aft of the tower
    for (const s of [-1, 1]) {
      const xc = s * 104;
      tier(-2380, -1820, 54, 116, 80, 24, y0 - 17, M.habDark, M.armor, xc);
      tier(-2330, -1880, 26, 76, 54, 18, y0 + 37, M.habDark, M.armorLight, xc + s * 6);
      tier(-2290, -1960, 18, 40, 40, 12, y0 + 63, M.habDark, M.armor, xc + s * 10);
      tier(-1000, -560, 26, 112, 120, 20, y0 + 1, M.habDark, M.armorLight, xc);
      tier(-960, -720, 16, 64, 70, 14, y0 + 27, M.habDark, M.armor, xc + s * 8);
      for (const z of [-2200, -2050, -900, -700]) lights.add(new THREE.Vector3(xc + s * 62, y0 + 20, z), NAV.amber, { period: 2.6, phase: z * 0.0007, duty: 0.06, size: 1.8, intensity: 9 });
    }
    // bridge: panoramic window band on the front slope of tier 3
    {
      const zb = t3.zB, h = t3.h, front = t3.front, yb = t3.yb;
      const ta = 0.3, tb = 0.62;
      const za = zb - front * ta, ya = yb + h * ta;
      const zc = zb - front * tb, yc = yb + h * tb;
      const len = Math.hypot(za - zc, ya - yc);
      const plane = new THREE.PlaneGeometry(t3.width - 18, len);
      const n = new THREE.Vector3(0, front, h).normalize();
      const up = new THREE.Vector3(0, yc - ya, zc - za).normalize();
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), up, n).setPosition(0, (ya + yc) / 2 + n.y * 3, (za + zc) / 2 + n.z * 3);
      batch.add(plane, M.bridge, basis);
      // window mullions
      for (let k = -6; k <= 6; k++) {
        const x = (k / 6) * (t3.width / 2 - 10);
        const a = new THREE.Vector3(x, ya + n.y * 3.6, za + n.z * 3.6), b = new THREE.Vector3(x, yc + n.y * 3.6, zc + n.z * 3.6);
        beamMatrix(a, b, 1.2, 0.8, n, m4); darkI.add(m4);
      }
      // lower tier observation bands
      for (const [tt, w] of [[t2, t2.width - 16], [t1, t1.width - 20]]) {
        const zA = tt.zB - tt.front * 0.45, yA = tt.yb + tt.h * 0.45;
        const zB2 = tt.zB - tt.front * 0.58, yB2 = tt.yb + tt.h * 0.58;
        const nn = new THREE.Vector3(0, tt.front, tt.h).normalize();
        const up2 = new THREE.Vector3(0, yB2 - yA, zB2 - zA).normalize();
        const L2 = Math.hypot(zA - zB2, yA - yB2);
        const bs = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), up2, nn).setPosition(0, (yA + yB2) / 2 + nn.y * 3, (zA + zB2) / 2 + nn.z * 3);
        batch.add(new THREE.PlaneGeometry(w, L2), M.bridge, bs);
      }
    }
    // masts & antennae
    const mast = (x, z, yb, h, r = 1.6) => {
      batch.add(tiledCylinderZ(r, r * 0.4, h, 8).rotateX(-Math.PI / 2), M.trussDark, new THREE.Matrix4().makeTranslation(x, yb + h / 2, z));
      lights.add(new THREE.Vector3(x, yb + h + 2, z), NAV.red, { period: 1.6, phase: (x + z) * 0.01, duty: 0.5, size: 2.2, intensity: 10 });
    };
    mast(-30, -1440, y0 + 226, 80, 2.0);
    mast(30, -1440, y0 + 226, 80, 2.0);
    mast(-84, -1600, y0 + 140, 70);
    mast(84, -1600, y0 + 140, 70);
    lights.add(new THREE.Vector3(0, y0 + 440, -1660), NAV.white, { period: 2.4, phase: 0.2, duty: 0.04, size: 4, intensity: 24 });
    lights.add(new THREE.Vector3(0, y0 + 300, -1560), NAV.red, { period: 1.8, phase: 0.6, duty: 0.4, size: 2.4, intensity: 10 });
    // sensor domes
    for (const [x, z, r] of [[-110, -1150, 12], [110, -1150, 12], [-60, -1250, 8], [60, -1250, 8]]) {
      batch.add(new THREE.SphereGeometry(r, 24, 12, 0, TAU, 0, Math.PI / 2), M.armorLight, new THREE.Matrix4().makeTranslation(x, y0 + 74 + 2, z));
    }
    // tower greebles
    for (let i = 0; i < 140; i++) {
      const tt = rng.pick([t1, t2]);
      const z = rng.range(tt.zA + tt.back + 6, tt.zB - tt.front - 6);
      const x = rng.range(-tt.width / 2 + 6, tt.width / 2 - 6);
      const h = rng.range(1, 6), w = rng.range(3, 12), d = rng.range(3, 14);
      m4.makeScale(w, h, d).setPosition(x, tt.yb + tt.h + h / 2 + 2, z);
      greebleI.add(m4, GREEBLE_TONES[rng.pick([1, 2, 3, 6])]);
    }
  }

  // ============================================================== nacelles & pylons
  const NAC = { x: 830, y: -24 };
  for (const s of [-1, 1]) {
    const T = new THREE.Matrix4().makeTranslation(s * NAC.x, NAC.y, 0);
    const prof = [[58, -2420], [70, -2330], [80, -2080], [82, -1000], [80, -760], [68, -560], [44, -440], [12, -372]];
    const oct = { segments: 8, faceted: true, phiStart: 22.5 * DEG, tile: 48 };
    batch.add(lathe(prof.slice(0, 4), oct), M.armor, T);
    batch.add(lathe(prof.slice(3), oct), M.armorLight, T);
    // armour bands & glowing rings
    for (const z of [-2200, -1800, -1400, -1050]) {
      batch.add(lathe([[83.5, z - 14], [83.5, z + 14]], oct), M.armorDark, T);
      batch.add(lathe([[84.2, z - 1.5], [84.2, z + 1.5]], oct), M.seam, T);
    }
    batch.add(lathe([[81, -980], [81, -790]], oct), M.habDark, T);
    batch.add(new THREE.TorusGeometry(46, 3, 8, 48), M.glowCyan, T.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -438)));
    // pylon (swept, wing-like)
    const sh = new THREE.Shape();
    const pts = [[250, -640], [s > 0 ? 820 : 820, -1060], [820, -1900], [250, -2060]];
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const pg = new THREE.ExtrudeGeometry(sh, { depth: 22, bevelEnabled: true, bevelThickness: 3, bevelSize: 3, bevelSegments: 1 });
    scaleUV(pg, 1 / HULL.tile);
    const pb = new THREE.Matrix4().makeBasis(new THREE.Vector3(s, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -s, 0)).setPosition(0, NAC.y + (s > 0 ? 11 : -11), 0);
    const pparts = splitGroups(pg);
    if (pparts[0]) batch.add(pparts[0], M.armor, pb);
    if (pparts[1]) batch.add(pparts[1], M.armorDark, pb);
    // energy conduits along the pylon (pulse outward to the nacelle)
    const pylonConduit = makeConduitMaterial({ color: new THREE.Vector3(0.28, 0.75, 1.0), axis: new THREE.Vector3(s, 0, 0), speed: 200, base: 0.8, packet: 6, spacing: 120 });
    for (const zz of [-1300, -1600]) {
      const tube = tiledCylinderZ(3, 3, 470, 10).rotateY(Math.PI / 2);
      const mesh = new THREE.Mesh(tube, pylonConduit);
      mesh.position.set(s * (330 + 235 + 20), NAC.y + 16, zz + (zz === -1300 ? -60 : 0));
      root.add(mesh);
    }
    // pylon ribs
    for (let k = 0; k < 7; k++) {
      const x = 330 + k * 75;
      const zLE = -640 - (x - 250) / 570 * 420, zTE = -2060 + (x - 250) / 570 * 160;
      beamMatrix(new THREE.Vector3(s * x, NAC.y + 13, zLE - 8), new THREE.Vector3(s * x, NAC.y + 13, zTE + 8), 3, 2, new THREE.Vector3(0, 1, 0), m4);
      darkI.add(m4);
    }
    // nav lights
    lights.add(new THREE.Vector3(s * NAC.x, NAC.y + 84, -900), s > 0 ? NAV.green : NAV.red, { intensity: 12, size: 3.5 });
    lights.add(new THREE.Vector3(s * (NAC.x + 84), NAC.y, -1500), NAV.white, { period: 1.7, phase: s > 0 ? 0 : 0.5, duty: 0.04, size: 4, intensity: 24 });
    lights.add(new THREE.Vector3(s * NAC.x, NAC.y, -350), NAV.cyan, { intensity: 10, size: 3 });
    for (let z = -2300; z < -1000; z += 100) lights.add(new THREE.Vector3(s * (NAC.x + 83), NAC.y, z), NAV.cyan, { intensity: 2.6, size: 1.1 });
  }

  // ============================================================== engines
  const sys = createEngineSystem();
  ctx.animated.push((t) => sys.update(t));
  const plumes = new THREE.Group();
  plumes.name = 'plumes';
  const eng = (cx, cy, rT, rE, len, coils, plumeLen, segs, zT = ZS) => addEngine(sys, batch, root, plumes, lights, M, darkI, { cx, cy, zThroat: zT, rThroat: rT, rExit: rE, len, coils, plumeLen, segs });
  eng(0, 20, 34, 82, 170, 4, 1700, 96);
  eng(-188, 18, 32, 76, 160, 4, 1500, 80);
  eng(188, 18, 32, 76, 160, 4, 1500, 80);
  for (const [x, y] of [[-62, 112], [62, 112], [-160, 100], [160, 100], [-62, -102], [62, -102], [-158, -90], [158, -90]]) eng(x, y, 15, 38, 90, 2, 700, 40);
  for (const s of [-1, 1]) eng(s * NAC.x, NAC.y, 28, 58, 120, 3, 1100, 48, -2420);
  root.add(plumes);
  ctx.engineUniforms = sys.shared;
  // stern face detail
  for (let i = 0; i < 120; i++) {
    const x = rng.range(-280, 280), y = rng.range(-120, 140);
    const poly = hullPolygon(ZS);
    // keep away from nozzles
    if (Math.hypot(x, y - 20) < 95 || Math.hypot(Math.abs(x) - 188, y - 18) < 90) continue;
    if (Math.abs(y) > 60 && Math.abs(x) < 210) continue;
    const w = rng.range(4, 18), h = rng.range(4, 18), d = rng.range(2, 9);
    m4.makeScale(w, h, d).setPosition(x, y, ZS - d / 2 + 0.5);
    greebleI.add(m4, GREEBLE_TONES[rng.pick([2, 3, 4])]);
  }
  const spill = new THREE.PointLight(new THREE.Color(0.5, 0.65, 1.0), 700, 3600, 1.15);
  spill.position.set(0, 0, ZS - 380);
  root.add(spill);

  // ============================================================== prow: blades & sensor lance
  {
    const blade = (z0, z1, height, sign, mat) => {
      const top = [], bot = [];
      for (let i = 0; i <= 24; i++) {
        const z = z0 + (i / 24) * (z1 - z0);
        const p = hullParams(z);
        const base = sign > 0 ? p.Ht - 3 : -(p.Hb + p.kd) + 3;
        const f = Math.pow(Math.sin(Math.PI * Math.pow(i / 24, 0.75)), 0.8) * height;
        bot.push([z, base]);
        top.push([z, base + sign * f]);
      }
      const s = new THREE.Shape();
      s.moveTo(bot[0][0], bot[0][1]);
      for (const p of bot.slice(1)) s.lineTo(p[0], p[1]);
      for (const p of top.slice().reverse()) s.lineTo(p[0], p[1]);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 1 });
      scaleUV(g, 1 / HULL.tile);
      batch.add(g, mat, new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(2.5, 0, 0));
      return top;
    };
    const topEdge = blade(1500, 2960, 64, 1, M.armorLight);
    blade(1200, 2800, 78, -1, M.armor);
    for (let i = 2; i < topEdge.length - 2; i += 2) lights.add(new THREE.Vector3(0, topEdge[i][1] + 2, topEdge[i][0]), NAV.cyan, { intensity: 3, size: 1.2 });
    // lance
    batch.add(tiledCylinderZ(4.5, 1.2, 340, 12), M.chrome, new THREE.Matrix4().makeTranslation(0, 0, ZP + 165));
    for (const [z, r] of [[ZP + 40, 16], [ZP + 120, 11], [ZP + 200, 7]]) {
      batch.add(new THREE.TorusGeometry(r, 1.6, 8, 32), M.armorDark, new THREE.Matrix4().makeTranslation(0, 0, z));
      batch.add(new THREE.TorusGeometry(r, 0.7, 6, 32), M.glowCyan, new THREE.Matrix4().makeTranslation(0, 0, z + 2));
    }
    lights.add(new THREE.Vector3(0, 0, ZP + 340), NAV.white, { period: 2.0, phase: 0.5, duty: 0.05, size: 4, intensity: 26 });
  }

  // ============================================================== running & navigation lights
  for (let z = ZS + 30; z < 2500; z += 55) {
    const p = hullParams(z);
    for (const s of [-1, 1]) {
      lights.add(new THREE.Vector3(s * (p.W + 1.5), p.ch + 1, z), NAV.white, { intensity: 2.2, size: 1.0 });
      lights.add(new THREE.Vector3(s * (p.W + 1.5), -p.ch - 1, z), NAV.white, { intensity: 2.2, size: 1.0 });
    }
  }
  for (let z = ZS + 80; z < 2600; z += 150) {
    const p = hullParams(z);
    lights.add(new THREE.Vector3(0, -p.Hb - p.kd - 2, z), NAV.red, { period: 3.0, phase: -z / 3000, duty: 0.12, size: 2.2, intensity: 10 });
    for (const s of [-1, 1]) lights.add(new THREE.Vector3(s * (0.44 * p.W + 2), p.Ht + 4, z), NAV.amber, { intensity: 2.6, size: 1.2 });
  }
  {
    const p = hullParams(-1350);
    lights.add(new THREE.Vector3(p.W + 4, 0, -1350), NAV.green, { intensity: 14, size: 4 });
    lights.add(new THREE.Vector3(-p.W - 4, 0, -1350), NAV.red, { intensity: 14, size: 4 });
    const ps = hullParams(ZS + 10);
    for (const s of [-1, 1]) {
      lights.add(new THREE.Vector3(s * (ps.W + 3), 0, ZS + 10), NAV.white, { period: 1.9, phase: 0.3, duty: 0.04, size: 4, intensity: 22 });
    }
  }

  // ============================================================== hull greebles (dorsal & flanks)
  const scatterFacet = (e, z0, z1, n, lift, sizes, tones) => {
    for (let i = 0; i < n; i++) {
      const z = rng.range(z0, z1);
      if (z > TOWER.z0 - 10 && z < TOWER.z1 + 10 && rightEdge(e) === 10) continue;
      const fr = facetFrame(e, z, rng.range(0.12, 0.88));
      if (fr.width < 20) continue;
      const w = rng.range(sizes[0], sizes[1]), h = rng.range(sizes[2], sizes[3]), d = rng.range(sizes[4], sizes[5]);
      const X = new THREE.Vector3().crossVectors(fr.normal, fr.along);
      m4.makeBasis(X.multiplyScalar(w), fr.normal.clone().multiplyScalar(h), fr.along.clone().multiplyScalar(d));
      m4.setPosition(fr.p.clone().addScaledVector(fr.normal, lift + h / 2));
      greebleI.add(m4, GREEBLE_TONES[rng.pick(tones)]);
    }
  };
  for (const e of [10, 15]) scatterFacet(e, ZS + 40, 2300, 420, 3, [3, 14, 1, 5, 4, 24], [1, 2, 3, 6]);
  for (const e of [9, 16]) scatterFacet(e, ZS + 40, 2300, 260, 3, [3, 10, 1, 4, 4, 18], [2, 3, 4]);
  for (const e of [8, 17]) scatterFacet(e, ZS + 40, 2000, 220, 3, [3, 10, 1, 4, 4, 16], [2, 3, 4, 5]);
  for (const e of [0, 25]) scatterFacet(e, ZS + 40, 2000, 200, 2.5, [3, 12, 1, 4, 4, 20], [3, 4]);

  // ============================================================== turrets along the dorsal shoulders
  {
    const turretGroup = new THREE.Group();
    turretGroup.name = 'turrets';
    const tb = new Batch();
    const base = new THREE.CylinderGeometry(9, 11, 5, 16);
    const domeG = new THREE.SphereGeometry(8.5, 20, 10, 0, TAU, 0, Math.PI / 2);
    const barrel = new THREE.CylinderGeometry(0.9, 0.9, 22, 8).rotateX(Math.PI / 2).translate(0, 4, 13);
    const housing = tiledBox(10, 6, 10, 24).translate(0, 4, 2);
    const turrets = [];
    const bodies = new Instancer(domeG, M.armorLight, { castShadow: true });
    const housings = new Instancer(housing, M.armor);
    const barrels = new Instancer(barrel, M.armorDark);
    const bases = new Instancer(base, M.armorDark);
    for (const e of [9, 16]) {
      for (let z = -2200; z < 1900; z += 150) {
        if (z > TOWER.z0 - 40 && z < TOWER.z1 + 40) continue;
        const fr = facetFrame(e, z, 0.42);
        const p = fr.p.clone().addScaledVector(fr.normal, 5.5);
        turrets.push({ p, n: fr.normal.clone(), phase: rng.range(0, TAU), speed: rng.range(0.05, 0.12) * rng.sign(), side: e === 9 ? 1 : -1 });
      }
    }
    const qn = new THREE.Quaternion(), qy = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    const setT = (t) => {
      turrets.forEach((tu, i) => {
        qn.setFromUnitVectors(Y, tu.n);
        qy.setFromAxisAngle(Y, tu.phase + Math.sin(t * tu.speed + tu.phase) * 1.2);
        const q = qn.clone().multiply(qy);
        m4.compose(tu.p, qn, sc); bases.matrices[i] = m4.clone();
        m4.compose(tu.p.clone().addScaledVector(tu.n, 2.5), q, sc);
        bodies.matrices[i] = m4.clone(); housings.matrices[i] = m4.clone(); barrels.matrices[i] = m4.clone();
      });
    };
    turrets.forEach(() => { bases.add(m4); bodies.add(m4); housings.add(m4); barrels.add(m4); });
    setT(0);
    const meshes = [bases.build(turretGroup), bodies.build(turretGroup), housings.build(turretGroup), barrels.build(turretGroup)];
    root.add(turretGroup);
    ctx.animated.push((t) => {
      setT(t);
      meshes.forEach((mesh, k) => {
        const src = [bases, bodies, housings, barrels][k];
        src.matrices.forEach((mm, i) => mesh.setMatrixAt(i, mm));
        mesh.instanceMatrix.needsUpdate = true;
      });
    });
  }

  batch.build(root, { name: 'hull' });
  darkI.build(root, 'frames');
  trussI.build(root, 'truss');
  greebleI.build(root, 'greebles');
  lights.build(root, { name: 'lights' });

  // Escort frigates: 330 m sister ships lofted from the same hull lines, flying in formation
  {
    const escorts = new THREE.Group();
    escorts.name = 'escorts';
    const k = 0.06;
    // build one frigate geometry set (unit scale k) and share it between the escorts
    const fb = new Batch();
    for (let e = 0; e < N_POLY; e++) {
      const def = EDGES[rightEdge(e)];
      const g = facetStrip(e, ZS, ZP, { step: 90 }).geometry;
      fb.add(g, def.mat === 'channel' ? M.seam : (def.plate ? M[def.plate.mats[0]] : M[def.mat]));
    }
    fb.add(sternCap(), M.armorDark);
    const frig = new THREE.Group();
    fb.build(frig, { name: 'frigate-hull' });
    frig.scale.setScalar(k);
    // tower block & engine glows (in frigate-local metres before scaling)
    const towerG = tiledBox(180, 90, 520, 48).translate(0, hullParams(-1400).Ht + 40, -1400);
    const tw = new THREE.Mesh(towerG, M.armorLight); tw.castShadow = true; frig.add(tw);
    const glowG = new THREE.CircleGeometry(60, 20).rotateY(Math.PI);
    for (const [x, y] of [[0, 20], [-190, 18], [190, 18]]) {
      const gm = new THREE.Mesh(glowG, M.glowThroat); gm.position.set(x, y, ZS - 6); frig.add(gm);
    }
    const defs = [
      { p: new THREE.Vector3(1900, 420, 900), r: 0.02 }, { p: new THREE.Vector3(-2100, -380, 300), r: -0.03 },
      { p: new THREE.Vector3(1500, -700, -1700), r: 0.04 }, { p: new THREE.Vector3(-1350, 820, 2100), r: -0.02 },
    ];
    const holders = [];
    defs.forEach((d, i) => {
      const g = frig.clone();
      g.position.copy(d.p);
      const l = new LightSet();
      for (const [x, y] of [[0, 20], [-190, 18], [190, 18]]) l.add(new THREE.Vector3(x * k, y * k, (ZS - 30) * k), new THREE.Color(0.55, 0.75, 1.0), { intensity: 10, size: 3 });
      l.add(new THREE.Vector3(0, 20, -60), NAV.white, { period: 1.5, phase: i * 0.3, duty: 0.05, size: 2, intensity: 16 });
      l.add(new THREE.Vector3(22, 0, -60), NAV.green, { intensity: 8, size: 1.6 });
      l.add(new THREE.Vector3(-22, 0, -60), NAV.red, { intensity: 8, size: 1.6 });
      const lg = new THREE.Group();
      l.build(lg, { name: 'escort-lights' });
      const holder = new THREE.Group();
      holder.add(g);
      g.position.set(0, 0, 0);
      holder.add(lg);
      holder.position.copy(d.p);
      escorts.add(holder);
      holders.push({ g: holder, base: d.p.clone(), ph: i * 1.7, r: d.r });
    });
    root.add(escorts);
    ctx.animated.push((t) => {
      for (const h of holders) {
        h.g.position.set(h.base.x + 18 * Math.sin(t * 0.05 + h.ph), h.base.y + 12 * Math.sin(t * 0.07 + h.ph * 2), h.base.z + 25 * Math.sin(t * 0.03 + h.ph));
        h.g.rotation.set(0.01 * Math.sin(t * 0.09 + h.ph), 0, h.r + 0.02 * Math.sin(t * 0.06 + h.ph));
      }
    });
  }

  return { root, plumes, nacelle: NAC };
}
