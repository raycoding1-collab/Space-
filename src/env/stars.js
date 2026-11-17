// Crisp resolution-independent starfield: ~260k point stars with spectral colours,
// a power-law brightness distribution, Milky Way concentration and diffraction spikes on the brightest.
import * as THREE from 'three';
import { RNG, clamp } from '../lib/rng.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG } from '../lib/glsl.js';
import { WORLD } from '../world.js';

// Approximate blackbody colour (Tanner Helland fit), returned linear-ish 0..1.
function kelvinToRGB(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.52 * Math.log(t - 10) - 305.04;
  return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
}

const VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
attribute float aBright;
attribute vec3 aColor;
attribute float aSpike;
uniform float uPx;
uniform float uExposure;
varying vec3 vColor;
varying float vSpike;
varying float vSize;
varying float vBright;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float b = aBright * uExposure;
  float size = (1.5 + 1.6 * sqrt(b)) * uPx;
  if (aSpike > 0.5) size = (18.0 + 4.0 * sqrt(b)) * uPx;
  gl_PointSize = clamp(size, 1.0, 220.0);
  vSize = gl_PointSize;
  vColor = aColor;
  vSpike = aSpike;
  vBright = b;
  ${LOGDEPTH_VERT}
}
`;

const FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
uniform float uPx;
varying vec3 vColor;
varying float vSpike;
varying float vSize;
varying float vBright;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * vSize;   // pixels from centre
  float r = length(p);
  float sigma = 0.62 * uPx;
  float core = exp(-r * r / (2.0 * sigma * sigma));
  float halo = exp(-r / (1.6 * uPx)) * 0.12;
  float I = core + halo;
  if (vSpike > 0.5) {
    float s = uPx;
    // 4-point diffraction spikes + soft glow
    float sx = exp(-abs(p.y) / (0.45 * s)) * exp(-abs(p.x) / (5.0 * s));
    float sy = exp(-abs(p.x) / (0.45 * s)) * exp(-abs(p.y) / (5.0 * s));
    vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * p;
    float sd = (exp(-abs(q.y) / (0.45 * s)) * exp(-abs(q.x) / (4.0 * s)) + exp(-abs(q.x) / (0.45 * s)) * exp(-abs(q.y) / (4.0 * s))) * 0.25;
    float glow = exp(-r / (5.0 * s)) * 0.18;
    I += (sx + sy) * 0.35 + sd * 0.5 + glow;
  }
  float fade = 1.0 - smoothstep(vSize * 0.42, vSize * 0.5, r);
  vec3 c = vColor * vBright * I * fade;
  if (max(c.r, max(c.g, c.b)) < 0.0004) discard;
  gl_FragColor = vec4(c, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

export function createStars({ count = 90000, bandCount = 170000 } = {}) {
  const rng = new RNG(4242);
  const total = count + bandCount;
  const pos = new Float32Array(total * 3);
  const bright = new Float32Array(total);
  const color = new Float32Array(total * 3);
  const spike = new Float32Array(total);
  const R = WORLD.skyRadius;

  const gn = WORLD.galNormal, gc = WORLD.galCenter;
  const gb = new THREE.Vector3().crossVectors(gn, gc).normalize();
  const v = new THREE.Vector3();

  const temps = [
    [3200, 10], [3900, 18], [4600, 22], [5400, 20], [6200, 14], [7500, 8], [9500, 5], [14000, 3], [22000, 1],
  ];

  for (let i = 0; i < total; i++) {
    let b;
    if (i < count) {
      // isotropic-ish population, mildly concentrated toward the plane
      if (rng.chance(0.35)) {
        const lon = rng.range(-Math.PI, Math.PI);
        const lat = rng.gauss() * 0.28;
        v.copy(gc).multiplyScalar(Math.cos(lat) * Math.cos(lon))
          .addScaledVector(gb, Math.cos(lat) * Math.sin(lon))
          .addScaledVector(gn, Math.sin(lat));
      } else {
        const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
        v.set(s * Math.cos(a), s * Math.sin(a), z);
      }
      // Pareto brightness (N(>b) ∝ b^-1.5)
      const u = Math.max(1e-6, rng.next());
      b = 0.07 * Math.pow(u, -1 / 1.45);
      b = Math.min(b, 40);
    } else {
      // dense dim population inside the Milky Way band, piling up toward the bulge
      const lon = rng.gauss() * 1.25;
      const wl = 0.075 + 0.11 * Math.exp(-(lon * lon) / 0.42);
      const lat = rng.gauss() * wl * 0.75;
      v.copy(gc).multiplyScalar(Math.cos(lat) * Math.cos(lon))
        .addScaledVector(gb, Math.cos(lat) * Math.sin(lon))
        .addScaledVector(gn, Math.sin(lat));
      const u = Math.max(1e-6, rng.next());
      b = 0.035 * Math.pow(u, -1 / 1.8);
      b = Math.min(b, 2.0);
    }
    v.normalize();
    pos[i * 3] = v.x * R; pos[i * 3 + 1] = v.y * R; pos[i * 3 + 2] = v.z * R;
    bright[i] = b;
    const T = rng.weighted(temps) * rng.range(0.9, 1.1);
    const c = kelvinToRGB(T);
    // gentle saturation boost for a more painterly sky
    const l = (c[0] + c[1] + c[2]) / 3;
    const sat = 1.25;
    color[i * 3] = clamp(l + (c[0] - l) * sat, 0, 1);
    color[i * 3 + 1] = clamp(l + (c[1] - l) * sat, 0, 1);
    color[i * 3 + 2] = clamp(l + (c[2] - l) * sat, 0, 1);
    spike[i] = b > 16 ? 1 : 0;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aSpike', new THREE.BufferAttribute(spike, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.1);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uExposure: { value: 1.0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -10;
  points.name = 'stars';
  return points;
}
