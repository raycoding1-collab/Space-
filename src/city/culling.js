// Per-instance culling for the city's instanced meshes. Each frame the camera moves, every static
// instance is tested against the view frustum (and against the frustum along its shadow, so shadows
// cast into view never pop) and against a minimum on-screen size. Survivors are packed to the front
// of the instance buffers and the mesh's draw count is cut to match, so the GPU only draws (and only
// shadow-renders) what can actually be seen.
import * as THREE from 'three';
import { WORLD } from '../world.js';

const _fr = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class InstanceCuller {
  constructor() {
    this.sets = [];
    this.last = { pos: new THREE.Vector3(1e9, 0, 0), quat: new THREE.Quaternion(), fov: 0, h: 0 };
    this.stats = { total: 0, drawn: 0, ms: 0 };
  }

  /** Register every static InstancedMesh under root (skipping subtrees that move). */
  registerTree(root, skip = []) {
    const walk = (o) => {
      if (skip.includes(o) || o.userData.dynamic) return;
      if (o.isInstancedMesh) this.register(o, { minPx: o.userData.minPx ?? 1.0 });
      for (const c of o.children) walk(c);
    };
    walk(root);
  }

  /** Register an InstancedMesh whose instances do not move. */
  register(mesh, { minPx = 1.0 } = {}) {
    const n = mesh.count;
    if (!n) return;
    const geo = mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const bs = geo.boundingSphere;
    const M = mesh.instanceMatrix.array.slice(0, n * 16);
    const C = new Float32Array(n * 3), R = new Float32Array(n);
    mesh.updateWorldMatrix(true, false);
    const W = mesh.matrixWorld, ws = W.getMaxScaleOnAxis();
    for (let i = 0; i < n; i++) {
      _m.fromArray(M, i * 16);
      _v.copy(bs.center).applyMatrix4(_m).applyMatrix4(W);
      C[i * 3] = _v.x; C[i * 3 + 1] = _v.y; C[i * 3 + 2] = _v.z;
      R[i] = bs.radius * _m.getMaxScaleOnAxis() * ws;
    }
    const attrs = [];
    for (const [name, a] of Object.entries(geo.attributes)) {
      if (a.isInstancedBufferAttribute) attrs.push({ a, full: a.array.slice(0, n * a.itemSize), size: a.itemSize });
    }
    if (mesh.instanceColor) attrs.push({ a: mesh.instanceColor, full: mesh.instanceColor.array.slice(0, n * 3), size: 3 });
    mesh.frustumCulled = false;
    // chunks of 64 consecutive instances (placement is spatially coherent) with bounding spheres,
    // so whole chunks can be rejected with a single test
    const CH = 64, nc = Math.ceil(n / CH), K = new Float32Array(nc * 5);
    for (let c = 0; c < nc; c++) {
      let x = 0, y = 0, z = 0, cnt = 0, rmax = 0, ytop = -1e9;
      for (let i = c * CH; i < Math.min(n, c * CH + CH); i++) { x += C[i * 3]; y += C[i * 3 + 1]; z += C[i * 3 + 2]; cnt++; }
      x /= cnt; y /= cnt; z /= cnt;
      for (let i = c * CH; i < Math.min(n, c * CH + CH); i++) {
        const d = Math.hypot(C[i * 3] - x, C[i * 3 + 1] - y, C[i * 3 + 2] - z) + R[i];
        rmax = Math.max(rmax, d); ytop = Math.max(ytop, C[i * 3 + 1] + R[i]);
      }
      K.set([x, y, z, rmax, ytop], c * 5);
    }
    this.sets.push({ mesh, n, M, C, R, attrs, minPx, K, CH });
    this.stats.total += n;
  }

  /** Re-cull if the camera changed (or when forced). */
  update(camera, viewH, force = false) {
    const L = this.last;
    if (!force && camera.position.distanceToSquared(L.pos) < 0.25 && camera.quaternion.angleTo(L.quat) < 1e-4 && camera.fov === L.fov && viewH === L.h) return;
    L.pos.copy(camera.position); L.quat.copy(camera.quaternion); L.fov = camera.fov; L.h = viewH;
    const t0 = performance.now();
    camera.updateMatrixWorld();
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    const P = _fr.planes;
    const n0x = P[0].normal.x, n0y = P[0].normal.y, n0z = P[0].normal.z, c0 = P[0].constant;
    const n1x = P[1].normal.x, n1y = P[1].normal.y, n1z = P[1].normal.z, c1 = P[1].constant;
    const n2x = P[2].normal.x, n2y = P[2].normal.y, n2z = P[2].normal.z, c2 = P[2].constant;
    const n3x = P[3].normal.x, n3y = P[3].normal.y, n3z = P[3].normal.z, c3 = P[3].constant;
    const n4x = P[4].normal.x, n4y = P[4].normal.y, n4z = P[4].normal.z, c4 = P[4].constant;
    const n5x = P[5].normal.x, n5y = P[5].normal.y, n5z = P[5].normal.z, c5 = P[5].constant;
    const inF = (x, y, z, r) => !(n0x * x + n0y * y + n0z * z + c0 < -r || n1x * x + n1y * y + n1z * z + c1 < -r ||
      n2x * x + n2y * y + n2z * z + c2 < -r || n3x * x + n3y * y + n3z * z + c3 < -r ||
      n4x * x + n4y * y + n4z * z + c4 < -r || n5x * x + n5y * y + n5z * z + c5 < -r);
    const px = viewH * 0.5 / Math.tan((camera.fov * Math.PI) / 360);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const sd = WORLD.sunDir, sy = Math.max(0.2, sd.y), sdx = sd.x, sdy = sd.y, sdz = sd.z;
    let drawn = 0;
    for (const S of this.sets) {
      const { mesh, n, M, C, R, attrs, minPx, K, CH } = S;
      const dst = mesh.instanceMatrix.array;
      const lim = px / minPx;
      let k = 0;
      const nc = K.length / 5;
      for (let c = 0; c < nc; c++) {
        const kx = K[c * 5], ky = K[c * 5 + 1], kz = K[c * 5 + 2], kr = K[c * 5 + 3], kt = K[c * 5 + 4];
        if (!inF(kx, ky, kz, kr)) {
          const len = kt > 0 ? kt / sy : 0;
          if (len === 0) continue;
          const hh = len * 0.5;
          if (!inF(kx - sdx * hh, ky - sdy * hh, kz - sdz * hh, kr + hh)) continue;
        }
      for (let i = c * CH, iEnd = Math.min(n, c * CH + CH); i < iEnd; i++) {
        const i3 = i * 3;
        const x = C[i3], y = C[i3 + 1], z = C[i3 + 2], r = R[i];
        const dx = x - cx, dy = y - cy, dz = z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        // on-screen size: r / d * px < minPx  ->  (r * lim)^2 < d^2 (when the camera is outside the sphere)
        const rl = r * lim;
        if (d2 > r * r && rl * rl < d2) continue;
        if (!inF(x, y, z, r)) {
          // its shadow may still fall into view: test a sphere around the shadow's length as well
          const len = y + r > 0 ? (y + r) / sy : 0;
          if (len === 0) continue;
          const h = len * 0.5;
          if (!inF(x - sdx * h, y - sdy * h, z - sdz * h, r + h)) continue;
        }
        const s16 = i * 16, d16 = k * 16;
        for (let j = 0; j < 16; j++) dst[d16 + j] = M[s16 + j];
        for (let q = 0; q < attrs.length; q++) {
          const A = attrs[q], sz = A.size, arr = A.a.array, full = A.full;
          for (let j = 0; j < sz; j++) arr[k * sz + j] = full[i * sz + j];
        }
        k++;
      }
      }
      mesh.count = k;
      mesh.visible = k > 0;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, Math.max(1, k) * 16);
      mesh.instanceMatrix.needsUpdate = true;
      for (const A of attrs) { A.a.clearUpdateRanges(); A.a.addUpdateRange(0, Math.max(1, k) * A.size); A.a.needsUpdate = true; }
      drawn += k;
    }
    this.stats.drawn = drawn;
    this.stats.ms = performance.now() - t0;
  }
}
