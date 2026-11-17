// Aurelis — a banded, ringed gas giant — plus its moon Ilex.
import * as THREE from 'three';
import { NOISE, HASH, LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG } from '../lib/glsl.js';
import { RNG, clamp, smoothstep, lerp } from '../lib/rng.js';
import { TileNoise } from '../lib/canvasNoise.js';
import { WORLD } from '../world.js';

/* ------------------------------------------------------------------------------------------ */
/* Planet surface bake (equirectangular)                                                        */
/* ------------------------------------------------------------------------------------------ */
const BAKE_FRAG = /* glsl */ `
precision highp float;
${NOISE}
varying vec2 vUv;
vec3 palette(float t) {
  // cream / ochre / rust / pale gold bands
  vec3 c0 = vec3(0.93, 0.83, 0.64);
  vec3 c1 = vec3(0.80, 0.57, 0.33);
  vec3 c2 = vec3(0.52, 0.28, 0.15);
  vec3 c3 = vec3(0.90, 0.73, 0.46);
  vec3 c4 = vec3(0.64, 0.44, 0.27);
  t = fract(t);
  if (t < 0.2) return mix(c0, c1, t / 0.2);
  if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
  if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
  if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
  return mix(c4, c0, (t - 0.8) / 0.2);
}
void main() {
  float lon = (vUv.x - 0.5) * 6.2831853;
  float lat = (vUv.y - 0.5) * 3.1415926;
  vec3 s = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  // zonal flow: stretch noise along longitude
  vec3 q = vec3(s.x * 1.2, s.y * 9.0, s.z * 1.2);
  float warp = fbm(q * 1.2 + vec3(0.0, 3.0, 0.0), 5);
  float turb = fbm(vec3(s.x * 6.0, s.y * 40.0, s.z * 6.0) + warp * 1.5, 6);
  float fineT = fbm(vec3(s.x * 22.0, s.y * 120.0, s.z * 22.0) + turb * 2.0, 4);
  float bandCoord = lat * 5.2 + 0.32 * warp + 0.11 * turb + 0.04 * fineT;
  vec3 col = palette(bandCoord * 0.5 + 0.13);
  // festoons and eddies along the belt boundaries
  float eddy = fbm(vec3(s.x * 14.0, s.y * 70.0, s.z * 14.0) + vec3(turb * 3.0, 0.0, warp * 2.0), 5);
  col *= 0.84 + 0.18 * turb + 0.1 * fineT + 0.08 * eddy;
  // great storm
  vec2 sp = vec2(lon - 0.9, (lat + 0.38) * 2.2);
  float sr = length(sp * vec2(1.0, 1.6));
  float swirl = atan(sp.y, sp.x) + 6.0 * exp(-sr * 4.0);
  float storm = smoothstep(0.34, 0.0, sr);
  vec3 stormCol = mix(vec3(0.82, 0.42, 0.25), vec3(0.98, 0.86, 0.7), 0.5 + 0.5 * sin(swirl * 3.0 + sr * 30.0));
  col = mix(col, stormCol, storm * 0.85);
  // small white ovals
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(-2.6 + fi * 1.05, 0.52 - mod(fi, 3.0) * 0.36);
    vec2 d = vec2(lon - c.x, (lat - c.y) * 3.0);
    col = mix(col, vec3(0.97, 0.94, 0.88), smoothstep(0.08, 0.0, length(d)) * 0.8);
  }
  // cool polar hoods
  float pole = smoothstep(0.95, 1.35, abs(lat));
  col = mix(col, vec3(0.58, 0.66, 0.72) * (0.9 + 0.1 * turb), pole * 0.7);
  gl_FragColor = vec4(col, 1.0);
}
`;

function bakePlanetTexture(renderer, w = 4096, h = 2048) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    depthBuffer: false,
  });
  rt.texture.anisotropy = 8;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BAKE_FRAG,
    depthTest: false, depthWrite: false,
  }));
  scene.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  quad.geometry.dispose(); quad.material.dispose();
  return rt;
}

