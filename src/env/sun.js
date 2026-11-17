// The local star: HDR photosphere, corona and starburst, plus the key light that casts ship shadows.
import * as THREE from 'three';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG, NOISE } from '../lib/glsl.js';
import { WORLD } from '../world.js';

const VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  // camera-facing billboard
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
  ${LOGDEPTH_VERT}
}
`;

const FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${NOISE}
uniform float uDisk;      // disk radius in billboard units (0..1)
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float a = atan(vUv.y, vUv.x);
  float x = r / uDisk;
  vec3 col = vec3(0.0);
  // photosphere with limb darkening
  if (x < 1.0) {
    float mu = sqrt(1.0 - x * x);
    float limb = 1.0 - 0.6 * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
    col += uColor * 90.0 * limb;
  }
  // inner corona
  float edge = max(x - 1.0, 0.0);
  float streamers = 0.75 + 0.25 * snoise(vec3(cos(a) * 2.0, sin(a) * 2.0, uTime * 0.02));
  col += uColor * 7.0 * exp(-edge * 3.4) * streamers * step(1.0, x);
  // broad glow
  col += vec3(1.0, 0.86, 0.68) * 0.9 * exp(-r * 7.0);
  col += vec3(1.0, 0.8, 0.6) * 0.18 * exp(-r * 2.2);
  // faint starburst rays
  float rays = pow(abs(cos(a * 6.0 + 0.3)), 60.0) + pow(abs(cos(a * 9.0 + 1.2)), 140.0) * 0.6;
  col += vec3(1.0, 0.9, 0.78) * rays * 0.5 * exp(-r * 4.0) * step(1.0, x);
  float fade = 1.0 - smoothstep(0.85, 1.0, r);
  gl_FragColor = vec4(col * fade, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

export function createSun({ shadowMapSize = 4096, shadow = null } = {}) {
  const group = new THREE.Group();
  group.name = 'sun';

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 1 },
      uDisk: { value: 0.035 },
      uColor: { value: new THREE.Vector3(1.0, 0.95, 0.86) },
      uTime: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const billboard = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  billboard.frustumCulled = false;
  billboard.renderOrder = -5;
  group.add(billboard);

  const dist = 1.1e6;
  const diskAngular = 0.0068; // radians (≈0.39°)
  mat.uniforms.uSize.value = (dist * Math.tan(diskAngular)) / mat.uniforms.uDisk.value;

  // Shadow coverage: a fixed box around the ship, or (adaptive) a box that follows the camera's focus.
  const S = shadow || { adaptive: false, center: new THREE.Vector3(0, 0, 300), halfX: 1150, halfZ: 3350, dist: 10000, near: 100, far: 22000, normalBias: 1.2 };

  // Key light
  const light = new THREE.DirectionalLight(WORLD.sunColor, WORLD.sunIntensity);
  light.castShadow = true;
  light.shadow.mapSize.set(shadowMapSize / 2, shadowMapSize);
  const cam = light.shadow.camera;
  cam.up.set(0, 0, 1);
  cam.near = S.near; cam.far = S.far;
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = S.normalBias;
  light.shadow.radius = 2;
  const target = new THREE.Object3D();
  light.target = target;

  // light-space axes (match the shadow camera's orientation: looking along -sunDir with up = +Z)
  const fwd = WORLD.sunDir.clone().negate();
  const ax = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), fwd).normalize(); // camera right... sign irrelevant
  const ay = new THREE.Vector3().crossVectors(fwd, ax).normalize();
  const _c = new THREE.Vector3();

  function place(center, hx, hz) {
    cam.left = -hx; cam.right = hx;
    cam.top = hz; cam.bottom = -hz;
    cam.updateProjectionMatrix();
    target.position.copy(center);
    light.position.copy(WORLD.sunDir).multiplyScalar(S.dist).add(center);
    target.updateMatrixWorld();
  }
  place(S.center, S.halfX, S.halfZ);

  /**
   * Fit the shadow box around a focus point. `radius` is the half-size wanted near the focus; it is
   * clamped to the ship's full coverage. The centre snaps to whole texels so shadows don't shimmer.
   */
  function fit(focus, radius) {
    if (!S.adaptive) return;
    const hx = Math.min(S.halfX, Math.max(S.minHalf || 400, radius));
    const hz = Math.min(S.halfZ, Math.max(S.minHalf || 400, radius * (S.aspect || 1)));
    // keep the box inside the ship's coverage region
    _c.copy(focus);
    const lx = _c.dot(ax), ly = _c.dot(ay), lz = _c.dot(fwd);
    const cx0 = S.center.dot(ax), cy0 = S.center.dot(ay);
    let px = THREE.MathUtils.clamp(lx, cx0 - S.halfX + hx, cx0 + S.halfX - hx);
    let py = THREE.MathUtils.clamp(ly, cy0 - S.halfZ + hz, cy0 + S.halfZ - hz);
    const tx = (2 * hx) / light.shadow.mapSize.x, ty = (2 * hz) / light.shadow.mapSize.y;
    px = Math.round(px / tx) * tx;
    py = Math.round(py / ty) * ty;
    const lzC = S.center.dot(fwd);
    _c.set(0, 0, 0).addScaledVector(ax, px).addScaledVector(ay, py).addScaledVector(fwd, lzC);
    light.shadow.normalBias = S.normalBias * Math.max(tx, ty);
    place(_c, hx, hz);
    void lz;
  }

  return {
    group,
    light,
    target,
    material: mat,
    fit,
    adaptive: !!S.adaptive,
    update(camera, t) {
      billboard.position.copy(camera.position).addScaledVector(WORLD.sunDir, dist);
      mat.uniforms.uTime.value = t;
    },
  };
}
