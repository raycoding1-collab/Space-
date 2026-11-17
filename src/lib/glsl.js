// Shared GLSL snippets.

// 3D simplex noise — Ian McEwan, Ashima Arts / Stefan Gustavson (MIT License).
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    s += a * snoise(p);
    n += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / n;
}

float ridged(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    s += a * (1.0 - abs(snoise(p)));
    n += a;
    p = p * 2.07 + vec3(4.1, 1.3, 7.7);
    a *= 0.5;
  }
  return s / n;
}
`;

// Hash functions — Dave Hoskins "Hash without Sine" (MIT License).
export const HASH = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
`;

// Logarithmic depth helpers for custom shaders (renderer uses logarithmicDepthBuffer).
export const LOGDEPTH_VERT_PARS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;
export const LOGDEPTH_VERT = /* glsl */ `
#include <logdepthbuf_vertex>
`;
export const LOGDEPTH_FRAG_PARS = /* glsl */ `
#include <logdepthbuf_pars_fragment>
`;
export const LOGDEPTH_FRAG = /* glsl */ `
#include <logdepthbuf_fragment>
`;

// Path length of a view ray inside the Arcadia habitat cylinder (axis = world Z through origin).
// Used for interior atmospheric haze, so the haze is right whether the camera is inside or outside.
export const HABITAT_HAZE = /* glsl */ `
uniform vec4 uHab; // x: inner radius, y: zMin, z: zMax, w: haze density
uniform vec3 uHazeColor;
uniform float uDaylight;

float habitatPath(vec3 ro, vec3 p) {
  vec3 d = p - ro;
  float L = length(d);
  float R = uHab.x;
  // entry along the radial direction
  float tEnter = 0.0;
  float r0 = length(ro.xy);
  if (r0 > R) {
    vec2 o = ro.xy, dd = d.xy;
    float a = dot(dd, dd);
    float b = 2.0 * dot(o, dd);
    float c = dot(o, o) - R * R;
    float disc = b * b - 4.0 * a * c;
    if (disc < 0.0) return 0.0;
    float t = (-b - sqrt(disc)) / (2.0 * a);
    tEnter = clamp(t, 0.0, 1.0);
  }
  // entry through the end planes
  if (ro.z > uHab.z && d.z < 0.0) tEnter = max(tEnter, (uHab.z - ro.z) / d.z);
  if (ro.z < uHab.y && d.z > 0.0) tEnter = max(tEnter, (uHab.y - ro.z) / d.z);
  return max(0.0, (1.0 - clamp(tEnter, 0.0, 1.0)) * L);
}

vec3 applyHabitatHaze(vec3 col, vec3 worldPos) {
  float path = habitatPath(cameraPosition, worldPos);
  float h = 1.0 - exp(-path * uHab.w);
  vec3 haze = uHazeColor * (0.08 + 0.92 * uDaylight);
  return mix(col, haze, h * 0.92);
}
`;
