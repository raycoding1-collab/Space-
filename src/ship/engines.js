// Propulsion: a magnetic-nozzle fusion drive ringed by six auxiliary engines,
// with volumetric-looking exhaust plumes and shock diamonds.
import * as THREE from 'three';
import { lathe, beamMatrix, Batch, Instancer, cyl, tiledCylinderZ, surfaceMatrix } from '../lib/geo.js';
import { RNG, TAU, DEG } from '../lib/rng.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG, NOISE } from '../lib/glsl.js';
import { scatterCylinder } from './greebles.js';
import { LightSet, NAV } from './lights.js';

const NOZZLE_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}
`;
const NOZZLE_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
uniform float uTime;
uniform float uThrottle;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  float t = vUv.y; // 0 at throat → 1 at exit
  vec3 hot = vec3(0.85, 0.92, 1.0);
  vec3 mid = vec3(0.35, 0.55, 1.0);
  vec3 cool = vec3(0.42, 0.22, 0.85);
  vec3 c = mix(hot, mid, smoothstep(0.0, 0.45, t));
  c = mix(c, cool, smoothstep(0.45, 1.0, t));
  float I = mix(9.0, 0.6, pow(t, 0.55));
  // magnetic coil banding
  float band = 0.75 + 0.25 * pow(0.5 + 0.5 * cos(t * 6.2831 * 5.0), 3.0);
  // shimmer
  float sh = 0.9 + 0.1 * sin(uTime * 23.0 + t * 40.0) * sin(uTime * 7.0 + vUv.x * 60.0);
  gl_FragColor = vec4(c * I * band * sh * uThrottle, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

const PLUME_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${NOISE}
uniform float uTime;
uniform float uThrottle;
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uGain;
uniform float uDiamonds;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  float s = vUv.y;                       // 0 at nozzle → 1 at tail
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(normalize(vN), V));
  float thick = pow(ndv, 1.6);           // brighter through the centre of the column
  float fall = exp(-s * 3.2) * (1.0 - smoothstep(0.75, 1.0, s));
  float diamonds = 1.0 + uDiamonds * pow(0.5 + 0.5 * cos(s * 6.2831 * 7.0), 10.0) * exp(-s * 4.0);
  float n = snoise(vec3(vUv.x * 12.0, s * 18.0 - uTime * 6.0, uTime * 0.6)) * 0.5 + 0.5;
  float turb = 0.75 + 0.5 * n;
  vec3 col = mix(uCore, uEdge, smoothstep(0.0, 0.5, s) * 0.85 + (1.0 - thick) * 0.3);
  float I = uGain * fall * diamonds * turb * (0.25 + 0.75 * thick) * uThrottle;
  gl_FragColor = vec4(col * I, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

function makeNozzleMaterial(shared) {
  const m = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: NOZZLE_VERT, fragmentShader: NOZZLE_FRAG });
  m.userData.castShadow = false;
  return m;
}
function makePlumeMaterial(shared, { core, edge, gain, diamonds }) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...shared, uCore: { value: core }, uEdge: { value: edge }, uGain: { value: gain }, uDiamonds: { value: diamonds } },
    vertexShader: NOZZLE_VERT,
    fragmentShader: PLUME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  m.userData.castShadow = false;
  return m;
}

export function buildEngines(M, ctx) {
  const group = new THREE.Group();
  group.name = 'engines';
  const rng = new RNG(909);
  const batch = new Batch();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const darkI = new Instancer(box, M.trussDark);
  const trussI = new Instancer(box, M.truss);
  const greebleI = new Instancer(box, M.greeble, { colors: true });
  const lights = new LightSet();
  const m4 = new THREE.Matrix4();
  const shared = { uTime: { value: 0 }, uThrottle: { value: 1.0 } };
  ctx.animated.push((t) => { shared.uTime.value = t; });
  ctx.engineUniforms = shared;
  const nozzleMat = makeNozzleMaterial(shared);
  const plumes = new THREE.Group();
  plumes.name = 'plumes';

  // ---------------- Thrust frame ----------------
  const frame = [[60, -2590], [118, -2626], [300, -2742], [344, -2786], [344, -2880], [300, -2918], [150, -2934]];
  // profile goes toward -z: reverse so normals face outward
  batch.add(lathe(frame.slice().reverse(), { segments: 96, tile: 48 }), M.hullDark);
  batch.add(lathe([[345, -2850], [345, -2816]], { segments: 96, tile: 48 }), M.gold);
  batch.add(lathe([[346, -2880], [346, -2870]], { segments: 96 }), M.hab);
  scatterCylinder(greebleI, rng, { r: 344, z0: -2866, z1: -2800, count: 380, w: [3, 12], h: [1, 5], d: [3, 10] });
  // thrust beams from the spine into the frame
  for (let k = 0; k < 12; k++) {
    const phi = (k / 12) * TAU;
    beamMatrix(cyl(58, phi, -2480), cyl(300, phi, -2750), 8, 8, null, m4); trussI.add(m4);
  }
  // propellant tanks clustered on the frame
  for (let k = 0; k < 6; k++) {
    const phi = (k / 6) * TAU + 30 * DEG;
    const c = cyl(214, phi, -2700);
    const tank = lathe([[4, -70], [26, -58], [30, -40], [30, 40], [26, 58], [4, 70]], { segments: 32, tile: 24 });
    batch.add(tank, k % 2 ? M.gold : M.hullWarm, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
  }

  // ---------------- Engine bells ----------------
  const addEngine = (cx, cy, zThroat, rThroat, rExit, len, coils, plumeLen, main) => {
    const N = 28;
    const prof = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      prof.push([rThroat + (rExit - rThroat) * Math.pow(t, 0.62), zThroat - len * t]);
    }
    const T = new THREE.Matrix4().makeTranslation(cx, cy, 0);
    // outer skin (exit → throat so normals face out)
    const outer = prof.map(([r, z]) => [r + Math.max(2, rExit * 0.03), z]).reverse();
    batch.add(lathe(outer, { segments: main ? 128 : 48, tile: 24 }), M.hullBlack, T);
    // hot inner surface
    const innerG = lathe(prof, { segments: main ? 128 : 48, uvMode: 'unit' });
    const inner = new THREE.Mesh(innerG, nozzleMat);
    inner.position.set(cx, cy, 0);
    group.add(inner);
    // exit lip
    batch.add(new THREE.TorusGeometry(rExit + rExit * 0.02, Math.max(1.6, rExit * 0.025), 10, main ? 160 : 64), M.chrome, new THREE.Matrix4().makeTranslation(cx, cy, zThroat - len));
    // cooling ribs
    const ribs = main ? 72 : 24;
    for (let j = 0; j < ribs; j++) {
      const phi = (j / ribs) * TAU;
      for (let i = 0; i < N; i += 2) {
        const [ra, za] = outer[N - i], [rb, zb] = outer[Math.max(0, N - i - 2)];
        const a = new THREE.Vector3(cx + Math.cos(phi) * (ra + 0.6), cy + Math.sin(phi) * (ra + 0.6), za);
        const b = new THREE.Vector3(cx + Math.cos(phi) * (rb + 0.6), cy + Math.sin(phi) * (rb + 0.6), zb);
        beamMatrix(a, b, main ? 2.2 : 1.4, main ? 1.6 : 1.0, new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0), m4, 0.5);
        darkI.add(m4);
      }
    }
    // magnetic coils
    for (let q = 0; q < coils; q++) {
      const t = (q + 0.6) / coils;
      const r = rThroat + (rExit - rThroat) * Math.pow(t, 0.62) + rExit * 0.06;
      const z = zThroat - len * t;
      batch.add(new THREE.TorusGeometry(r, rExit * 0.035, 10, main ? 128 : 48), M.hullDark, new THREE.Matrix4().makeTranslation(cx, cy, z));
      batch.add(new THREE.TorusGeometry(r + rExit * 0.03, rExit * 0.009, 6, main ? 128 : 48), M.glowViolet, new THREE.Matrix4().makeTranslation(cx, cy, z));
    }
    // plumes: bright core + broad sheath
    const zExit = zThroat - len;
    const mk = (r0, r1, L, opts) => {
      const p = [];
      for (let i = 0; i <= 24; i++) {
        const s = i / 24;
        p.push([r0 + (r1 - r0) * Math.pow(s, 0.7), zExit - 4 - L * s]);
      }
      const g = lathe(p, { segments: 48, uvMode: 'unit' });
      const mesh = new THREE.Mesh(g, makePlumeMaterial(shared, opts));
      mesh.position.set(cx, cy, 0);
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      plumes.add(mesh);
    };
    mk(rExit * 0.32, rExit * 0.5, plumeLen * 0.55, { core: new THREE.Vector3(0.85, 0.92, 1.0), edge: new THREE.Vector3(0.45, 0.6, 1.0), gain: 1.1, diamonds: 2.2 });
    mk(rExit * 0.85, rExit * 2.4, plumeLen, { core: new THREE.Vector3(0.45, 0.62, 1.0), edge: new THREE.Vector3(0.45, 0.28, 1.0), gain: 0.11, diamonds: 0.6 });
    lights.add(new THREE.Vector3(cx, cy, zExit - 6), new THREE.Color(0.6, 0.75, 1.0), { intensity: 3, size: rExit * 0.12 });
    return zExit;
  };

  const zMainExit = addEngine(0, 0, -2934, 58, 196, 410, 5, 3200, true);
  for (let k = 0; k < 6; k++) {
    const phi = (k / 6) * TAU;
    const c = cyl(276, phi, 0);
    addEngine(c.x, c.y, -2926, 22, 70, 200, 3, 1500, false);
    // pylons
    beamMatrix(cyl(150, phi, -2920), cyl(250, phi, -2940), 10, 6, null, m4); trussI.add(m4);
  }
  group.add(plumes);

  // engine-light spill onto the stern
  const spill = new THREE.PointLight(new THREE.Color(0.55, 0.65, 1.0), 900, 4200, 1.15);
  spill.position.set(0, 0, zMainExit - 260);
  group.add(spill);

  // ---------------- Lights ----------------
  for (let k = 0; k < 12; k++) {
    const phi = (k / 12) * TAU;
    lights.add(cyl(350, phi, -2800), k % 3 === 0 ? NAV.white : NAV.amber, { period: k % 3 === 0 ? 2.2 : 0, phase: k / 12, duty: 0.05, size: 2.5, intensity: k % 3 === 0 ? 16 : 3 });
  }

  batch.build(group, { name: 'engines' });
  darkI.build(group, 'engine-ribs');
  trussI.build(group, 'engine-truss');
  greebleI.build(group, 'engine-greebles');
  lights.build(group, { name: 'engine-lights' });
  return { group, plumes, uniforms: shared };
}
