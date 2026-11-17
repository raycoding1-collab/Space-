// The biome domes on the forward centreline. Each one is its own world under glass, with its own frame:
//   Lake Dome    — a lake with wooded islands, cliffs and a waterfall, under a hex-geodesic frame
//   Forest Dome  — a dense forest climbing a central peak, under meridian ribs and latitude rings
//   Orchard Dome — concentric stepped crop terraces and orchards, under a diagrid lamella frame
import * as THREE from 'three';
import { DOMES, DOME_RING } from './layout.js';
import { Shape, ShapeBatch, Z, circle } from './geo.js';
import { beamMatrix } from '../lib/geo.js';
import { RNG, TAU, smoothstep as sm, clamp } from '../lib/rng.js';
import { cityPatch, CITY_U, HAZE_GLSL, COMMON_GLSL } from './shaders.js';
import { hazed } from './materials.js';
import { buildTrees, instMatrix } from './districts.js';
import { LightSet, NAV } from '../ship/lights.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG } from '../lib/glsl.js';

const HD = 0.6; // dome height as a fraction of its base radius

function capSphere(R) {
  const Hd = R * HD;
  const Rs = (R * R + Hd * Hd) / (2 * Hd);
  return { Hd, Rs, cy: Hd - Rs };
}

function terrainMat(style, d, water = -45) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  cityPatch(m, 'terrain', {
    uTerr: { value: new THREE.Vector4(water, 9, style === 2 ? 0.55 : 0.42, style) },
    uTerrC: { value: new THREE.Vector3(d.x, d.z, d.R) },
  }, { key: `t${style}` });
  return m;
}

/** Radial heightfield disc. */
function terrainDisc(d, hFn, rings = 90, segs = 180) {
  const pos = [], idx = [];
  pos.push(d.x, hFn(0, 0), d.z);
  for (let i = 1; i <= rings; i++) {
    const r = d.R * Math.pow(i / rings, 0.9);
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * TAU;
      pos.push(d.x + Math.sin(th) * r, hFn(r, th), d.z + Math.cos(th) * r);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segs));
  for (let i = 1; i < rings; i++) {
    const a = 1 + (i - 1) * segs, b = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a + j, b + j, b + j1, a + j, b + j1, a + j1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals face up
  const n = g.attributes.normal;
  let up = 0; for (let i = 0; i < n.count; i++) up += n.getY(i);
  if (up < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

// ------------------------------------------------------------------ dome frames
function hexGeodesic(R, Rs, cy, detail) {
  // dual of a subdivided icosahedron: hexagonal (and twelve pentagonal) cells
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const p = ico.attributes.position;
  const key = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const cent = [], edges = new Map();
  for (let f = 0; f < p.count / 3; f++) {
    const c = new THREE.Vector3();
    const ks = [];
    for (let k = 0; k < 3; k++) {
      const v = new THREE.Vector3(p.getX(f * 3 + k), p.getY(f * 3 + k), p.getZ(f * 3 + k));
      c.add(v); ks.push(key(v.x, v.y, v.z));
    }
    cent.push(c.normalize());
    for (let k = 0; k < 3; k++) {
      const a = ks[k], b = ks[(k + 1) % 3];
      const ek = a < b ? a + '|' + b : b + '|' + a;
      if (!edges.has(ek)) edges.set(ek, []);
      edges.get(ek).push(f);
    }
  }
  // tilt so a pentagon sits at the crown
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0.618).normalize(), new THREE.Vector3(0, 1, 0));
  const segs = [];
  for (const fs of edges.values()) {
    if (fs.length !== 2) continue;
    const a = cent[fs[0]].clone().applyQuaternion(q), b = cent[fs[1]].clone().applyQuaternion(q);
    const A = a.multiplyScalar(Rs).add(new THREE.Vector3(0, cy, 0)), B = b.multiplyScalar(Rs).add(new THREE.Vector3(0, cy, 0));
    if (A.y < 4 && B.y < 4) continue;
    if (A.y < 0) A.y = 0; if (B.y < 0) B.y = 0;
    segs.push([A, B]);
  }
  return segs;
}
function meridians(R, Rs, cy, nm = 48, nl = 9) {
  const segs = [];
  const thMax = Math.acos(clamp(-cy / Rs, -1, 1));
  const P = (th, ph) => new THREE.Vector3(Math.sin(th) * Math.sin(ph) * Rs, cy + Math.cos(th) * Rs, Math.sin(th) * Math.cos(ph) * Rs);
  const N = 28;
  for (let m = 0; m < nm; m++) {
    const ph = (m / nm) * TAU;
    const start = m % 2 === 0 ? 0.08 : 0.2; // alternate ribs stop short of the oculus
    for (let i = 0; i < N; i++) {
      const t0 = start + (1 - start) * (i / N), t1 = start + (1 - start) * ((i + 1) / N);
      segs.push([P(thMax * t0, ph), P(thMax * t1, ph)]);
    }
  }
  for (let l = 1; l <= nl; l++) {
    const th = thMax * (l / (nl + 0.6));
    const n = Math.max(24, Math.round(nm * 2 * Math.sin(th) / Math.sin(thMax)));
    for (let k = 0; k < n; k++) segs.push([P(th, (k / n) * TAU), P(th, ((k + 1) / n) * TAU)]);
  }
  // oculus ring
  for (let k = 0; k < 48; k++) segs.push([P(thMax * 0.08, (k / 48) * TAU), P(thMax * 0.08, ((k + 1) / 48) * TAU)]);
  return segs;
}
function diagrid(R, Rs, cy, n = 40) {
  const segs = [];
  const thMax = Math.acos(clamp(-cy / Rs, -1, 1));
  const P = (th, ph) => new THREE.Vector3(Math.sin(th) * Math.sin(ph) * Rs, cy + Math.cos(th) * Rs, Math.sin(th) * Math.cos(ph) * Rs);
  const N = 22;
  for (const dir of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const ph0 = (k / n) * TAU;
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N;
        const th0 = thMax * (1 - t0 * 0.92), th1 = thMax * (1 - t1 * 0.92);
        segs.push([P(th0, ph0 + dir * t0 * 1.6), P(th1, ph0 + dir * t1 * 1.6)]);
      }
    }
  }
  for (let k = 0; k < 64; k++) segs.push([P(thMax * 0.08, (k / 64) * TAU), P(thMax * 0.08, ((k + 1) / 64) * TAU)]);
  return segs;
}

