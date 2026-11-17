// Building archetypes. Each one is a designed silhouette (setbacks, chamfers, fins, crowns) built at
// real scale with zoned surfaces: the facade shader turns the zones into curtain walls, podiums,
// cladding, roofs, gilded crowns, lit trims and gardens. Base at y = 0, centred on the origin.
import { Shape, Z, rect, chamfer, rounded, circle, regular, movePoly, rotPoly } from './geo.js';
import { TAU } from '../lib/rng.js';

// ------------------------------------------------------------------ small parts
function roofKit(sh, rng, w, d, y, k = 1) {
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const bw = rng.range(6, 14) * k, bd = rng.range(6, 12) * k, bh = rng.range(3, 7) * k;
    const x = rng.range(-w / 2 + bw, w / 2 - bw) * 0.7, z = rng.range(-d / 2 + bd, d / 2 - bd) * 0.7;
    sh.prism(rect(bw, bd, x, z), y, y + bh, Z.CLAD, Z.ROOF);
  }
  if (rng.chance(0.35)) {
    const r = rng.range(3, 5) * k;
    sh.prism(circle(r, 10, rng.range(-w, w) * 0.25, rng.range(-d, d) * 0.25), y, y + r * 1.6, Z.METAL, Z.METAL);
  }
  if (rng.chance(0.3)) mast(sh, rng.range(-w, w) * 0.3, rng.range(-d, d) * 0.3, y, rng.range(12, 30) * k, 0.8 * k);
}
function mast(sh, x, z, y, h, r = 1) {
  sh.cone(x, z, r, r * 0.25, y, y + h, Z.METAL, 6);
  sh.prism(rect(r * 1.6, r * 1.6, x, z), y + h, y + h + r * 1.4, Z.TRIM, Z.TRIM);
}
function trimBand(sh, poly, y, h = 1.2, out = 0.4) {
  let cx = 0, cz = 0;
  for (const [x, z] of poly) { cx += x / poly.length; cz += z / poly.length; }
  const p = poly.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x + (dx / l) * out, z + (dz / l) * out]; });
  sh.walls(p, y, y + h, Z.TRIM);
}
function spire(sh, x, z, y, h, r) {
  sh.cone(x, z, r, r * 0.05, y, y + h, Z.METAL, 8);
  sh.prism(rect(r * 0.5, r * 0.5, x, z), y + h * 0.985, y + h * 1.01, Z.TRIM, Z.TRIM);
}

// ------------------------------------------------------------------ mega-towers (spire district)
export function blade(rng, H) {
  const sh = new Shape();
  const w = rng.range(130, 185), d = rng.range(34, 46);
  sh.prism(rounded(w + 34, d + 46, 16, 3), 0, 30, Z.PODIUM, Z.GARDEN);
  const poly = rounded(w, d, d * 0.48, 5);
  const lo = H * rng.range(0.74, 0.84);
  const r0 = poly.map(([x, z]) => [x, 28, z]);
  const r1 = poly.map(([x, z]) => [x, lo + (x / w + 0.5) * (H - lo), z]);
  sh.loft([r0, r1], Z.FACADE, { crease: 40 });
  sh.capRing(r1, Z.METAL);
  // spine fins on the broad faces
  for (const s of [-1, 1]) {
    sh.prism(rect(5, 3, 0, s * (d / 2 + 1.2)), 30, lo * 0.97, Z.METAL, Z.METAL);
    sh.prism(rect(1.2, 1, 0, s * (d / 2 + 2.8)), 34, lo * 0.95, Z.TRIM, null);
  }
  // lit edge along the raked roof
  sh.beam([-w / 2 + 2, lo + 2, 0], [w / 2 - 2, H + 2, 0], 1.6, 2.2, Z.TRIM);
  mast(sh, w / 2 - 14, 0, H - 4, H * 0.1, 2.2);
  return { shape: sh, w: w + 34, d: d + 46, h: H };
}