/* ------------------------------------------------------------------------------------------ */
/* Ring profile                                                                                 */
/* ------------------------------------------------------------------------------------------ */
function makeRingTexture(n = 4096) {
  const rng = new RNG(77);
  const noise = new TileNoise(12, 4096);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let d = 0;
    // C ring (faint), B ring (dense), Cassini-like gap, A ring with a narrow gap, thin outer ringlet
    if (t < 0.24) d = 0.12 + 0.12 * smoothstep(0.0, 0.24, t);
    else if (t < 0.58) d = 0.62 + 0.3 * smoothstep(0.24, 0.4, t) - 0.1 * smoothstep(0.5, 0.58, t);
    else if (t < 0.635) d = 0.04;
    else if (t < 0.9) d = 0.52 - 0.12 * smoothstep(0.8, 0.9, t);
    else if (t < 0.93) d = 0.0;
    else if (t > 0.955 && t < 0.962) d = 0.55;
    else d = 0.015;
    if (t > 0.835 && t < 0.842) d *= 0.08; // narrow gap in the A ring
    // ringlets
    const ring = noise.noise(t, 0, 512) * 0.55 + noise.noise(t, 0.3, 2048) * 0.45;
    d *= 0.55 + 0.75 * ring;
    d = clamp(d, 0, 1) * smoothstep(0, 0.01, t);
    // colour: dusty rose / cream / grey-tan
    const tone = 0.7 + 0.3 * noise.noise(t, 0.7, 96);
    let r = lerp(0.78, 0.95, tone), g = lerp(0.66, 0.86, tone), b = lerp(0.55, 0.74, tone);
    if (t < 0.24) { r *= 0.8; g *= 0.78; b *= 0.8; }
    data[i * 4] = r * 255; data[i * 4 + 1] = g * 255; data[i * 4 + 2] = b * 255; data[i * 4 + 3] = d * 255;
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------------------------------ */
/* Shaders                                                                                      */
/* ------------------------------------------------------------------------------------------ */
const PLANET_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vLocal = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}
`;

const PLANET_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
uniform sampler2D uMap;
uniform sampler2D uRingTex;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCenter;
uniform vec3 uRingN;
uniform vec2 uRingR;
uniform float uRadius;
uniform float uSpin;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
void main() {
  vec3 n = normalize(vNormalW);
  float lat = asin(clamp(vLocal.y, -1.0, 1.0));
  float lon = atan(vLocal.z, vLocal.x) + uSpin;
  vec2 uv = vec2(lon / 6.2831853 + 0.5, lat / 3.1415926 + 0.5);
  vec3 alb = texture2D(uMap, uv).rgb;
  vec3 V = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(n, V), 0.0, 1.0);
  float ndl = dot(n, uSunDir);
  // soft terminator from the deep atmosphere
  float diff = smoothstep(-0.06, 0.6, ndl) * (0.25 + 0.75 * clamp(ndl * 1.2 + 0.1, 0.0, 1.0));
  float limb = pow(mu, 0.35);
  vec3 col = alb * uSunColor * diff * limb * 0.8;
  // warm scattering band at the terminator
  float term = smoothstep(-0.14, 0.02, ndl) * (1.0 - smoothstep(0.02, 0.22, ndl));
  col += alb * vec3(1.0, 0.45, 0.18) * term * 0.22;
  // ring shadow cast onto the cloud tops
  vec3 p = vWorld - uCenter;
  float denom = dot(uSunDir, uRingN);
  if (abs(denom) > 1e-4) {
    float t = -dot(p, uRingN) / denom;
    if (t > 0.0) {
      float r = length(p + uSunDir * t);
      float rt = (r - uRingR.x) / (uRingR.y - uRingR.x);
      if (rt > 0.0 && rt < 1.0) {
        float a = texture2D(uRingTex, vec2(rt, 0.5)).a;
        col *= 1.0 - a * 0.85;
      }
    }
  }
  // atmospheric rim (Rayleigh-blue high haze on the lit limb)
  float rim = pow(1.0 - mu, 3.5);
  float rimLit = smoothstep(-0.25, 0.35, ndl);
  col += vec3(0.32, 0.52, 1.0) * rim * rimLit * 0.55;
  col += vec3(1.0, 0.6, 0.3) * pow(1.0 - mu, 8.0) * term * 0.6;
  // ring-shine on the night side
  col += alb * vec3(0.9, 0.8, 0.7) * 0.012 * (1.0 - smoothstep(-0.2, 0.1, ndl));
  gl_FragColor = vec4(col, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

const ATMO_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
uniform vec3 uSunDir;
uniform vec3 uCenter;
uniform float uRadius;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vWorld - uCenter);
  // Distance of the view ray from the planet centre gives a smooth limb glow beyond the disc
  vec3 ro = cameraPosition - uCenter;
  vec3 rd = -V;
  float b = dot(ro, rd);
  vec3 closest = ro - rd * b;
  float h = (length(closest) - uRadius) / (uRadius * 0.05);
  float glow = exp(-max(h, 0.0) * 2.4) * step(-0.02, h);
  float lit = smoothstep(-0.35, 0.4, dot(normalize(closest), uSunDir));
  vec3 col = mix(vec3(0.25, 0.45, 1.0), vec3(0.75, 0.85, 1.0), lit) * glow * lit * 0.55;
  gl_FragColor = vec4(col, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

const RING_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}
`;

