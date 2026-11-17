// The working city: the industrial stern (cooling towers, refineries, smelters, radiator banks, tank
// farms, glowing conduits running to the engine wall) and the construction quarter (unfinished towers
// in scaffolding, tower cranes that slowly slew, welding arcs on the top floors).
import * as THREE from 'three';
import { Shape, ShapeBatch, Z, rect, circle, chamfer } from './geo.js';
import { beamMatrix } from '../lib/geo.js';
import { RNG, TAU } from '../lib/rng.js';
import { D, districtAt, halfWidth, INDUSTRY_Z, CONSTRUCTION, Z_STERN, CANAL } from './layout.js';
import { makeConduitMaterial } from '../ship/conduit.js';
import { LightSet, NAV } from '../ship/lights.js';
import { instMatrix } from './districts.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG } from '../lib/glsl.js';
import { CITY_U, HAZE_GLSL, COMMON_GLSL } from './shaders.js';

// Radiator panels: heat glows from the roots of the fins and fades toward their tips.
const RAD_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vW; varying vec3 vN; varying float vH;
void main() {
  vec4 wp = vec4(position, 1.0);
#ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
#endif
  vH = position.y;
  wp = modelMatrix * wp;
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}`;
const RAD_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${COMMON_GLSL}
uniform float uCityTime;
${HAZE_GLSL}
varying vec3 vW; varying vec3 vN; varying float vH;
void main() {
  vec3 N = normalize(vN);
  float l = max(dot(N, uSunDirC), 0.0);
  float ribs = fp(vW.x / 4.0 + vW.z / 4.0, max(fwidth(vW.x / 4.0 + vW.z / 4.0), 1e-4), 0.5);
  vec3 base = vec3(0.12, 0.11, 0.1) * (0.4 + 0.9 * l) * mix(0.8, 1.1, ribs);
  float heat = exp(-vH * 0.03) * (0.85 + 0.15 * sin(uCityTime * 0.6 + vW.x * 0.01));
  vec3 glow = mix(vec3(0.9, 0.16, 0.03), vec3(1.0, 0.55, 0.2), exp(-vH * 0.06)) * heat * 1.3;
  gl_FragColor = vec4(applyHaze(base + glow * mix(0.85, 1.0, ribs), vW), 1.0);
  ${LOGDEPTH_FRAG}
}`;

function coolingTower(sh, x, z, r, h) {
  // hyperboloid shell: waist at 70 % of the height
  const rings = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = h * t;
    const w = 0.72 * h;
    const k = (y - w) / (t < 0.72 ? w : h - w);
    const rr = r * (0.62 + 0.38 * k * k * (t < 0.72 ? 1 : 0.55));
    rings.push(circle(rr, 36, x, z).map(([a, b]) => [a, y, b]));
  }
  sh.loft(rings, Z.CLAD, { closed: true, crease: 80 });
  // inner face (seen over the lip) and the dark throat
  const top = rings[N], inner = circle(r * 0.62 * 1.0, 36, x, z).map(([a, b]) => [a, h - 30, b]);
  sh.loft([top, inner], Z.CLAD, { closed: true, orient: [0, 1, 0] });
  sh.cap(circle(r * 0.62, 36, x, z), h - 30, Z.DARKGLASS);
  // splayed legs at the base
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU;
    sh.beam([x + Math.sin(a) * r * 1.0, 0, z + Math.cos(a) * r * 1.0], [x + Math.sin(a + 0.12) * r * 0.97, 16, z + Math.cos(a + 0.12) * r * 0.97], 2.5, 2.5, Z.CLAD);
  }
  sh.walls(circle(r * 0.98, 36, x, z), h - 6, h - 4, Z.TRIM);
}

function sphereTank(sh, x, z, r) {
  const rings = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    rings.push(circle(Math.max(0.01, Math.cos(a) * r), 20, x, z).map(([p, q]) => [p, r * 1.4 + Math.sin(a) * r, q]));
  }
  sh.loft(rings, Z.METAL, { closed: true, crease: 80 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    sh.beam([x + Math.sin(a) * r * 0.75, 0, z + Math.cos(a) * r * 0.75], [x + Math.sin(a) * r * 0.85, r * 1.4, z + Math.cos(a) * r * 0.85], 2.4, 2.4, Z.CLAD);
  }
  sh.walls(circle(r * 1.005, 20, x, z), r * 1.4 - 1, r * 1.4 + 1, Z.TRIM);
}

