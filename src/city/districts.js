// District planner: lays buildings onto the street grids. The main deck uses a Cartesian grid of
// blocks split into parcels; the spire terraces use a radial grid of avenues and ring streets.
// Each district has its own architectural mix, palette and height profile, and the skyline climbs
// toward the Crown Spire.
import * as THREE from 'three';
import { RNG, TAU, clamp, smoothstep as sm } from '../lib/rng.js';
import {
  D, districtAt, halfWidth, blockRect, GRID, PLATEAUS, plateauLevel, polarOf, polarSpokes, POLAR, SPIRE,
  CANAL, DOMES, DOME_RING, CONSTRUCTION, transitDist,
} from './layout.js';
import * as A from './archetypes.js';

const ARCH_MATS = {
  blade: ['spireFins', 'spireGlass', 'spireDark', 'spireRose', 'spireJade'],
  twin: ['spireGlass', 'spireWhite', 'spireBronze', 'midCurtain'],
  ziggurat: ['spireBronze', 'spireWhite', 'spireGlass', 'resBalcony'],
  twisted: ['spireDiagrid', 'spireGlass', 'spireDark', 'spireRose', 'spireJade'],
  needle: ['spireGlass', 'spireWhite', 'spireFins', 'midCurtain'],
  crowned: ['spireGlass', 'spireWhite', 'spireBronze', 'midRibbon', 'spireJade', 'midCopper'],
  trifoil: ['spireFins', 'spireGlass', 'spireWhite'],
  gate: ['spireWhite', 'spireGlass', 'midRibbon'],
  crystal: ['spireDark', 'spireHex', 'spireDiagrid'],
  stack: ['spireWhite', 'midRibbon', 'midDark', 'resWhite'],
  cylinders: ['midCurtain', 'spireGlass', 'midFins', 'resHex'],
  podiumTower: ['midCurtain', 'midFins', 'midDark', 'midRibbon', 'spireGlass', 'midCopper', 'spireJade'],
  slab: ['midRibbon', 'midPunched', 'midCurtain', 'resBalcony', 'resWhite', 'midTerra', 'resOchre'],
  roundedBlock: ['midRibbon', 'resWhite', 'midCurtain', 'gardenWhite', 'gardenSage', 'spireWhite'],
  hexTower: ['resHex', 'resBalcony', 'midFins', 'spireHex', 'resOchre'],
  terraced: ['resBalcony', 'gardenWhite', 'resWhite', 'gardenStone', 'resOchre', 'gardenSage'],
  lblock: ['midPunched', 'resPunched', 'gardenStone', 'midRibbon', 'midTerra'],
  courtyard: ['resPunched', 'midPunched', 'gardenStone', 'resBalcony', 'midTerra', 'resOchre'],
  villaRow: ['gardenStone', 'gardenTimber', 'gardenWhite', 'gardenSage'],
  pavilion: ['gardenWhite', 'gardenTimber'],
  courtyardLow: ['gardenStone', 'gardenTimber', 'gardenWhite', 'resPunched', 'gardenSage', 'resOchre'],
};

const PALETTE = {
  spireHi: ['spireGlass', 'spireDiagrid', 'spireFins', 'spireDark', 'spireBronze', 'spireWhite', 'spireHex', 'spireJade', 'spireRose'],
  spireLo: ['midCurtain', 'midRibbon', 'midFins', 'midDark', 'spireGlass', 'spireWhite', 'midPunched', 'spireBronze', 'midCopper', 'spireJade', 'spireRose'],
  central: ['midCurtain', 'midRibbon', 'midFins', 'midDark', 'midPunched', 'spireGlass', 'midTerra', 'midCopper', 'spireWhite'],
  canal: ['resBalcony', 'resPunched', 'resHex', 'resWhite', 'midRibbon', 'resOchre', 'midTerra'],
  garden: ['gardenStone', 'gardenTimber', 'gardenWhite', 'resBalcony', 'resWhite', 'gardenSage', 'resOchre'],
};

