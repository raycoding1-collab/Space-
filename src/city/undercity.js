// The undercity: towers hanging from the belly like stalactites, lit from below by four caged reactor
// suns, with ventral launch rails running the length of the keel.
import * as THREE from 'three';
import { Shape, ShapeBatch, Z, rect, circle } from './geo.js';
import { beamMatrix } from '../lib/geo.js';
import { RNG, TAU, clamp } from '../lib/rng.js';
import { REACTORS, Z_BOW, Z_STERN } from './layout.js';
import { crossSection } from './foundation.js';
import { Library } from './districts.js';
import { LightSet, NAV } from '../ship/lights.js';
import { makeConduitMaterial } from '../ship/conduit.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG, NOISE } from '../lib/glsl.js';
import { CITY_U } from './shaders.js';

/** y of the belly surface below (x, z). */
export function bellyY(x, z) {
  const s = crossSection(z);
  const ax = Math.abs(x);
  if (ax > s.X) return null;
  const b = s.belly;
  for (let i = 0; i < b.length - 1; i++) {
    const [x0, y0] = b[i], [x1, y1] = b[i + 1];
    if (ax <= x0 && ax >= x1) { const t = (x0 - ax) / Math.max(1e-6, x0 - x1); return y0 + (y1 - y0) * t; }
  }
  return b[b.length - 1][1];
}