export function buildIndustry(M, ctx) {
  const root = new THREE.Group();
  root.name = 'industry';
  const B = new ShapeBatch();
  const rng = new RNG(31337);
  const lights = new LightSet();
  const radiators = [];
  const conduits = [];
  const ind = M.industry, indL = M.industryLight;

  // ---------------------------------------------------------------- the industrial stern
  const cell = 560;
  for (let z = INDUSTRY_Z - cell / 2; z > Z_STERN + 300; z -= cell) {
    const W = halfWidth(z);
    for (let x = CANAL.halfW + CANAL.walk + 140 + cell / 2; x < W - 350; x += cell) {
      for (const side of [-1, 1]) {
        const cx = side * x + rng.range(-40, 40), cz = z + rng.range(-40, 40);
        if (districtAt(cx, cz) !== D.INDUSTRY) continue;
        const kind = rng.weighted([['cooling', 1.1], ['refinery', 1.3], ['smelter', 1.0], ['radiators', 1.2], ['tanks', 0.9], ['hall', 0.8]]);
        const sh = B.get(kind === 'smelter' || kind === 'hall' ? ind : indL);
        if (kind === 'cooling') {
          const n = rng.int(2, 3);
          for (let k = 0; k < n; k++) {
            const a = (k / n) * TAU + rng.range(0, 1);
            const r = rng.range(70, 100), h = rng.range(200, 290);
            coolingTower(sh, cx + Math.sin(a) * 140, cz + Math.cos(a) * 140, r, h);
            lights.add(new THREE.Vector3(cx + Math.sin(a) * 140, h + 4, cz + Math.cos(a) * 140), NAV.red, { intensity: 10, size: 6, period: 1.6, phase: rng.next(), duty: 0.3 });
          }
        } else if (kind === 'refinery') {
          for (let k = 0; k < rng.int(3, 6); k++) sphereTank(B.get(M.steel), cx + rng.range(-180, 180), cz + rng.range(-180, 180), rng.range(22, 48));
          for (let k = 0; k < rng.int(4, 8); k++) {
            const px = cx + rng.range(-200, 200), pz = cz + rng.range(-200, 200), r = rng.range(7, 13), h = rng.range(70, 170);
            sh.prism(circle(r, 14, px, pz), 0, h, Z.CLAD, Z.METAL);
            for (let y = 20; y < h; y += 26) sh.walls(circle(r + 1.8, 14, px, pz), y, y + 1.4, Z.METAL);
            lights.add(new THREE.Vector3(px, h + 2, pz), NAV.red, { intensity: 6, size: 3, period: 2.2, phase: rng.next(), duty: 0.25 });
          }
          // pipe racks
          for (let k = 0; k < 4; k++) {
            const a = [cx - 230, cz - 220 + k * 140], b = [cx + 230, cz - 220 + k * 140];
            sh.prism([[a[0], a[1] - 6], [b[0], b[1] - 6], [b[0], b[1] + 6], [a[0], a[1] + 6]], 14, 18, Z.METAL, Z.METAL);
            for (let xx = a[0]; xx <= b[0]; xx += 40) sh.prism(rect(2, 12, xx, a[1]), 0, 14, Z.CLAD, null);
          }
        } else if (kind === 'smelter') {
          const ang = rng.chance(0.5) ? 0 : Math.PI / 2;
          const L = rng.range(260, 360), Wd = rng.range(80, 110), Hh = rng.range(50, 75);
          const hall = new Shape();
          hall.prism(chamfer(L, Wd, 8), 0, Hh, Z.FACADE, Z.ROOF);
          // glowing furnace vents along both long sides
          for (let k = 0; k < 8; k++) {
            const xx = -L / 2 + 30 + k * ((L - 60) / 7);
            for (const s of [-1, 1]) hall.prism(rect(14, 2, xx, s * (Wd / 2 + 0.6)), 6, 24, Z.TRIM, null);
          }
          // stacks
          for (let k = 0; k < rng.int(3, 5); k++) {
            const xx = -L / 2 + 40 + k * 60, h = rng.range(180, 260);
            hall.cone(xx, 0, 13, 9, Hh, h, Z.CLAD, 14);
            hall.walls(circle(9.4, 14, xx, 0), h - 12, h - 2, Z.TRIM);
            const p = new THREE.Vector3(xx, h + 2, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(new THREE.Vector3(cx, 0, cz));
            lights.add(p, NAV.red, { intensity: 10, size: 5, period: 1.3, phase: rng.next(), duty: 0.4 });
          }
          B.get(M.smelter).add(hall, new THREE.Matrix4().makeRotationY(ang).setPosition(cx, 0, cz));
          conduits.push(new THREE.Vector3(cx, 4, cz));
        } else if (kind === 'radiators') {
          const ang = rng.chance(0.5) ? 0 : Math.PI / 2;
          const n = rng.int(10, 16), h = rng.range(130, 190);
          for (let k = 0; k < n; k++) radiators.push(instMatrix(cx + Math.cos(ang) * (k - n / 2) * 30, 0, cz - Math.sin(ang) * (k - n / 2) * 30, ang, 1, h / 160));
          sh.prism(rect(n * 30 + 40, 40, cx, cz).map(([a, b]) => { const dx = a - cx, dz = b - cz; return [cx + dx * Math.cos(ang) - dz * Math.sin(ang), cz + dx * Math.sin(ang) + dz * Math.cos(ang)]; }), 0, 10, Z.CLAD, Z.METAL);
          conduits.push(new THREE.Vector3(cx, 4, cz));
        } else if (kind === 'tanks') {
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            if (rng.chance(0.2)) continue;
            const r = rng.range(36, 52), h = rng.range(40, 64);
            const px = cx + i * 150, pz = cz + j * 150;
            B.get(M.steel).prism(circle(r, 28, px, pz), 0, h, Z.METAL, null);
            B.get(M.steel).cone(px, pz, r, r * 0.2, h, h + r * 0.25, Z.CLAD, 28);
            B.get(M.steel).walls(circle(r + 0.4, 28, px, pz), h * 0.5, h * 0.5 + 2, Z.TRIM);
          }
        } else {
          // long barrel-vaulted works hall
          const L = rng.range(300, 420), Wd = rng.range(90, 130);
          const hall = new Shape();
          hall.prism(rect(L, Wd), 0, 34, Z.FACADE, null);
          const rings = [];
          for (let i = 0; i <= 12; i++) {
            const a = Math.PI * (i / 12);
            rings.push([[-L / 2, 34 + Math.sin(a) * Wd * 0.3, Math.cos(a) * Wd / 2], [L / 2, 34 + Math.sin(a) * Wd * 0.3, Math.cos(a) * Wd / 2]]);
          }
          hall.loft(rings, Z.METAL, { closed: false, orient: [0, 1, 0] });
          hall.walls(rect(L + 1, Wd + 1), 30, 31.5, Z.TRIM);
          B.get(ind).add(hall, new THREE.Matrix4().makeRotationY(rng.chance(0.5) ? 0 : Math.PI / 2).setPosition(cx, 0, cz));
        }
      }
    }
  }
  // radiator panels (instanced)
  console.log(`[city] radiators: ${radiators.length}`);
  if (radiators.length) {
    const panel = new THREE.BoxGeometry(6, 160, 70).translate(0, 80, 0);
    const rm = new THREE.ShaderMaterial({
      uniforms: { uCityTime: CITY_U.uCityTime, uSunDirC: CITY_U.uSunDirC, uHazeC: CITY_U.uHazeC, uHazeR: CITY_U.uHazeR, uHazeK: CITY_U.uHazeK, uHazeFloor: CITY_U.uHazeFloor, uHazeCol: CITY_U.uHazeCol },
      vertexShader: RAD_VERT, fragmentShader: RAD_FRAG,
    });
    const mesh = new THREE.InstancedMesh(panel, rm, radiators.length);
    radiators.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  // glowing conduits from the plants to the engine wall
  {
    const cm = makeConduitMaterial({ color: new THREE.Vector3(1.0, 0.55, 0.22), axis: new THREE.Vector3(0, 0, -1), speed: 260, base: 0.5, packet: 4, spacing: 260 });
    const cm2 = makeConduitMaterial({ color: new THREE.Vector3(0.3, 0.78, 1.0), axis: new THREE.Vector3(0, 0, -1), speed: 320, base: 0.5, packet: 4, spacing: 200 });
    conduits.forEach((p, k) => {
      const end = new THREE.Vector3(Math.sign(p.x) * Math.min(Math.abs(p.x), halfWidth(Z_STERN) - 400), 4, Z_STERN + 30);
      const mid = new THREE.Vector3(p.x, 26, (p.z + end.z) / 2);
      const curve = new THREE.CatmullRomCurve3([p.clone().setY(18), mid, end.clone().setY(18)]);
      const g = new THREE.TubeGeometry(curve, 60, 5.5, 8, false);
      const mesh = new THREE.Mesh(g, k % 3 === 0 ? cm2 : cm);
      root.add(mesh);
      // supports
      for (let i = 1; i < 10; i++) {
        const q = curve.getPointAt(i / 10);
        B.get(M.steel).prism(rect(6, 6, q.x, q.z), 0, q.y - 5, Z.CLAD, Z.METAL);
      }
    });
  }

  // ---------------------------------------------------------------- construction quarter
  buildConstruction(M, ctx, root, B, lights, rng);

  B.build(root, { name: 'industry' });
  lights.build(root, { name: 'industry-lights' });
  return root;
}

function buildConstruction(M, ctx, root, B, lights, rng) {
  const C = CONSTRUCTION;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const scaff = [];
  const cranes = [];
  const m4 = new THREE.Matrix4();
  const sites = [];
  for (let x = C.x0 + 260; x < C.x1 - 200; x += 520) {
    for (let z = C.z0 + 260; z < C.z1 - 200; z += 560) {
      if (x > halfWidth(z) - 520) continue;
      sites.push([x + rng.range(-60, 60), z + rng.range(-60, 60)]);
    }
  }
  console.log(`[city] construction sites: ${sites.length}`);
  sites.forEach(([cx, cz], k) => {
    const s = rng.range(50, 74), H = rng.range(320, 760);
    const done = H * rng.range(0.25, 0.5), frame = H * rng.range(0.7, 0.92);
    const fl = 4.4;
    const sh = B.get(M.midCurtain);
    const p = chamfer(s, s * rng.range(0.8, 1.0), s * 0.12, cx, cz);
    // finished lower floors
    sh.prism(p, 0, done, Z.FACADE, null);
    // concrete core to the top
    B.get(M.industryLight).prism(rect(s * 0.38, s * 0.32, cx, cz), 0, H, Z.CLAD, Z.ROOF);
    // exposed slabs and columns
    for (let y = done; y < frame; y += fl) B.get(M.industryLight).prism(p, y, y + 0.9, Z.CLAD, Z.ROOF);
    const pts = p;
    for (const [px, pz] of pts) B.get(M.industryLight).prism(rect(1.6, 1.6, px - Math.sign(px - cx) * 2, pz - Math.sign(pz - cz) * 2), done, frame, Z.CLAD, null);
    // scaffolding around the top of the finished cladding
    const sy0 = done - 30, sy1 = Math.min(frame, done + 120);
    const sp = chamfer(s + 8, s * 0.9 + 8, s * 0.12, cx, cz);
    for (let i = 0; i < sp.length; i++) {
      const a = sp[i], b = sp[(i + 1) % sp.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(L / 9));
      for (let j = 0; j < n; j++) {
        const t = j / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        scaff.push([new THREE.Vector3(x, sy0, z), new THREE.Vector3(x, sy1, z), 0.5]);
      }
      for (let y = sy0; y <= sy1; y += 8.8) scaff.push([new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(b[0], y, b[1]), 0.4]);
    }
    // welding arcs on the frontier floors
    for (let w = 0; w < 6; w++) {
      const q = p[rng.int(0, p.length - 1)];
      lights.add(new THREE.Vector3(q[0], frame - rng.range(0, 30), q[1]), new THREE.Color(0.7, 0.85, 1.0), { intensity: 9, size: 1.6, period: rng.range(0.15, 0.6), phase: rng.next(), duty: rng.range(0.2, 0.6) });
    }
    // tower crane on the core
    cranes.push({ x: cx, z: cz, y: H, mast: rng.range(40, 80), ph: rng.range(0, TAU), sp: rng.range(0.02, 0.06) * rng.sign() });
    if (k % 2 === 0) cranes.push({ x: cx + s * 1.4, z: cz - s * 0.6, y: 0, mast: done + 120, ph: rng.range(0, TAU), sp: rng.range(0.02, 0.05) * rng.sign() });
  });
  if (scaff.length) {
    const mesh = new THREE.InstancedMesh(box, M.steelPlain, scaff.length);
    scaff.forEach(([a, b, w], i) => { beamMatrix(a, b, w, w, null, m4, 0); mesh.setMatrixAt(i, m4); });
    mesh.castShadow = true;
    root.add(mesh);
  }
  // cranes: static masts, slewing tops
  const mastS = new Shape();
  mastS.prism(rect(6, 6), 0, 1, Z.METAL, null);
  const top = new Shape();
  const jib = 70, cj = 24;
  top.prism(rect(7, 7), 0, 6, Z.CLAD, Z.ROOF); // slewing unit + cab
  top.prism(rect(4, 5, 4.5, 2), 1, 5, Z.GLASS, Z.ROOF);
  for (const s of [-1.6, 1.6]) {
    top.beam([s, 6, 0], [s, 6, jib], 0.8, 0.8, Z.METAL);
    top.beam([s, 6, 0], [s, 6, -cj], 0.8, 0.8, Z.METAL);
  }
  top.beam([0, 9.5, 0], [0, 9.5, jib], 0.8, 0.8, Z.METAL);
  for (let zz = 0; zz < jib; zz += 6) { top.beam([-1.6, 6, zz], [0, 9.5, zz + 3], 0.4, 0.4, Z.METAL); top.beam([1.6, 6, zz], [0, 9.5, zz + 3], 0.4, 0.4, Z.METAL); }
  top.prism(rect(4, 3), 6, 20, Z.METAL, null); // apex
  top.beam([0, 20, 0], [0, 9.5, jib * 0.7], 0.4, 0.4, Z.METAL);
  top.beam([0, 20, 0], [0, 7, -cj], 0.4, 0.4, Z.METAL);
  top.prism(rect(6, 8, 0, -cj + 4), 2, 7, Z.CLAD, Z.ROOF); // counterweight
  top.prism(rect(3, 3, 0, jib * 0.55), -1, 5, Z.CLAD, Z.ROOF); // trolley
  const mastMesh = new THREE.InstancedMesh(mastS.toGeometry(), M.cranes, cranes.length);
  const topMesh = new THREE.InstancedMesh(top.toGeometry(), M.cranes, cranes.length);
  cranes.forEach((c, i) => mastMesh.setMatrixAt(i, instMatrix(c.x, c.y, c.z, 0, 1, c.mast)));
  mastMesh.castShadow = true; topMesh.castShadow = true;
  topMesh.userData.dynamic = true; topMesh.frustumCulled = false;
  root.add(mastMesh, topMesh);
  const cl = new LightSet();
  cranes.forEach(() => cl.add(new THREE.Vector3(), NAV.red, { intensity: 10, size: 3, period: 1.4, duty: 0.5 }));
  const pts = cl.build(root, { name: 'crane-lights' });
  pts.frustumCulled = false;
  const attr = pts.geometry.attributes.position;
  const setT = (t) => {
    cranes.forEach((c, i) => {
      const a = c.ph + t * c.sp;
      topMesh.setMatrixAt(i, instMatrix(c.x, c.y + c.mast, c.z, a, 1, 1));
      attr.setXYZ(i, c.x + Math.sin(a) * jib, c.y + c.mast + 10, c.z + Math.cos(a) * jib);
    });
    topMesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  };
  setT(0);
  ctx.animated.push(setT);
  ctx.cranes = cranes;
  void box;
}
