// The Keel-Leaf foundation: an arrowhead deck 32 km long, three lit city-wall tiers stepping down and
// out from its edge, a ribbed belly converging to a keel, the engine wall at the stern, and the five
// terrace plateaus that climb toward the Crown Spire.
import * as THREE from 'three';
import { Shape, ShapeBatch, mirrorX, capXY, superellipse, Z } from './geo.js';
import {
  Z_BOW, Z_STERN, halfWidth, TIERS, bowTaper, keelDepth, PLATEAUS, CANAL, SPIRE,
} from './layout.js';
import { RNG, smoothstep as sm } from '../lib/rng.js';

const BELLY_N = 20;

/** Cross-section of the right half at station z. Returns key points from the deck edge to the keel. */
export function crossSection(z) {
  const W = halfWidth(z);
  const tp = bowTaper(z);
  const q = Math.min(1, W / 1400);
  const ty = 0.3 + 0.7 * Math.min(tp, Math.max(q, 0.2));
  const o1 = TIERS[1].off * tp * q, o2 = TIERS[2].off * tp * q;
  const y1 = TIERS[0].y1 * ty, y2 = TIERS[1].y1 * ty, y3 = TIERS[2].y1 * ty;
  const K = Math.max(keelDepth(z), -y3 + 160);
  const X = W + o2;
  const belly = [];
  const n = 2.5;
  for (let i = 0; i <= BELLY_N; i++) {
    const a = (i / BELLY_N) * (Math.PI / 2);
    const cx = Math.pow(Math.cos(a), 2 / n), sy = Math.pow(Math.sin(a), 2 / n);
    // a slight keel: the bottom pinches into a shallow V near the centreline
    const keelV = Math.pow(1 - cx, 1.0) * 0.0;
    belly.push([X * cx, y3 + (-K - y3) * sy - keelV]);
  }
  return { z, W, o1, o2, y1, y2, y3, K, X, belly };
}

function stations() {
  const zs = [];
  for (let z = Z_STERN; z < 11000; z += 200) zs.push(z);
  for (let z = 11000; z < Z_BOW; z += 70) zs.push(z);
  zs.push(Z_BOW);
  return zs;
}