/** Geometry/material library with height buckets so a few hundred variants cover the whole city. */
class Library {
  constructor(M) { this.M = M; this.geos = new Map(); this.inst = new Map(); this.tris = 0; this.tops = []; }
  variant(name, H, seedIdx) {
    const f = H > 250 ? 1.2 : 1.32;
    const b = Math.round(Math.log(H) / Math.log(f));
    const Hb = Math.pow(f, b);
    const key = `${name}|${f}|${b}|${seedIdx}`;
    let v = this.geos.get(key);
    if (!v) {
      const rng = new RNG(1000 + seedIdx * 7919 + b * 131 + name.length * 17);
      const fn = A[name];
      const r = fn(rng, Hb);
      v = { geo: r.shape.toGeometry(), w: r.w, d: r.d, h: Hb, key, tris: r.shape.triCount };
      this.geos.set(key, v);
    }
    return v;
  }
  add(v, styleName, m4) {
    // remember the tops of the tallest towers (for aircraft-warning beacons)
    const sy = m4.elements[5] !== undefined ? Math.hypot(m4.elements[4], m4.elements[5], m4.elements[6]) : 1;
    const top = v.h * sy;
    if (top > 480 && m4.elements[5] > 0) this.tops.push([m4.elements[12], m4.elements[13] + top * 1.04, m4.elements[14]]);
    let e = this.inst.get(v.key);
    if (!e) { e = { geo: v.geo, list: [], styles: [] }; this.inst.set(v.key, e); }
    e.list.push(m4.clone());
    e.styles.push(this.M.style[styleName]);
    this.tris += v.tris;
  }
  build(parent) {
    let n = 0;
    for (const e of this.inst.values()) {
      e.geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(e.styles), 1));
      const mesh = new THREE.InstancedMesh(e.geo, this.M.buildings, e.list.length);
      e.list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      n += e.list.length;
    }
    return n;
  }
}

const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
function instMatrix(x, y, z, rot, s, sy) {
  _q.setFromAxisAngle(_Y, rot);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(s, sy, s));
}

function pickMat(rng, arch, palette) {
  const ok = ARCH_MATS[arch].filter((m) => palette.includes(m));
  return rng.pick(ok.length ? ok : ARCH_MATS[arch]);
}

/** Is the rotated footprint fully inside one district / plateau level? */
function footprintOK(x, z, w, d, rot, test) {
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0]]) {
    const px = x + (a * w) * c - (b * d) * s, pz = z + (a * w) * s + (b * d) * c;
    if (!test(px, pz)) return false;
  }
  return true;
}

