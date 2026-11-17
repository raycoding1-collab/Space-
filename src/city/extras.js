// Fine detail that rewards a close look: ground traffic animated on the GPU along every street, neon
// banners and holographic billboards on the commercial and canal districts, a holographic ring display
// above the Cascade, helipads with parked aircars on the rooftops, glass sky bridges between the
// spire-district towers, and sailboats drifting on the Lake Dome.
import * as THREE from 'three';
import { Shape, ShapeBatch, Z, circle, rect } from './geo.js';
import { RNG, TAU } from '../lib/rng.js';
import { GRID, D, districtAt, streetW, DOMES, CASCADE_Z, PLATEAUS, CITY_DETAIL, SPIRE, plateauRho } from './layout.js';
import { CITY_U, COMMON_GLSL, cityPatch } from './shaders.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG } from '../lib/glsl.js';
import { aircar, Movers } from './life.js';
import { instMatrix, buildTrees } from './districts.js';
import { LightSet } from '../ship/lights.js';
import { superellipse } from './geo.js';
import { spireR } from './spire.js';
import { NAV, lightUniforms } from '../ship/lights.js';

// ------------------------------------------------------------------ ground traffic (GPU-animated)
function podGeometry() {
  // a low rounded runabout, 7 m long; front lamps white, tail lamps red (per-vertex emission)
  const s = new Shape();
  const sec = (z, w, h, y0 = 0.3) => [[-w / 2, y0, z], [w / 2, y0, z], [w * 0.42, y0 + h, z], [-w * 0.42, y0 + h, z]];
  s.loft([sec(-3.5, 1.6, 0.8, 0.5), sec(-3.1, 2.4, 1.3), sec(2.4, 2.4, 1.4), sec(3.5, 1.4, 0.7, 0.45)], 0, { closed: true, crease: 35 });
  s.prism(rect(1.9, 3.0, 0, -0.2), 1.6, 2.2, 1, 1);
  const g = s.toGeometry();
  const p = g.attributes.position, n = p.count;
  const em = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = p.getY(i), z = p.getZ(i), zone = g.attributes.aZone.getX(i);
    let e = [0, 0, 0];
    if (z > 3.3 && y < 1.2) e = [4.0, 3.7, 3.2];
    else if (z < -3.3 && y < 1.2) e = [3.2, 0.25, 0.15];
    em.set(e, i * 3);
    col.set(zone > 0.5 ? [0.08, 0.1, 0.12] : [1, 1, 1], i * 3);
  }
  g.setAttribute('aEmit', new THREE.Float32BufferAttribute(em, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function trafficMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCityTime = CITY_U.uCityTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uCityTime;
attribute vec4 aRoute; // start x, start z, heading, length
attribute vec4 aMove;  // speed, phase, lane offset, y
attribute vec3 aEmit;
attribute vec3 aTint;
varying vec3 vEmit;
mat3 podRot() { float c = cos(aRoute.z), s = sin(aRoute.z); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
vec3 podPos() {
  float L = aRoute.w;
  float d = mod(aMove.y * L + uCityTime * aMove.x, L);
  vec2 dir = vec2(sin(aRoute.z), cos(aRoute.z)), perp = vec2(dir.y, -dir.x);
  vec2 p = aRoute.xy + dir * d + perp * aMove.z;
  return vec3(p.x, aMove.w, p.y);
}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = podRot() * objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = podRot() * transformed + podPos();\nvEmit = aEmit;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor.rgb *= aTint;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit;');
  };
  m.customProgramCacheKey = () => 'city-traffic';
  return m;
}

const blvdRuns = [];
function buildGroundTraffic(root, rng) {
  const routes = [], moves = [], tints = [];
  const TINTS = [[0.9, 0.9, 0.88], [0.25, 0.3, 0.38], [0.75, 0.2, 0.15], [0.9, 0.7, 0.3], [0.2, 0.45, 0.6], [0.6, 0.62, 0.64], [0.12, 0.12, 0.13]];
  const ok = (x, z) => { const d = districtAt(x, z); return d === D.CENTRAL || d === D.CANALSIDE || d === D.GARDEN || d === D.RIM || d === D.INDUSTRY || d === D.CONSTRUCTION; };
  const addRuns = (axis) => {
    // streets along z (at x = i*px) and along x (at z = j*pz); split into runs of drivable blocks
    const lines = axis === 'z' ? [-24, 24, GRID.px, GRID.pz] : [-49, 49, GRID.pz, GRID.px];
    for (let i = lines[0]; i <= lines[1]; i++) {
      const c = i * lines[2];
      const wS = streetW(i);
      let run = null;
      for (let j = (axis === 'z' ? -49 : -24); j <= (axis === 'z' ? 49 : 24); j++) {
        const a = j * lines[3], b = (j + 1) * lines[3], m = (a + b) / 2;
        const px = axis === 'z' ? c : m, pz = axis === 'z' ? m : c;
        const good = ok(px, pz) && ok(axis === 'z' ? c - 40 : m, axis === 'z' ? m : c - 40) && ok(axis === 'z' ? c + 40 : m, axis === 'z' ? m : c + 40);
        if (good) { if (!run) run = [a, b]; else run[1] = b; }
        if ((!good || j === (axis === 'z' ? 49 : 24)) && run) {
          const L = run[1] - run[0];
          if (L > 300 && wS > 50) blvdRuns.push({ axis, c, a: run[0], b: run[1] });
          if (L > 300) {
            const lanes = wS > 50 ? [6, 13] : [3.6];
            for (const dirSign of [1, -1]) {
              for (const lane of lanes) {
                const n = Math.max(1, Math.round((L / 120) * rng.range(0.6, 1.3) * CITY_DETAIL.k));
                for (let k = 0; k < n; k++) {
                  let sx, sz, hd;
                  if (axis === 'z') { sx = c; sz = dirSign > 0 ? run[0] : run[1]; hd = dirSign > 0 ? 0 : Math.PI; }
                  else { sz = c; sx = dirSign > 0 ? run[0] : run[1]; hd = dirSign > 0 ? Math.PI / 2 : -Math.PI / 2; }
                  routes.push(sx, sz, hd, L);
                  moves.push(rng.range(14, 26), rng.next(), lane, 0.05);
                  tints.push(...rng.pick(TINTS));
                }
              }
            }
          }
          run = null;
        }
      }
    }
  };
  addRuns('z'); addRuns('x');
  const n = routes.length / 4;
  const geo = podGeometry();
  geo.setAttribute('aRoute', new THREE.InstancedBufferAttribute(new Float32Array(routes), 4));
  geo.setAttribute('aMove', new THREE.InstancedBufferAttribute(new Float32Array(moves), 4));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(tints), 3));
  const mesh = new THREE.InstancedMesh(geo, trafficMaterial(), n);
  mesh.frustumCulled = false;
  mesh.userData.dynamic = true;
  mesh.name = 'ground-traffic';
  root.add(mesh);
  // head and tail lights as glowing sprites, animated with the same route maths
  const pg = new THREE.BufferGeometry();
  const R2 = new Float32Array(n * 8), M2 = new Float32Array(n * 8), S2 = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 2; k++) {
      R2.set(routes.slice(i * 4, i * 4 + 4), (i * 2 + k) * 4);
      M2.set(moves.slice(i * 4, i * 4 + 4), (i * 2 + k) * 4);
      S2[i * 2 + k] = k === 0 ? 1 : -1;
    }
  }
  pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 6), 3));
  pg.setAttribute('aRoute', new THREE.Float32BufferAttribute(R2, 4));
  pg.setAttribute('aMove', new THREE.Float32BufferAttribute(M2, 4));
  pg.setAttribute('aSide', new THREE.Float32BufferAttribute(S2, 1));
  const pm = new THREE.ShaderMaterial({
    uniforms: { uCityTime: CITY_U.uCityTime, uPx: lightUniforms.uPx, uViewH: lightUniforms.uViewH },
    vertexShader: TRAFFIC_LIGHT_VERT, fragmentShader: TRAFFIC_LIGHT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(pg, pm);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  pts.name = 'traffic-lights';
  root.add(pts);
  return n;
}

const TRAFFIC_LIGHT_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
uniform float uCityTime;
uniform float uPx;
uniform float uViewH;
attribute vec4 aRoute;
attribute vec4 aMove;
attribute float aSide;
varying vec3 vColor;
void main() {
  float L = aRoute.w;
  float d = mod(aMove.y * L + uCityTime * aMove.x, L);
  vec2 dir = vec2(sin(aRoute.z), cos(aRoute.z)), perp = vec2(dir.y, -dir.x);
  vec2 p = aRoute.xy + dir * (d + aSide * 3.4) + perp * aMove.z;
  vec4 mv = modelViewMatrix * vec4(p.x, aMove.w + 0.9, p.y, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 1.0);
  float px = 1.4 * projectionMatrix[1][1] * uViewH * 0.5 / dist;
  gl_PointSize = clamp(max(px * 6.0, 1.8 * uPx), 1.0, 64.0);
  float fade = clamp(px * 6.0 / (1.8 * uPx) + 0.4, 0.4, 1.0);
  vColor = (aSide > 0.0 ? vec3(1.0, 0.92, 0.78) * 2.6 : vec3(1.0, 0.12, 0.06) * 2.2) * fade;
  ${LOGDEPTH_VERT}
}`;
const TRAFFIC_LIGHT_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
varying vec3 vColor;
void main() {
  vec2 q = (gl_PointCoord - 0.5) * 2.0;
  float r = length(q);
  float I = (exp(-r * r * 20.0) * 1.5 + exp(-r * 4.5) * 0.3) * (1.0 - smoothstep(0.85, 1.0, r));
  if (I < 0.003) discard;
  gl_FragColor = vec4(vColor * I, 1.0);
  ${LOGDEPTH_FRAG}
}`;

// ------------------------------------------------------------------ holographic signage
const HOLO_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
attribute float aSeed;
varying vec2 vUv; varying float vSeed; varying vec3 vW;
void main() {
  vUv = uv; vSeed = aSeed;
  vec4 wp = vec4(position, 1.0);
#ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
#endif
  wp = modelMatrix * wp; vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}`;
const HOLO_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${COMMON_GLSL}
uniform float uCityTime;
uniform vec2 uGrid;    // glyph columns, rows
uniform float uGain;
varying vec2 vUv; varying float vSeed; varying vec3 vW;
vec3 pal(float h) {
  return h < 0.25 ? vec3(0.25, 0.85, 1.0) : (h < 0.5 ? vec3(1.0, 0.3, 0.75) : (h < 0.75 ? vec3(1.0, 0.68, 0.25) : vec3(0.45, 1.0, 0.55)));
}
void main() {
  vec2 g = vUv * uGrid;
  vec2 cell = floor(g);
  float t = uCityTime;
  // glyphs: 3×5 blocky characters that change in bursts, scrolling slowly
  float scroll = floor(t * (0.6 + vSeed * 1.4));
  vec2 gc = vec2(cell.x, cell.y + scroll);
  float on = step(0.35, hashI(gc + vSeed * 97.0));
  vec2 sub = fract(g) * vec2(3.0, 5.0);
  float px = step(0.45, hashI(floor(sub) + gc * 7.0 + floor(t * 0.25 + vSeed * 9.0)));
  vec2 fw = fwidth(g);
  float far = smoothstep(0.08, 0.3, max(fw.x, fw.y));
  float glyph = mix(on * px, 0.3, far);
  vec3 c = pal(fract(vSeed * 3.7 + floor(t * 0.05 + vSeed) * 0.25));
  vec3 c2 = pal(fract(vSeed * 3.7 + 0.5));
  // frame, scanlines and the odd flicker
  vec2 e = min(vUv, 1.0 - vUv) * uGrid;
  float frame = 1.0 - smoothstep(0.12, 0.12 + max(fw.x, fw.y) * 1.5, min(e.x, e.y));
  float scan = 0.75 + 0.25 * sin(vUv.y * uGrid.y * 18.0 - t * 6.0);
  float flick = 0.85 + 0.15 * step(0.97, hashI(vec2(floor(t * 12.0), vSeed * 31.0)));
  vec3 col = (c * glyph * scan + c2 * frame * 1.4 + c * 0.06) * flick * uGain;
  gl_FragColor = vec4(col, 1.0);
  ${LOGDEPTH_FRAG}
}`;
function holoMat(grid, gain) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCityTime: CITY_U.uCityTime, uGrid: { value: new THREE.Vector2(...grid) }, uGain: { value: gain } },
    vertexShader: HOLO_VERT, fragmentShader: HOLO_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  m.userData.castShadow = false;
  return m;
}