export function buildFoundation(M, ctx) {
  const root = new THREE.Group();
  root.name = 'foundation';
  const B = new ShapeBatch();
  const zs = stations();
  const S = zs.map(crossSection);
  const R = (fn) => S.map((s) => fn(s));
  const right = new ShapeBatch();

  // ---------------------------------------------------------------- city-wall tiers and ledges
  const walls = [
    { mat: M.wallA, top: (s) => [s.W, 0, s.z], bot: (s) => [s.W, s.y1, s.z] },
    { mat: M.wallB, top: (s) => [s.W + s.o1, s.y1, s.z], bot: (s) => [s.W + s.o1, s.y2, s.z] },
    { mat: M.wallC, top: (s) => [s.W + s.o2, s.y2, s.z], bot: (s) => [s.W + s.o2, s.y3, s.z] },
  ];
  for (const w of walls) {
    right.get(w.mat).loft([R(w.top), R(w.bot)], Z.FACADE, { closed: false, orient: [1, 0, 0], crease: 30 });
  }
  // ledges: paved promenade, a garden band, and an outer walk
  const ledges = [
    { y: (s) => s.y1, a: (s) => s.W, b: (s) => s.W + s.o1 },
    { y: (s) => s.y2, a: (s) => s.W + s.o1, b: (s) => s.W + s.o2 },
  ];
  for (const L of ledges) {
    const at = (f) => (s) => [L.a(s) + (L.b(s) - L.a(s)) * f, L.y(s), s.z];
    right.get(M.stone).loft([R(at(0)), R(at(0.28))], Z.STONE, { closed: false, orient: [0, 1, 0] });
    right.get(M.stone).loft([R(at(0.28)), R(at(0.78))], Z.GARDEN, { closed: false, orient: [0, 1, 0] });
    right.get(M.stone).loft([R(at(0.78)), R(at(1))], Z.STONE, { closed: false, orient: [0, 1, 0] });
  }
  // belly
  {
    const rings = [];
    for (let i = 0; i <= BELLY_N; i++) rings.push(S.map((s) => [s.belly[i][0], s.belly[i][1], s.z]));
    right.get(M.belly).loft(rings, Z.FACADE, { closed: false, orient: (p) => [p[0], p[1] + 200, 0], crease: 50 });
  }

  // ---------------------------------------------------------------- belly ribs (transverse frames)
  const rng = new RNG(77);
  for (let z = Z_STERN + 900; z < 13000; z += 760) {
    const s = crossSection(z);
    const sN = crossSection(z + 1);
    void sN;
    const ribW = 70, ribH = 34 * Math.min(1, s.K / 1600);
    const rings = [];
    for (let i = 0; i <= BELLY_N; i++) {
      const p = s.belly[i];
      const pn = s.belly[Math.min(BELLY_N, i + 1)], pp = s.belly[Math.max(0, i - 1)];
      let tx = pn[0] - pp[0], ty = pn[1] - pp[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const nx = ty, ny = -tx; // outward (down/out)
      const o = nx * p[0] + ny * (p[1] + 200) < 0 ? -1 : 1;
      const Nx = nx * o, Ny = ny * o;
      rings.push([
        [p[0], p[1], z - ribW / 2], [p[0] + Nx * ribH, p[1] + Ny * ribH, z - ribW / 2],
        [p[0] + Nx * ribH, p[1] + Ny * ribH, z + ribW / 2], [p[0], p[1], z + ribW / 2],
      ]);
    }
    right.get(M.bellyDark).loft(rings, Z.FACADE, { closed: true, crease: 30 });
    void rng;
  }

  // ---------------------------------------------------------------- pilasters on the city walls
  for (let k = 0; k < 3; k++) {
    for (let z = Z_STERN + 420; z < 12500; z += 520) {
      const s = crossSection(z);
      const x = [s.W, s.W + s.o1, s.W + s.o2][k];
      const y0 = [0, s.y1, s.y2][k], y1 = [s.y1, s.y2, s.y3][k];
      const s2 = crossSection(z + 40);
      const x2 = [s2.W, s2.W + s2.o1, s2.W + s2.o2][k];
      const tz = 40, tx = x2 - x, tl = Math.hypot(tx, tz);
      const T = [tx / tl, tz / tl], N = [T[1], -T[0]];
      const w = 46, d = 16;
      const P = (a, b) => [x + T[0] * a + N[0] * b, z + T[1] * a + N[1] * b];
      const poly = [P(-w / 2, -2), P(w / 2, -2), P(w / 2, d), P(-w / 2, d)];
      right.get(M.stone).prism(poly, y1, y0 + 12, Z.CLAD, Z.METAL);
      // lit slot down the face of the pilaster
      const poly2 = [P(-3, d - 0.5), P(3, d - 0.5), P(3, d + 1.5), P(-3, d + 1.5)];
      right.get(M.stone).prism(poly2, y1 + 20, y0 - 10, Z.TRIM, null);
    }
  }

  // mirror the right half
  for (const [mat, sh] of right.map) {
    B.get(mat).add(sh);
    B.get(mat).add(mirrorX(sh));
  }
  right.map.clear();

  // ---------------------------------------------------------------- deck parapet (lit rail along the edge)
  {
    const top = R((s) => [s.W - 1, 9, s.z]), bot = R((s) => [s.W - 1, 0, s.z]);
    const sh = new Shape().loft([bot, top], Z.CLAD, { closed: false, orient: [1, 0, 0] });
    B.get(M.stone).add(sh).add(mirrorX(sh));
    const glow = new Shape().loft([R((s) => [s.W + 0.5, 6.5, s.z]), R((s) => [s.W + 0.5, 8.0, s.z])], Z.TRIM, { closed: false, orient: [1, 0, 0] });
    B.get(M.stone).add(glow).add(mirrorX(glow));
  }

  // ---------------------------------------------------------------- engine wall (stern cap)
  {
    const s = crossSection(Z_STERN);
    const half = [[0, 0], [s.W, 0], [s.W, s.y1], [s.W + s.o1, s.y1], [s.W + s.o1, s.y2], [s.W + s.o2, s.y2], ...s.belly.map((p) => [p[0], p[1]])];
    const outline = [...half, ...half.slice().reverse().map(([x, y]) => [-x, y]).filter((p, i, a) => i > 0 && i < a.length - 1)];
    capXY(B.get(M.engineWall), outline, Z_STERN, Z.FACADE, -1);
    ctx.sternOutline = outline;
  }

  // ---------------------------------------------------------------- deck
  {
    const pts = [];
    for (const z of zs) pts.push([halfWidth(z), z]);
    const outline = [...pts, ...pts.slice().reverse().map(([x, z]) => [-x, z])];
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const hw = CANAL.halfW + CANAL.walk;
    const hole = new THREE.Path([[-hw, CANAL.z0], [hw, CANAL.z0], [hw, CANAL.z1], [-hw, CANAL.z1]].map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.holes.push(hole);
    const g = new THREE.ShapeGeometry(shape, 1);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, M.ground);
    mesh.receiveShadow = true;
    mesh.name = 'deck';
    root.add(mesh);
  }

  // ---------------------------------------------------------------- terrace plateaus around the spire
  {
    let yPrev = 0;
    PLATEAUS.forEach((P, k) => {
      const poly = superellipse(P.a, P.b, P.n, 220, 0, P.cz);
      const wall = new Shape().walls(poly, yPrev - 2, P.h, Z.FACADE, { crease: 20 });
      B.get(M.terrace).add(wall);
      // parapet with a lit rail
      const par = new Shape().walls(poly, P.h, P.h + 7, Z.CLAD, { crease: 20 });
      B.get(M.stone).add(par);
      const cap = new Shape().cap(poly, P.h, Z.ROOF);
      const capMesh = new THREE.Mesh(cap.toGeometry(), M.groundPolar);
      capMesh.receiveShadow = true;
      capMesh.name = `plateau-${k}`;
      root.add(capMesh);
      yPrev = P.h;
    });
  }

  B.build(root, { name: 'foundation' });
  void sm; void SPIRE;
  return root;
}