export function twin(rng, H) {
  const sh = new Shape();
  const s = rng.range(44, 56), gap = rng.range(30, 48);
  const W = 2 * s + gap;
  sh.prism(chamfer(W + 34, s + 34, 12), 0, 36, Z.PODIUM, Z.GARDEN);
  [-1, 1].forEach((side, k) => {
    const cx = side * (s + gap) / 2;
    const Hk = k === 0 ? H : H * rng.range(0.86, 0.94);
    const p = movePoly(chamfer(s, s, s * 0.2), cx, 0);
    const p2 = movePoly(chamfer(s * 0.78, s * 0.78, s * 0.16), cx, 0);
    sh.prism(p, 34, Hk * 0.8, Z.FACADE, Z.METAL);
    sh.prism(p2, Hk * 0.8, Hk * 0.9, Z.FACADE, null);
    trimBand(sh, movePoly(chamfer(s * 0.78, s * 0.78, s * 0.16), cx, 0), Hk * 0.8 + 1, 1.0, 0.35);
    // pyramidal gilded crown and needle
    const top = chamfer(s * 0.78, s * 0.78, s * 0.16).map(([x, z]) => [x + cx, Hk * 0.9, z]);
    const apex = chamfer(s * 0.08, s * 0.08, s * 0.016).map(([x, z]) => [x + cx, Hk * 0.98, z]);
    sh.loft([top, apex], Z.METAL, { crease: 30 });
    spire(sh, cx, 0, Hk * 0.98, Hk * 0.09, 2.4);
  });
  for (const f of [0.38, 0.62]) {
    const y = H * f;
    sh.prism(rect(gap + 4, 22, 0, 0), y, y + 16, Z.GLASS, Z.ROOF);
    sh.prism(rect(gap + 4, 1, 0, 11.5), y - 1, y, Z.TRIM, null);
    sh.prism(rect(gap + 4, 1, 0, -11.5), y - 1, y, Z.TRIM, null);
  }
  return { shape: sh, w: W + 34, d: s + 34, h: H };
}

export function ziggurat(rng, H) {
  const sh = new Shape();
  const n = rng.int(5, 7);
  const base = rng.range(84, 112), asp = rng.range(0.82, 1.0);
  let y0 = 0;
  for (let k = 0; k < n; k++) {
    const y1 = H * 0.86 * Math.pow((k + 1) / n, 0.8);
    const s = base * (1 - k * 0.12);
    const p = chamfer(s, s * asp, s * 0.14);
    sh.prism(p, y0, y1, k === 0 ? Z.PODIUM : Z.FACADE, Z.GARDEN);
    if (k > 0) trimBand(sh, p, y1 - 1.4, 1.0, 0.3);
    y0 = y1;
  }
  // art-deco crown: stepped gilded fins around a central spire
  const s = base * (1 - (n - 1) * 0.12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const x = Math.cos(a) * s * 0.36, z = Math.sin(a) * s * 0.36;
    sh.prism(rotPoly(rect(4, s * 0.3), a).map(([px, pz]) => [px + x, pz + z]), y0, y0 + H * 0.07, Z.METAL, Z.METAL);
  }
  sh.prism(chamfer(s * 0.4, s * 0.4 * asp, s * 0.08), y0, y0 + H * 0.05, Z.METAL, Z.METAL);
  spire(sh, 0, 0, y0 + H * 0.05, H * 0.1, s * 0.08);
  return { shape: sh, w: base, d: base * asp, h: H };
}

