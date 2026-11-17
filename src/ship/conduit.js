// Energy conduits: emissive tubes and channels with data/energy packets racing along them.
import * as THREE from 'three';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG, HASH } from '../lib/glsl.js';

const VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vPos;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}
`;
const FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${HASH}
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uAxis;
uniform float uSpeed;
uniform float uBase;
uniform float uPacket;
uniform float uSpacing;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vView;
void main() {
  float s = dot(vPos, uAxis) - uTime * uSpeed;
  float k = floor(s / uSpacing);
  float f = fract(s / uSpacing);
  float on = step(0.4, hash11(k * 1.37 + 0.5));
  float packet = exp(-pow((f - 0.5) * 7.0, 2.0)) * on;
  float fine = pow(0.5 + 0.5 * sin(s * 0.3), 8.0) * 0.3;
  float fres = 0.6 + 0.4 * pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.5);
  vec3 c = uColor * (uBase + fine + packet * uPacket) * fres;
  gl_FragColor = vec4(c, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

export const conduitTime = { value: 0 };

export function makeConduitMaterial({ color = new THREE.Vector3(0.25, 0.75, 1.0), axis = new THREE.Vector3(0, 0, 1), speed = 240, base = 0.7, packet = 7, spacing = 160 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: conduitTime,
      uColor: { value: color },
      uAxis: { value: axis.clone().normalize() },
      uSpeed: { value: speed },
      uBase: { value: base },
      uPacket: { value: packet },
      uSpacing: { value: spacing },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
  m.userData.castShadow = false;
  return m;
}

// Arteries: tubes whose pulses travel along the tube's own length (TubeGeometry uv.x), outward from a source.
const ART_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}
`;
const ART_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${HASH}
uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uBase;
uniform float uPacket;
uniform float uSpacing;
uniform float uLength;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vView;
void main() {
  float s = vUv.x * uLength - uTime * uSpeed + uSeed * 97.0;
  float k = floor(s / uSpacing);
  float f = fract(s / uSpacing);
  float on = step(0.3, hash11(k * 1.37 + uSeed));
  float packet = exp(-pow((f - 0.5) * 6.0, 2.0)) * on;
  float fres = 0.6 + 0.4 * pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.5);
  vec3 c = uColor * (uBase + packet * uPacket) * fres;
  gl_FragColor = vec4(c, 1.0);
  ${LOGDEPTH_FRAG}
}
`;
export function makeArteryMaterial({ color = new THREE.Vector3(0.25, 0.75, 1.0), speed = 160, base = 0.55, packet = 5, spacing = 120, length = 1000, seed = 0 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: conduitTime, uColor: { value: color }, uSpeed: { value: speed }, uBase: { value: base },
      uPacket: { value: packet }, uSpacing: { value: spacing }, uLength: { value: length }, uSeed: { value: seed },
    },
    vertexShader: ART_VERT,
    fragmentShader: ART_FRAG,
  });
  m.userData.castShadow = false;
  return m;
}