function buildSignage(root, placed, rng) {
  // vertical neon banners on building faces, billboards on rooftops
  const banners = [], boards = [];
  for (const P of placed) {
    const dc = districtAt(P.x, P.z);
    if (!(dc === D.CENTRAL || dc === D.CANALSIDE || dc === D.RIM || dc === D.SPIRE)) continue;
    if (P.top < 40) continue;
    const r = rng.next();
    const c = Math.cos(P.rot), s = Math.sin(P.rot);
    // local +x face of the footprint, rotated into the world
    const face = rng.chance(0.5) ? 1 : -1;
    const fx = face * (P.w / 2 + 0.8);
    const ox = rng.range(-0.3, 0.3) * P.d;
    const wx = P.x + fx * c + ox * s, wz = P.z - fx * s + ox * c;
    const heading = P.rot + (face > 0 ? Math.PI / 2 : -Math.PI / 2);
    const flatFace = P.arch === 'slab' || P.arch === 'roundedBlock' || P.arch === 'courtyard';
    if (flatFace && r < 0.55 * (0.4 + 0.6 * CITY_DETAIL.k)) {
      const h = Math.min(P.top * 0.6, rng.range(22, 70));
      const y0 = P.y + rng.range(6, Math.max(7, P.top - h - 4));
      banners.push([wx, y0 + h / 2, wz, heading, h, rng.next()]);
    } else if (FLAT.has(P.arch) && r > 0.86 && P.top < 260) {
      boards.push([P.x, P.y + P.top + 9, P.z, P.rot + rng.range(-0.3, 0.3), rng.range(18, 34), rng.next()]);
    }
  }
  const mk = (list, geo, mat, name) => {
    if (!list.length) return;
    const g = geo.clone();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(list.map((b) => b[5])), 1));
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach(([x, y, z, rot, size], i) => mesh.setMatrixAt(i, name === 'banners' ? instMatrix(x, y, z, rot, 1, size / 10) : instMatrix(x, y, z, rot, size / 10, size / 10)));
    mesh.computeBoundingSphere();
    mesh.name = name;
    mesh.renderOrder = 6;
    mesh.userData.minPx = 1.5;
    root.add(mesh);
  };
  // banner: 4 m wide, 10 m tall unit (scaled in y); billboard: 10 × 5 m unit (scaled uniformly)
  mk(banners, new THREE.PlaneGeometry(6, 10), holoMat([2, 10], 2.4), 'banners');
  mk(boards, new THREE.PlaneGeometry(10, 5), holoMat([8, 3], 2.0), 'billboards');
  // billboard frames on their masts
  const fs = new Shape();
  for (const [x, y, z, rot, size] of boards) {
    const k = size / 10;
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
    const f = new Shape();
    f.prism(rect(10.6 * k, 0.6), -2.8 * k, -2.5 * k, Z.METAL, Z.METAL);
    f.prism(rect(0.5, 0.5, -3 * k, 0), -9, -2.8 * k, Z.METAL, null);
    f.prism(rect(0.5, 0.5, 3 * k, 0), -9, -2.8 * k, Z.METAL, null);
    fs.add(f, m);
  }
  return { banners: banners.length, boards: boards.length, frames: fs };
}