const RING_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${HASH}
uniform sampler2D uRingTex;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCenter;
uniform vec3 uRingN;
uniform vec2 uRingR;
uniform float uRadius;
varying vec3 vWorld;
void main() {
  vec3 p = vWorld - uCenter;
  float r = length(p);
  float t = (r - uRingR.x) / (uRingR.y - uRingR.x);
  if (t < 0.0 || t > 1.0) discard;
  vec4 rs = texture2D(uRingTex, vec2(t, 0.5));
  float dens = rs.a;
  if (dens < 0.004) discard;
  // planet shadow (soft)
  float b = dot(p, uSunDir);
  float shadow = 1.0;
  if (b < 0.0) {
    float d = length(p - uSunDir * b);
    shadow = smoothstep(uRadius * 0.985, uRadius * 1.02, d);
  }
  vec3 V = normalize(cameraPosition - vWorld);
  float sunSide = dot(uRingN, uSunDir);
  float camSide = dot(uRingN, V);
  float lit = abs(sunSide);
  float phase = pow(max(dot(-V, uSunDir), 0.0), 6.0);
  vec3 col;
  if (sunSide * camSide > 0.0) {
    col = rs.rgb * (0.08 + 0.62 * lit);
  } else {
    // unlit face: light diffusing through thin regions, strong forward scattering
    col = rs.rgb * (0.08 * lit + 0.9 * phase) * (1.0 - dens * 0.7) * 0.9;
  }
  col *= uSunColor * shadow;
  // subtle grain so close views feel particulate
  col *= 0.92 + 0.16 * hash12(floor(vWorld.xz * 0.02));
  gl_FragColor = vec4(col, clamp(dens * 1.1, 0.0, 0.96));
  ${LOGDEPTH_FRAG}
}
`;

const MOON_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${NOISE}
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uPlanetDir;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vLocal;
float craters(vec3 p) {
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    vec3 q = p * (3.0 + float(i) * 4.0);
    vec3 cell = floor(q);
    vec3 f = fract(q);
    float md = 1.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 o = fract(sin(vec3(dot(cell + g, vec3(127.1, 311.7, 74.7)), dot(cell + g, vec3(269.5, 183.3, 246.1)), dot(cell + g, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
      md = min(md, length(g + o - f));
    }
    c += smoothstep(0.32, 0.25, md) * (0.6 - float(i) * 0.15) - smoothstep(0.38, 0.32, md) * smoothstep(0.25, 0.32, md) * 0.3;
  }
  return c;
}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 lp = vLocal;
  float h = fbm(lp * 3.0, 6) * 0.5 + 0.5;
  float cr = craters(lp);
  vec3 alb = mix(vec3(0.34, 0.33, 0.32), vec3(0.62, 0.6, 0.57), h);
  alb = mix(alb, vec3(0.2, 0.2, 0.21), smoothstep(0.55, 0.7, fbm(lp * 1.4 + 5.0, 4) * 0.5 + 0.5) * 0.6);
  alb *= 1.0 - cr * 0.35;
  // perturb normal with noise gradient for relief
  float e = 0.01;
  float hx = fbm((lp + vec3(e, 0, 0)) * 7.0, 4) - fbm((lp - vec3(e, 0, 0)) * 7.0, 4);
  float hy = fbm((lp + vec3(0, e, 0)) * 7.0, 4) - fbm((lp - vec3(0, e, 0)) * 7.0, 4);
  float hz = fbm((lp + vec3(0, 0, e)) * 7.0, 4) - fbm((lp - vec3(0, 0, e)) * 7.0, 4);
  vec3 nb = normalize(n - vec3(hx, hy, hz) * 2.2);
  float ndl = max(dot(nb, uSunDir), 0.0);
  vec3 col = alb * uSunColor * ndl * 1.1;
  // warm planetshine on the night side
  col += alb * vec3(0.95, 0.75, 0.5) * max(dot(n, uPlanetDir), 0.0) * 0.035;
  gl_FragColor = vec4(col, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

/* ------------------------------------------------------------------------------------------ */
export function createPlanetSystem(renderer, { planetTexWidth = 4096 } = {}) {
  const group = new THREE.Group();
  group.name = 'aurelis-system';

  const C = WORLD.planetCenter;
  const Rp = WORLD.planetRadius;
  const ringN = WORLD.ringNormal;
  const ringR = new THREE.Vector2(Rp * WORLD.ringInner, Rp * WORLD.ringOuter);

  const mapRT = bakePlanetTexture(renderer, planetTexWidth, planetTexWidth / 2);
  const ringTex = makeRingTexture();

  // Orientation: planet local +Y = ring normal
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), ringN);

  const shared = {
    uSunDir: { value: WORLD.sunDir },
    uSunColor: { value: new THREE.Vector3(1.0, 0.95, 0.88) },
    uCenter: { value: C },
    uRingN: { value: ringN },
    uRingR: { value: ringR },
    uRadius: { value: Rp },
    uRingTex: { value: ringTex },
  };

  const planetMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uMap: { value: mapRT.texture }, uSpin: { value: 0 } },
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(Rp, 256, 128), planetMat);
  planet.position.copy(C);
  planet.quaternion.copy(q);
  planet.name = 'aurelis';
  group.add(planet);

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: PLANET_VERT,
    fragmentShader: ATMO_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(Rp * 1.08, 192, 96), atmoMat);
  atmo.position.copy(C);
  group.add(atmo);

  const ringMat = new THREE.ShaderMaterial({
    uniforms: { ...shared },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringGeo = new THREE.RingGeometry(ringR.x, ringR.y, 720, 24);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(C);
  // RingGeometry lies in XY (normal +Z) → rotate so normal = ringN
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ringN);
  ring.renderOrder = 1;
  group.add(ring);

  const moonMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uPlanetDir: { value: C.clone().sub(WORLD.moonCenter).normalize() },
    },
    vertexShader: PLANET_VERT,
    fragmentShader: MOON_FRAG,
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(WORLD.moonRadius, 128, 64), moonMat);
  moon.position.copy(WORLD.moonCenter);
  moon.name = 'ilex';
  group.add(moon);

  return {
    group,
    planet,
    ring,
    moon,
    update(t) {
      planetMat.uniforms.uSpin.value = t * 0.00035;
    },
  };
}
