// Procedural deep-sky backdrop: Milky Way with dust lanes, emission/reflection nebulae, faint galaxies.
// Baked once into a cubemap (one face per frame so the page stays responsive).
import * as THREE from 'three';
import { NOISE, HASH } from '../lib/glsl.js';
import { WORLD } from '../world.js';

const SKY_FRAG = /* glsl */ `
precision highp float;
${NOISE}
${HASH}
uniform vec3 uGalN;
uniform vec3 uGalC;
uniform float uFaceRes;
varying vec3 vDir;

// One emission nebula complex
vec3 nebula(vec3 d, vec3 c, float radius, vec3 colA, vec3 colB, vec3 colC, float seed, float gain) {
  float ca = dot(d, c);
  float ang = acos(clamp(ca, -1.0, 1.0));
  float fall = exp(-pow(ang / radius, 2.0));
  if (fall < 0.003) return vec3(0.0);
  vec3 p = d * (2.2 / radius) + seed;
  vec3 q = vec3(fbm(p, 4), fbm(p + vec3(5.2, 1.3, 2.8), 4), fbm(p + vec3(9.7, 3.1, 7.4), 4));
  vec3 r = vec3(fbm(p + 2.0 * q + vec3(1.7, 9.2, 0.0), 4), fbm(p + 2.0 * q + vec3(8.3, 2.8, 4.4), 4), 0.0);
  float n = fbm(p + 2.4 * r.xyx, 7) * 0.5 + 0.5;
  float dens = smoothstep(0.28, 0.95, n * (0.55 + 0.75 * fall)) * fall;
  dens = pow(dens, 1.35);
  float m = fbm(p * 1.6 + q * 1.5, 5) * 0.5 + 0.5;
  vec3 col = mix(colA, colB, smoothstep(0.35, 0.68, m));
  col = mix(col, colC, smoothstep(0.62, 0.9, n) * 0.8);
  // filamentary bright rims
  float fil = pow(1.0 - abs(snoise(p * 2.8 + r * 3.0)), 6.0);
  col += colC * fil * dens * 0.9;
  // dark globules / dust lanes inside
  float lanes = smoothstep(0.52, 0.8, fbm(p * 2.2 - q * 2.0 + 4.0, 6) * 0.5 + 0.5);
  return col * dens * (1.0 - 0.75 * lanes) * gain;
}

// Small distant spiral galaxy
vec3 galaxy(vec3 d, vec3 c, vec3 ax, float size, float tilt, vec3 col) {
  float ca = dot(d, c);
  if (ca < cos(size * 3.0)) return vec3(0.0);
  vec3 u = normalize(cross(c, ax));
  vec3 v = cross(c, u);
  vec2 p = vec2(dot(d, u), dot(d, v)) / size;
  p.y /= tilt;
  float r = length(p);
  float a = atan(p.y, p.x);
  float arms = 0.5 + 0.5 * cos(2.0 * a - 5.5 * log(r + 0.05));
  float disk = exp(-r * 3.2) * (0.45 + 0.55 * arms);
  float core = exp(-r * r * 60.0);
  return col * (disk * 0.06 + core * 0.35);
}

void main() {
  vec3 d = normalize(vDir);
  vec3 gn = normalize(uGalN);
  vec3 gc = normalize(uGalC);
  vec3 gb = normalize(cross(gn, gc));
  float lat = asin(clamp(dot(d, gn), -1.0, 1.0));
  float lon = atan(dot(d, gb), dot(d, gc));

  // ---------- background ----------
  vec3 col = vec3(0.0018, 0.0022, 0.0042);
  float big = fbm(d * 1.3 + 7.0, 4) * 0.5 + 0.5;
  col += vec3(0.0035, 0.0022, 0.0060) * smoothstep(0.35, 0.9, big);
  // faint integrated-flux cirrus everywhere
  float cir = fbm(d * 4.0 + 3.0, 6) * 0.5 + 0.5;
  col += vec3(0.0030, 0.0034, 0.0050) * pow(cir, 3.0);

  // ---------- Milky Way ----------
  float bulge = exp(-(lon * lon) / 0.42);
  float w = 0.075 + 0.11 * bulge + 0.018 * snoise(d * 2.5);
  float latW = lat + 0.02 * snoise(d * 3.0 + 1.0);
  float band = exp(-pow(latW / w, 2.0));
  float halo = exp(-pow(latW / (w * 3.2), 2.0));
  float clouds = fbm(d * 5.0 + vec3(2.0, 0.0, 1.0), 7) * 0.5 + 0.5;
  float clumps = fbm(d * 16.0, 5) * 0.5 + 0.5;
  float fine = fbm(d * 48.0, 3) * 0.5 + 0.5;
  float mw = band * (0.18 + 1.25 * pow(clouds, 1.6)) * (0.6 + 0.7 * clumps) * (0.8 + 0.4 * fine);
  mw += halo * 0.16 * clouds;
  float core = exp(-(lon * lon * 1.4 + latW * latW * 5.0) / 0.05);
  float coreHot = exp(-(lon * lon * 3.0 + latW * latW * 12.0) / 0.012);

  // dust lanes: the great rift runs along the plane, offset slightly
  float laneLat = latW - 0.01 - 0.012 * sin(lon * 2.0 + 1.0);
  float dustMask = exp(-pow(laneLat / (w * 0.62), 2.0));
  // anisotropic noise: filaments stretched along the galactic plane
  vec3 gp = vec3(cos(lon) * 3.2, sin(lon) * 3.2, latW * 16.0);
  float dn = fbm(gp + vec3(3.1, 1.7, 9.4) + 0.35 * vec3(snoise(d * 9.0)), 7) * 0.5 + 0.5;
  float dr = ridged(gp * 1.8 + vec3(5.0), 6);
  float dust = smoothstep(0.42, 0.7, dn) * dustMask;
  dust = max(dust, smoothstep(0.72, 0.9, dr) * dustMask * 0.8);
  dust += smoothstep(0.55, 0.75, dn) * exp(-pow(laneLat / (w * 1.4), 2.0)) * 0.35;
  dust = clamp(dust, 0.0, 1.0);

  vec3 cool = vec3(0.62, 0.74, 1.0);
  vec3 neutral = vec3(0.92, 0.92, 0.98);
  vec3 warm = vec3(1.0, 0.82, 0.6);
  vec3 mwCol = mix(cool, neutral, smoothstep(0.0, 0.5, bulge));
  mwCol = mix(mwCol, warm, smoothstep(0.45, 1.0, bulge));
  vec3 mwLight = mwCol * mw * 0.085;
  mwLight += vec3(1.0, 0.78, 0.52) * core * 0.32 + vec3(1.0, 0.9, 0.75) * coreHot * 0.4;
  // dust absorbs and reddens
  vec3 ext = mix(vec3(1.0), vec3(0.16, 0.14, 0.13), dust);
  mwLight *= ext;
  // faint reddish H-alpha knots along the plane
  float ha = smoothstep(0.62, 0.85, fbm(d * 9.0 + 11.0, 5) * 0.5 + 0.5) * band;
  mwLight += vec3(0.5, 0.08, 0.12) * ha * 0.05 * (1.0 - dust);
  col += mwLight;

  // ---------- Nebulae ----------
  col += nebula(d, normalize(vec3(0.22, 0.50, -0.84)), 0.36,
                vec3(0.80, 0.16, 0.32), vec3(0.10, 0.46, 0.64), vec3(1.0, 0.62, 0.50), 3.7, 0.11);
  col += nebula(d, normalize(vec3(-0.78, 0.38, -0.50)), 0.24,
                vec3(0.18, 0.30, 0.85), vec3(0.42, 0.18, 0.72), vec3(0.72, 0.88, 1.0), 12.1, 0.07);
  col += nebula(d, normalize(vec3(0.82, -0.32, -0.48)), 0.22,
                vec3(0.75, 0.22, 0.12), vec3(0.85, 0.42, 0.18), vec3(1.0, 0.76, 0.5), 21.4, 0.06);
  col += nebula(d, normalize(vec3(-0.25, -0.15, 0.96)), 0.3,
                vec3(0.12, 0.55, 0.55), vec3(0.20, 0.25, 0.70), vec3(0.6, 1.0, 0.9), 33.3, 0.065);
  col += nebula(d, normalize(vec3(0.55, 0.62, 0.56)), 0.2,
                vec3(0.70, 0.18, 0.40), vec3(0.95, 0.45, 0.30), vec3(1.0, 0.8, 0.7), 44.4, 0.05);

  // ---------- distant galaxies ----------
  col += galaxy(d, normalize(vec3(0.35, 0.55, 0.76)), vec3(0.2, 0.9, 0.1), 0.018, 0.38, vec3(1.0, 0.92, 0.8));
  col += galaxy(d, normalize(vec3(-0.2, -0.75, 0.62)), vec3(0.9, 0.1, 0.3), 0.009, 0.7, vec3(0.85, 0.9, 1.0));
  col += galaxy(d, normalize(vec3(0.9, 0.12, -0.42)), vec3(0.1, 0.3, 0.9), 0.007, 0.25, vec3(1.0, 0.85, 0.75));

  // ---------- unresolved star grain (sub-texel sparkle) ----------
  vec3 cell = floor(d * uFaceRes * 0.9);
  float g = hash13(cell);
  float density = 0.995 - 0.03 * band * clouds;
  if (g > density) {
    float b = (g - density) / (1.0 - density);
    vec3 sc = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash13(cell + 7.0));
    col += sc * b * b * 0.08 * (1.0 - dust * 0.9);
  }

  // dither to kill banding
  col += (hash13(d * 4000.0) - 0.5) * 0.0012;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export function createSkyMaterial(faceRes) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uGalN: { value: WORLD.galNormal.clone() },
      uGalC: { value: WORLD.galCenter.clone() },
      uFaceRes: { value: faceRes },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
}

/** Bake the sky into a cube render target, one face per animation frame. */
export async function bakeSky(renderer, size, onProgress) {
  const rt = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });
  const scene = new THREE.Scene();
  const mat = createSkyMaterial(size);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat);
  scene.add(mesh);
  const cube = new THREE.CubeCamera(0.1, 100, rt);
  cube.coordinateSystem = renderer.coordinateSystem;
  cube.updateCoordinateSystem();
  cube.updateMatrixWorld(true);
  const prevTarget = renderer.getRenderTarget();
  for (let f = 0; f < 6; f++) {
    renderer.setRenderTarget(rt, f);
    renderer.render(scene, cube.children[f]);
    // Force completion so progress is honest and the browser can breathe.
    renderer.getContext().finish?.();
    onProgress?.((f + 1) / 6);
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
  renderer.setRenderTarget(prevTarget);
  mesh.geometry.dispose();
  mat.dispose();
  return rt;
}