// a giant holographic ring display above the Cascade
function buildHoloRings(root, ctx) {
  const g = new THREE.Group();
  g.position.set(0, PLATEAUS[0].h + 150, CASCADE_Z + 220);
  const rings = [[70, 22, [14, 2]], [104, 16, [22, 2]], [140, 12, [30, 1]]];
  rings.forEach(([r, h, grid], k) => {
    const geo = new THREE.CylinderGeometry(r, r, h, 96, 1, true);
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(0.17 + k * 0.29), 1));
    const m = new THREE.Mesh(geo, holoMat(grid, 1.1));
    m.position.y = k * 34 - 34;
    m.rotation.x = 0.12 * (k - 1);
    m.renderOrder = 6;
    g.add(m);
    ctx.animated.push((t) => { m.rotation.y = t * (0.05 + 0.04 * k) * (k % 2 ? -1 : 1); });
  });
  root.add(g);
}

// ------------------------------------------------------------------ rooftop helipads and parked aircars
const FLAT = new Set(['podiumTower', 'slab', 'roundedBlock', 'hexTower', 'lblock', 'courtyard', 'stack', 'cylinders', 'terraced']);
function buildRooftops(root, M, placed, rng) {
  const pad = new Shape();
  pad.prism(circle(10, 24), 0, 0.5, Z.STONE, Z.ROOF);
  pad.walls(circle(10.1, 24), 0.2, 0.55, Z.TRIM);
  pad.prism(rect(1.4, 9), 0.5, 0.6, Z.TRIM, Z.TRIM);
  pad.prism(rect(5, 1.4), 0.5, 0.6, Z.TRIM, Z.TRIM);
  const pads = [], cars = [];
  for (const P of placed) {
    if (!FLAT.has(P.arch) || P.top < 50 || P.w < 34 || P.d < 34) continue;
    if (!rng.chance(0.4)) continue;
    const c = Math.cos(P.rot), s = Math.sin(P.rot);
    const ox = rng.range(-0.18, 0.18) * P.w, oz = rng.range(-0.18, 0.18) * P.d;
    const x = P.x + ox * c + oz * s, z = P.z - ox * s + oz * c, y = P.y + P.top + 0.3;
    pads.push(instMatrix(x, y, z, P.rot, 1, 1));
    if (rng.chance(0.45)) cars.push(instMatrix(x, y + 0.6, z, rng.range(0, TAU), 1.3, 1.3));
  }
  const mk = (geo, list, style, name) => {
    if (!list.length) return;
    geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(list.length).fill(style), 1));
    const mesh = new THREE.InstancedMesh(geo, M.buildings, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.name = name;
    mesh.userData.minPx = 1.2;
    root.add(mesh);
  };
  mk(pad.toGeometry(), pads, M.style.pierMat, 'helipads');
  mk(aircar().toGeometry(), cars, M.style.shipDark, 'parked-aircars');
  return { pads: pads.length, cars: cars.length };
}

