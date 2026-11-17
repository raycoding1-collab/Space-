// The Grand Canal: nine kilometres of water down the aft centreline. Canal houses line its walls,
// tree-lined quays run beside the water, bridges of three designs cross it, lantern boats drift along
// it, and a ribbed, pointed glass vault covers the whole length. At its head the Cascade spills from
// the spire terraces in six falls.
import * as THREE from 'three';
import { CANAL, PLATEAUS } from './layout.js';
import { Shape, ShapeBatch, Z, rect } from './geo.js';
import { beamMatrix } from '../lib/geo.js';
import { RNG, TAU } from '../lib/rng.js';
import { cityPatch, CITY_U } from './shaders.js';
import { glassShellMat, GLASS_VERT, FALL_FRAG } from './domes.js';
import { buildTrees, instMatrix } from './districts.js';
import { LightSet, NAV } from '../ship/lights.js';

const QY = -16; // quay level
const XW = CANAL.halfW + CANAL.walk; // 330: canal wall line
const SPRING = XW + 30; // vault springing line

export function vaultPoint(t, side) {
  // pointed arch: each half is an arc centred 90 m across the axis, rising from the springing line
  const Cx = -side * 90, R = SPRING + 90, ys = 22;
  const angS = Math.atan2(0, side * SPRING - Cx);
  const yTop = ys + Math.sqrt(R * R - Cx * Cx);
  const angT = Math.atan2(yTop - ys, -Cx);
  const a = angS + (angT - angS) * t;
  return [Cx + Math.cos(a) * R, ys + Math.sin(a) * R];
}