export function twisted(rng, H) {
  const sh = new Shape();
  const s = rng.range(52, 66), tw = rng.range(0.7, 1.3) * (Math.PI / 2) * rng.sign();
  sh.prism(rounded(s * 1.7, s * 1.7, 22, 4), 0, 28, Z.PODIUM, Z.GARDEN);
  const N = 34, secs = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    secs.push({ poly: rounded(s, s, s * 0.24, 3), y: 26 + (H - 26) * t, rot: tw * t, s: 1 - 0.3 * Math.pow(t, 1.2) });
  }
  sh.tower(secs, Z.FACADE, { crease: 60, cap: Z.ROOF });
  const top = rotPoly(rounded(s * 0.7, s * 0.7, s * 0.17, 3), tw);
  trimBand(sh, top, H - 2.2, 1.4, 0.4);
  mast(sh, 0, 0, H, H * 0.12, 2.6);
  return { shape: sh, w: s * 1.7, d: s * 1.7, h: H };
}

export function needle(rng, H) {
  const sh = new Shape();
  const r0 = rng.range(28, 36);
  sh.prism(circle(r0 * 1.9, 24), 0, 20, Z.PODIUM, Z.GARDEN);
  const rAt = (y) => r0 * (1 - 0.7 * Math.pow(y / H, 1.4));
  const secs = [];
  for (let i = 0; i <= 12; i++) { const y = 18 + (H * 0.86 - 18) * (i / 12); secs.push({ poly: circle(rAt(y), 20), y }); }
  sh.tower(secs, Z.FACADE, { crease: 80, cap: null });
  sh.cone(0, 0, rAt(H * 0.86), 0.4, H * 0.86, H, Z.METAL, 20);
  for (let y = 70; y < H * 0.8; y += 64) {
    const r = rAt(y) + 5;
    sh.prism(circle(r, 20), y, y + 2.4, Z.METAL, Z.GARDEN);
    sh.walls(circle(r + 0.2, 20), y - 0.8, y, Z.TRIM);
  }
  sh.prism(rect(1.2, 1.2), H - 0.5, H + 1.5, Z.TRIM, Z.TRIM);
  return { shape: sh, w: r0 * 3.8, d: r0 * 3.8, h: H };
}

export function crowned(rng, H) {
  const sh = new Shape();
  const r = rng.range(34, 46);
  sh.prism(circle(r * 1.55, 28), 0, 24, Z.PODIUM, Z.GARDEN);
  sh.prism(circle(r, 28), 22, H * 0.76, Z.FACADE, null);
  sh.prism(circle(r * 0.84, 28), H * 0.76, H * 0.82, Z.DARKGLASS, null);
  sh.cap(circle(r, 28), H * 0.76, Z.GARDEN);
  sh.prism(circle(r * 0.96, 28), H * 0.82, H * 0.94, Z.FACADE, Z.ROOF);
  trimBand(sh, circle(r * 0.96, 28), H * 0.82 - 1.2, 1.2, 0.3);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    sh.beam([c * r * 0.86, H * 0.88, s * r * 0.86], [c * r * 1.32, H * 1.03, s * r * 1.32], 2.6, 7, Z.METAL, [c, 0, s]);
  }
  sh.cone(0, 0, r * 0.42, 0.3, H * 0.94, H * 1.08, Z.METAL, 16);
  sh.prism(rect(1.4, 1.4), H * 1.08 - 1, H * 1.08 + 1.5, Z.TRIM, Z.TRIM);
  return { shape: sh, w: r * 3.1, d: r * 3.1, h: H };
}

export function trifoil(rng, H) {
  const sh = new Shape();
  const L = rng.range(56, 74), aw = rng.range(26, 32);
  sh.prism(circle(L * 1.35, 24), 0, 18, Z.PODIUM, Z.GARDEN);
  sh.prism(regular(6, aw * 0.78), 16, H, Z.FACADE, Z.ROOF);
  for (let k = 0; k < 3; k++) {
    const th = (k / 3) * TAU + rng.range(-0.05, 0.05);
    const arm = rotPoly(movePoly(rounded(L, aw, aw * 0.46, 4), L / 2, 0), th);
    const hk = H * (0.6 + 0.15 * k);
    sh.prism(arm, 16, hk, Z.FACADE, Z.GARDEN);
    const tip = rotPoly([[L - 6, 0]], th)[0];
    sh.prism(rect(3, 3, tip[0], tip[1]), hk, hk + 18, Z.METAL, Z.TRIM);
  }
  spire(sh, 0, 0, H, H * 0.14, aw * 0.25);
  return { shape: sh, w: L * 2.7, d: L * 2.7, h: H };
}