// ------------------------------------------------------------------ sky bridges in the spire district
function buildSkyBridges(B, M, placed, rng) {
  const towers = placed.filter((p) => p.y > 100 && p.top > 260);
  const used = new Map();
  let n = 0;
  for (let i = 0; i < towers.length; i++) {
    const a = towers[i];
    if ((used.get(a) || 0) >= 2) continue;
    for (let j = i + 1; j < towers.length; j++) {
      const b = towers[j];
      if (Math.abs(a.y - b.y) > 1 || (used.get(b) || 0) >= 2) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 100 || d > 360 || !rng.chance(0.7)) continue;
      const y = a.y + Math.min(a.top, b.top) * rng.range(0.3, 0.7);
      const sh = new Shape();
      sh.beam([a.x, y, a.z], [b.x, y, b.z], 16, 12, Z.GLASS);
      sh.beam([a.x, y - 6.6, a.z], [b.x, y - 6.6, b.z], 17, 1.2, Z.METAL);
      sh.beam([a.x, y - 7.4, a.z], [b.x, y - 7.4, b.z], 3, 0.4, Z.TRIM);
      B.get(M.spireGlass).add(sh);
      used.set(a, (used.get(a) || 0) + 1); used.set(b, (used.get(b) || 0) + 1);
      n++;
      break;
    }
  }
  return n;
}

