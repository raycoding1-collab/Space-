// HDR post pipeline: MSAA scene target → bloom → final grade (lens flare, chromatic aberration,
// vignette, filmic tone mapping, grain) → screen.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { HASH } from '../lib/glsl.js';

const FINAL_FRAG = /* glsl */ `
precision highp float;
${HASH}
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uExposure;
uniform vec2 uSun;
uniform float uSunOnScreen;
uniform float uFlare;
uniform float uTime;
uniform float uVignette;
uniform float uCA;
uniform float uGrain;
uniform float uFade;
uniform float uSaturation;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = I * (color / 0.6);
  color = RRTAndODTFit(color);
  return clamp(O * color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 ghost(vec2 uv, vec2 pos, float size, vec3 tint, float aspect) {
  vec2 d = (uv - pos) * vec2(aspect, 1.0);
  float r = length(d) / size;
  float disc = smoothstep(1.0, 0.82, r);
  float rim = smoothstep(1.0, 0.9, r) * (1.0 - smoothstep(0.9, 0.7, r));
  return tint * (disc * 0.35 + rim * 0.6);
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 c = uv - 0.5;
  float r2 = dot(c * vec2(aspect, 1.0), c * vec2(aspect, 1.0));
  // chromatic aberration (radial, stronger toward the edges)
  vec2 off = c * uCA * r2;
  vec3 col;
  col.r = texture2D(tScene, uv - off).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv + off).b;

  // lens flare from the star (occlusion measured from the scene itself)
  if (uFlare > 0.0 && uSunOnScreen > 0.0) {
    float vis = 0.0;
    for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
      vec2 o = vec2(float(i), float(j)) * 3.0 / uRes;
      vis += step(14.0, lum(texture2D(tScene, uSun + o).rgb));
    }
    vis /= 25.0;
    vec2 toC = vec2(0.5) - uSun;
    float edge = 1.0 - smoothstep(0.35, 0.75, length(toC));
    float k = vis * uFlare * (0.4 + 0.6 * edge);
    vec3 f = vec3(0.0);
    f += ghost(uv, uSun + toC * 0.55, 0.030, vec3(0.30, 0.50, 1.00) * 0.08, aspect);
    f += ghost(uv, uSun + toC * 0.85, 0.060, vec3(0.50, 1.00, 0.70) * 0.04, aspect);
    f += ghost(uv, uSun + toC * 1.25, 0.018, vec3(1.00, 0.60, 0.30) * 0.10, aspect);
    f += ghost(uv, uSun + toC * 1.55, 0.110, vec3(0.70, 0.40, 1.00) * 0.025, aspect);
    f += ghost(uv, uSun + toC * 1.9, 0.045, vec3(0.40, 0.80, 1.00) * 0.05, aspect);
    // anamorphic streak
    vec2 ds = (uv - uSun) * vec2(aspect, 1.0);
    float streak = exp(-abs(ds.y) * 900.0) * exp(-abs(ds.x) * 3.2);
    f += vec3(0.55, 0.7, 1.0) * streak * 0.9;
    // halo ring
    float hr = length(ds);
    f += vec3(1.0, 0.8, 0.6) * exp(-pow((hr - 0.32) * 28.0, 2.0)) * 0.025;
    col += f * k;
  }

  col *= uExposure;
  // gentle vignette
  float vig = smoothstep(1.25, 0.25, length(c * vec2(aspect, 1.0) * 1.05));
  col *= mix(1.0, vig, uVignette);
  // tone map
  vec3 mapped = aces(col);
  // saturation
  float l = lum(mapped);
  mapped = mix(vec3(l), mapped, uSaturation);
  vec3 outc = toSRGB(clamp(mapped, 0.0, 1.0));
  // film grain + dither in display space
  float n = hash12(uv * uRes + fract(uTime * 13.17) * 811.0) - 0.5;
  outc += n * uGrain * (0.6 + 0.4 * (1.0 - l));
  outc += (hash12(uv * uRes * 1.37 + 17.0) - 0.5) / 255.0;
  outc *= 1.0 - uFade;
  gl_FragColor = vec4(outc, 1.0);
}
`;

export class PostFX {
  constructor(renderer, { samples = 4 } = {}) {
    this.renderer = renderer;
    this.samples = samples;
    this.size = new THREE.Vector2(1, 1);
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples,
      depthBuffer: true,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 1.6);
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uExposure: { value: 1.0 },
        uSun: { value: new THREE.Vector2(0.5, 0.5) },
        uSunOnScreen: { value: 0 },
        uFlare: { value: 1.0 },
        uTime: { value: 0 },
        uVignette: { value: 0.55 },
        uCA: { value: 0.0035 },
        uGrain: { value: 0.018 },
        uFade: { value: 0 },
        uSaturation: { value: 1.06 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FINAL_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.finalMat);
    this._sunWorld = new THREE.Vector3();
  }

  setSize(w, h) {
    this.size.set(w, h);
    this.sceneRT.setSize(w, h);
    this.bloom.setSize(w, h);
    this.finalMat.uniforms.uRes.value.set(w, h);
  }

  setSamples(n) {
    if (n === this.sceneRT.samples) return;
    this.sceneRT.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(this.size.x, this.size.y, {
      type: THREE.HalfFloatType, samples: n, depthBuffer: true, colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.samples = n;
  }

  updateSun(camera, sunDir) {
    const u = this.finalMat.uniforms;
    this._sunWorld.copy(camera.position).addScaledVector(sunDir, 1e5);
    const v = this._sunWorld.clone().project(camera);
    const inFront = camera.getWorldDirection(new THREE.Vector3()).dot(sunDir) > 0;
    u.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    u.uSunOnScreen.value = inFront && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02 ? 1 : 0;
  }

  render(scene, camera, t) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    this.bloom.render(r, null, this.sceneRT, 0, false);
    this.finalMat.uniforms.tScene.value = this.sceneRT.texture;
    this.finalMat.uniforms.uTime.value = t;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}