export function gate(rng, H) {
  const sh = new Shape();
  const lw = rng.range(36, 46), span = rng.range(90, 130), bh = rng.range(48, 72);
  for (const s of [-1, 1]) {
    const cx = s * (span / 2 + lw / 2);
    sh.prism(movePoly(chamfer(lw, lw * 1.25, 7), cx, 0), 0, H - bh, Z.FACADE, null);
    sh.prism(movePoly(rect(lw + 12, lw * 1.25 + 12), cx, 0), 0, 26, Z.PODIUM, Z.GARDEN);
  }
  const bw = span + 2 * lw;
  sh.prism(chamfer(bw, lw * 1.25, 7), H - bh, H, Z.FACADE, Z.ROOF);
  sh.cap(rect(span, lw * 1.25), H - bh, Z.TRIM, { down: true });
  for (let i = -2; i <= 2; i++) sh.prism(rect(3, lw * 0.9, i * bw * 0.18, 0), H, H + 12 + (2 - Math.abs(i)) * 8, Z.METAL, Z.METAL);
  return { shape: sh, w: bw + 12, d: lw * 1.25 + 12, h: H };
}

export function crystal(rng, H) {
  const sh = new Shape();
  const r = rng.range(34, 44);
  sh.prism(regular(6, r * 1.6, Math.PI / 6), 0, 16, Z.PODIUM, Z.GARDEN);
  const secs = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    secs.push({ poly: regular(6, r), y: 14 + (H * 0.9 - 14) * t, rot: (i % 2) * (Math.PI / 6), s: 1 - 0.35 * t });
  }
  sh.tower(secs, Z.FACADE, { crease: 20, cap: null });
  const top = secs[N];
  const ring = regular(6, r * top.s, top.rot).map(([x, z]) => [x, top.y, z]);
  const apex = regular(6, 0.5, top.rot).map(([x, z]) => [x, H * 1.05, z]);
  sh.loft([ring, apex], Z.METAL, { crease: 20 });
  return { shape: sh, w: r * 3.2, d: r * 3.2, h: H };
}

export function stack(rng, H) {
  const sh = new Shape();
  const n = rng.int(6, 9);
  let y = 0;
  const lh = H / n;
  let maxW = 0, maxD = 0;
  for (let k = 0; k < n; k++) {
    const w = rng.range(46, 78), d = rng.range(36, 60);
    const ox = rng.range(-14, 14), oz = rng.range(-12, 12);
    sh.prism(rect(w, d, ox, oz), y, y + lh, k % 3 === 2 ? Z.DARKGLASS : Z.FACADE, Z.GARDEN);
    trimBand(sh, rect(w, d, ox, oz), y + lh - 0.6, 0.6, 0.2);
    maxW = Math.max(maxW, w + 2 * Math.abs(ox)); maxD = Math.max(maxD, d + 2 * Math.abs(oz));
    y += lh;
  }
  roofKit(sh, rng, 40, 30, y);
  return { shape: sh, w: maxW, d: maxD, h: H };
}