// ------------------------------------------------------------------ sailboats on the Lake Dome
function buildSailboats(root, M, ctx, rng) {
  const lake = DOMES.find((d) => d.id === 'lake');
  const s = new Shape();
  const sec = (z, w, d) => [[-w / 2, 0, z], [w / 2, 0, z], [w * 0.3, -d, z], [-w * 0.3, -d, z]];
  s.loft([sec(-5, 0.6, 0.6), sec(-3.5, 3.4, 1.2), sec(3, 3.2, 1.2), sec(5.5, 0.4, 0.4)], Z.STONE, { closed: true, crease: 40 });
  s.prism(rect(0.3, 0.3, 0, 0.5), 0, 12, Z.METAL, null);
  // sail: a thin triangular fin
  const sail = [[0, 1.2, 0.8], [0, 11.5, 0.6], [0, 1.4, -4.2]];
  s.tri(sail[0], sail[1], sail[2], [1, 0, 0], [1, 0, 0], [1, 0, 0], [0, 0], [0, 1], [1, 0], Z.CLAD);
  s.tri(sail[0], sail[2], sail[1], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [0, 0], [1, 0], [0, 1], Z.CLAD);
  const list = [];
  const water = 64 + 10 - 40; // plinth + offset + lake level
  for (let i = 0; i < 26; i++) {
    const r0 = rng.range(250, 900), cx = lake.x + rng.range(-300, 300), cz = lake.z + rng.range(-400, 200);
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      pts.push(new THREE.Vector3(cx + Math.sin(a) * r0 * rng.range(0.8, 1.1), water + 0.4, cz + Math.cos(a) * r0 * 0.7 * rng.range(0.8, 1.1)));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    list.push({ curve, len: curve.getLength(), ph: rng.next(), speed: rng.range(3, 6), dir: 1, scale: rng.range(1.2, 2.0) });
  }
  const mv = new Movers(root, s.toGeometry(), M.buildings, M.style.resWhite, list, [
    { at: [0, 12.2, 0], color: NAV.warm, opts: { intensity: 3, size: 1.2 } },
  ], 'sailboats');
  ctx.animated.push((t) => mv.update(t));
  mv.update(0);
}