export function buildDistricts(M, ctx, blocks) {
  const root = new THREE.Group();
  root.name = 'districts';
  const lib = new Library(M);
  const rng = new RNG(4242);
  const trees = [];
  const stats = { blocks: 0, parks: 0, plazas: 0, buildings: 0 };
  const setBlock = (i, j, type) => {
    const ii = i + blocks.i0, jj = j + blocks.j0;
    if (ii < 0 || jj < 0 || ii >= blocks.NI || jj >= blocks.NJ) return;
    blocks.data[(ii + jj * blocks.NI) * 4] = type;
  };

  // ---------------------------------------------------------------- Cartesian blocks
  const spireDist = (x, z) => Math.hypot(x - SPIRE.x, (z - SPIRE.z) * 0.8);
  for (let i = -24; i < 24; i++) {
    for (let j = -49; j < 49; j++) {
      const B = blockRect(i, j);
      const dc = districtAt(B.cx, B.cz);
      if (dc === D.VOID || dc === D.DOME || dc === D.CANAL || dc === D.SPIRE) {
        // the deck beside landmarks reads as plazas and gardens
        if (dc === D.SPIRE || dc === D.DOME) setBlock(i, j, 1);
        continue;
      }
      if (dc === D.INDUSTRY) { setBlock(i, j, 3); continue; }
      if (dc === D.CONSTRUCTION) { setBlock(i, j, 4); continue; }
      // every corner must be on open deck of the same kind
      const corners = [[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]];
      let ok = true;
      for (const [x, z] of corners) {
        const d2 = districtAt(x, z);
        if (d2 === D.VOID || d2 === D.DOME || d2 === D.CANAL || d2 === D.SPIRE) { ok = false; break; }
      }
      if (!ok) { setBlock(i, j, 1); stats.parks++; continue; }
      stats.blocks++;
      const r = rng.next();
      const pPark = dc === D.GARDEN ? 0.3 : (dc === D.RIM ? 0.22 : (dc === D.CANALSIDE ? 0.1 : 0.07));
      if (r < pPark) { setBlock(i, j, 1); stats.parks++; parkTrees(B, rng, trees); continue; }
      if (r < pPark + 0.05) { setBlock(i, j, 2); stats.plazas++; plazaFeature(B, lib, rng, dc); continue; }
      setBlock(i, j, 0);
      fillBlock(B, dc, lib, rng, spireDist, stats);
    }
  }

  // ---------------------------------------------------------------- radial spire terraces
  for (let k = 0; k < 4; k++) {
    const P = PLATEAUS[k];
    const levelOK = (x, z) => plateauLevel(x, z) === k;
    for (let rk = 0; rk < 18; rk++) {
      const rMid = (rk + 0.5) * POLAR.ring;
      const n = polarSpokes(rMid);
      for (let m = 0; m < n; m++) {
        const th0 = (m / n) * TAU, th1 = ((m + 1) / n) * TAU;
        const thM = (th0 + th1) / 2;
        const cx = SPIRE.x + Math.sin(thM) * rMid, cz = SPIRE.z + (Math.cos(thM) * rMid) / 0.955;
        if (plateauLevel(cx, cz) !== k) continue;
        // cell: radial depth (minus ring streets) × arc (minus avenues)
        const depth = POLAR.ring - POLAR.ringStreet - 24;
        const arc = (th1 - th0) * rMid - POLAR.avenue - 24;
        const nAlong = k >= 3 ? 1 : (k === 2 ? rng.int(1, 2) : rng.int(2, 3));
        for (let a = 0; a < nAlong; a++) {
          const th = th0 + (th1 - th0) * ((a + 0.5) / nAlong) + rng.range(-0.01, 0.01);
          const r = rMid + rng.range(-20, 20);
          const x = SPIRE.x + Math.sin(th) * r, z = SPIRE.z + (Math.cos(th) * r) / 0.955;
          const slotW = arc / nAlong, slotD = depth;
          // height climbs toward the spire
          const lvl = k + (1 - clamp((spireDist(x, z) - 1100) / 3300, 0, 1));
          let arch, H, palette;
          if (k >= 2) {
            arch = rng.weighted([['blade', 2], ['twin', 1.4], ['ziggurat', 1.2], ['twisted', 2], ['needle', 1.6], ['crowned', 1.6], ['trifoil', 1.4], ['gate', 0.5], ['crystal', 1.2]]);
            H = (k === 3 ? rng.range(760, 1380) : rng.range(460, 900)) * (0.9 + 0.1 * lvl / 4);
            palette = PALETTE.spireHi;
          } else if (k === 1) {
            arch = rng.weighted([['blade', 1], ['twisted', 1], ['needle', 1], ['crowned', 1], ['crystal', 0.8], ['stack', 1], ['podiumTower', 1.6], ['cylinders', 1], ['ziggurat', 0.8]]);
            H = rng.range(260, 560);
            palette = PALETTE.spireLo;
          } else {
            arch = rng.weighted([['podiumTower', 2], ['slab', 1], ['stack', 1], ['cylinders', 1], ['roundedBlock', 1], ['hexTower', 1], ['crowned', 0.4], ['twisted', 0.4]]);
            H = rng.range(130, 340);
            palette = PALETTE.spireLo;
          }
          const v = lib.variant(arch, H, rng.int(0, 2));
          const rot = -th + (rng.chance(0.5) ? 0 : Math.PI / 2) * (v.w > v.d * 1.6 ? 0 : 1);
          let s = Math.min(1.08, slotW / v.w, slotD / v.d);
          if (s < 0.55) continue;
          s = Math.min(s, rng.range(0.85, 1.08));
          if (!footprintOK(x, z, v.w * s, v.d * s, rot, levelOK)) continue;
          if (transitDist(x, z) < Math.hypot(v.w, v.d) * s * 0.5 + 40) continue;
          const sy = (H / v.h);
          lib.add(v, pickMat(rng, arch, palette), instMatrix(x, P.h, z, rot, s, sy));
          stats.buildings++;
        }
      }
    }
  }

  const n = lib.build(root);
  blocks.tex.needsUpdate = true;
  if (trees.length) buildTrees(root, trees, M);
  console.log(`[city] districts: ${JSON.stringify(stats)} instances=${n} variants=${lib.geos.size} meshes=${lib.inst.size} tris≈${(lib.tris / 1e6).toFixed(2)}M trees=${trees.length}`);
  ctx.lib = lib;
  return root;
}