const SUN_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vL = position; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}`;
const SUN_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${NOISE}
uniform float uCityTime;
uniform float uSeed;
uniform float uGlow;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float ndv = clamp(dot(normalize(vN), V), 0.0, 1.0);
  vec3 p = normalize(vL);
  float t = uCityTime * 0.05 + uSeed;
  float n = fbm(p * 3.0 + vec3(t, -t * 0.7, t * 0.4), 4) * 0.5 + 0.5;
  float cells = ridged(p * 7.0 + vec3(-t * 1.3, t, 0.0), 3);
  vec3 hot = vec3(1.0, 0.93, 0.78), warm = vec3(1.0, 0.62, 0.28);
  vec3 col = mix(warm, hot, smoothstep(0.35, 0.75, n)) * (0.75 + 0.5 * cells);
  float limb = 0.55 + 0.45 * pow(ndv, 0.5);
  gl_FragColor = vec4(col * uGlow * limb, 1.0);
  ${LOGDEPTH_FRAG}
}`;
const HALO_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
uniform float uGlow;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float ndv = abs(dot(normalize(vN), V));
  float g = pow(ndv, 3.0) * uGlow;
  gl_FragColor = vec4(vec3(1.0, 0.66, 0.34) * g, 1.0);
  ${LOGDEPTH_FRAG}
}`;

export function buildUndercity(M, ctx) {
  const root = new THREE.Group();
  root.name = 'undercity';
  const B = new ShapeBatch();
  const rng = new RNG(1717);
  const lib = new Library(M);
  const lights = new LightSet();

  // ---------------------------------------------------------------- hanging towers
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
  const qy = new THREE.Quaternion();
  const styles = ['underDark', 'underBronze', 'underGlass', 'spireDark', 'midDark'];
  let n = 0;
  for (let z = Z_STERN + 1600; z < 9600; z += 150) {
    for (let x = -4200; x <= 4200; x += 150) {
      const px = x + rng.range(-50, 50), pz = z + rng.range(-50, 50);
      const y = bellyY(px, pz);
      if (y === null) continue;
      const s = crossSection(pz);
      const core = 1 - clamp(Math.abs(px) / (s.X * 0.7), 0, 1);
      // clusters around the reactor suns, thinning toward the flanks
      let near = 0;
      for (const r of REACTORS) near = Math.max(near, 1 - clamp(Math.hypot(px - r.x, pz - r.z) / 3200, 0, 1));
      const p = 0.08 + 0.5 * core * core + 0.4 * near;
      if (!rng.chance(p * 0.55)) continue;
      // keep clear of the reactors and the launch rails
      let blocked = false;
      for (const r of REACTORS) if (Math.hypot(px - r.x, pz - r.z) < r.R * 2.6) blocked = true;
      if (Math.abs(Math.abs(px) - 520) < 90) blocked = true;
      if (blocked) continue;
      const H = (120 + 900 * Math.pow(rng.next(), 1.6) * (0.35 + 0.65 * Math.max(core, near))) * (0.5 + 0.5 * clamp((-y - 900) / 1200, 0, 1));
      const arch = H > 380 ? rng.pick(['needle', 'crystal', 'twisted', 'ziggurat', 'crowned', 'cylinders']) : rng.pick(['hexTower', 'stack', 'cylinders', 'podiumTower', 'crystal']);
      const v = lib.variant(arch, Math.max(60, H), rng.int(0, 1));
      qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, TAU));
      const q = flip.clone().multiply(qy);
      const sc = rng.range(0.7, 1.0);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(px, y + 30, pz), q, new THREE.Vector3(sc, Math.max(60, H) / v.h, sc));
      lib.add(v, rng.pick(styles), m);
      n++;
    }
  }
  lib.build(root);

  // ---------------------------------------------------------------- reactor suns
  const sunGeo = new THREE.SphereGeometry(1, 64, 32);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cageSegs = [];
  REACTORS.forEach((r, k) => {
    const c = new THREE.Vector3(r.x, r.y, r.z);
    const mat = new THREE.ShaderMaterial({ uniforms: { uCityTime: CITY_U.uCityTime, uSeed: { value: k * 3.1 }, uGlow: { value: 1.9 } }, vertexShader: SUN_VERT, fragmentShader: SUN_FRAG });
    const sun = new THREE.Mesh(sunGeo, mat);
    sun.position.copy(c); sun.scale.setScalar(r.R);
    root.add(sun);
    const halo = new THREE.Mesh(sunGeo, new THREE.ShaderMaterial({ uniforms: { uGlow: { value: 0.45 } }, vertexShader: SUN_VERT, fragmentShader: HALO_FRAG, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }));
    halo.position.copy(c); halo.scale.setScalar(r.R * 1.9);
    halo.renderOrder = 2;
    root.add(halo);
    // light from the sun onto the belly and the hanging towers
    const pl = new THREE.PointLight(new THREE.Color(1.0, 0.72, 0.45), 1.2e6, 0, 2);
    pl.position.copy(c);
    root.add(pl);
    // lattice cage: meridians and rings
    const Rc = r.R * 1.45;
    const P = (th, ph) => new THREE.Vector3(c.x + Math.sin(th) * Math.sin(ph) * Rc, c.y + Math.cos(th) * Rc, c.z + Math.sin(th) * Math.cos(ph) * Rc);
    const nm = 16, nr = 7;
    for (let m = 0; m < nm; m++) for (let i = 0; i < 16; i++) cageSegs.push([P((i / 16) * Math.PI, (m / nm) * TAU), P(((i + 1) / 16) * Math.PI, (m / nm) * TAU), 9]);
    for (let l = 1; l < nr; l++) for (let j = 0; j < 48; j++) cageSegs.push([P((l / nr) * Math.PI, (j / 48) * TAU), P((l / nr) * Math.PI, ((j + 1) / 48) * TAU), 7]);
    // equatorial gantry ring
    for (let j = 0; j < 64; j++) cageSegs.push([P(Math.PI / 2, (j / 64) * TAU).multiplyScalar(1).add(new THREE.Vector3()), P(Math.PI / 2, ((j + 1) / 64) * TAU), 22]);
    // suspension pylons to the belly
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * TAU + Math.PI / 4;
      const top = P(0.35, a);
      const bx = c.x + Math.sin(a) * Rc * 1.4, bz = c.z + Math.cos(a) * Rc * 1.4;
      const by = bellyY(bx, bz) ?? (c.y + 1200);
      cageSegs.push([top, new THREE.Vector3(bx, by + 20, bz), 26]);
    }
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * TAU;
      lights.add(P(Math.PI / 2, a).add(new THREE.Vector3(0, -14, 0)), NAV.red, { intensity: 8, size: 6, period: 2.4, phase: j / 12, duty: 0.15 });
    }
  });
  {
    const mesh = new THREE.InstancedMesh(box, M.darkPlain, cageSegs.length);
    const m4 = new THREE.Matrix4();
    cageSegs.forEach(([a, b, w], i) => { beamMatrix(a, b, w, w, null, m4, w); mesh.setMatrixAt(i, m4); });
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
  }

  // ---------------------------------------------------------------- ventral launch rails
  {
    const railMat = makeConduitMaterial({ color: new THREE.Vector3(0.3, 0.8, 1.0), axis: new THREE.Vector3(0, 0, 1), speed: 1400, base: 0.25, packet: 6, spacing: 3000 });
    const zA = Z_STERN + 2600, zB = Z_BOW - 5200;
    const shots = [];
    for (const side of [-1, 1]) {
      const x = side * 520;
      const pts = [];
      for (let z = zA; z <= zB; z += 250) {
        const y = (bellyY(x, z) ?? -2000) - 90;
        pts.push(new THREE.Vector3(x, y, z));
      }
      // smooth the rail line
      for (let it = 0; it < 4; it++) for (let i = 1; i < pts.length - 1; i++) pts[i].y = (pts[i - 1].y + 2 * pts[i].y + pts[i + 1].y) / 4;
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 6, 8, false), railMat);
      root.add(tube);
      const sh = B.get(M.steel);
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i];
        const by = bellyY(x, p.z) ?? p.y + 90;
        sh.prism(rect(14, 10, x, p.z), p.y + 6, by + 10, Z.METAL, null);
        // accelerator ring
        const ring = new Shape();
        const R1 = 54, R0 = 40;
        const ringPts = (r, zz) => circle(r, 24).map(([a, b]) => [a, b, zz]);
        const Rm = (R0 + R1) / 2;
        ring.loft([ringPts(R0, -6), ringPts(R1, -6), ringPts(R1, 6), ringPts(R0, 6), ringPts(R0, -6)], Z.METAL, { closed: true, crease: 60, orient: (q) => { const l = Math.hypot(q[0], q[1]) || 1; return [q[0] / l * (l - Rm), q[1] / l * (l - Rm), q[2]]; } });
        sh.add(ring, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
        const trim = new Shape();
        trim.loft([circle(R0 - 0.5, 24).map(([a, b]) => [a, b, -3]), circle(R0 - 0.5, 24).map(([a, b]) => [a, b, 3])], Z.TRIM, { closed: true, orient: (q) => [-q[0], -q[1], 0] });
        sh.add(trim, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      }
      shots.push(curve);
    }
    // launched craft streaking along the rails
    const L = new LightSet();
    const defs = [];
    shots.forEach((curve, k) => { for (let j = 0; j < 3; j++) { defs.push({ curve, ph: j / 3 + k * 0.17 }); L.add(new THREE.Vector3(), new THREE.Color(0.75, 0.9, 1.0), { intensity: 16, size: 10 }); } });
    const pts = L.build(root, { name: 'launches', minPx: 3 });
    pts.frustumCulled = false;
    const attr = pts.geometry.attributes.position;
    const tmp = new THREE.Vector3();
    ctx.animated.push((t) => {
      defs.forEach((d, i) => {
        const u = (t * 0.035 + d.ph) % 1;
        d.curve.getPointAt(Math.pow(u, 1.8), tmp);
        attr.setXYZ(i, tmp.x, tmp.y, tmp.z);
      });
      attr.needsUpdate = true;
    });
  }
  B.build(root, { name: 'undercity' });
  lights.build(root, { name: 'undercity-lights' });
  console.log(`[city] undercity towers: ${n}`);
  return root;
}
