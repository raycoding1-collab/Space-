// City geometry builder. Every vertex carries, besides position and normal:
//   aFac  — facade coordinates in metres (u: distance along the wall, v: height), or (x, z) on caps
//   aZone — what the surface is (facade, podium, cladding, roof, metal, trim, dark glass, garden, …)
// The city shaders turn these into windows, floors, mullions and roofs at any distance.
import * as THREE from 'three';
import { TAU } from '../lib/rng.js';

export const Z = {
  FACADE: 0, PODIUM: 1, CLAD: 2, ROOF: 3, METAL: 4, TRIM: 5, DARKGLASS: 6, GARDEN: 7, GLASS: 8, STONE: 9,
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();

export class Shape {
  constructor() { this.P = []; this.N = []; this.F = []; this.Zn = []; }

  /** Triangle; winding is fixed automatically to face along the supplied normals. */
  tri(a, b, c, na, nb, nc, fa, fb, fc, zone) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    const avg = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    if (_n.x * avg[0] + _n.y * avg[1] + _n.z * avg[2] < 0) {
      [b, c] = [c, b]; [nb, nc] = [nc, nb]; [fb, fc] = [fc, fb];
    }
    this.P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.N.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    this.F.push(fa[0], fa[1], fb[0], fb[1], fc[0], fc[1]);
    this.Zn.push(zone, zone, zone);
  }
  quad(a, b, c, d, na, nb, nc, nd, fa, fb, fc, fd, zone) {
    this.tri(a, b, c, na, nb, nc, fa, fb, fc, zone);
    this.tri(a, c, d, na, nc, nd, fa, fc, fd, zone);
  }

  /**
   * Loft through rings of 3D points (equal counts). Normals are smoothed across neighbouring quads
   * unless the angle between them exceeds `crease` degrees.
   */
  loft(rings, zone, { closed = true, crease = 40, u0 = 0, zoneFn = null, vFn = null, flip = false, orient = null } = {}) {
    const R = rings.length, C = rings[0].length;
    const E = closed ? C : C - 1;
    // face normals
    const fn = [];
    for (let i = 0; i < R - 1; i++) {
      const row = [];
      for (let j = 0; j < E; j++) {
        const j1 = (j + 1) % C;
        const p00 = rings[i][j], p01 = rings[i][j1], p10 = rings[i + 1][j], p11 = rings[i + 1][j1];
        _a.set(p11[0] - p00[0], p11[1] - p00[1], p11[2] - p00[2]);
        _b.set(p10[0] - p01[0], p10[1] - p01[1], p10[2] - p01[2]);
        _n.crossVectors(_b, _a);
        if (_n.lengthSq() < 1e-12) {
          // degenerate (apex): use the quad's other diagonal pair
          _a.set(p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2]);
          _b.set(p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]);
          _n.crossVectors(_b, _a);
        }
        _n.normalize();
        if (flip) _n.negate();
        row.push([_n.x, _n.y, _n.z]);
      }
      fn.push(row);
    }
    if (orient) {
      // flip every face normal if they point against the expected outward direction
      let dot = 0;
      for (let i = 0; i < R - 1; i++) for (let j = 0; j < E; j++) {
        const p = rings[i][j], o = typeof orient === 'function' ? orient(p) : orient, n = fn[i][j];
        dot += n[0] * o[0] + n[1] * o[1] + n[2] * o[2];
      }
      if (dot < 0) for (const row of fn) for (const n of row) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
    }
    const cosC = Math.cos((crease * Math.PI) / 180);
    const vnorm = (i, j, ref) => {
      const s = [0, 0, 0];
      for (const di of [-1, 0]) for (const dj of [-1, 0]) {
        const qi = i + di; let qj = j + dj;
        if (qi < 0 || qi >= R - 1) continue;
        if (closed) qj = (qj + E) % E; else if (qj < 0 || qj >= E) continue;
        const n = fn[qi][qj];
        if (n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] >= cosC) { s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; }
      }
      const l = Math.hypot(s[0], s[1], s[2]) || 1;
      return [s[0] / l, s[1] / l, s[2] / l];
    };
    // facade u along each ring
    const U = rings.map((ring) => {
      const u = [u0];
      for (let j = 1; j <= C; j++) {
        const a = ring[j - 1], b = ring[j % C];
        u.push(u[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
      }
      return u;
    });
    for (let i = 0; i < R - 1; i++) {
      for (let j = 0; j < E; j++) {
        const j1 = (j + 1) % C;
        const ref = fn[i][j];
        const p = [rings[i][j], rings[i][j1], rings[i + 1][j1], rings[i + 1][j]];
        const n = [vnorm(i, j, ref), vnorm(i, j1 === 0 && closed ? C : j1, ref), vnorm(i + 1, j1 === 0 && closed ? C : j1, ref), vnorm(i + 1, j, ref)];
        const vv = (q, ii) => (vFn ? vFn(q, ii) : q[1]);
        const f = [[U[i][j], vv(p[0], i)], [U[i][j + 1], vv(p[1], i)], [U[i + 1][j + 1], vv(p[2], i + 1)], [U[i + 1][j], vv(p[3], i + 1)]];
        const z = zoneFn ? zoneFn(i, j) : zone;
        this.quad(p[0], p[1], p[2], p[3], n[0], n[1], n[2], n[3], f[0], f[1], f[2], f[3], z);
      }
    }
    return this;
  }

  /** Vertical walls around a 2D polygon [[x, z], ...] from y0 to y1. */
  walls(poly, y0, y1, zone, { crease = 40, u0 = 0 } = {}) {
    const pts = ccw(poly);
    return this.loft([pts.map(([x, z]) => [x, y0, z]), pts.map(([x, z]) => [x, y1, z])], zone, { crease, u0 });
  }

  /** Flat cap (triangulated polygon) at height y. */
  cap(poly, y, zone, { down = false, holes = [] } = {}) {
    const pts = ccw(poly);
    const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
    const hv = holes.map((h) => ccw(h).reverse().map(([x, z]) => new THREE.Vector2(x, z)));
    const tris = THREE.ShapeUtils.triangulateShape(contour, hv);
    const all = [...pts, ...holes.flatMap((h) => ccw(h).reverse())];
    const n = down ? [0, -1, 0] : [0, 1, 0];
    for (const [a, b, c] of tris) {
      const A = all[a], B = all[b], Cc = all[c];
      this.tri([A[0], y, A[1]], [B[0], y, B[1]], [Cc[0], y, Cc[1]], n, n, n, A, B, Cc, zone);
    }
    return this;
  }

  /** Cap a 3D ring that is planar but not necessarily horizontal (triangulated in its xz projection). */
  capRing(ring, zone, n = null) {
    const contour = ring.map((p) => new THREE.Vector2(p[0], p[2]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    let nn = n;
    if (!nn) {
      // Newell normal
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length];
        nx += (a[1] - c[1]) * (a[2] + c[2]); ny += (a[2] - c[2]) * (a[0] + c[0]); nz += (a[0] - c[0]) * (a[1] + c[1]);
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      nn = [nx / l, ny / l, nz / l];
      if (nn[1] < 0) nn = [-nn[0], -nn[1], -nn[2]];
    }
    for (const [a, b, c] of tris) {
      const A = ring[a], B = ring[b], Cc = ring[c];
      this.tri(A, B, Cc, nn, nn, nn, [A[0], A[2]], [B[0], B[2]], [Cc[0], Cc[2]], zone);
    }
    return this;
  }

  /** Prism: walls plus a roof cap (and optionally a floor). */
  prism(poly, y0, y1, zone, roofZone = Z.ROOF, { bottom = false, crease = 40, u0 = 0 } = {}) {
    this.walls(poly, y0, y1, zone, { crease, u0 });
    if (roofZone !== null) this.cap(poly, y1, roofZone);
    if (bottom) this.cap(poly, y0, roofZone ?? zone, { down: true });
    return this;
  }

  /** Tapered / twisted tower: sections [{poly, y, rot?, s?}] lofted with smooth or creased normals. */
  tower(sections, zone, { crease = 40, cap = Z.ROOF, zoneFn = null } = {}) {
    const rings = sections.map((s) => {
      const c = Math.cos(s.rot || 0), si = Math.sin(s.rot || 0), k = s.s ?? 1;
      return ccw(s.poly).map(([x, z]) => [(x * c - z * si) * k + (s.ox || 0), s.y, (x * si + z * c) * k + (s.oz || 0)]);
    });
    this.loft(rings, zone, { crease, zoneFn });
    if (cap !== null) {
      const last = rings[rings.length - 1];
      this.cap(last.map((p) => [p[0], p[2]]), last[0][1], cap);
    }
    return this;
  }

  box(cx, cy, cz, w, h, d, zone, roof = Z.ROOF) {
    const poly = [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]];
    return this.prism(poly, cy - h / 2, cy + h / 2, zone, roof, { bottom: false });
  }

  cylinder(cx, cz, r, y0, y1, zone, seg = 24, roof = Z.ROOF) {
    return this.prism(circle(r, seg, cx, cz), y0, y1, zone, roof, { crease: 80 });
  }

  /** Cone / spike from radius r0 at y0 to r1 at y1 (r1 may be 0). */
  cone(cx, cz, r0, r1, y0, y1, zone, seg = 16) {
    const a = circle(r0, seg, cx, cz).map(([x, z]) => [x, y0, z]);
    const b = circle(Math.max(r1, 0.001), seg, cx, cz).map(([x, z]) => [x, y1, z]);
    return this.loft([a, b], zone, { crease: 80 });
  }

  /** Beam between two 3D points with a w×h rectangular section. */
  beam(a, b, w, h, zone, up = [0, 1, 0]) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = d.length(); if (L < 1e-6) return this;
    d.divideScalar(L);
    let u = new THREE.Vector3(...up);
    if (Math.abs(u.dot(d)) > 0.95) u = new THREE.Vector3(1, 0, 0);
    const x = new THREE.Vector3().crossVectors(u, d).normalize().multiplyScalar(w / 2);
    const y = new THREE.Vector3().crossVectors(d, x).normalize().multiplyScalar(h / 2);
    const ring = (p) => [
      [p[0] - x.x - y.x, p[1] - x.y - y.y, p[2] - x.z - y.z], [p[0] + x.x - y.x, p[1] + x.y - y.y, p[2] + x.z - y.z],
      [p[0] + x.x + y.x, p[1] + x.y + y.y, p[2] + x.z + y.z], [p[0] - x.x + y.x, p[1] - x.y + y.y, p[2] - x.z + y.z],
    ];
    return this.loft([ring(a), ring(b)], zone, { crease: 30 });
  }

  /** Append another shape transformed by a Matrix4. */
  add(other, m = null) {
    if (!m) {
      this.P.push(...other.P); this.N.push(...other.N); this.F.push(...other.F); this.Zn.push(...other.Zn);
      return this;
    }
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    for (let i = 0; i < other.P.length; i += 3) {
      v.set(other.P[i], other.P[i + 1], other.P[i + 2]).applyMatrix4(m);
      this.P.push(v.x, v.y, v.z);
      v.set(other.N[i], other.N[i + 1], other.N[i + 2]).applyMatrix3(nm).normalize();
      this.N.push(v.x, v.y, v.z);
    }
    this.F.push(...other.F); this.Zn.push(...other.Zn);
    return this;
  }

  get triCount() { return this.P.length / 9; }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('aFac', new THREE.Float32BufferAttribute(this.F, 2));
    g.setAttribute('aZone', new THREE.Float32BufferAttribute(this.Zn, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ 2D polygons ([x, z] arrays)
export function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
/** Orientation that yields outward wall normals with the builder's convention. */
export function ccw(poly) { return area(poly) < 0 ? poly.slice().reverse() : poly; }

export function rect(w, d, cx = 0, cz = 0) {
  return [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]];
}
export function chamfer(w, d, c, cx = 0, cz = 0) {
  const x = w / 2, z = d / 2;
  return [[-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c], [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c]].map(([a, b]) => [a + cx, b + cz]);
}
export function rounded(w, d, r, seg = 4, cx = 0, cz = 0) {
  const out = [];
  const x = w / 2 - r, z = d / 2 - r;
  const corners = [[x, -z, -Math.PI / 2], [x, z, 0], [-x, z, Math.PI / 2], [-x, -z, Math.PI]];
  for (const [ox, oz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push([cx + ox + Math.cos(a) * r, cz + oz + Math.sin(a) * r]);
    }
  }
  return out;
}
export function circle(r, seg = 24, cx = 0, cz = 0, a0 = 0) {
  const out = [];
  for (let i = 0; i < seg; i++) { const a = a0 + (i / seg) * TAU; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}
export function ellipse(a, b, seg = 32, cx = 0, cz = 0) {
  const out = [];
  for (let i = 0; i < seg; i++) { const t = (i / seg) * TAU; out.push([cx + Math.cos(t) * a, cz + Math.sin(t) * b]); }
  return out;
}
export function superellipse(a, b, n, seg = 64, cx = 0, cz = 0) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * TAU, c = Math.cos(t), s = Math.sin(t);
    out.push([cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cz + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
  }
  return out;
}
/** n-lobed flower: radius r * (1 + k cos(n t)). */
export function lobed(r, n, k, seg = 72, rot = 0) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const t = (i / seg) * TAU;
    const rr = r * (1 + k * Math.cos(n * t));
    out.push([Math.cos(t + rot) * rr, Math.sin(t + rot) * rr]);
  }
  return out;
}
export function regular(n, r, rot = 0, cx = 0, cz = 0) { return circle(r, n, cx, cz, rot); }
export function offsetPoly(poly, d) {
  // miter offset of a convex-ish polygon (outward for d > 0)
  const p = ccw(poly), n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
    const e1 = norm2([b[0] - a[0], b[1] - a[1]]), e2 = norm2([c[0] - b[0], c[1] - b[1]]);
    const n1 = [e1[1], -e1[0]], n2 = [e2[1], -e2[0]];
    const m = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
    const k = d / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]);
    out.push([b[0] + m[0] * k, b[1] + m[1] * k]);
  }
  return out;
}
function norm2(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
export function scalePoly(poly, sx, sz = sx) { return poly.map(([x, z]) => [x * sx, z * sz]); }
export function movePoly(poly, dx, dz) { return poly.map(([x, z]) => [x + dx, z + dz]); }
export function rotPoly(poly, a) { const c = Math.cos(a), s = Math.sin(a); return poly.map(([x, z]) => [x * c - z * s, x * s + z * c]); }

/** Collects Shapes per material and turns each into one mesh. */
export class ShapeBatch {
  constructor() { this.map = new Map(); }
  get(mat) { if (!this.map.has(mat)) this.map.set(mat, new Shape()); return this.map.get(mat); }
  build(parent, { castShadow = true, receiveShadow = true, name = '' } = {}) {
    const out = [];
    for (const [mat, sh] of this.map) {
      if (!sh.P.length) continue;
      const mesh = new THREE.Mesh(sh.toGeometry(), mat);
      mesh.castShadow = castShadow && mat.userData.castShadow !== false && !mat.transparent;
      mesh.receiveShadow = receiveShadow;
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}

/** Mirror a shape across x = 0 (winding is repaired by tri()). */
export function mirrorX(sh) {
  const out = new Shape();
  const P = sh.P, N = sh.N, F = sh.F, Zn = sh.Zn;
  for (let t = 0; t < P.length; t += 9) {
    const v = (k) => [-P[t + k * 3], P[t + k * 3 + 1], P[t + k * 3 + 2]];
    const n = (k) => [-N[t + k * 3], N[t + k * 3 + 1], N[t + k * 3 + 2]];
    const f = (k) => [F[(t / 9) * 6 + k * 2], F[(t / 9) * 6 + k * 2 + 1]];
    out.tri(v(0), v(1), v(2), n(0), n(1), n(2), f(0), f(1), f(2), Zn[t / 3]);
  }
  return out;
}

/** Vertical polygon in the XY plane at depth z (e.g. a stern wall), facing ±Z. */
export function capXY(sh, poly, z, zone, facing = -1) {
  const contour = poly.map(([x, y]) => new THREE.Vector2(x, y));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const n = [0, 0, facing];
  for (const [a, b, c] of tris) {
    const A = poly[a], B = poly[b], Cc = poly[c];
    sh.tri([A[0], A[1], z], [B[0], B[1], z], [Cc[0], Cc[1], z], n, n, n, A, B, Cc, zone);
  }
  return sh;
}