// ------------------------------------------------------------------ Cartesian block filling
function districtProfile(dc, x, z, spireDist, rng) {
  // returns { palette, pick() -> arch, H }
  const dS = spireDist(x, z);
  if (dc === D.CENTRAL) {
    const near = 1 - clamp((dS - 4200) / 6000, 0, 1);
    const H = 60 + (90 + 330 * near * near) * Math.pow(rng.next(), 0.9);
    const arch = H > 200
      ? rng.weighted([['podiumTower', 2], ['twisted', 0.6], ['blade', 0.4], ['cylinders', 1], ['stack', 0.8], ['crowned', 0.5], ['hexTower', 0.7]])
      : rng.weighted([['podiumTower', 1.4], ['slab', 1.2], ['roundedBlock', 1], ['lblock', 1], ['courtyard', 1], ['hexTower', 0.8], ['terraced', 0.6]]);
    return { palette: PALETTE.central, arch, H };
  }
  if (dc === D.CANALSIDE) {
    const nearCanal = 1 - clamp((Math.abs(x) - 340) / 1600, 0, 1);
    const H = 30 + (40 + 150 * nearCanal) * Math.pow(rng.next(), 0.8);
    const arch = H > 90
      ? rng.weighted([['hexTower', 1], ['terraced', 1.2], ['podiumTower', 0.8], ['stack', 0.6], ['cylinders', 0.5], ['ziggurat', 0.3]])
      : rng.weighted([['courtyard', 1.6], ['terraced', 1], ['lblock', 1], ['slab', 0.6], ['roundedBlock', 0.7]]);
    return { palette: PALETTE.canal, arch, H };
  }
  if (dc === D.GARDEN) {
    const H = 10 + 34 * Math.pow(rng.next(), 1.6) + (rng.chance(0.06) ? rng.range(40, 90) : 0);
    const arch = H > 50
      ? rng.weighted([['hexTower', 1], ['terraced', 1], ['roundedBlock', 1]])
      : rng.weighted([['villaRow', 1.6], ['courtyardLow', 1.6], ['pavilion', 0.4], ['terraced', 0.6]]);
    return { palette: PALETTE.garden, arch, H };
  }
  // rim: terraced low blocks along the deck edge
  const H = 16 + 50 * Math.pow(rng.next(), 1.3);
  const arch = rng.weighted([['terraced', 1.4], ['courtyardLow', 1], ['villaRow', 0.8], ['slab', 0.5]]);
  return { palette: PALETTE.garden, arch, H };
}

