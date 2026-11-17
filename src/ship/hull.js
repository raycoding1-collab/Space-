// Main hull of the capital ship: an angular dagger lofted from 26-point cross-sections.
// Every facet is generated separately so edges stay razor sharp, while each facet stays smooth
// along the length of the ship. Selected facets carry layered armour plates with glowing seams.
import * as THREE from 'three';
import { RNG, clamp, smoothstep as sm } from '../lib/rng.js';
import { TILE_SCALE } from '../lib/geo.js';

export const HULL = {
  zStern: -2450,
  zProw: 3000,
  tile: 48 * TILE_SCALE,
};

/** Shape parameters of the hull at station z. */
export function hullParams(z) {
  const { zStern, zProw } = HULL;
  const u = clamp((z + 900) / (zProw + 900), 0, 1); // 0 aft of z=-900, 1 at the prow tip
  const sternFlare = 0.86 + 0.14 * sm(zStern, zStern + 300, z);
  let W = 360 * Math.pow(1 - u, 0.92) * sternFlare + 22 * Math.exp(-(((z + 1350) / 520) ** 2));
  let Ht = 196 * Math.pow(1 - u, 1.02) * (0.9 + 0.1 * sm(zStern, zStern + 300, z));
  let Hb = 166 * Math.pow(1 - u, 1.22);
  W = Math.max(W, 2.5);
  Ht = Math.max(Ht, 1.6);
  Hb = Math.max(Hb, 1.4);
  const trench = sm(-2080, -1840, z) * (1 - sm(1250, 1650, z));
  const tw = 30 * trench;
  const td = Math.min(0.26 * Ht, 46) * trench;
  const tl = 12 * trench;
  const chF = sm(zStern, zStern + 160, z) * (1 - sm(2050, 2650, z));
  const ch = 9 * chF;
  const rd = 9 * chF;
  const kd = 24 * Math.pow(1 - u, 1.2);
  return { W, Ht, Hb, tw, td, tl, ch, rd, kd };
}

/** Right half (x ≥ 0) from the keel centre up to the trench floor centre. */
function rightHalf(p) {
  const { W, Ht, Hb, tw, td, tl, ch, rd, kd } = p;
  return [
    [0, -Hb - kd],                    // R0  keel centre
    [0.36 * W, -Hb],                  // R1  keel shoulder
    [0.8 * W, -0.48 * Hb],            // R2  lower flank
    [0.97 * W, -ch - 0.06 * Hb],      // R3  lower window band
    [W, -ch],                         // R4  chine (low lip)
    [W - rd, -0.55 * ch],             // R5  channel floor
    [W - rd, 0.55 * ch],              // R6  channel floor
    [W, ch],                          // R7  chine (high lip)
    [0.95 * W, ch + 0.18 * Ht],       // R8  upper window band
    [0.84 * W, 0.5 * Ht],             // R9  upper flank
    [0.44 * W, Ht],                   // R10 dorsal shoulder
    [tw + tl, Ht],                    // R11 trench lip
    [tw, Ht - td],                    // R12 trench floor edge
    [0, Ht - td],                     // R13 trench floor centre
  ];
}

/** Full closed polygon (counter-clockwise seen from +z). 26 points. */
export function hullPolygon(z) {
  const r = rightHalf(hullParams(z));
  const poly = r.slice();
  for (let i = 12; i >= 1; i--) poly.push([-r[i][0], r[i][1]]);
  return poly;
}
export const N_POLY = 26;
/** Map any edge index to its right-side equivalent (left side mirrors the right). */
export const rightEdge = (e) => (e <= 12 ? e : 25 - e);

/** z samples between a and b with roughly `step` spacing (denser toward the prow). */
export function zSamples(a, b, step = 36) {
  const out = [a];
  let z = a;
  while (z < b) {
    const s = z > 2200 ? step * 0.45 : z > 1200 ? step * 0.75 : step;
    z = Math.min(b, z + s);
    out.push(z);
  }
  return out;
}

const _e = new THREE.Vector3(), _l = new THREE.Vector3(), _n = new THREE.Vector3();

/**
 * Build a strip for polygon edge `edge` between za and zb.
 * opts.lift: offset along the facet normal (armour plates), opts.inset: margin from the facet edges (m).
 */
export function facetStrip(edge, za, zb, { lift = 0, insetA = 0, insetB = 0, step = 36, uOffset = 0, f0 = 0, f1 = 1 } = {}) {
  const zs = zSamples(za, zb, step);
  const A = [], B = [], acrossA = [], acrossB = [];
  for (const z of zs) {
    const poly = hullPolygon(z);
    const a0 = poly[edge], b0 = poly[(edge + 1) % N_POLY];
    const a = [a0[0] + (b0[0] - a0[0]) * f0, a0[1] + (b0[1] - a0[1]) * f0];
    const b = [a0[0] + (b0[0] - a0[0]) * f1, a0[1] + (b0[1] - a0[1]) * f1];
    let ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    let dx, dy, nx, ny;
    if (len < 1e-4) { dx = 0; dy = 0; nx = Math.sign(a[0]) || 0; ny = a[1] >= 0 ? 1 : -1; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; }
    else { dx = ex / len; dy = ey / len; nx = dy; ny = -dx; }
    const ia = Math.min(insetA, len * 0.35), ib = Math.min(insetB, len * 0.35);
    A.push(new THREE.Vector3(a[0] + dx * ia + nx * lift, a[1] + dy * ia + ny * lift, z));
    B.push(new THREE.Vector3(b[0] - dx * ib + nx * lift, b[1] - dy * ib + ny * lift, z));
    acrossA.push(ia);
    acrossB.push(len - ib);
  }
  const n = zs.length;
  const pos = new Float32Array(n * 2 * 3), nor = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
  const tile = HULL.tile;
  for (let k = 0; k < n; k++) {
    const k0 = Math.max(0, k - 1), k1 = Math.min(n - 1, k + 1);
    _e.subVectors(B[k], A[k]);
    if (_e.lengthSq() < 1e-8) _e.set(1, 0, 0);
    _l.copy(A[k1]).add(B[k1]).sub(A[k0]).sub(B[k0]);
    if (_l.lengthSq() < 1e-8) _l.set(0, 0, 1);
    _n.crossVectors(_e, _l).normalize();
    pos.set([A[k].x, A[k].y, A[k].z, B[k].x, B[k].y, B[k].z], k * 6);
    nor.set([_n.x, _n.y, _n.z, _n.x, _n.y, _n.z], k * 6);
    uv.set([zs[k] / tile, (acrossA[k] + uOffset) / tile, zs[k] / tile, (acrossB[k] + uOffset) / tile], k * 4);
  }
  const idx = [];
  for (let k = 0; k < n - 1; k++) {
    const a = k * 2, b = k * 2 + 1, c = (k + 1) * 2 + 1, d = (k + 1) * 2;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geometry: g, A, B, zs };
}

