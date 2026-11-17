// Engine builder: magnetic-nozzle bells with white-hot throats, coil rings and layered exhaust plumes.
import * as THREE from 'three';
import { lathe, beamMatrix } from '../lib/geo.js';
import { TAU } from '../lib/rng.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG, NOISE } from '../lib/glsl.js';
import { NAV } from './lights.js';

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
  vec3 hot = vec3(0.9, 0.95, 1.0);
  vec3 mid = vec3(0.3, 0.62, 1.0);
  vec3 cool = vec3(0.18, 0.3, 0.9);
  vec3 c = mix(hot, mid, smoothstep(0.0, 0.35, t));
  c = mix(c, cool, smoothstep(0.35, 1.0, t));
  float I = mix(3.2, 0.18, pow(t, 0.45));
  float band = 0.7 + 0.3 * pow(0.5 + 0.5 * cos(t * 6.2831 * 6.0), 4.0);
  float sh = 0.92 + 0.08 * sin(uTime * 23.0 + t * 40.0) * sin(uTime * 7.0 + vUv.x * 60.0);
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
  float s = vUv.y;
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(normalize(vN), V));
  float thick = pow(ndv, 2.2);
  float fall = exp(-s * 3.6) * (1.0 - smoothstep(0.7, 1.0, s)) * smoothstep(0.0, 0.03, s);
  float diamonds = 1.0 + uDiamonds * pow(0.5 + 0.5 * cos(s * 6.2831 * 8.0), 12.0) * exp(-s * 5.0);
  float n = snoise(vec3(vUv.x * 10.0, s * 16.0 - uTime * 7.0, uTime * 0.5)) * 0.5 + 0.5;
  vec3 col = mix(uCore, uEdge, smoothstep(0.0, 0.5, s));
  float I = uGain * fall * diamonds * (0.7 + 0.6 * n) * thick * uThrottle;
  gl_FragColor = vec4(col * I, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

export function createEngineSystem() {
  const shared = { uTime: { value: 0 }, uThrottle: { value: 1.0 } };
  const nozzleMat = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: NOZZLE_VERT, fragmentShader: NOZZLE_FRAG });
  nozzleMat.userData.castShadow = false;
  const plumeMat = (core, edge, gain, diamonds) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...shared, uCore: { value: core }, uEdge: { value: edge }, uGain: { value: gain }, uDiamonds: { value: diamonds } },
      vertexShader: NOZZLE_VERT,
      fragmentShader: PLUME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    m.userData.castShadow = false;
    return m;
  };
  const coreMat = plumeMat(new THREE.Vector3(0.8, 0.92, 1.0), new THREE.Vector3(0.35, 0.6, 1.0), 0.9, 1.6);
  const sheathMat = plumeMat(new THREE.Vector3(0.4, 0.62, 1.0), new THREE.Vector3(0.38, 0.32, 1.0), 0.14, 0.4);
  return { shared, nozzleMat, coreMat, sheathMat, update(t) { shared.uTime.value = t; } };
}

/**
 * Adds one engine. The bell opens toward -z with its throat at (cx, cy, zThroat).
 */
export function addEngine(sys, batch, group, plumes, lights, M, darkI, { cx, cy, zThroat, rThroat, rExit, len, coils = 3, plumeLen = 900, segs = 64 }) {
  const N = 20;
  const prof = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    prof.push([rThroat + (rExit - rThroat) * Math.pow(t, 0.62), zThroat - len * t]);
  }
  const T = new THREE.Matrix4().makeTranslation(cx, cy, 0);
  const thick = Math.max(2, rExit * 0.035);
  const outer = prof.map(([r, z]) => [r + thick, z]).reverse();
  batch.add(lathe(outer, { segments: segs, tile: 24 }), M.hullBlack, T);
  // housing collar where the bell meets the hull
  batch.add(lathe([[rThroat + thick * 3, zThroat - 4], [rThroat + thick * 3, zThroat + 30]], { segments: segs }), M.armorDark, T);
  // white-hot throat
  batch.add(new THREE.CircleGeometry(rThroat * 1.02, segs).rotateY(Math.PI), M.glowThroat, new THREE.Matrix4().makeTranslation(cx, cy, zThroat - 0.4));
  const inner = new THREE.Mesh(lathe(prof, { segments: segs, uvMode: 'unit' }), sys.nozzleMat);
  inner.position.set(cx, cy, 0);
  group.add(inner);
  // exit lip & coils
  batch.add(new THREE.TorusGeometry(rExit + thick, thick * 0.9, 8, segs), M.chrome, new THREE.Matrix4().makeTranslation(cx, cy, zThroat - len));
  for (let q = 0; q < coils; q++) {
    const t = (q + 0.55) / coils;
    const r = rThroat + (rExit - rThroat) * Math.pow(t, 0.62) + thick + rExit * 0.03;
    const z = zThroat - len * t;
    batch.add(new THREE.TorusGeometry(r, rExit * 0.04, 8, segs), M.hullDark, new THREE.Matrix4().makeTranslation(cx, cy, z));
    batch.add(new THREE.TorusGeometry(r + rExit * 0.035, rExit * 0.01, 6, segs), M.glowCyanSoft, new THREE.Matrix4().makeTranslation(cx, cy, z));
  }
  // cooling ribs along the bell
  const ribs = Math.max(12, Math.round(segs / 2));
  const m4 = new THREE.Matrix4();
  for (let j = 0; j < ribs; j++) {
    const phi = (j / ribs) * TAU;
    for (let i = 0; i < N; i += 4) {
      const [ra, za] = outer[N - i], [rb, zb] = outer[Math.max(0, N - i - 4)];
      const a = new THREE.Vector3(cx + Math.cos(phi) * (ra + 0.4), cy + Math.sin(phi) * (ra + 0.4), za);
      const b = new THREE.Vector3(cx + Math.cos(phi) * (rb + 0.4), cy + Math.sin(phi) * (rb + 0.4), zb);
      beamMatrix(a, b, Math.max(1, rExit * 0.022), Math.max(0.8, rExit * 0.018), new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0), m4, 0.5);
      darkI.add(m4);
    }
  }
  // plumes
  const zExit = zThroat - len;
  const mk = (r0, r1, L, mat) => {
    const p = [];
    for (let i = 0; i <= 20; i++) {
      const s = i / 20;
      p.push([r0 + (r1 - r0) * Math.pow(s, 0.75), zExit - 2 - L * s]);
    }
    // reversed (z increasing) so the outward faces are front faces
    const g = lathe(p.slice().reverse(), { segments: 40, uvMode: 'unit' });
    // flip v so 0 = nozzle
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(cx, cy, 0);
    mesh.renderOrder = 6;
    plumes.add(mesh);
  };
  mk(rExit * 0.3, rExit * 0.45, plumeLen * 0.5, sys.coreMat);
  mk(rExit * 0.85, rExit * 1.9, plumeLen, sys.sheathMat);
  return zExit;
}

export { NAV };