function fillBlock(B, dc, lib, rng, spireDist, stats) {
  const maxP = dc === D.GARDEN || dc === D.RIM ? 95 : (dc === D.CANALSIDE ? 115 : 125);
  const parcels = [];
  const split = (x0, z0, x1, z1, depth) => {
    const w = x1 - x0, d = z1 - z0;
    if ((w <= maxP && d <= maxP) || depth > 4) { parcels.push([x0, z0, x1, z1]); return; }
    const t = rng.range(0.4, 0.6);
    if (w > d) { const xm = x0 + w * t; split(x0, z0, xm, z1, depth + 1); split(xm, z0, x1, z1, depth + 1); }
    else { const zm = z0 + d * t; split(x0, z0, x1, zm, depth + 1); split(x0, zm, x1, z1, depth + 1); }
  };
  split(B.x0, B.z0, B.x1, B.z1, 0);
  for (const [x0, z0, x1, z1] of parcels) {
    const m = 7;
    const pw = x1 - x0 - 2 * m, pd = z1 - z0 - 2 * m;
    if (pw < 20 || pd < 20) continue;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (transitDist(cx, cz) < Math.hypot(pw, pd) * 0.5 + 34) continue;
    const prof = districtProfile(dc, cx, cz, spireDist, rng);
    const v = lib.variant(prof.arch, prof.H, rng.int(0, 1));
    // choose the orientation that fits best
    const r0 = Math.min(pw / v.w, pd / v.d), r1 = Math.min(pw / v.d, pd / v.w);
    let rot = (r1 > r0 ? Math.PI / 2 : 0) + (rng.chance(0.5) ? Math.PI : 0);
    let s = Math.max(r0, r1);
    if (s < 0.5) continue;
    s = Math.min(s, rng.range(0.9, 1.12));
    const sy = prof.H / v.h;
    lib.add(v, pickMat(rng, prof.arch, prof.palette), instMatrix(cx, 0, cz, rot, s, sy));
    stats.buildings++;
  }
}

function plazaFeature(B, lib, rng, dc) {
  // a pavilion or a slender monument at the plaza's heart
  if (dc === D.GARDEN || rng.chance(0.5)) {
    const v = lib.variant('pavilion', 12, rng.int(0, 2));
    lib.add(v, pickMat(rng, 'pavilion', PALETTE.garden), instMatrix(B.cx + 40, 0, B.cz + 50, rng.range(0, TAU), 1, 1));
  }
}

function parkTrees(B, rng, trees) {
  const step = 17;
  for (let x = B.x0 + 8; x < B.x1 - 8; x += step) {
    for (let z = B.z0 + 8; z < B.z1 - 8; z += step) {
      if (rng.chance(0.38)) continue;
      trees.push([x + rng.range(-6, 6), 0, z + rng.range(-6, 6), rng.range(0.7, 1.35), rng.next()]);
    }
  }
}

export function buildTrees(parent, trees, M, name = 'trees') {
  // crown: a lumpy low-poly blob; trunk: a short hexagonal column
  const crown = new THREE.IcosahedronGeometry(1, 0);
  const pos = crown.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 5.1 + z * 3.3) * Math.cos(y * 4.7);
    pos.setXYZ(i, x * 6.5 * k, 9 + y * 5.5 * k, z * 6.5 * k);
  }
  crown.computeVertexNormals();
  const trunk = new THREE.CylinderGeometry(0.5, 0.8, 6, 5, 1, true).translate(0, 3, 0);
  const merged = mergeTree(crown, trunk);
  const mat = M.foliage;
  const mesh = new THREE.InstancedMesh(merged, mat, trees.length);
  const col = new THREE.Color();
  trees.forEach(([x, y, z, s, h], i) => {
    mesh.setMatrixAt(i, instMatrix(x, y, z, h * TAU, s, s * (0.85 + 0.3 * h)));
    col.setHSL(0.22 + 0.1 * h, 0.45 + 0.2 * h, 0.16 + 0.1 * h);
    mesh.setColorAt(i, col);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  return mesh;
}

function mergeTree(crown, trunk) {
  const g = new THREE.BufferGeometry();
  const a = crown.toNonIndexed(), b = trunk.toNonIndexed();
  const P = [...a.attributes.position.array, ...b.attributes.position.array];
  const N = [...a.attributes.normal.array, ...b.attributes.normal.array];
  // vertex colour: trunk dark, crown white (multiplied by the instance colour)
  const C = [];
  for (let i = 0; i < a.attributes.position.count; i++) C.push(1, 1, 1);
  for (let i = 0; i < b.attributes.position.count; i++) C.push(0.35, 0.22, 0.25);
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

export { instMatrix, Library, PALETTE, pickMat, footprintOK };
void sm; void halfWidth; void GRID; void CANAL; void DOMES; void DOME_RING; void CONSTRUCTION;