// glass: thin reflective shell with faint secondary mullions, fresnel and a soft sky sheen
const GLASS_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vW; varying vec3 vN; varying vec3 vL;
void main() {
  vL = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}`;
const GLASS_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${COMMON_GLSL}
uniform float uCityTime;
uniform vec3 uTint;
uniform float uMull;
uniform samplerCube uEnv;
${HAZE_GLSL}
varying vec3 vW; varying vec3 vN; varying vec3 vL;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 env = textureLod(uEnv, R, 0.0).rgb;
  float sun = (pow(max(dot(R, uSunDirC), 0.0), 1400.0) * 16.0 + pow(max(dot(R, uSunDirC), 0.0), 60.0) * 0.12) * (gl_FrontFacing ? 1.0 : 0.04);
  // fine mullions (spherical coordinates of the shell)
  float ph = atan(vL.x, vL.z) * uMull, th = acos(clamp(normalize(vL - vec3(0.0, -2000.0, 0.0)).y, -1.0, 1.0)) * uMull * 0.8;
  float m = max(fln(ph, max(fwidth(ph), 1e-4), 0.04), fln(th, max(fwidth(th), 1e-4), 0.04)) * step(0.5, uMull);
  vec3 col = env * F * 1.6 + vec3(sun) * F + uTint * 0.02;
  col = mix(col, uTint * 0.25 + env * 0.05, m * 0.7);
  float a = clamp(F * 0.9 + 0.05 + m * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(applyHaze(col, vW), a);
  ${LOGDEPTH_FRAG}
}`;

