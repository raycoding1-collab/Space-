// ELYSION master plan: one place that defines the shape of the foundation, the terraces, the landmarks,
// the districts and the street grids. Every builder (geometry, placement, shaders) reads from here, so
// buildings sit on blocks, blocks sit on terraces and landmarks never collide.
import { clamp, smoothstep as sm, lerp } from '../lib/rng.js';

// Density of the small things (trees, traffic, signage, hanging towers): 1 on desktops, less on phones.
export const CITY_DETAIL = { k: 1 };

export const Z_BOW = 16000;
export const Z_STERN = -16000;
export const Z_MAXB = -6000; // station of maximum beam
export const BEAM = 6200; // half-beam of the top deck at its widest

/** Half-width of the top deck at station z (0 beyond the ends). */
export function halfWidth(z) {
  if (z > Z_BOW || z < Z_STERN) return 0;
  if (z >= Z_MAXB) {
    const t = (z - Z_MAXB) / (Z_BOW - Z_MAXB);
    return BEAM * Math.pow(Math.max(0, 1 - Math.pow(t, 1.85)), 0.72);
  }
  const t = (Z_MAXB - z) / (Z_MAXB - Z_STERN);
  let w = BEAM - 950 * Math.pow(t, 1.6);
  const c = 650, d = z - Z_STERN;
  if (d < c) w -= c - Math.sqrt(Math.max(0, c * c - (c - d) * (c - d)));
  return w;
}

// City-wall tiers stepping down and out from the deck edge: [outward offset of the wall, bottom y of the wall]
export const TIERS = [
  { off: 0, y0: 0, y1: -280 },
  { off: 340, y0: -280, y1: -600 },
  { off: 640, y0: -600, y1: -960 },
];

/** Bow taper for the tier geometry: 1 over most of the length, shrinking toward the bow tip. */
export function bowTaper(z) {
  return 1 - 0.8 * sm(11500, Z_BOW, z);
}

/** Depth of the keel below the deck at station z (positive number). */
export function keelDepth(z) {
  const mid = 2400;
  const bow = 1 - sm(4000, Z_BOW, z);
  const stern = 1 - 0.08 * sm(Z_STERN + 3000, Z_STERN, z);
  return Math.max(320, mid * (0.18 + 0.82 * Math.pow(bow, 0.8)) * stern);
}

// ------------------------------------------------------------------ landmarks
export const SPIRE = { x: 0, z: -2600, base: 620, top: 5200 };

// Five terrace plateaus around the spire (superellipses), stepping up toward it.
export const PLATEAUS = [
  { a: 4300, b: 4500, h: 130, n: 2.6, cz: -2750 },
  { a: 3350, b: 3550, h: 255, n: 2.5, cz: -2700 },
  { a: 2500, b: 2650, h: 375, n: 2.4, cz: -2660 },
  { a: 1720, b: 1820, h: 495, n: 2.3, cz: -2630 },
  { a: 1050, b: 1100, h: 620, n: 2.2, cz: -2600 },
];

/** Superellipse "radius" of a point relative to plateau k (1 on its edge). */
export function plateauRho(k, x, z) {
  const P = PLATEAUS[k];
  return Math.pow(Math.pow(Math.abs(x) / P.a, P.n) + Math.pow(Math.abs(z - P.cz) / P.b, P.n), 1 / P.n);
}
/** Index of the highest plateau containing (x, z), or -1. */
export function plateauLevel(x, z) {
  for (let k = PLATEAUS.length - 1; k >= 0; k--) if (plateauRho(k, x, z) < 1) return k;
  return -1;
}
export function groundY(x, z) {
  const k = plateauLevel(x, z);
  return k < 0 ? 0 : PLATEAUS[k].h;
}

export const DOMES = [
  { id: 'lake', name: 'Lake Dome', x: 0, z: 4700, R: 1900, frame: 'hex' },
  { id: 'forest', name: 'Forest Dome', x: 0, z: 8800, R: 1600, frame: 'meridian' },
  { id: 'orchard', name: 'Orchard Dome', x: 0, z: 12000, R: 1150, frame: 'diagrid' },
];
export const DOME_RING = 150; // width of the plinth ring around each dome

export const CANAL = { halfW: 210, walk: 120, z0: -15250, z1: -7246, y: -38, vaultR: 420 };
export const CASCADE_Z = -7246; // the canal head, where water falls from the terraces

export const HALO = { r: 1700, y: 2300, width: 150, cableY: 3700 };

export const HARBOURS = [-8600, -6100, -3600, -1100, 1400, 3900]; // pier stations along each flank
export const PIER = { len: 1500, width: 110, y: -600 };

export const CONSTRUCTION = { x0: 2900, x1: 5300, z0: 1500, z1: 6200 };
export const INDUSTRY_Z = -11200;

export const REACTORS = [
  { z: -11200, x: 0, y: -3150, R: 230 },
  { z: -5600, x: 0, y: -3300, R: 260 },
  { z: 600, x: 0, y: -3250, R: 240 },
  { z: 5600, x: 0, y: -2700, R: 200 },
];

// ------------------------------------------------------------------ districts
export const D = { VOID: 0, DOME: 1, CANAL: 2, SPIRE: 3, CENTRAL: 4, CANALSIDE: 5, GARDEN: 6, INDUSTRY: 7, CONSTRUCTION: 8, RIM: 9 };

export function domeAt(x, z, margin = 0) {
  for (const d of DOMES) {
    const r = Math.hypot(x - d.x, z - d.z);
    if (r < d.R + DOME_RING + margin) return d;
  }
  return null;
}