/** Flat-shaded quad list helper (orientation corrected toward `facing`). */
export class QuadBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; }
  quad(p0, p1, p2, p3, facing, uvScale = 1 / HULL.tile) {
    const e1 = new THREE.Vector3().subVectors(p1, p0), e2 = new THREE.Vector3().subVectors(p2, p0);
    const n = new THREE.Vector3().crossVectors(e1, e2);
    if (n.lengthSq() < 1e-10) return;
    n.normalize();
    let q = [p0, p1, p2, p3];
    if (facing && n.dot(facing) < 0) { q = [p0, p3, p2, p1]; n.negate(); }
    const tri = [q[0], q[1], q[2], q[0], q[2], q[3]];
    const w = p0.distanceTo(p1), h = p0.distanceTo(p3);
    const uvs = [[0, 0], [w, 0], [w, h], [0, 0], [w, h], [0, h]];
    for (let i = 0; i < 6; i++) {
      this.pos.push(tri[i].x, tri[i].y, tri[i].z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(uvs[i][0] * uvScale, uvs[i][1] * uvScale);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

/**
 * Armour plate: a raised slab over [za, zb] on facet `edge`, with side walls and end caps.
 */
export function armourPlate(edge, za, zb, { lift = 3, inset = 4, step = 36 } = {}) {
  const top = facetStrip(edge, za, zb, { lift, insetA: inset, insetB: inset, step });
  const base = facetStrip(edge, za, zb, { lift: 0.2, insetA: inset, insetB: inset, step });
  const qb = new QuadBuilder();
  const n = top.zs.length;
  for (let k = 0; k < n - 1; k++) {
    // long side walls
    const outA = new THREE.Vector3().subVectors(top.A[k], top.B[k]).normalize();
    qb.quad(base.A[k], base.A[k + 1], top.A[k + 1], top.A[k], outA);
    const outB = outA.clone().negate();
    qb.quad(base.B[k], base.B[k + 1], top.B[k + 1], top.B[k], outB);
  }
  qb.quad(base.A[0], base.B[0], top.B[0], top.A[0], new THREE.Vector3(0, 0, -1));
  qb.quad(base.A[n - 1], base.B[n - 1], top.B[n - 1], top.A[n - 1], new THREE.Vector3(0, 0, 1));
  return { top: top.geometry, sides: qb.geometry() };
}

/** Segment a z-range into plates separated by gaps. */
export function plateLayout(rng, z0, z1, { min = 150, max = 320, gap = 10, exclude = [] } = {}) {
  const segs = [];
  let z = z0 + rng.range(0, min * 0.6);
  while (z < z1 - 40) {
    const len = rng.range(min, max);
    const a = z, b = Math.min(z1, z + len);
    let blocked = false;
    for (const [xa, xb] of exclude) if (b > xa && a < xb) blocked = true;
    if (!blocked && b - a > 30) segs.push([a, b]);
    z = b + gap;
  }
  return segs;
}

/** Stern cap: flat triangulated face at the aft end. */
export function sternCap() {
  const z = HULL.zStern;
  const poly = hullPolygon(z);
  const contour = poly.map(([x, y]) => new THREE.Vector2(x, y));
  // remove consecutive duplicates
  const clean = [];
  for (const p of contour) if (!clean.length || clean[clean.length - 1].distanceTo(p) > 0.01) clean.push(p);
  const tris = THREE.ShapeUtils.triangulateShape(clean, []);
  const pos = [], nor = [], uv = [];
  for (const t of tris) {
    // facing -z: reverse winding
    for (const i of [t[0], t[2], t[1]]) {
      pos.push(clean[i].x, clean[i].y, z);
      nor.push(0, 0, -1);
      uv.push(clean[i].x / HULL.tile, clean[i].y / HULL.tile);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Frame (point + axes) on a facet at station z, at fraction f across the edge. */
export function facetFrame(edge, z, f = 0.5) {
  const poly = hullPolygon(z);
  const a = poly[edge], b = poly[(edge + 1) % N_POLY];
  const p = new THREE.Vector3(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, z);
  const across = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0);
  const width = across.length();
  across.normalize();
  const along = new THREE.Vector3(0, 0, 1);
  const normal = new THREE.Vector3().crossVectors(across, along).normalize();
  return { p, across, along, normal, width };
}
