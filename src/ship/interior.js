// Shaders for inhabited interiors: self-lit landscapes, instanced buildings and clouds,
// with physically motivated haze inside the Arcadia cylinder.
import * as THREE from 'three';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG, HASH, HABITAT_HAZE } from '../lib/glsl.js';
import { SHIP } from '../world.js';

export const habitatUniforms = {
  uHab: { value: new THREE.Vector4(SHIP.arcadia.Ri, SHIP.arcadia.z0, SHIP.arcadia.z1, 0.00034) },
  uHazeColor: { value: new THREE.Vector3(0.6, 0.66, 0.76) },
  uDaylight: { value: 0.82 },
  uSunlineColor: { value: new THREE.Vector3(1.0, 0.88, 0.7) },
  uTime: { value: 0 },
};

const SURFACE_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}
`;

const SURFACE_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${HABITAT_HAZE}
uniform sampler2D uMap;
uniform sampler2D uEmis;
uniform vec3 uSunlineColor;
uniform float uLight;
uniform float uEmisGain;
uniform vec2 uRepeat;
uniform float uSwap;
uniform float uHaze;
uniform float uFlip;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec2 uv = vUv;
  if (uSwap > 0.5) uv = vec2(vUv.y, vUv.x);
  uv *= uRepeat;
  if (uFlip > 0.5) uv.x = 1.0 - uv.x;
  vec3 alb = texture2D(uMap, uv).rgb;
  vec3 em = texture2D(uEmis, uv).rgb;
  // Light from the axial sunline: surfaces facing the axis are lit evenly.
  vec3 toAxis = normalize(vec3(-vWorld.xy, 0.0));
  float facing = clamp(dot(normalize(vNormalW), toAxis), 0.0, 1.0);
  float day = uDaylight;
  vec3 lit = alb * uSunlineColor * uLight * (0.25 + 0.75 * facing) * (0.06 + 0.94 * day);
  // city lights come up as the sunline dims
  lit += em * uEmisGain * (0.35 + 1.4 * (1.0 - day));
  if (uHaze > 0.5) lit = applyHabitatHaze(lit, vWorld);
  gl_FragColor = vec4(lit, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

export function makeSurfaceMaterial({ map, emissive, light = 1.0, emisGain = 1.0, repeat = [1, 1], swap = false, haze = false, flip = false, side = THREE.FrontSide }) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...habitatUniforms,
      uMap: { value: map },
      uEmis: { value: emissive },
      uLight: { value: light },
      uEmisGain: { value: emisGain },
      uRepeat: { value: new THREE.Vector2(repeat[0], repeat[1]) },
      uSwap: { value: swap ? 1 : 0 },
      uHaze: { value: haze ? 1 : 0 },
      uFlip: { value: flip ? 1 : 0 },
    },
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    side,
  });
  m.userData.castShadow = false;
  m.userData.receiveShadow = false;
  return m;
}

/* ---------------------------------- Instanced buildings ---------------------------------- */
const BUILDING_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vNormalL;
varying vec3 vWorld;
varying float vSeed;
varying vec3 vTint;
#ifdef USE_INSTANCING_COLOR
#endif
void main() {
  mat4 im = instanceMatrix;
  vScale = vec3(length(im[0].xyz), length(im[1].xyz), length(im[2].xyz));
  vLocal = position;
  vNormalL = normal;
  vec4 wp = modelMatrix * im * vec4(position, 1.0);
  vWorld = wp.xyz;
  vSeed = fract(sin(dot(im[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}
`;