export function cylinders(rng, H) {
  const sh = new Shape();
  const rs = [rng.range(22, 30), rng.range(16, 24), rng.range(14, 20)];
  const hs = [H, H * rng.range(0.66, 0.8), H * rng.range(0.45, 0.6)];
  const pos = [[0, 0], [rs[0] + rs[1] * 0.6, 0], [rs[0] * 0.3, rs[0] + rs[2] * 0.5]];
  for (let k = 0; k < 3; k++) {
    const [x, z] = pos[k];
    sh.prism(circle(rs[k], 24, x, z), 0, hs[k], Z.FACADE, Z.ROOF);
    trimBand(sh, circle(rs[k], 24).map(([a, b]) => [a + x, b + z]), hs[k] - 3, 1.2, 0.3);
  }
  mast(sh, 0, 0, H, H * 0.15, 2);
  return { shape: sh, w: rs[0] * 2 + rs[1] * 2.2, d: rs[0] * 2 + rs[2] * 1.6, h: H };
}

// ------------------------------------------------------------------ mid-rise
export function podiumTower(rng, H) {
  const sh = new Shape();
  const pw = rng.range(70, 100), pd = rng.range(56, 80), ph = rng.range(18, 30);
  sh.prism(rect(pw, pd), 0, ph, Z.PODIUM, Z.GARDEN);
  const s = rng.range(28, 40), ox = rng.range(-1, 1) * (pw - s) * 0.3, oz = rng.range(-1, 1) * (pd - s) * 0.3;
  const p = movePoly(chamfer(s, s * rng.range(0.8, 1.1), s * 0.15), ox, oz);
  sh.prism(p, ph, H, Z.FACADE, Z.ROOF);
  sh.prism(movePoly(chamfer(s * 0.7, s * 0.6, s * 0.1), ox, oz), H, H + 9, Z.CLAD, Z.ROOF);
  trimBand(sh, chamfer(s, s, s * 0.15).map(([a, b]) => [a + ox, b + oz]), H - 1.2, 1.0, 0.2);
  if (rng.chance(0.6)) mast(sh, ox, oz, H + 9, rng.range(10, 30), 1.2);
  return { shape: sh, w: pw, d: pd, h: H };
}

export function slab(rng, H) {
  const sh = new Shape();
  const w = rng.range(66, 100), d = rng.range(18, 26);
  sh.prism(chamfer(w, d, 4), 0, H, Z.FACADE, Z.ROOF);
  trimBand(sh, chamfer(w, d, 4), H - 1.2, 1.0, 0.2);
  roofKit(sh, rng, w * 0.6, d * 0.6, H);
  return { shape: sh, w, d, h: H };
}

export function roundedBlock(rng, H) {
  const sh = new Shape();
  const w = rng.range(48, 72), d = rng.range(34, 50), r = rng.range(8, 14);
  sh.prism(rounded(w, d, r, 4), 0, H - 7, Z.FACADE, Z.GARDEN);
  sh.prism(rounded(w - 14, d - 12, r * 0.6, 3), H - 7, H, Z.GLASS, Z.ROOF);
  roofKit(sh, rng, w * 0.5, d * 0.5, H);
  return { shape: sh, w, d, h: H };
}

export function hexTower(rng, H) {
  const sh = new Shape();
  const r = rng.range(19, 27);
  sh.prism(regular(6, r * 1.5), 0, 10, Z.PODIUM, Z.GARDEN);
  sh.prism(regular(6, r), 8, H, Z.FACADE, Z.GARDEN);
  sh.prism(regular(6, r + 1.5), H, H + 2, Z.METAL, Z.METAL);
  sh.prism(regular(6, r * 0.45), H, H + 8, Z.CLAD, Z.ROOF);
  return { shape: sh, w: r * 3, d: r * 3, h: H };
}

export function terraced(rng, H) {
  const sh = new Shape();
  const w = rng.range(60, 96), d = rng.range(40, 60);
  const n = rng.int(4, 6);
  for (let k = 0; k < n; k++) {
    const dk = d * (1 - k * 0.14);
    const y0 = (H * k) / n, y1 = (H * (k + 1)) / n;
    sh.prism(rect(w - k * 4, dk, 0, -(d - dk) / 2), y0, y1, Z.FACADE, Z.GARDEN);
  }
  return { shape: sh, w, d, h: H };
}