export function buildCanal(M, ctx, envTex) {
  const root = new THREE.Group();
  root.name = 'grand-canal';
  const B = new ShapeBatch();
  const rng = new RNG(9090);
  const lights = new LightSet();
  const z0 = CANAL.z0, zHead = PLATEAUS[0].cz - PLATEAUS[0].b + 4; // foot of the terraces
  const z1 = zHead;
  const len = z1 - z0;

  // ---------------------------------------------------------------- channel
  for (const side of [-1, 1]) {
    const sh = new Shape();
    // canal-house wall from the deck down to the quay
    sh.loft([[[side * XW, QY, z0], [side * XW, QY, z1]], [[side * XW, 0, z0], [side * XW, 0, z1]]], Z.FACADE, { closed: false, orient: [-side, 0, 0] });
    B.get(M.canalHouses).add(sh);
    const q = new Shape();
    // quay promenade, quay wall, and the water's edge
    q.loft([[[side * XW, QY, z0], [side * XW, QY, z1]], [[side * CANAL.halfW, QY, z0], [side * CANAL.halfW, QY, z1]]], Z.STONE, { closed: false, orient: [0, 1, 0] });
    q.loft([[[side * (XW - 30), QY + 0.3, z0], [side * (XW - 30), QY + 0.3, z1]], [[side * (XW - 62), QY + 0.3, z0], [side * (XW - 62), QY + 0.3, z1]]], Z.GARDEN, { closed: false, orient: [0, 1, 0] });
    q.loft([[[side * CANAL.halfW, CANAL.y - 30, z0], [side * CANAL.halfW, CANAL.y - 30, z1]], [[side * CANAL.halfW, QY, z0], [side * CANAL.halfW, QY, z1]]], Z.STONE, { closed: false, orient: [-side, 0, 0] });
    // lit kerb along the water
    q.loft([[[side * (CANAL.halfW + 0.5), QY - 3, z0], [side * (CANAL.halfW + 0.5), QY - 3, z1]], [[side * (CANAL.halfW + 0.5), QY - 2, z0], [side * (CANAL.halfW + 0.5), QY - 2, z1]]], Z.TRIM, { closed: false, orient: [-side, 0, 0] });
    B.get(M.stone).add(q);
    // trees and lanterns along the quay
    const trees = [];
    for (let z = z0 + 20; z < z1 - 20; z += 26) trees.push([side * (XW - 46), QY, z + rng.range(-4, 4), rng.range(0.7, 1.0), rng.next()]);
    buildTrees(root, trees, M, 'quay-trees', { fine: true });
    for (let z = z0 + 13; z < z1; z += 52) lights.add(new THREE.Vector3(side * (CANAL.halfW + 4), QY + 6, z), NAV.warm, { intensity: 3, size: 2.2 });
  }
  // canal floor and ends
  B.get(M.stone).loft([[[-CANAL.halfW, CANAL.y - 30, z0], [-CANAL.halfW, CANAL.y - 30, z1]], [[CANAL.halfW, CANAL.y - 30, z0], [CANAL.halfW, CANAL.y - 30, z1]]], Z.STONE, { closed: false, orient: [0, 1, 0] });
  {
    const end = new Shape();
    end.prism(rect(2 * XW, 30, 0, z0 - 15), CANAL.y - 32, 0, Z.FACADE, Z.STONE);
    B.get(M.canalHouses).add(end);
  }
  // water
  const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0 });
  cityPatch(wm, 'water', { uWaterDeep: { value: new THREE.Vector3(0.015, 0.045, 0.06) }, uWaterShallow: { value: new THREE.Vector3(0.04, 0.1, 0.1) } }, { key: 'canal' });
  const wg = new THREE.PlaneGeometry(2 * CANAL.halfW, len, 1, 1).rotateX(-Math.PI / 2).translate(0, CANAL.y, (z0 + z1) / 2);
  const water = new THREE.Mesh(wg, wm);
  water.receiveShadow = true;
  water.name = 'canal-water';
  root.add(water);

  // ---------------------------------------------------------------- the Cascade at the canal head
  {
    const steps = 6, top = PLATEAUS[0].h, bot = CANAL.y;
    const run = 46, w = 380;
    const fallMat = new THREE.ShaderMaterial({
      uniforms: { uCityTime: CITY_U.uCityTime, uSunDirC: CITY_U.uSunDirC, uHazeC: CITY_U.uHazeC, uHazeR: CITY_U.uHazeR, uHazeK: CITY_U.uHazeK, uHazeFloor: CITY_U.uHazeFloor, uHazeCol: CITY_U.uHazeCol },
      vertexShader: GLASS_VERT.replace('varying vec3 vW;', 'attribute vec2 uv2;\nvarying vec2 vUv2;\nvarying vec3 vW;').replace('vL = position;', 'vL = position; vUv2 = uv2;'),
      fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const P = [], UV = [], I = [];
    const pools = [];
    for (let k = 0; k <= steps; k++) {
      const y = top - (top - bot) * (k / steps);
      const zA = zHead - k * run, zB = zA - run;
      const wk = w * (1 + 0.08 * k);
      if (k < steps) {
        // stone step with a pool of water on top
        B.get(M.stone).prism(rect(wk + 40, run + 2, 0, (zA + zB) / 2), bot - 30, y - 1.5, Z.STONE, Z.STONE);
        pools.push([wk, run, (zA + zB) / 2, y - 1]);
        // the fall over its lip
        const yN = top - (top - bot) * ((k + 1) / steps);
        const n = P.length / 3;
        P.push(-wk / 2, y, zB, wk / 2, y, zB, -wk / 2, yN, zB - 3, wk / 2, yN, zB - 3);
        UV.push(0, 0, 1, 0, 0, 1, 1, 1);
        I.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
        for (let j = 0; j < 9; j++) lights.add(new THREE.Vector3((j / 8 - 0.5) * wk, y + 2, zB + 2), NAV.white, { intensity: 1.6, size: 2 });
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    fg.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(P.length).map((_, i) => (i % 3 === 2 ? -1 : 0)), 3));
    fg.setAttribute('uv2', new THREE.Float32BufferAttribute(UV, 2));
    fg.setIndex(I);
    const falls = new THREE.Mesh(fg, fallMat);
    falls.renderOrder = 4;
    root.add(falls);
    for (const [wk, run2, zc, y] of pools) {
      const pg = new THREE.PlaneGeometry(wk, run2 - 4).rotateX(-Math.PI / 2).translate(0, y, zc);
      const pm = new THREE.Mesh(pg, wm);
      root.add(pm);
    }
    // flanking stairs of stone with gilded obelisks
    for (const side of [-1, 1]) {
      for (let k = 0; k < steps; k++) {
        const y = top - (top - bot) * (k / steps);
        const zc = zHead - k * run - run / 2;
        B.get(M.stone).prism(rect(60, run + 2, side * (w * 0.62 + 40), zc), bot - 30, y + 2, Z.STONE, Z.GARDEN);
      }
      const ob = new Shape();
      ob.prism(rect(14, 14), 0, 120, Z.STONE, null);
      ob.cone(0, 0, 9, 0.3, 120, 170, Z.METAL, 4);
      B.get(M.metal).add(ob, new THREE.Matrix4().makeTranslation(side * (w * 0.62 + 40), top + 2, zHead - 20));
    }
    ctx.cascade = new THREE.Vector3(0, top, zHead);
  }
  const zWater = zHead - 6 * 46 - 46; // where the open canal begins below the Cascade

  // ---------------------------------------------------------------- bridges
  const bridgeZ = [];
  for (let z = zWater - 700; z > z0 + 300; z -= 820 + rng.range(-120, 120)) bridgeZ.push(z);
  bridgeZ.forEach((z, k) => {
    const type = k % 3;
    const b = new Shape();
    const span = 2 * XW + 40, dw = type === 1 ? 46 : 32;
    // deck
    b.prism(rect(span, dw, 0, z), -6, 0, Z.CLAD, Z.STONE);
    b.prism(rect(span, 1.2, 0, z - dw / 2 + 1), 0, 1.6, Z.METAL, Z.METAL);
    b.prism(rect(span, 1.2, 0, z + dw / 2 - 1), 0, 1.6, Z.METAL, Z.METAL);
    if (type === 0) {
      // stone arch springing from the quay walls
      const N = 24, rings = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, x = -CANAL.halfW + 2 * CANAL.halfW * t;
        const y = CANAL.y + (-10 - CANAL.y + 4) * Math.sin(Math.PI * t) + 4;
        rings.push([[x, y - 8, z - dw / 2 + 2], [x, y - 8, z + dw / 2 - 2], [x, y, z + dw / 2 - 2], [x, y, z - dw / 2 + 2]]);
      }
      b.loft(rings, Z.STONE, { closed: true, crease: 30 });
      for (let i = 1; i < 12; i++) {
        const x = -CANAL.halfW + (2 * CANAL.halfW * i) / 12;
        const t = i / 12, y = CANAL.y + (-10 - CANAL.y + 4) * Math.sin(Math.PI * t) + 4;
        b.prism(rect(3, dw - 6, x, z), y, -6, Z.STONE, null);
      }
    } else if (type === 1) {
      // inhabited bridge: a row of small houses with a lit arcade
      let x = -XW + 10;
      while (x < XW - 30) {
        const w2 = rng.range(16, 30), h = rng.range(10, 24);
        b.prism(rect(w2 - 1, dw - 12, x + w2 / 2, z), 0, h, Z.FACADE, Z.GARDEN);
        x += w2;
      }
      b.prism(rect(span - 40, 2, 0, z - dw / 2 + 5), 0, 4, Z.TRIM, null);
      for (const xx of [-CANAL.halfW * 0.5, 0, CANAL.halfW * 0.5]) b.prism(rect(10, dw - 6, xx, z), CANAL.y - 30, -6, Z.STONE, null);
    } else {
      // cable-stayed: two gilded pylons on the quays
      for (const s of [-1, 1]) {
        const px = s * (CANAL.halfW + 40);
        b.prism(rect(10, 8, px, z), QY, 110, Z.METAL, Z.TRIM);
        for (let i = 1; i <= 6; i++) {
          const xd = px - s * i * 26;
          b.beam([px, 104 - i * 6, z], [xd, 0, z - dw / 2 + 1], 0.8, 0.8, Z.METAL);
          b.beam([px, 104 - i * 6, z], [xd, 0, z + dw / 2 - 1], 0.8, 0.8, Z.METAL);
        }
      }
    }
    B.get(type === 1 ? M.canalHouses : M.stone).add(b);
    for (let i = -6; i <= 6; i++) lights.add(new THREE.Vector3(i * 50, 4, z + dw / 2), NAV.warm, { intensity: 3, size: 2 });
  });
  ctx.bridges = bridgeZ;

  // ---------------------------------------------------------------- the vault
  {
    const zs = [], NV = 20;
    const vz0 = z0 + 40, vz1 = zWater - 60;
    // glass shell
    const P = [], I = [];
    const NZ = 60;
    for (let i = 0; i <= NZ; i++) {
      const z = vz0 + (vz1 - vz0) * (i / NZ);
      for (let j = 0; j <= 2 * NV; j++) {
        const side = j <= NV ? -1 : 1, t = j <= NV ? j / NV : (2 * NV - j) / NV;
        const [x, y] = vaultPoint(t, side);
        P.push(x, y, z);
      }
    }
    const C = 2 * NV + 1;
    for (let i = 0; i < NZ; i++) for (let j = 0; j < C - 1; j++) {
      const a = i * C + j, b2 = a + 1, c = a + C, d = c + 1;
      I.push(a, c, b2, b2, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    const shell = new THREE.Mesh(g, glassShellMat(envTex, { mull: 0 }));
    shell.renderOrder = 3;
    root.add(shell);
    // ribs and purlins
    const box = new THREE.BoxGeometry(1, 1, 1);
    const segs = [];
    for (let z = vz0; z <= vz1; z += 120) {
      zs.push(z);
      for (const side of [-1, 1]) {
        for (let j = 0; j < NV; j++) {
          const [x0, y0] = vaultPoint(j / NV, side), [x1, y1] = vaultPoint((j + 1) / NV, side);
          segs.push([new THREE.Vector3(x0, y0, z), new THREE.Vector3(x1, y1, z), 7, 12]);
        }
      }
    }
    for (const side of [-1, 1]) {
      for (const t of [0.0, 0.25, 0.5, 0.75, 1.0]) {
        if (side === 1 && t === 1.0) continue;
        const [x, y] = vaultPoint(t, side);
        for (let k = 0; k < zs.length - 1; k++) segs.push([new THREE.Vector3(x, y, zs[k]), new THREE.Vector3(x, y, zs[k + 1]), 4, 4]);
      }
    }
    const m4 = new THREE.Matrix4();
    const mesh = new THREE.InstancedMesh(box, M.frameBronze, segs.length);
    segs.forEach(([a, b2, w, h], i) => {
      const mid = a.clone().add(b2).multiplyScalar(0.5);
      const n = new THREE.Vector3(mid.x, mid.y + 100, 0).normalize();
      beamMatrix(a, b2, w, h, n, m4, w * 0.5);
      mesh.setMatrixAt(i, m4);
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
    // springing plinths along both sides
    for (const side of [-1, 1]) {
      B.get(M.stone).prism([[side * (SPRING - 22), vz0], [side * (SPRING + 22), vz0], [side * (SPRING + 22), vz1], [side * (SPRING - 22), vz1]], -2, 24, Z.CLAD, Z.METAL);
      for (const z of zs) lights.add(new THREE.Vector3(side * SPRING, 30, z), NAV.warm, { intensity: 4, size: 3.5 });
    }
    const [, yTop] = vaultPoint(1, 1);
    for (let k = 0; k < zs.length; k += 2) lights.add(new THREE.Vector3(0, yTop + 8, zs[k]), NAV.white, { intensity: 6, size: 4, period: 3, phase: k * 0.03, duty: 0.1 });
    ctx.vault = { z0: vz0, z1: vz1, top: yTop };
  }

  // ---------------------------------------------------------------- lantern boats
  {
    const hull = new Shape();
    const L = 26, Wb = 7;
    const sec = (z, w, d) => [[-w / 2, 0, z], [w / 2, 0, z], [w * 0.4, -d, z], [-w * 0.4, -d, z]];
    hull.loft([sec(-L / 2, 0.5, 0.5), sec(-L / 2 + 3, Wb, 2.2), sec(L / 2 - 5, Wb, 2.2), sec(L / 2, 0.4, 0.4)], Z.METAL, { closed: true, crease: 40 });
    hull.cap([[-Wb / 2, -L / 2 + 3], [Wb / 2, -L / 2 + 3], [Wb / 2, L / 2 - 5], [-Wb / 2, L / 2 - 5]], 0, Z.STONE);
    hull.prism(rect(Wb - 2, 10, 0, -2), 0, 3.4, Z.GLASS, Z.METAL);
    hull.cone(0, -2, 4.5, 0.2, 3.4, 6, Z.METAL, 8);
    const boatG = hull.toGeometry();
    const N = 46;
    const boats = new THREE.InstancedMesh(boatG, M.metal, N);
    boats.castShadow = true;
    const bl = new LightSet();
    const defs = [];
    for (let i = 0; i < N; i++) {
      const lane = rng.pick([-150, -80, 80, 150]);
      defs.push({ x: lane + rng.range(-10, 10), ph: rng.next(), sp: (lane > 0 ? 1 : -1) * rng.range(3, 7) });
      bl.add(new THREE.Vector3(), NAV.warm, { intensity: 5, size: 3 });
      bl.add(new THREE.Vector3(), new THREE.Color(1.0, 0.6, 0.3), { intensity: 3, size: 2 });
    }
    boats.userData.dynamic = true;
    boats.frustumCulled = false;
    root.add(boats);
    const pts = bl.build(root, { name: 'boat-lights' });
    pts.frustumCulled = false;
    const attr = pts.geometry.attributes.position;
    const zA = z0 + 120, zB = zWater - 40, Lc = zB - zA;
    ctx.animated.push((t) => {
      defs.forEach((d, i) => {
        const u = (((d.ph * Lc + t * d.sp) % Lc) + Lc) % Lc;
        const z = zA + u;
        boats.setMatrixAt(i, instMatrix(d.x, CANAL.y + 0.6, z, d.sp > 0 ? 0 : Math.PI, 1, 1));
        attr.setXYZ(i * 2, d.x, CANAL.y + 9, z - 2);
        attr.setXYZ(i * 2 + 1, d.x, CANAL.y + 3, z + (d.sp > 0 ? 12 : -12));
      });
      boats.instanceMatrix.needsUpdate = true;
      attr.needsUpdate = true;
    });
  }

  B.build(root, { name: 'canal' });
  lights.build(root, { name: 'canal-lights' });
  void TAU;
  return root;
}