// ------------------------------------------------------------------ boulevard trees and lamp posts
function buildBoulevards(root, M, rng) {
  const trees = [], lamps = [];
  const lampShape = new Shape();
  lampShape.prism(circle(0.35, 6), 0, 11, Z.METAL, null);
  lampShape.beam([0, 10.6, 0], [2.6, 11.4, 0], 0.3, 0.3, Z.METAL);
  lampShape.prism(rect(1.6, 0.7, 2.6, 0), 10.6, 11.6, Z.METAL, Z.METAL);
  lampShape.prism(rect(1.3, 0.5, 2.6, 0), 10.4, 10.6, Z.TRIM, Z.TRIM);
  const ls = new LightSet();
  const tStep = 26 / Math.sqrt(CITY_DETAIL.k), lStep = 46;
  for (const R of blvdRuns) {
    for (let t = R.a + 12; t < R.b - 12; t += tStep) {
      const along = t + rng.range(-2, 2);
      for (const o of [-4.5, 4.5]) {
        const x = R.axis === 'z' ? R.c + o : along, z = R.axis === 'z' ? along : R.c + o;
        trees.push([x, 0, z, rng.range(0.7, 0.95), rng.next()]);
      }
    }
    for (let t = R.a + 20; t < R.b - 20; t += lStep) {
      for (const side of [-1, 1]) {
        const o = side * (GRID.blvd / 2 - 4.5);
        const x = R.axis === 'z' ? R.c + o : t, z = R.axis === 'z' ? t : R.c + o;
        // the arm reaches out over the carriageway
        const rot = R.axis === 'z' ? (side > 0 ? Math.PI : 0) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        lamps.push(instMatrix(x, 0, z, rot, 1, 1));
        const ax = R.axis === 'z' ? x - side * 2.6 : x, az = R.axis === 'z' ? z : z - side * 2.6;
        ls.add(new THREE.Vector3(ax, 10.2, az), NAV.warm, { intensity: 3.2, size: 1.6 });
      }
    }
  }
  buildTrees(root, trees, M, 'boulevard-trees');
  const g = lampShape.toGeometry();
  g.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(lamps.length).fill(M.style.spireDark), 1));
  const mesh = new THREE.InstancedMesh(g, M.buildings, lamps.length);
  lamps.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.castShadow = true;
  mesh.computeBoundingSphere();
  mesh.userData.minPx = 1.5;
  mesh.name = 'lamp-posts';
  root.add(mesh);
  ls.build(root, { name: 'lamp-lights', minPx: 1.2 });
  return { trees: trees.length, lamps: lamps.length };
}

