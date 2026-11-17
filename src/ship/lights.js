// Point-sprite light systems: blinking navigation lights, steady glows, travelling light pulses.
import * as THREE from 'three';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG } from '../lib/glsl.js';

const VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
attribute vec3 aColor;
attribute vec4 aBlink; // x: period (s, 0 = steady), y: phase, z: duty, w: size (metres)
uniform float uTime;
uniform float uPx;
uniform float uViewH;   // viewport height (px)
uniform float uMinPx;
varying vec3 vColor;
varying float vOn;
varying float vSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float on = 1.0;
  if (aBlink.x > 0.0) {
    float ph = fract(uTime / aBlink.x + aBlink.y);
    // sharp flash with a short afterglow
    on = smoothstep(0.0, 0.02, ph) * (1.0 - smoothstep(aBlink.z, aBlink.z + 0.06, ph));
  }
  vOn = on;
  // world-size sprite with a pixel floor so lights stay visible from far away
  float dist = max(-mv.z, 1.0);
  float px = aBlink.w * projectionMatrix[1][1] * uViewH * 0.5 / dist;
  float size = max(px * 6.0, uMinPx * uPx);
  gl_PointSize = clamp(size, 1.0, 256.0);
  vSize = gl_PointSize;
  // Far lights shrink below the floor: compensate brightness so they fade gracefully
  vColor = aColor * clamp(px * 6.0 / (uMinPx * uPx) + 0.35, 0.35, 1.0);
  if (on < 0.01) gl_PointSize = 0.0;
  ${LOGDEPTH_VERT}
}
`;

const FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
uniform float uPx;
varying vec3 vColor;
varying float vOn;
varying float vSize;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float r = length(p);
  float core = exp(-r * r * 22.0);
  float halo = exp(-r * 4.5) * 0.35;
  float I = (core * 1.6 + halo) * (1.0 - smoothstep(0.85, 1.0, r));
  if (I * vOn < 0.002) discard;
  gl_FragColor = vec4(vColor * I * vOn, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

export const lightUniforms = {
  uTime: { value: 0 },
  uPx: { value: 1 },
  uViewH: { value: 1080 },
};

export class LightSet {
  constructor() {
    this.pos = [];
    this.col = [];
    this.blink = [];
  }
  /** color: THREE.Color (HDR allowed via intensity), period 0 = steady */
  add(p, color, { intensity = 6, period = 0, phase = 0, duty = 0.08, size = 1.5 } = {}) {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(color.r * intensity, color.g * intensity, color.b * intensity);
    this.blink.push(period, phase, duty, size);
    return this;
  }
  get count() { return this.pos.length / 3; }
  build(parent, { minPx = 2.4, name = 'lights' } = {}) {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aBlink', new THREE.Float32BufferAttribute(this.blink, 4));
    g.computeBoundingSphere();
    const m = new THREE.ShaderMaterial({
      uniforms: { ...lightUniforms, uMinPx: { value: minPx } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.name = name;
    pts.renderOrder = 5;
    parent.add(pts);
    return pts;
  }
}

export const NAV = {
  red: new THREE.Color(1.0, 0.1, 0.06),
  green: new THREE.Color(0.1, 1.0, 0.35),
  white: new THREE.Color(1.0, 0.98, 0.95),
  amber: new THREE.Color(1.0, 0.6, 0.15),
  cyan: new THREE.Color(0.35, 0.85, 1.0),
  warm: new THREE.Color(1.0, 0.78, 0.5),
};