export function districtAt(x, z) {
  const W = halfWidth(z);
  if (Math.abs(x) > W - 30) return D.VOID;
  if (domeAt(x, z, 60)) return D.DOME;
  if (z < CANAL.z1 + 120 && z > CANAL.z0 - 400 && Math.abs(x) < CANAL.halfW + CANAL.walk + 40) return D.CANAL;
  if (plateauLevel(x, z) >= 0) return D.SPIRE;
  if (x > CONSTRUCTION.x0 && x < CONSTRUCTION.x1 && z > CONSTRUCTION.z0 && z < CONSTRUCTION.z1) return D.CONSTRUCTION;
  if (Math.abs(x) > W - 420) return D.RIM;
  if (z < INDUSTRY_Z) return D.INDUSTRY;
  if (z > 2300) return D.GARDEN;
  if (z < -7300) return D.CANALSIDE;
  return D.CENTRAL;
}

// ------------------------------------------------------------------ street grids
// Cartesian grid for the main deck. Blocks are PX × PZ (street centre to street centre); every
// BLVD-th street is a wide boulevard. The grid is symmetric about the centreline.
export const GRID = { px: 270, pz: 330, street: 30, blvd: 74, every: 4 };

/** Cartesian block containing (x, z): index, centre and the block's buildable rectangle. */
export function gridBlock(x, z) {
  const i = Math.floor(x / GRID.px), j = Math.floor(z / GRID.pz);
  return blockRect(i, j);
}
export function streetW(k) { return (((k % GRID.every) + GRID.every) % GRID.every === 0) ? GRID.blvd : GRID.street; }
export function blockRect(i, j) {
  const x0 = i * GRID.px + streetW(i) / 2, x1 = (i + 1) * GRID.px - streetW(i + 1) / 2;
  const z0 = j * GRID.pz + streetW(j) / 2, z1 = (j + 1) * GRID.pz - streetW(j + 1) / 2;
  return { i, j, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}

// Radial grid on the spire plateaus: rings of blocks around the spire, cut by radial avenues.
export const POLAR = { ring: 300, avenue: 46, ringStreet: 34, spokes: [[0, 12], [1400, 24], [2600, 36], [3800, 48]] };
export function polarSpokes(r) {
  let n = POLAR.spokes[0][1];
  for (const [r0, k] of POLAR.spokes) if (r >= r0) n = k;
  return n;
}
/** Elliptical polar coordinates around the spire (r in metres, theta in radians). */
export function polarOf(x, z) {
  const dx = x - SPIRE.x, dz = (z - SPIRE.z) * 0.955;
  return { r: Math.hypot(dx, dz), th: Math.atan2(dx, dz) };
}

export { clamp, sm, lerp };

// ------------------------------------------------------------------ transit network (elevated maglev)
// Control points [x, y, z]; y is absolute. Districts keep buildings out of these corridors.
const ringLine = [];
for (let i = 0; i < 40; i++) {
  const a = (i / 40) * Math.PI * 2;
  ringLine.push([Math.sin(a) * 4560, 95, -2760 + Math.cos(a) * 4760]);
}
export const TRANSIT = [
  { name: 'Spine', closed: false, pts: [
    [480, 70, -14600], [480, 70, -11000], [480, 80, -8300], [470, 220, -7000], [430, 330, -6000], [400, 450, -5100],
    [420, 580, -4300], [640, 690, -3650], [1030, 700, -2950], [1080, 700, -2300], [700, 690, -1650], [480, 600, -1000],
    [480, 470, -150], [520, 340, 800], [600, 210, 1650], [900, 90, 2400], [2300, 90, 3300], [2360, 90, 4700],
    [2250, 90, 6100], [2050, 90, 7800], [2050, 90, 9700], [1650, 90, 11000], [1560, 90, 12100], [1150, 90, 13200], [260, 80, 14000],
  ] },
  { name: 'Port', closed: false, pts: [
    [-480, 70, -14600], [-480, 70, -11000], [-480, 80, -8600], [-1400, 95, -7650], [-2600, 95, -6900],
  ] },
  { name: 'Ring', closed: true, pts: ringLine },
  { name: 'Domes', closed: false, pts: [
    [-1800, 95, 1700], [-2300, 90, 3300], [-2360, 90, 4700], [-2250, 90, 6100], [-2050, 90, 7800], [-2050, 90, 9700],
    [-1650, 90, 11000], [-1560, 90, 12100], [-1150, 90, 13200], [-260, 80, 14000],
  ] },
  { name: 'Starboard Harbours', closed: false, pts: [[4500, 95, -3600], [5300, 95, -3600], [6000, 90, -3600]] },
  { name: 'Port Harbours', closed: false, pts: [[-4500, 95, -3600], [-5300, 95, -3600], [-6000, 90, -3600]] },
  { name: 'Starboard Quays', closed: false, pts: [[4560, 95, 1300], [5300, 95, 1400], [5950, 90, 1400]] },
  { name: 'Port Quays', closed: false, pts: [[-4560, 95, 1300], [-5300, 95, 1400], [-5950, 90, 1400]] },
];

let _tSegs = null;
function transitSegs() {
  if (_tSegs) return _tSegs;
  _tSegs = [];
  for (const r of TRANSIT) {
    const P = r.pts;
    const n = r.closed ? P.length : P.length - 1;
    for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % P.length]; _tSegs.push([a[0], a[2], b[0], b[2]]); }
  }
  return _tSegs;
}
/** Horizontal distance from (x, z) to the nearest transit line. */
export function transitDist(x, z) {
  let best = 1e9;
  for (const [ax, az, bx, bz] of transitSegs()) {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L || 1)));
    const ex = ax + dx * t - x, ez = az + dz * t - z;
    best = Math.min(best, Math.hypot(ex, ez));
  }
  return best;
}
