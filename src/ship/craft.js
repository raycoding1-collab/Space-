// Small craft: shuttle geometry (for instanced traffic) and docked vessels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lathe, tiledBox, Batch } from '../lib/geo.js';
import { TAU, DEG } from '../lib/rng.js';

function clean(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.index) {
    const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx);
  }
  return g;
}

/** Shuttle hull (≈38 m), nose toward +Z, engines at -Z. */
export function shuttleGeometry(scale = 1) {
  const parts = [];
  const body = lathe([[0.5, -18], [3.6, -16], [4.4, -6], [4.0, 6], [2.6, 14], [0.4, 19]], { segments: 10, tile: 12 });
  body.scale(1, 0.72, 1);
  parts.push(body);
  const wing = tiledBox(26, 0.9, 10, 12); wing.translate(0, -0.6, -8); parts.push(wing);
  const fin = tiledBox(0.8, 6, 8, 12); fin.translate(0, 3.6, -12); parts.push(fin);
  for (const s of [-1, 1]) {
    const pod = lathe([[1.6, -17], [2.2, -15], [2.2, -4], [1.2, -1]], { segments: 8, tile: 12 });
    pod.translate(s * 7.5, -0.8, 0); parts.push(pod);
  }
  const g = mergeGeometries(parts.map(clean));
  g.scale(scale, scale, scale);
  return g;
}

/** Medium transport (~150 m) built into a Batch at a given matrix. Returns engine nozzle positions (local). */
export function addTransport(batch, M, matrix, variant = 0) {
  const parts = [];
  const add = (g, mat) => batch.add(g, mat, matrix);
  // command section
  add(lathe([[16, 40], [15, 56], [10, 70], [2, 78]], { segments: 16, tile: 24 }), M.armorLight);
  add(lathe([[16, 30], [16, 40]], { segments: 16, tile: 24 }), M.habDark);
  // spine
  add(lathe([[7, -50], [7, 30]], { segments: 10, tile: 24 }), M.armorDark);
  // cargo pods / tanks
  const podMat = variant % 2 ? M.armor : M.armorLight;
  for (let k = 0; k < 4; k++) {
    const phi = k * 90 * DEG + 45 * DEG;
    const pod = lathe([[2, -44], [9, -40], [9, 22], [2, 26]], { segments: 12, tile: 24 });
    pod.translate(Math.cos(phi) * 15, Math.sin(phi) * 15, 0);
    add(pod, podMat);
  }
  // engine block
  add(lathe([[12, -70], [18, -66], [18, -56], [14, -50]], { segments: 16, tile: 24 }), M.armorDark);
  const nozzles = [];
  for (let k = 0; k < 3; k++) {
    const phi = k * 120 * DEG;
    const x = Math.cos(phi) * 8, y = Math.sin(phi) * 8;
    const n = lathe([[6, -82], [4.5, -76], [3, -70]], { segments: 12, tile: 24 });
    n.translate(x, y, 0);
    add(n, M.chrome);
    nozzles.push(new THREE.Vector3(x, y, -82));
  }
  return nozzles;
}