// ------------------------------------------------------------------ the spire plaza: colonnade, pools, parterres
function buildSpirePlaza(root, B, M, ctx) {
  const P4 = PLATEAUS[4], y = P4.h;
  const ls = new LightSet();
  const sh = new Shape();
  const rc = 985;
  const finAt = (a) => { for (let k = 0; k < 6; k++) { let d = Math.abs(((a - (k / 6) * TAU) + Math.PI * 3) % TAU - Math.PI); if (d < 0.06) return true; } return false; };
  // colonnade ring with a gilded entablature
  const n = Math.round((TAU * rc) / 14);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    if (finAt(a)) continue;
    const x = SPIRE.x + Math.sin(a) * rc, z = SPIRE.z + Math.cos(a) * rc * 1.04;
    sh.prism(circle(2.4, 12, x, z), y, y + 34, Z.STONE, null);
    sh.prism(rect(6, 6, x, z), y + 34, y + 36, Z.STONE, null);
    if (i % 4 === 0) ls.add(new THREE.Vector3(x, y + 33, z), NAV.warm, { intensity: 2.6, size: 2.2 });
  }
  const ring = (r, yy) => superellipse(r, r * 1.04, 2.0, 256, SPIRE.x, SPIRE.z).map(([x, z]) => [x, yy, z]);
  sh.loft([ring(rc - 5, y + 36), ring(rc + 5, y + 36), ring(rc + 5, y + 42), ring(rc - 5, y + 42), ring(rc - 5, y + 36)], Z.METAL, { closed: true, crease: 50 });
  // six reflecting pools between the fins, flanked by parterres and lamp obelisks
  const water = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0 });
  cityPatch(water, 'water', { uWaterDeep: { value: new THREE.Vector3(0.02, 0.05, 0.07) }, uWaterShallow: { value: new THREE.Vector3(0.04, 0.09, 0.11) } }, { key: 'pool' });
  const pools = new Shape();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + TAU / 12;
    const ca = Math.sin(a), sa = Math.cos(a), px = Math.cos(a), pz = -Math.sin(a);
    const r0 = spireR(y) * 1.5, r1 = 900;
    const pt = (r, w) => [SPIRE.x + ca * r + px * w, SPIRE.z + (sa * r + pz * w) * 1.04];
    const poly = [pt(r0, -26), pt(r1, -70), pt(r1, 70), pt(r0, 26)];
    const rim = [pt(r0 - 8, -34), pt(r1 + 8, -80), pt(r1 + 8, 80), pt(r0 - 8, 34)];
    sh.prism(rim, y, y + 1.6, Z.STONE, null);
    pools.cap(poly, y + 1.2, 0);
    for (const s of [-1, 1]) {
      const g = [pt(r0, s * 40), pt(r1, s * 92), pt(r1, s * 150), pt(r0, s * 70)];
      sh.prism(g, y, y + 1.0, Z.STONE, Z.GARDEN);
      for (let r = r0 + 30; r < r1; r += 60) {
        const w = 40 + (r - r0) / (r1 - r0) * 52;
        const [ox, oz] = pt(r, s * (w - 5));
        sh.prism(rect(3, 3, ox, oz), y, y + 14, Z.STONE, null);
        sh.cone(ox, oz, 2.1, 0.2, y + 14, y + 19, Z.METAL, 4);
        ls.add(new THREE.Vector3(ox, y + 16, oz), NAV.warm, { intensity: 3, size: 1.8 });
      }
    }
  }
  B.get(M.stone).add(sh);
  const pm = new THREE.Mesh(pools.toGeometry(), water);
  pm.receiveShadow = true;
  pm.name = 'plaza-pools';
  root.add(pm);
  ls.build(root, { name: 'plaza-lights' });
}

