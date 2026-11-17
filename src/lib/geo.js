// Geometry toolkit: lathes around the ship axis (Z), beams, batching and instancing helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU } from './rng.js';

// Physical size multiplier for hull texture tiles (one 2048² plating tile ≈ 96 m).
export const TILE_SCALE = 2;

/**
 * Revolve a 2D profile [[r, z], ...] around the Z axis.
 * UVs are in "tile" units (metres / tile) so one shared hull texture keeps a consistent physical scale.
 * Normals are analytic; corners sharper than `crease` degrees are split for crisp edges.
 */
export function lathe(profile, {
  segments = 64,
  phiStart = 0,
  phiLength = TAU,
  tile = 48,
  crease = 35,
  faceted = false,
  uScale = 1,
  vScale = 1,
  uvMode = 'tile', // 'tile' | 'unit'
} = {}) {
  tile *= TILE_SCALE;
  // Build rows (profile vertices with normals), splitting at creases.
  const rows = [];
  const segN = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i];
    const [r1, z1] = profile[i + 1];
    const dr = r1 - r0, dz = z1 - z0;
    const l = Math.hypot(dr, dz) || 1;
    segN.push([dz / l, -dr / l, l]);
  }
  const cosCrease = Math.cos(crease * Math.PI / 180);
  let arc = 0;
  for (let i = 0; i < profile.length; i++) {
    const [r, z] = profile[i];
    const nPrev = i > 0 ? segN[i - 1] : null;
    const nNext = i < segN.length ? segN[i] : null;
    if (i > 0) arc += segN[i - 1][2];
    if (nPrev && nNext) {
      const d = nPrev[0] * nNext[0] + nPrev[1] * nNext[1];
      if (d < cosCrease) {
        rows.push({ r, z, nr: nPrev[0], nz: nPrev[1], v: arc });
        rows.push({ r, z, nr: nNext[0], nz: nNext[1], v: arc });
      } else {
        const nr = nPrev[0] + nNext[0], nz = nPrev[1] + nNext[1];
        const l = Math.hypot(nr, nz) || 1;
        rows.push({ r, z, nr: nr / l, nz: nz / l, v: arc });
      }
    } else {
      const n = nPrev || nNext;
      rows.push({ r, z, nr: n[0], nz: n[1], v: arc });
    }
  }
  const totalArc = arc || 1;
  let rMax = 0;
  for (const p of profile) rMax = Math.max(rMax, p[0]);
  const full = Math.abs(phiLength - TAU) < 1e-6;
  const uLenTiles = full
    ? Math.max(1, Math.round((TAU * rMax) / tile))
    : (phiLength * rMax) / tile;

  const pos = [], nor = [], uv = [], idx = [];
  const cols = [];
  if (faceted) {
    for (let s = 0; s < segments; s++) {
      const a0 = phiStart + (s / segments) * phiLength;
      const a1 = phiStart + ((s + 1) / segments) * phiLength;
      const am = (a0 + a1) / 2;
      cols.push({ a: a0, f: s / segments, an: am });
      cols.push({ a: a1, f: (s + 1) / segments, an: am, end: true });
    }
  } else {
    for (let s = 0; s <= segments; s++) {
      const a = phiStart + (s / segments) * phiLength;
      cols.push({ a, f: s / segments, an: a });
    }
  }
  // vertices: rows x cols
  for (let ri = 0; ri < rows.length; ri++) {
    const R = rows[ri];
    for (let ci = 0; ci < cols.length; ci++) {
      const C = cols[ci];
      const ca = Math.cos(C.a), sa = Math.sin(C.a);
      pos.push(R.r * ca, R.r * sa, R.z);
      let nx, ny;
      if (faceted) {
        // facet normal: profile normal rotated to facet centre, corrected for chord
        const cn = Math.cos(C.an), sn = Math.sin(C.an);
        nx = R.nr * cn; ny = R.nr * sn;
      } else {
        nx = R.nr * ca; ny = R.nr * sa;
      }
      nor.push(nx, ny, R.nz);
      if (uvMode === 'unit') uv.push(C.f * uScale, (R.v / totalArc) * vScale);
      else uv.push(C.f * uLenTiles * uScale, (R.v / tile) * vScale);
    }
  }
  const nc = cols.length;
  for (let ri = 0; ri < rows.length - 1; ri++) {
    // skip zero-length crease duplicates
    if (rows[ri].r === rows[ri + 1].r && rows[ri].z === rows[ri + 1].z) continue;
    const step = faceted ? 2 : 1;
    for (let ci = 0; ci < nc - 1; ci += step) {
      const a = ri * nc + ci, b = ri * nc + ci + 1;
      const c = (ri + 1) * nc + ci + 1, d = (ri + 1) * nc + ci;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Box with UVs scaled to metres/tile on each face. */
export function tiledBox(w, h, d, tile = 48) {
  tile *= TILE_SCALE;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    let su, sv;
    if (ax > 0.5) { su = d; sv = h; } else if (ay > 0.5) { su = w; sv = d; } else { su = w; sv = h; }
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  return g;
}

/** Cylinder along Z with tile UVs. */
export function tiledCylinderZ(r0, r1, len, seg = 24, tile = 48, open = false) {
  tile *= TILE_SCALE;
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  g.rotateX(Math.PI / 2);
  const uv = g.attributes.uv;
  const circ = TAU * Math.max(r0, r1);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / tile, (uv.getY(i) * len) / tile);
  return g;
}

const _z = new THREE.Vector3(0, 0, 1);
const _up = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Matrix that maps a unit box/cylinder (aligned to Z, centred) onto the segment a→b. */
export function beamMatrix(a, b, w, h, up = null, out = new THREE.Matrix4(), extend = 0) {
  _d.subVectors(b, a);
  const len = _d.length() + extend;
  _d.normalize();
  _up.copy(up || (Math.abs(_d.y) < 0.95 ? _y.set(0, 1, 0) : _y.set(1, 0, 0)));
  _x.crossVectors(_up, _d).normalize();
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  const yy = new THREE.Vector3().crossVectors(_d, _x).normalize();
  out.makeBasis(_x.multiplyScalar(w), yy.multiplyScalar(h), _d.clone().multiplyScalar(len));
  out.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return out;
}

export function composeMatrix(pos, quat, scale, out = new THREE.Matrix4()) {
  return out.compose(pos, quat, scale);
}

/** Collects geometry per material and merges into as few draw calls as possible. */
export class Batch {
  constructor() { this.groups = new Map(); }
  add(geometry, material, matrix = null) {
    const g = geometry.index ? geometry.clone() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    // normalise attribute set
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.index) {
      const idx = [];
      for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
      g.setIndex(idx);
    }
    g.morphAttributes = {};
    g.clearGroups();
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(g);
    return this;
  }
  build(parent, { castShadow = true, receiveShadow = true, name = '' } = {}) {
    const meshes = [];
    for (const [mat, geos] of this.groups) {
      if (!geos.length) continue;
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow && !mat.transparent && mat.userData.castShadow !== false;
      mesh.receiveShadow = receiveShadow && mat.userData.receiveShadow !== false;
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
      for (const g of geos) if (g !== merged) g.dispose();
    }
    this.groups.clear();
    return meshes;
  }
}