export function lblock(rng, H) {
  const sh = new Shape();
  const w = rng.range(60, 90), d = rng.range(60, 90), t = rng.range(18, 26);
  sh.prism(rect(w, t, 0, -d / 2 + t / 2), 0, H, Z.FACADE, Z.ROOF);
  sh.prism(rect(t, d - t, -w / 2 + t / 2, t / 2), 0, H * rng.range(0.7, 1.0), Z.FACADE, Z.GARDEN);
  roofKit(sh, rng, w * 0.5, t * 0.6, H);
  return { shape: sh, w, d, h: H };
}

export function courtyard(rng, H) {
  const sh = new Shape();
  const w = rng.range(70, 110), d = rng.range(70, 110), t = rng.range(15, 22);
  const outer = chamfer(w, d, rng.range(2, 10)), inner = rect(w - 2 * t, d - 2 * t);
  sh.walls(outer, 0, H, Z.FACADE);
  sh.loft([inner.map(([x, z]) => [x, 0, z]), inner.map(([x, z]) => [x, H, z])], Z.FACADE, { crease: 40, orient: (p) => [-p[0], 0, -p[2]] });
  sh.cap(outer, H, Z.ROOF, { holes: [inner] });
  sh.cap(inner, 0.6, Z.GARDEN);
  trimBand(sh, outer, H - 1.0, 0.8, 0.2);
  return { shape: sh, w, d, h: H };
}

// ------------------------------------------------------------------ low-rise (garden quarters)
export function villaRow(rng, H) {
  const sh = new Shape();
  const n = rng.int(4, 6), uw = rng.range(12, 16), ud = rng.range(16, 22);
  for (let k = 0; k < n; k++) {
    const h = H * rng.range(0.7, 1.0);
    const x = (k - (n - 1) / 2) * uw;
    sh.prism(rect(uw - 0.6, ud, x, rng.range(-2, 2)), 0, h, Z.FACADE, Z.GARDEN);
    sh.prism(rect(uw * 0.5, ud * 0.4, x, -ud * 0.2), h, h + 3, Z.GLASS, Z.ROOF);
  }
  return { shape: sh, w: n * uw, d: ud + 4, h: H };
}

export function pavilion(rng, H) {
  const sh = new Shape();
  const r = rng.range(16, 26);
  sh.prism(circle(r + 6, 24), 0, 1.2, Z.STONE, Z.STONE);
  sh.prism(circle(r, 24), 1.2, H, Z.GLASS, null);
  sh.cone(0, 0, r + 2, 0.5, H, H + r * 0.45, Z.METAL, 24);
  sh.walls(circle(r + 2.1, 24), H - 0.4, H + 0.4, Z.TRIM);
  return { shape: sh, w: (r + 6) * 2, d: (r + 6) * 2, h: H };
}

export function courtyardLow(rng, H) {
  const sh = new Shape();
  const w = rng.range(46, 70), d = rng.range(46, 70), t = rng.range(11, 15);
  const outer = rect(w, d), inner = rect(w - 2 * t, d - 2 * t);
  sh.walls(outer, 0, H, Z.FACADE);
  sh.loft([inner.map(([x, z]) => [x, 0, z]), inner.map(([x, z]) => [x, H, z])], Z.FACADE, { crease: 40, orient: (p) => [-p[0], 0, -p[2]] });
  sh.cap(outer, H, Z.GARDEN, { holes: [inner] });
  sh.cap(inner, 0.6, Z.GARDEN);
  return { shape: sh, w, d, h: H };
}

export const MEGA = { blade, twin, ziggurat, twisted, needle, crowned, trifoil, gate, crystal, stack, cylinders };
export const MID = { podiumTower, slab, roundedBlock, hexTower, terraced, lblock, courtyard, cylinders, stack };
export const LOW = { villaRow, pavilion, courtyardLow, terraced, courtyard };