const FALL_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${COMMON_GLSL}
uniform float uCityTime;
${HAZE_GLSL}
varying vec3 vW; varying vec3 vN; varying vec3 vL;
varying vec2 vUv2;
void main() {
  float x = vUv2.x, y = vUv2.y;
  float streak = vnoise(vec2(x * 60.0, y * 3.0 + uCityTime * 2.2)) * 0.6 + vnoise(vec2(x * 140.0, y * 8.0 + uCityTime * 3.4)) * 0.4;
  float edge = smoothstep(0.0, 0.12, x) * smoothstep(1.0, 0.88, x);
  float a = edge * (0.45 + 0.55 * streak) * (0.6 + 0.4 * smoothstep(0.0, 0.2, y));
  vec3 col = vec3(0.82, 0.9, 0.95) * (0.6 + 0.8 * streak);
  gl_FragColor = vec4(applyHaze(col, vW) * a, a);
  ${LOGDEPTH_FRAG}
}`;

/** Thin reflective glass shell (used by the domes and the canal vault). */
export function glassShellMat(envTex, { tint = new THREE.Color(0.55, 0.7, 0.8), mull = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uCityTime: CITY_U.uCityTime, uSunDirC: CITY_U.uSunDirC, uTint: { value: tint }, uMull: { value: mull }, uEnv: { value: envTex },
      uHazeC: CITY_U.uHazeC, uHazeR: CITY_U.uHazeR, uHazeK: CITY_U.uHazeK, uHazeFloor: CITY_U.uHazeFloor, uHazeCol: CITY_U.uHazeCol },
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
export { GLASS_VERT, FALL_FRAG };

export function buildDomes(M, ctx, envTex) {
  const root = new THREE.Group();
  root.name = 'domes';
  const B = new ShapeBatch();
  const rng = new RNG(808);
  const lights = new LightSet();
  const frameMats = { hex: M.frameWhite, meridian: M.frameBronze, diagrid: M.frameGold };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const m4 = new THREE.Matrix4();

  for (const d of DOMES) {
    const { Hd, Rs, cy } = capSphere(d.R);
    const g = new THREE.Group();
    g.name = d.id;

    // ---------------------------------------------------------------- plinth
    const ro = d.R + DOME_RING, rp = 64;
    const outer = circle(ro, 160, d.x, d.z), inner = circle(d.R + 8, 160, d.x, d.z);
    B.get(M.haloMat).walls(outer, -2, rp, Z.FACADE);
    B.get(M.metal).walls(circle(ro + 0.6, 160, d.x, d.z), rp - 6, rp - 4.5, Z.TRIM);
    B.get(M.stone).cap(outer, rp, Z.STONE, { holes: [inner] });
    B.get(M.stone).cap(circle(ro - 20, 160, d.x, d.z), rp + 0.2, Z.GARDEN, { holes: [circle(d.R + 40, 160, d.x, d.z)] });
    B.get(M.metal).loft([inner.map(([x, z]) => [x, rp, z]), inner.map(([x, z]) => [x, rp + 14, z])], Z.METAL, { closed: true, orient: (p) => [p[0] - d.x, 0, p[2] - d.z] });
    // four gates with lit portals
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      const cx = d.x + Math.sin(a) * (ro + 4), cz = d.z + Math.cos(a) * (ro + 4);
      const sh = new Shape();
      sh.prism([[-60, -10], [60, -10], [60, 14], [-60, 14]], 0, rp + 26, Z.STONE, Z.METAL);
      sh.prism([[-34, 14], [34, 14], [34, 15.5], [-34, 15.5]], 0, rp - 10, Z.TRIM, null);
      B.get(M.stone).add(sh, new THREE.Matrix4().makeRotationY(a).setPosition(cx, 0, cz));
    }

    // ---------------------------------------------------------------- frame
    const segs = d.frame === 'hex' ? hexGeodesic(d.R, Rs, cy, 15) : (d.frame === 'meridian' ? meridians(d.R, Rs, cy) : diagrid(d.R, Rs, cy));
    const fw = d.frame === 'hex' ? 7 : (d.frame === 'meridian' ? 10 : 6);
    const mesh = new THREE.InstancedMesh(box, frameMats[d.frame], segs.length);
    segs.forEach(([a, b], i) => {
      const n = a.clone().add(b).multiplyScalar(0.5).sub(new THREE.Vector3(0, cy, 0)).normalize();
      beamMatrix(a, b, fw, fw * 1.4, n, m4, fw * 0.6);
      mesh.setMatrixAt(i, m4);
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(d.x, rp + 10, d.z);
    g.add(mesh);
    // glass shell
    const thMax = Math.acos(clamp(-cy / Rs, -1, 1));
    const shellG = new THREE.SphereGeometry(Rs - 2, 160, 64, 0, TAU, 0, thMax);
    shellG.translate(0, cy, 0);
    const glass = new THREE.ShaderMaterial({
      uniforms: { uCityTime: CITY_U.uCityTime, uSunDirC: CITY_U.uSunDirC, uTint: { value: new THREE.Color(0.55, 0.7, 0.8) },
        uMull: { value: d.frame === 'hex' ? 90 : 70 }, uEnv: { value: envTex },
        uHazeC: CITY_U.uHazeC, uHazeR: CITY_U.uHazeR, uHazeK: CITY_U.uHazeK, uHazeFloor: CITY_U.uHazeFloor, uHazeCol: CITY_U.uHazeCol },
      vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(shellG, glass);
    shell.position.set(d.x, rp + 10, d.z);
    shell.renderOrder = 3;
    g.add(shell);
    // a lit crown ring and aircraft beacons
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      lights.add(new THREE.Vector3(d.x + Math.sin(a) * (ro + 2), rp + 2, d.z + Math.cos(a) * (ro + 2)), NAV.warm, { intensity: 4, size: 4 });
    }
    lights.add(new THREE.Vector3(d.x, rp + 10 + Hd + 6, d.z), NAV.red, { intensity: 14, size: 10, period: 2.0, phase: d.R * 0.001, duty: 0.12 });

    // ---------------------------------------------------------------- interior
    const R = d.R;
    if (d.id === 'lake') {
      const water = -40;
      const islands = [[-560, 260, 230, 95], [420, -520, 160, 70], [180, 420, 120, 48], [-250, -340, 90, 36]];
      const cliffDir = 0; // cliffs on the bow side
      const hFn = (r, th) => {
        const x = Math.sin(th) * r, z = Math.cos(th) * r;
        const n = Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.009) * 0.5 + Math.sin(x * 0.031 + z * 0.027) * 0.25;
        const side = Math.pow(Math.max(0, Math.cos(th - cliffDir)), 2);
        const rimH = 50 + 330 * side;
        const rim = sm(0.62 * R, 0.84 * R - side * 0.1 * R, r) * rimH * (1 - sm(0.86 * R, 0.99 * R, r) * 0.95);
        let h = -78 + sm(0.5 * R, 0.66 * R, r) * 60 + rim + n * 14;
        for (const [ix, iz, ir, ih] of islands) {
          const dd = Math.hypot(x - ix, z - iz) / ir;
          h += Math.max(0, 1 - dd * dd) * (ih + 70 * (1 - Math.min(1, dd))) * (dd < 1 ? 1 : 0);
        }
        return h;
      };
      const tg = terrainDisc(d, hFn, 110, 220);
      const tm = new THREE.Mesh(tg, terrainMat(0, d, rp + 10 + water));
      tm.position.y = rp + 10; tm.receiveShadow = true; tm.castShadow = true;
      g.add(tm);
      const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0 });
      cityPatch(wm, 'water', { uWaterDeep: { value: new THREE.Vector3(0.02, 0.06, 0.075) }, uWaterShallow: { value: new THREE.Vector3(0.05, 0.12, 0.11) } }, { key: 'lake' });
      const wg = new THREE.CircleGeometry(R * 0.86, 160).rotateX(-Math.PI / 2).translate(d.x, rp + 10 + water, d.z);
      const wmesh = new THREE.Mesh(wg, wm);
      wmesh.receiveShadow = true;
      g.add(wmesh);
      // trees on islands and the shore
      const trees = [];
      for (let k = 0; k < 9000; k++) {
        const r = Math.sqrt(rng.next()) * R * 0.95, th = rng.range(0, TAU);
        const h = hFn(r, th);
        if (h < water + 4) continue;
        const side = Math.pow(Math.max(0, Math.cos(th)), 2);
        if (side > 0.5 && r > 0.66 * R && r < 0.86 * R) continue; // bare cliff face
        trees.push([d.x + Math.sin(th) * r, rp + 10 + h - 1, d.z + Math.cos(th) * r, rng.range(0.8, 1.6), rng.next()]);
      }
      buildTrees(g, trees, M, 'lake-trees');
      // the waterfall: a cascade down the cliff face into the lake
      {
        let rTop = 0.6 * R, hTop = -1e9;
        for (let r = 0.6 * R; r < 0.9 * R; r += 4) { const h = hFn(r, 0); if (h > hTop) { hTop = h; rTop = r; } }
        let rBot = rTop;
        while (rBot > 0.3 * R && hFn(rBot, 0) > water) rBot -= 4;
        const N = 40, W = 110;
        const P = [], UV = [], I = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N, r = rTop + (rBot - rTop) * t;
          const y = rp + 10 + Math.max(hFn(r, 0), water) + 4;
          const w = W * (1 + 0.6 * t);
          P.push(d.x - w / 2, y, d.z + r, d.x + w / 2, y, d.z + r);
          UV.push(0, t, 1, t);
          if (i < N) { const k = i * 2; I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
        }
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        fg.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(P.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
        fg.setAttribute('uv2', new THREE.Float32BufferAttribute(UV, 2));
        fg.setIndex(I);
        const fm = new THREE.ShaderMaterial({
          uniforms: { uCityTime: CITY_U.uCityTime, uSunDirC: CITY_U.uSunDirC, uHazeC: CITY_U.uHazeC, uHazeR: CITY_U.uHazeR, uHazeK: CITY_U.uHazeK, uHazeFloor: CITY_U.uHazeFloor, uHazeCol: CITY_U.uHazeCol },
          vertexShader: GLASS_VERT.replace('varying vec3 vW;', 'attribute vec2 uv2;\nvarying vec2 vUv2;\nvarying vec3 vW;').replace('vL = position;', 'vL = position; vUv2 = uv2;'),
          fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
          blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        });
        const fall = new THREE.Mesh(fg, fm);
        fall.renderOrder = 4;
        g.add(fall);
        ctx.waterfall = new THREE.Vector3(d.x, rp + 10 + hTop, d.z + rTop);
      }
      // shore lanterns
      for (let k = 0; k < 140; k++) {
        const th = (k / 140) * TAU;
        let r = R * 0.5;
        for (let s = 0; s < 30; s++) { if (hFn(r, th) > water + 2) break; r += R * 0.012; }
        lights.add(new THREE.Vector3(d.x + Math.sin(th) * r, rp + 10 + hFn(r, th) + 3, d.z + Math.cos(th) * r), NAV.warm, { intensity: 2.5, size: 2.5 });
      }
    } else if (d.id === 'forest') {
      const hFn = (r, th) => {
        const x = Math.sin(th) * r, z = Math.cos(th) * r;
        const peak = 540 * Math.exp(-Math.pow(r / (0.36 * R), 1.7));
        const ridges = (Math.sin(th * 5 + r * 0.004) * 0.5 + 0.5) * 60 * Math.exp(-Math.pow(r / (0.7 * R), 2));
        const n = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 26 + Math.sin(x * 0.041 + z * 0.037) * 9;
        return (peak + ridges + n + 20) * (1 - sm(0.9 * R, 0.995 * R, r));
      };
      const tg = terrainDisc(d, hFn, 100, 200);
      const tm = new THREE.Mesh(tg, terrainMat(1, d, -999));
      tm.position.y = rp + 10; tm.receiveShadow = true; tm.castShadow = true;
      g.add(tm);
      const trees = [];
      for (let k = 0; k < 22000; k++) {
        const r = Math.sqrt(rng.next()) * R * 0.97, th = rng.range(0, TAU);
        const h = hFn(r, th);
        if (h > 470 && rng.chance(0.85)) continue; // bare summit
        trees.push([d.x + Math.sin(th) * r, rp + 10 + h - 1, d.z + Math.cos(th) * r, rng.range(1.0, 2.1), rng.next()]);
      }
      buildConifers(g, trees.filter((_, i) => i % 3 !== 0), M);
      buildTrees(g, trees.filter((_, i) => i % 3 === 0), M, 'forest-broadleaf');
      ctx.forestPeak = new THREE.Vector3(d.x, rp + 10 + hFn(0, 0), d.z);
    } else {
      // orchard: stepped concentric terraces rising toward a central glasshouse
      const steps = 12, sw = (R * 0.94) / steps, sh = 18;
      const tsh = new Shape();
      for (let k = 0; k < steps; k++) {
        const r0 = R * 0.94 - k * sw, r1 = r0 - sw;
        const y = k * sh + 4;
        const ring = (r, yy) => circle(r, 160).map(([x, z]) => [x, yy, z]);
        tsh.loft([ring(r0, y - sh), ring(r0, y)], Z.FACADE, { closed: true, orient: (p) => [p[0], 0, p[2]] });
        tsh.loft([ring(r0, y), ring(Math.max(r1, 30), y)], Z.FACADE, { closed: true, orient: [0, 1, 0] });
        // orchard rows on alternate terraces
        if (k % 2 === 1 && k < steps - 1) {
          for (let rr = r1 + 14; rr < r0 - 8; rr += 16) {
            const n = Math.floor((TAU * rr) / 15);
            for (let j = 0; j < n; j++) {
              const a = (j / n) * TAU;
              ctx._orchard = ctx._orchard || [];
              ctx._orchard.push([d.x + Math.sin(a) * rr, rp + 10 + y, d.z + Math.cos(a) * rr, rng.range(0.42, 0.6), rng.next()]);
            }
          }
        }
      }
      const tm = new THREE.Mesh(tsh.toGeometry(), terrainMat(2, d, -999));
      tm.position.set(d.x, rp + 10, d.z); tm.receiveShadow = true; tm.castShadow = true;
      g.add(tm);
      if (ctx._orchard) buildTrees(g, ctx._orchard, M, 'orchard-trees');
      // central glasshouse
      const gh = new Shape();
      const yTop = steps * sh + 4;
      gh.prism(circle(60, 32), 0, 26, Z.GLASS, null);
      gh.cone(0, 0, 62, 1, 26, 74, Z.GLASS, 32);
      gh.walls(circle(62.5, 32), 24, 26, Z.TRIM);
      B.get(M.haloMat).add(gh, new THREE.Matrix4().makeTranslation(d.x, rp + 10 + yTop - sh, d.z));
    }
    root.add(g);
  }
  B.build(root, { name: 'dome-plinths' });
  lights.build(root, { name: 'dome-lights' });
  return root;
}

function buildConifers(parent, trees, M) {
  const cone = new THREE.ConeGeometry(4.2, 16, 6, 1, false).translate(0, 11, 0);
  const cone2 = new THREE.ConeGeometry(3.0, 10, 6, 1, false).translate(0, 17, 0);
  const trunk = new THREE.CylinderGeometry(0.5, 0.7, 4, 4, 1, true).translate(0, 2, 0);
  const parts = [cone, cone2, trunk].map((g) => g.toNonIndexed());
  const P = [], N = [], C = [];
  parts.forEach((g, k) => {
    P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) C.push(...(k === 2 ? [0.3, 0.2, 0.2] : [1, 1, 1]));
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const mesh = new THREE.InstancedMesh(geo, M.foliage, trees.length);
  const col = new THREE.Color();
  trees.forEach(([x, y, z, s, h], i) => {
    mesh.setMatrixAt(i, instMatrix(x, y, z, h * TAU, s * 0.9, s));
    col.setHSL(0.3 + 0.06 * h, 0.4, 0.09 + 0.06 * h);
    mesh.setColorAt(i, col);
  });
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.name = 'conifers';
  parent.add(mesh);
}