const BUILDING_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${HASH}
${HABITAT_HAZE}
uniform vec3 uSunlineColor;
uniform float uLight;
uniform float uHaze;
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vNormalL;
varying vec3 vWorld;
varying float vSeed;
varying vec3 vTint;
void main() {
  // local Y = up (toward the habitat axis); faces: roof (|n.y|), walls
  vec3 n = vNormalL;
  vec3 p = (vLocal + 0.5) * vScale; // metres within the building
  vec3 base = vTint;
  float day = uDaylight;
  float shade;
  vec3 em = vec3(0.0);
  if (abs(n.y) > 0.5) {
    shade = n.y > 0.0 ? 1.0 : 0.2;
    // rooftop detail
    float g = step(0.5, fract(p.x * 0.11 + vSeed)) * step(0.5, fract(p.z * 0.13));
    base *= 0.85 + 0.15 * g;
  } else {
    shade = abs(n.x) > 0.5 ? 0.72 : 0.58;
    vec2 f = abs(n.x) > 0.5 ? vec2(p.z, p.y) : vec2(p.x, p.y);
    vec2 cell = floor(f / vec2(2.6, 3.4));
    vec2 w = fract(f / vec2(2.6, 3.4));
    float win = step(0.18, w.x) * step(w.x, 0.82) * step(0.25, w.y) * step(w.y, 0.8);
    float litW = step(0.55 - 0.25 * (1.0 - day), hash12(cell + vSeed * 91.0));
    base = mix(base, vec3(0.06, 0.08, 0.1), win * 0.85);
    vec3 wc = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.9, 0.75), hash12(cell * 1.7 + vSeed));
    em = wc * win * litW * (0.6 + 2.2 * (1.0 - day));
  }
  vec3 col = base * uSunlineColor * uLight * shade * (0.06 + 0.94 * day) + em;
  if (uHaze > 0.5) col = applyHabitatHaze(col, vWorld);
  gl_FragColor = vec4(col, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

export function makeBuildingMaterial({ light = 1.0, haze = false } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...habitatUniforms, uLight: { value: light }, uHaze: { value: haze ? 1 : 0 } },
    vertexShader: BUILDING_VERT,
    fragmentShader: BUILDING_FRAG,
  });
  m.userData.castShadow = false;
  return m;
}

/* ---------------------------------------- Clouds ---------------------------------------- */
const CLOUD_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${HABITAT_HAZE}
uniform sampler2D uMap;
uniform vec2 uRepeat;
uniform vec2 uOffset;
uniform vec3 uSunlineColor;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec4 c = texture2D(uMap, vUv * uRepeat + uOffset);
  if (c.a < 0.01) discard;
  // Lit from the axis above; the side facing the ground is darker
  vec3 toAxis = normalize(vec3(-vWorld.xy, 0.0));
  vec3 V = normalize(cameraPosition - vWorld);
  float rCam = length(cameraPosition.xy);
  float rHere = length(vWorld.xy);
  float fromBelow = step(rHere, rCam); // camera nearer the hull than the cloud: seeing the underside
  float shade = mix(1.0, 0.62, fromBelow);
  float day = uDaylight;
  vec3 col = c.rgb * uSunlineColor * shade * (0.05 + 0.95 * day) * 1.05;
  col = applyHabitatHaze(col, vWorld);
  gl_FragColor = vec4(col, c.a * 0.92);
  ${LOGDEPTH_FRAG}
}
`;

export function makeCloudMaterial(map, repeat = [6, 3]) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...habitatUniforms,
      uMap: { value: map },
      uRepeat: { value: new THREE.Vector2(repeat[0], repeat[1]) },
      uOffset: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: SURFACE_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  m.userData.castShadow = false;
  return m;
}

/* -------------------------------- Additive glow volumes -------------------------------- */
const GLOW_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
uniform vec3 uColor;
uniform float uPower;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float f = abs(dot(normalize(vNormalW), V));
  float I = pow(f, uPower);
  gl_FragColor = vec4(uColor * I, 1.0);
  ${LOGDEPTH_FRAG}
}
`;
export function makeGlowVolume(color, power = 2.0) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uPower: { value: power } },
    vertexShader: SURFACE_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  m.userData.castShadow = false;
  return m;
}