/** Instanced mesh accumulator. */
export class Instancer {
  constructor(geometry, material, { castShadow = true, receiveShadow = true, colors = false } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.matrices = [];
    this.colors = colors ? [] : null;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
  }
  add(matrix, color = null) {
    this.matrices.push(matrix.clone());
    if (this.colors) this.colors.push(color ? color.clone() : new THREE.Color(1, 1, 1));
    return this;
  }
  get count() { return this.matrices.length; }
  build(parent, name = '') {
    if (!this.matrices.length) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.matrices.length);
    this.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    if (this.colors) this.colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = this.receiveShadow;
    mesh.computeBoundingSphere();
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    parent.add(mesh);
    return mesh;
  }
}

/** Point on a cylinder around Z: angle phi, radius r, z. */
export function cyl(r, phi, z, out = new THREE.Vector3()) {
  return out.set(r * Math.cos(phi), r * Math.sin(phi), z);
}

/** Orientation matrix for an object sitting on the outside of a cylinder (local +Y = radial out, +Z = ship axis). */
export function surfaceMatrix(r, phi, z, sx, sy, sz, out = new THREE.Matrix4(), rollZ = 0) {
  const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
  const axis = new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3().crossVectors(radial, axis); // local X
  if (rollZ) {
    tangent.applyAxisAngle(radial, rollZ);
    axis.applyAxisAngle(radial, rollZ);
  }
  out.makeBasis(tangent.multiplyScalar(sx), radial.clone().multiplyScalar(sy), axis.multiplyScalar(sz));
  out.setPosition(radial.x * r, radial.y * r, z);
  return out;
}

export { _m as scratchMatrix, _z as AXIS_Z };