// ------------------------------------------------------------------ promenades along the terrace edges
function buildTerracePromenades(root, M, rng) {
  const trees = [], ls = new LightSet();
  for (let k = 0; k < 4; k++) {
    const P = PLATEAUS[k];
    const N = Math.round((TAU * (P.a + P.b) * 0.5) / 26);
    for (let i = 0; i < N; i++) {
      const t = (i / N) * TAU, c = Math.cos(t), s = Math.sin(t);
      const ex = P.a * Math.sign(c) * Math.pow(Math.abs(c), 2 / P.n), ez = P.cz + P.b * Math.sign(s) * Math.pow(Math.abs(s), 2 / P.n);
      const l = Math.hypot(ex - SPIRE.x, ez - SPIRE.z) || 1;
      const inset = 26;
      const x = ex - ((ex - SPIRE.x) / l) * inset, z = ez - ((ez - SPIRE.z) / l) * inset;
      if (plateauRho(k, x, z) > 0.999 || (k < 4 && plateauRho(k + 1, x, z) < 1.02)) continue;
      trees.push([x, P.h, z, rng.range(0.75, 1.0), rng.next()]);
      if (i % 2 === 0) ls.add(new THREE.Vector3(ex - ((ex - SPIRE.x) / l) * 10, P.h + 6, ez - ((ez - SPIRE.z) / l) * 10), NAV.warm, { intensity: 2.4, size: 1.6 });
    }
  }
  buildTrees(root, trees, M, 'promenade-trees');
  ls.build(root, { name: 'promenade-lights' });
  return trees.length;
}

export function buildExtras(M, ctx, lib) {
  const root = new THREE.Group();
  root.name = 'extras';
  const rng = new RNG(97531);
  const B = new ShapeBatch();
  const placed = lib ? lib.placed : [];
  const nTraffic = buildGroundTraffic(root, rng);
  const sign = buildSignage(root, placed, rng);
  B.get(M.steel).add(sign.frames);
  buildHoloRings(root, ctx);
  const roofs = buildRooftops(root, M, placed, rng);
  const bridges = buildSkyBridges(B, M, placed, rng);
  buildSailboats(root, M, ctx, rng);
  const blvd = buildBoulevards(root, M, rng);
  buildSpirePlaza(root, B, M, ctx);
  const prom = buildTerracePromenades(root, M, rng);
  B.build(root, { name: 'extras' });
  console.log(`[city] extras: ${JSON.stringify({ groundTraffic: nTraffic, banners: sign.banners, billboards: sign.boards, helipads: roofs.pads, parkedCars: roofs.cars, skyBridges: bridges, boulevardTrees: blvd.trees, lampPosts: blvd.lamps, promenadeTrees: prom })}`);
  return root;
}
