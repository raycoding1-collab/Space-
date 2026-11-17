// ELYSION shader library. City materials are MeshStandardMaterials patched with procedural surfaces:
// facades, roofs, cladding, hull plating, streets. All patterns are box-filtered with fwidth, so they're
// crisp up close and settle to their average colour far away instead of shimmering.
import * as THREE from 'three';
import { WORLD } from '../world.js';

// ------------------------------------------------------------------ shared uniforms
const DEBUG = new URLSearchParams(location.search).has('dbg');
const HZ = parseFloat(new URLSearchParams(location.search).get('haze') || '85000');
export const CITY_U = {
  uCityTime: { value: 0 },
  uHazeC: { value: new THREE.Vector3(0, 900, -400) },
  uHazeR: { value: new THREE.Vector3(9800, 6600, 19800) },
  uHazeK: { value: 1 / HZ },
  uHazeFloor: { value: -420 },
  uHazeCol: { value: new THREE.Vector3(0.24, 0.34, 0.6) },
  uSunDirC: { value: WORLD.sunDir },
};

// ------------------------------------------------------------------ GLSL: common helpers
export const CITY_COMMON = /* glsl */ `
float hashI(vec2 c) {
  uvec2 q = uvec2(ivec2(floor(c)) + ivec2(1048576));
  uint h = q.x * 1597334677u ^ q.y * 3812015801u;
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return float(h) * (1.0 / 4294967296.0);
}
float hashI3(vec3 c) { return hashI(c.xy + vec2(c.z * 7.0, c.z * 13.0)); }
// value noise (cheap) on a lattice
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashI(i), hashI(i + vec2(1, 0)), u.x), mix(hashI(i + vec2(0, 1)), hashI(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p) { return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 7.1) + 0.125 * vnoise(p * 4.1 + 3.3) + 0.0625 * vnoise(p * 8.3 + 1.7); }
// Box-filtered pulse train: 1 on [0, d) of every unit period, averaged over a footprint of width w.
float fp(float x, float w, float d) {
  w = max(w, 1e-5);
  float a = x - 0.5 * w, b = x + 0.5 * w;
  return ((floor(b) * d + min(fract(b), d)) - (floor(a) * d + min(fract(a), d))) / w;
}
float fpc(float x, float w, float d) { return fp(x - 0.5 + 0.5 * d, w, d); }       // centred in the cell
float fln(float x, float w, float t) { return fp(x + 0.5 * t, w, t); }              // line of width t at integers
`;

export const CITY_FRAG_COMMON = /* glsl */ `
// Height-field bump from screen-space derivatives (no tangents needed).
vec3 cityBump(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}
`;

// Atmosphere held over the city by its field: aerial perspective inside an ellipsoid above the deck.
export const CITY_HAZE = /* glsl */ `
uniform vec3 uHazeC;
uniform vec3 uHazeR;
uniform float uHazeK;
uniform float uHazeFloor;
uniform vec3 uHazeCol;
uniform vec3 uSunDirC;
float hazePath(vec3 ro, vec3 p) {
  vec3 o = (ro - uHazeC) / uHazeR, d = (p - ro) / uHazeR;
  float a = dot(d, d), b = 2.0 * dot(o, d), c = dot(o, o) - 1.0;
  float disc = b * b - 4.0 * a * c;
  if (disc <= 0.0) return 0.0;
  float s = sqrt(disc);
  float t0 = max((-b - s) / (2.0 * a), 0.0), t1 = min((-b + s) / (2.0 * a), 1.0);
  // keep to the air above the floor plane
  float dy = p.y - ro.y;
  if (abs(dy) > 1e-3) {
    float ty = (uHazeFloor - ro.y) / dy;
    if (dy > 0.0) t0 = max(t0, ty); else t1 = min(t1, ty);
  } else if (ro.y < uHazeFloor) return 0.0;
  return max(t1 - t0, 0.0) * length(p - ro);
}
vec3 hazeLight(vec3 ro, vec3 p) {
  vec3 v = normalize(p - ro);
  float mu = max(dot(v, uSunDirC), 0.0);
  float phase = 0.75 + 0.6 * pow(mu, 6.0) + 0.35 * pow(1.0 - abs(v.y), 3.0);
  return uHazeCol * phase;
}
vec3 applyHaze(vec3 col, vec3 p) {
  float L = hazePath(cameraPosition, p);
  float h = 1.0 - exp(-L * uHazeK);
  return mix(col, hazeLight(cameraPosition, p), h);
}
`;

// ------------------------------------------------------------------ facade surfaces
const FACADE = /* glsl */ `
// Style table: every facade language is 9 texels in uStyleTex; a building picks its row per instance.
uniform sampler2D uStyleTex;
varying float vStyleC;
vec4 uFacA;   // floorH, bayW, column every N bays, mechanical floor every N floors
vec4 uFacB;   // pattern (main), pattern (podium), lit probability, warmth 0..1
vec4 uFacC;   // podium top (m), podium floorH, lobby height (m), segment length (m, 0 = off)
vec3 uFrame, uGlass, uPanel, uAccent, uTrim, uRoof;
float uLitI, uTrimI, uAO, uStyleSeed;
void loadStyle() {
  int r = int(vStyleC + 0.5);
  uFacA = texelFetch(uStyleTex, ivec2(0, r), 0);
  uFacB = texelFetch(uStyleTex, ivec2(1, r), 0);
  uFacC = texelFetch(uStyleTex, ivec2(2, r), 0);
  vec4 t3 = texelFetch(uStyleTex, ivec2(3, r), 0); uFrame = t3.rgb; uLitI = t3.a;
  vec4 t4 = texelFetch(uStyleTex, ivec2(4, r), 0); uGlass = t4.rgb; uTrimI = t4.a;
  vec4 t5 = texelFetch(uStyleTex, ivec2(5, r), 0); uPanel = t5.rgb; uAO = t5.a;
  vec4 t6 = texelFetch(uStyleTex, ivec2(6, r), 0); uAccent = t6.rgb; uStyleSeed = t6.a;
  uTrim = texelFetch(uStyleTex, ivec2(7, r), 0).rgb;
  uRoof = texelFetch(uStyleTex, ivec2(8, r), 0).rgb;
}

struct CS { vec3 alb; float rough; float metal; vec3 emis; float h; float ao; };

vec3 litColour(float warm, float r) {
  vec3 warmC = vec3(1.0, 0.68, 0.40), coolC = vec3(0.74, 0.84, 1.0), neutral = vec3(1.0, 0.86, 0.7);
  vec3 c = mix(coolC, warmC, warm);
  return mix(c, neutral, step(0.82, r) * 0.7);
}

// One storey-and-bay facade. pat: 0 curtain, 1 ribbon, 2 punched, 3 fins, 4 diagrid, 5 balcony, 6 hex, 7 louvre
CS facade(vec2 f, int pat, float floorH, float bayW, float colEvery, float mechEvery, float seed, float litP, float warm, float lobbyH) {
  CS o;
  // segment variation along long walls: each stretch reads as a different building
  vec3 panel = uPanel;
  float segH = 0.0;
  if (uFacC.w > 0.0) {
    float sid = floor(f.x / uFacC.w);
    float sh = hashI(vec2(sid, 3.0) + seed * 101.0);
    segH = sh;
    float sp = hashI(vec2(sid, 17.0) + seed * 7.0);
    pat = sp < 0.78 ? pat : (pat == 5 ? 2 : 5);
    float pc = hashI(vec2(sid, 29.0));
    vec3 pal = pc < 0.25 ? vec3(0.84, 0.8, 0.72) : (pc < 0.45 ? vec3(0.76, 0.68, 0.56) : (pc < 0.62 ? vec3(0.6, 0.58, 0.55) : (pc < 0.78 ? vec3(0.74, 0.58, 0.48) : vec3(0.88, 0.87, 0.85))));
    panel = mix(uPanel, pal, 0.4) * mix(0.94, 1.04, sh);
    floorH *= mix(0.94, 1.1, hashI(vec2(sid, 41.0)));
    litP *= mix(0.6, 1.3, sh);
  }
  vec2 c = vec2(f.x / bayW, f.y / floorH);
  vec2 w = max(fwidth(c), vec2(1e-5));
  float far = smoothstep(0.07, 0.3, max(w.x, w.y));
  float bumpK = 1.0 - smoothstep(0.035, 0.14, max(w.x, w.y));
  float du = 0.86, dv = 0.78, recess = 0.35;
  vec3 frame = uFrame;
  float fRough = 0.42, fMetal = 0.7;
  if (pat == 1) { du = 0.965; dv = 0.5; frame = panel; fMetal = 0.05; fRough = 0.55; recess = 0.25; }
  else if (pat == 2) { du = 0.42; dv = 0.56; frame = panel; fMetal = 0.0; fRough = 0.72; recess = 0.55; }
  else if (pat == 3) { du = 0.34; dv = 0.93; frame = uAccent; fMetal = 0.9; fRough = 0.32; recess = 1.1; }
  else if (pat == 5) { du = 0.9; dv = 0.7; frame = panel; fMetal = 0.05; fRough = 0.6; recess = 1.4; }
  float cy = c.y - 0.04;
  float wu = fpc(c.x, w.x, du);
  float wv = fpc(cy, w.y, dv);
  float win = wu * wv;
  // structural column lines
  if (colEvery > 0.5) {
    float col = fln(c.x / colEvery, w.x / colEvery, 0.32 / colEvery);
    win *= 1.0 - col;
  }
  // mechanical floors: louvred bands that give tall towers their rhythm
  float mech = 0.0;
  if (mechEvery > 0.5) mech = fp(c.y / mechEvery + 1.6 / mechEvery, w.y / mechEvery, 1.6 / mechEvery);
  // lobby: double-height glass at the foot of the building
  float lobby = (1.0 - smoothstep(lobbyH - 0.5, lobbyH + 0.5, f.y)) * step(0.5, lobbyH) * step(-0.5, f.y);
  vec2 id = floor(vec2(c.x, cy));
  float r = hashI(id + vec2(seed * 913.0, seed * 37.0));
  // lights come on in runs along a floor (an office, an apartment row), with the odd dark window
  // lights come on in blocks: a tenant's few floors × a run of bays, like offices and apartments
  float runLen = 6.0 + floor(hashI(vec2(floor(id.y / 5.0), seed * 13.0 + 3.0)) * 14.0);
  float runId = floor(c.x / runLen);
  float fBlock = 2.0 + floor(hashI(vec2(runId, seed * 7.0 + 1.0)) * 5.0);
  float rowId = floor(id.y / fBlock);
  float run = hashI(vec2(runId, rowId) + vec2(seed * 51.0, 11.0));
  float r2 = hashI(vec2(runId * 1.7, rowId) + vec2(31.0 + seed * 77.0, 5.0));
  float on = step(run, litP) * step(0.1, r);
  float ph = fract(uCityTime * (0.002 + 0.012 * r2) + run * 7.0);
  on *= step(0.04, ph);
  float lit = mix(on, litP * 0.9, far);
  float br = mix(mix(0.6, 1.15, r2), 0.88, far);
  float grad = mix(1.0, 0.7 + 0.6 * smoothstep(0.1, 0.95, fract(cy - 0.5 + 0.5 * dv) / dv), 1.0 - far);
  vec3 glass = uGlass * mix(mix(0.75, 1.25, r), 1.0, far);
  // pattern-specific extras
  float h = 0.0;
  if (pat == 3) {
    // fins: rounded vertical blades between narrow glass slots
    float s = fract(c.x + 0.5);
    h += (1.0 - win) * sin(3.14159 * clamp((s - (0.5 - (1.0 - du) * 0.5)) / (1.0 - du) + 0.5, 0.0, 1.0)) * 0.9;
  }
  vec3 alb = mix(frame, glass, win);
  float rough = mix(fRough, 0.17, win);
  float metal = mix(fMetal, 0.72, win);
  vec3 emis = win * lit * br * grad * litColour(warm, r2);
  if (pat == 4) {
    // diagrid: diagonal structure over a curtain wall
    float k = 6.0, kx = k * floorH / bayW;
    float d1 = c.x / kx + c.y / k, d2 = c.x / kx - c.y / k;
    float wd = max(fwidth(d1), 1e-5);
    float diag = max(fln(d1, wd, 0.07), fln(d2, wd, 0.07));
    alb = mix(alb, uAccent, diag); rough = mix(rough, 0.3, diag); metal = mix(metal, 0.95, diag);
    emis *= 1.0 - diag; h += diag * 0.8;
  } else if (pat == 5) {
    // balcony slabs and glass rails, with planters on some balconies
    float slab = fp(c.y, w.y, 0.14);
    float rail = fp(c.y - 0.14, w.y, 0.2) * (1.0 - slab);
    alb = mix(alb, uPanel * 1.08, slab);
    alb = mix(alb, mix(alb, vec3(0.55, 0.62, 0.66), 0.35), rail);
    float plant = step(0.72, hashI(id * 1.3 + 4.0)) * rail * (1.0 - far);
    alb = mix(alb, vec3(0.12, 0.2, 0.08), plant * 0.8);
    h += slab * 1.2;
    rough = mix(rough, 0.6, slab);
    metal = mix(metal, 0.05, slab);
    emis *= 1.0 - slab;
  } else if (pat == 6) {
    // hexagonal lattice skin
    vec2 q = f / (bayW * 2.2);
    q.x *= 1.1547; q.y += mod(floor(q.x), 2.0) * 0.5;
    vec2 g = fract(q) - 0.5;
    vec2 a = abs(g); float dd = max(a.x * 0.866 + a.y * 0.5, a.y);
    float fw = max(fwidth(dd), 1e-4);
    float edge = smoothstep(0.43 - fw, 0.43 + fw, dd);
    edge = mix(edge, 0.25, far);
    alb = mix(alb, uAccent, edge); metal = mix(metal, 0.9, edge); rough = mix(rough, 0.35, edge);
    emis *= 1.0 - edge; h += edge * 0.7;
  } else if (pat == 7) {
    // fine vertical louvres in front of the glass
    float lc = f.x / 0.9;
    float lv = fpc(lc, max(fwidth(lc), 1e-5), 0.45);
    alb = mix(alb, uAccent * 0.85, lv * 0.85); metal = mix(metal, 0.8, lv); rough = mix(rough, 0.35, lv);
    emis *= 1.0 - 0.65 * lv; h += lv * 0.25;
  }
  // long city walls: deep galleries every 24 floors, with a lit soffit
  if (uFacC.w > 0.0) {
    float gy = c.y / 24.0;
    float gal = fp(gy, w.y / 24.0, 1.4 / 24.0);
    float soffit = fp(gy - 1.25 / 24.0, w.y / 24.0, 0.12 / 24.0);
    alb = mix(alb, vec3(0.03), gal); emis = mix(emis, vec3(0.0), gal);
    emis += soffit * vec3(1.0, 0.78, 0.5) * 1.6;
    metal = mix(metal, 0.0, gal); rough = mix(rough, 0.9, gal);
    h -= gal * 3.0;
  }
  // mechanical bands
  float louv = fp(c.y * 5.0, w.y * 5.0, 0.5);
  vec3 mechC = mix(uPanel * 0.5, uPanel * 0.85, louv);
  alb = mix(alb, mechC, mech); emis *= 1.0 - mech; metal = mix(metal, 0.4, mech); rough = mix(rough, 0.55, mech);
  // lobby glass
  emis = mix(emis, vec3(1.0, 0.8, 0.55) * 1.1 * fpc(c.x, w.x, 0.92), lobby * 0.8);
  alb = mix(alb, uGlass, lobby * 0.8);
  h -= win * recess;
  o.alb = alb; o.rough = rough; o.metal = metal; o.emis = emis * uLitI; o.h = h * bumpK * 0.55; o.ao = 1.0;
  return o;
}

CS cladding(vec2 f, float floorH, float bayW, float seed, float litP, float warm) {
  CS o;
  vec2 c = vec2(f.x / (bayW * 2.0), f.y / floorH);
  vec2 w = max(fwidth(c), vec2(1e-5));
  float far = smoothstep(0.3, 1.1, max(w.x, w.y));
  float joint = max(fln(c.x, w.x, 0.02), fln(c.y, w.y, 0.04));
  float tone = mix(mix(0.96, 1.04, hashI(floor(c) + seed * 17.0)), 1.0, far);
  float slit = fpc(c.x * 2.0, w.x * 2.0, 0.07) * fpc(c.y - 0.05, w.y, 0.6);
  float r = hashI(floor(vec2(c.x * 2.0, c.y)) + seed * 3.0);
  float lit = mix(step(r, litP * 0.5), litP * 0.5, far);
  o.alb = uPanel * tone * (1.0 - 0.35 * joint) * (1.0 - 0.75 * slit);
  o.rough = 0.62; o.metal = 0.08;
  o.emis = slit * lit * litColour(warm, r) * uLitI * 0.8;
  o.h = (-0.15 * joint - 0.3 * slit) * (1.0 - far); o.ao = 1.0;
  return o;
}

CS roofSurf(vec2 f, float seed) {
  CS o;
  vec2 c = f / 4.0;
  vec2 w = max(fwidth(c), vec2(1e-5));
  float far = smoothstep(0.3, 1.1, max(w.x, w.y));
  float g = max(fln(c.x, w.x, 0.03), fln(c.y, w.y, 0.03));
  vec2 big = floor(f / 12.0);
  float r = hashI(big + seed * 7.0);
  vec3 base = uRoof * mix(mix(0.92, 1.06, hashI(big * 0.37 + 2.0)), 1.0, far);
  vec3 alb = base * (1.0 - 0.25 * g);
  float rough = 0.8, metal = 0.0;
  vec3 emis = vec3(0.0);
  vec2 cb = f / 12.0; vec2 wb = max(fwidth(cb), vec2(1e-5));
  float inner = fpc(cb.x, wb.x, 0.8) * fpc(cb.y, wb.y, 0.8);
  float solar = step(0.72, r) * inner;
  float sky = step(0.93, hashI(big + 19.0)) * inner;
  float hvac = step(0.55, r) * step(r, 0.72) * fpc(cb.x, wb.x, 0.5) * fpc(cb.y, wb.y, 0.5);
  float cellL = max(fln(c.x * 2.0, w.x * 2.0, 0.08), fln(c.y * 2.0, w.y * 2.0, 0.08));
  alb = mix(alb, mix(vec3(0.05, 0.07, 0.12), vec3(0.2, 0.22, 0.26), cellL), mix(solar, 0.28 * 0.64, far));
  rough = mix(rough, 0.25, solar); metal = mix(metal, 0.5, solar);
  alb = mix(alb, base * 0.6, hvac * (1.0 - far));
  alb = mix(alb, vec3(0.1, 0.13, 0.16), sky);
  emis += sky * vec3(1.0, 0.8, 0.55) * 0.6 * uLitI;
  o.alb = alb; o.rough = rough; o.metal = metal; o.emis = emis; o.h = (hvac * 1.5 - g * 0.05) * (1.0 - far); o.ao = 1.0;
  return o;
}

CS garden(vec2 f, vec3 wp) {
  CS o;
  float n1 = fbm2(wp.xz / 9.0);
  float n2 = vnoise(wp.xz / 2.2);
  float fw = fwidth(wp.x) + fwidth(wp.z);
  float far = smoothstep(1.0, 6.0, fw);
  float clump = mix(smoothstep(0.35, 0.75, n1 * 0.7 + n2 * 0.3), 0.55, far);
  vec3 dark = vec3(0.035, 0.07, 0.03), mid = vec3(0.09, 0.16, 0.05), light = vec3(0.18, 0.26, 0.09);
  vec3 alb = mix(dark, mix(mid, light, n2), clump);
  vec2 fc = wp.xz / 1.3, fi = floor(fc);
  vec2 jit = vec2(hashI(fi + 3.0), hashI(fi + 9.0)) * 0.5 + 0.25;
  float fr = length(fract(fc) - jit);
  float ffw = max(fwidth(fc.x), 1e-4);
  float flower = step(0.9, hashI(fi)) * (1.0 - smoothstep(0.14 - ffw, 0.14 + ffw, fr)) * (1.0 - far);
  alb = mix(alb, mix(vec3(0.75, 0.32, 0.42), vec3(0.9, 0.78, 0.38), hashI(fi + 5.0)), flower * 0.8);
  float blades = vnoise(wp.xz * 2.7) * 0.5 + vnoise(wp.xz * 6.1) * 0.5;
  alb *= mix(1.0, mix(0.8, 1.15, blades), 1.0 - smoothstep(0.15, 0.8, fw));
  o.alb = alb; o.rough = 0.88; o.metal = 0.0; o.emis = vec3(0.0); o.h = clump * 1.2 * (1.0 - far); o.ao = mix(0.75, 1.0, clump);
  return o;
}

CS stone(vec2 f, float seed) {
  CS o;
  vec2 c = vec2(f.x / 2.4, f.y / 1.2);
  c.x += 0.5 * mod(floor(c.y), 2.0);
  vec2 w = max(fwidth(c), vec2(1e-5));
  float far = smoothstep(0.3, 1.1, max(w.x, w.y));
  float j = max(fln(c.x, w.x, 0.04), fln(c.y, w.y, 0.06));
  float tone = mix(mix(0.93, 1.06, hashI(floor(c) + seed * 9.0)), 1.0, far);
  o.alb = uPanel * tone * (1.0 - 0.3 * j); o.rough = 0.7; o.metal = 0.0; o.emis = vec3(0.0); o.h = -0.12 * j * (1.0 - far); o.ao = 1.0;
  return o;
}

CS citySurface(vec2 f, float zone, float seed, vec3 wp) {
  loadStyle();
  seed = fract(seed + uStyleSeed);
  int zn = int(zone + 0.5);
  CS o;
  float litP = uFacB.z, warm = clamp(uFacB.w + (seed - 0.5) * 0.3, 0.0, 1.0);
  if (zn == 0) {
    o = facade(f, int(uFacB.x + 0.5), uFacA.x, uFacA.y, uFacA.z, uFacA.w, seed, litP, warm, uFacC.z);
  } else if (zn == 1) {
    o = facade(f, int(uFacB.y + 0.5), uFacC.y, uFacA.y * 1.5, 0.0, 0.0, seed + 0.31, min(1.0, litP * 1.6 + 0.2), 0.85, 0.0);
  } else if (zn == 2) {
    o = cladding(f, uFacA.x, uFacA.y, seed, litP, warm);
  } else if (zn == 3) {
    o = roofSurf(f, seed);
  } else if (zn == 4) {
    vec2 c = vec2(f.y * 2.5, f.x * 0.2);
    float br = fp(c.x, max(fwidth(c.x), 1e-5), 0.5);
    o.alb = uAccent * mix(0.92, 1.05, br); o.rough = mix(0.24, 0.34, br); o.metal = 1.0; o.emis = vec3(0.0); o.h = 0.0; o.ao = 1.0;
  } else if (zn == 5) {
    o.alb = vec3(0.05); o.rough = 0.4; o.metal = 0.0; o.emis = uTrim * uTrimI; o.h = 0.0; o.ao = 1.0;
  } else if (zn == 6) {
    vec2 c = vec2(f.x / (uFacA.y * 1.5), f.y / uFacA.x);
    vec2 w = max(fwidth(c), vec2(1e-5));
    float far = smoothstep(0.3, 1.1, max(w.x, w.y));
    float m = max(fln(c.x, w.x, 0.03), fln(c.y, w.y, 0.025));
    float r = hashI(floor(c) + seed * 5.0);
    float lit = mix(step(r, litP * 0.3), litP * 0.3, far);
    o.alb = mix(uGlass * 0.55, uFrame * 0.6, m); o.rough = 0.06; o.metal = 0.95;
    o.emis = (1.0 - m) * lit * litColour(0.2, r) * uLitI * 0.7; o.h = 0.0; o.ao = 1.0;
  } else if (zn == 7) {
    o = garden(f, wp);
  } else if (zn == 8) {
    vec2 c = f / vec2(2.0, 2.4);
    vec2 w = max(fwidth(c), vec2(1e-5));
    float far = smoothstep(0.3, 1.1, max(w.x, w.y));
    float m = max(fln(c.x, w.x, 0.06), fln(c.y, w.y, 0.06));
    o.alb = mix(vec3(0.18, 0.24, 0.3), uFrame, m); o.rough = mix(0.05, 0.4, m); o.metal = mix(0.9, 0.7, m);
    o.emis = (1.0 - m) * vec3(1.0, 0.82, 0.6) * 0.35 * uLitI * mix(step(0.4, hashI(floor(c / 3.0) + seed)), 0.6, far); o.h = m * 0.2 * (1.0 - far); o.ao = 1.0;
  } else {
    o = stone(f, seed);
  }
  // street-canyon occlusion: darker toward the foot of tall buildings
  o.ao *= mix(1.0, mix(0.5, 1.0, smoothstep(0.0, 80.0, f.y)), uAO * step(zone, 2.5) * step(0.5, 3.0 - zone));
  return o;
}
`;

// ------------------------------------------------------------------ hull plating (triplanar)
const PLATING = /* glsl */ `
uniform vec3 uPlateA;   // base colour
uniform vec3 uPlateB;   // seam / secondary colour
uniform vec4 uPlateS;   // big panel w, h, light rows every N panels, seam light intensity
uniform vec3 uSeamCol;
uniform float uPlateMetal;
uniform float uPlateRough;
struct CS { vec3 alb; float rough; float metal; vec3 emis; float h; float ao; };

vec4 plate2(vec2 p, float seed) {
  // returns (tone, seam, light, height)
  vec2 c = p / uPlateS.xy;
  c.x += 0.5 * mod(floor(c.y), 2.0);
  vec2 w = max(fwidth(c), vec2(1e-5));
  float far = smoothstep(0.25, 1.0, max(w.x, w.y));
  float big = max(fln(c.x, w.x, 0.012), fln(c.y, w.y, 0.024));
  vec2 c2 = p / (uPlateS.xy * 0.25);
  vec2 w2 = max(fwidth(c2), vec2(1e-5));
  float far2 = smoothstep(0.3, 1.0, max(w2.x, w2.y));
  float mid = max(fln(c2.x, w2.x, 0.02), fln(c2.y, w2.y, 0.03)) * (1.0 - far2 * 0.7);
  vec2 c3 = p / (uPlateS.xy * 0.0625);
  vec2 w3 = max(fwidth(c3), vec2(1e-5));
  float fine = max(fln(c3.x, w3.x, 0.03), fln(c3.y, w3.y, 0.04)) * (1.0 - smoothstep(0.3, 1.0, max(w3.x, w3.y)));
  float tone = mix(mix(0.93, 1.06, hashI(floor(c) + seed)), 1.0, far);
  float tone2 = mix(mix(0.97, 1.03, hashI(floor(c2) + seed + 3.0)), 1.0, far2);
  // seam lights: small lamps along every Nth big seam
  float rowL = step(0.5, 1.0 - abs(mod(floor(c.y + 0.5), uPlateS.z)));
  vec2 lc = vec2(p.x / 9.0, c.y);
  float lamp = fpc(lc.x, max(fwidth(lc.x), 1e-5), 0.25) * fln(c.y, w.y, 0.035) * rowL;
  lamp = mix(lamp, 0.25 * 0.035 / max(uPlateS.z, 1.0), far);
  return vec4(tone * tone2, max(big, mid * 0.6 + fine * 0.35), lamp, -0.3 * big - 0.12 * mid - 0.05 * fine);
}

CS plating(vec3 wp, vec3 wn, float seed) {
  CS o;
  vec3 b = pow(abs(wn), vec3(6.0));
  b /= (b.x + b.y + b.z);
  vec4 px = plate2(wp.zy, seed), py = plate2(wp.xz, seed + 11.0), pz = plate2(wp.xy, seed + 23.0);
  vec4 P = px * b.x + py * b.y + pz * b.z;
  o.alb = mix(uPlateA * P.x, uPlateB, P.y * 0.55);
  o.rough = uPlateRough + P.y * 0.15; o.metal = uPlateMetal;
  o.emis = uSeamCol * P.z * uPlateS.w;
  o.h = P.w; o.ao = 1.0;
  return o;
}
`;

// ------------------------------------------------------------------ deck: streets, blocks and plazas
const GROUND = /* glsl */ `
uniform sampler2D uBlockTex;   // Cartesian block types (r: type, g: tone)
uniform vec4 uGridA;           // px, pz, street, blvd
uniform vec4 uGridB;           // every, i0 (offset), j0 (offset), unused
uniform sampler2D uPolarTex;   // polar block types (x: sector, y: ring band)
uniform vec4 uPolar;           // spire x, z, z-scale, ring pitch
uniform vec4 uPolarB;          // avenue width, ring street width, unused, unused
uniform vec3 uPave;
uniform vec3 uStreet;
uniform float uStreetLights;
struct CS { vec3 alb; float rough; float metal; vec3 emis; float h; float ao; };

float streetHalf(float k) { return (mod(k, uGridB.x) < 0.5) ? uGridA.w * 0.5 : uGridA.z * 0.5; }

// distance from street centre lines, AA'd street mask and lane markings for one axis
// returns (inStreet, distFromCentre/halfWidth, halfWidth, k)
vec4 axisStreet(float x, float pitch) {
  float k = floor(x / pitch + 0.5);
  float d = x - k * pitch;
  float hw = streetHalf(k);
  float fw = max(fwidth(x), 1e-4);
  float m = 1.0 - smoothstep(hw - fw, hw + fw, abs(d));
  return vec4(m, d / hw, hw, k);
}

vec3 streetDetail(float d, float along, float hw, float isBlvd, inout float rough, inout vec3 emis, inout float h, float far) {
  // d: signed offset from centre (m), along: coordinate along the street (m)
  float a = abs(d);
  vec3 col = uStreet;
  // sidewalks
  float side = smoothstep(hw - 6.5, hw - 6.0, a);
  col = mix(col, uPave * 0.62, side);
  h += side * 0.18;
  // boulevard median garden
  float med = isBlvd * (1.0 - smoothstep(9.0, 9.5, a));
  col = mix(col, vec3(0.07, 0.12, 0.05), med);
  // lane dashes
  float fwa = max(fwidth(along), 1e-4);
  float lane = isBlvd > 0.5 ? abs(abs(d) - 18.0) : abs(a - 0.0);
  float laneLine = (1.0 - smoothstep(0.12, 0.12 + fwidth(d) + 1e-4, lane)) * fp(along / 12.0, fwa / 12.0, 0.5);
  col = mix(col, vec3(0.6, 0.58, 0.5), laneLine * (1.0 - far) * (1.0 - med) * (1.0 - side));
  // street lamps along the kerbs
  float lampD = abs(a - (hw - 5.0));
  float lampA = fpc(along / 32.0, fwa / 32.0, 0.06);
  float lamp = (1.0 - smoothstep(0.9, 0.9 + fwidth(d) * 1.5 + 1e-4, lampD)) * lampA;
  lamp = mix(lamp, 0.06 * 1.8 / max(hw, 1.0), far);
  emis += vec3(1.0, 0.72, 0.42) * lamp * uStreetLights;
  rough = mix(0.55, 0.85, side);
  return col;
}

CS groundCart(vec3 wp) {
  CS o;
  float fw = fwidth(wp.x) + fwidth(wp.z);
  float far = smoothstep(2.0, 9.0, fw);
  vec4 sx = axisStreet(wp.x, uGridA.x);
  vec4 sz = axisStreet(wp.z, uGridA.y);
  float rough = 0.7, h = 0.0; vec3 emis = vec3(0.0);
  // block type
  ivec2 bi = ivec2(floor(wp.x / uGridA.x), floor(wp.z / uGridA.y)) + ivec2(int(uGridB.y), int(uGridB.z));
  vec4 bt = texelFetch(uBlockTex, clamp(bi, ivec2(0), textureSize(uBlockTex, 0) - 1), 0);
  float type = floor(bt.r * 255.0 + 0.5);
  vec3 blk;
  // paving: large slabs with joints
  vec2 pc = wp.xz / 6.0; vec2 pw = max(fwidth(pc), vec2(1e-5));
  float joints = max(fln(pc.x, pw.x, 0.04), fln(pc.y, pw.y, 0.04)) * (1.0 - smoothstep(0.3, 1.0, max(pw.x, pw.y)));
  vec3 pave = uPave * mix(0.92, 1.06, bt.g) * (1.0 - 0.18 * joints);
  if (type < 0.5) { blk = pave * 0.86; }                                   // built-up: courtyards and service lanes
  else if (type < 1.5) {                                                   // park
    float n = fbm2(wp.xz / 14.0);
    blk = mix(vec3(0.05, 0.1, 0.035), vec3(0.13, 0.2, 0.06), smoothstep(0.3, 0.75, n));
    float path = 1.0 - smoothstep(1.4, 1.4 + fw, abs(fract((wp.x + wp.z) / 70.0) - 0.5) * 70.0);
    blk = mix(blk, uPave * 0.8, path * (1.0 - far));
    rough = 0.9;
  }
  else if (type < 2.5) {                                                   // plaza with a radial pattern
    vec2 bc = (vec2(bi - ivec2(int(uGridB.y), int(uGridB.z))) + 0.5) * uGridA.xy;
    float rr = length(wp.xz - bc);
    float ring = fln(rr / 12.0, max(fwidth(rr / 12.0), 1e-5), 0.08);
    blk = mix(pave * 1.06, uPave * 0.7, ring * (1.0 - far));
    float pool = 1.0 - smoothstep(26.0, 26.0 + fw, rr);
    blk = mix(blk, vec3(0.03, 0.08, 0.1), pool);
    emis += pool * vec3(0.2, 0.55, 0.7) * 0.25 * (0.6 + 0.4 * sin(uCityTime * 0.7 + rr * 0.3));
    rough = mix(rough, 0.05, pool);
  }
  else if (type < 3.5) { blk = uStreet * 1.3; rough = 0.8; }               // industrial apron
  else { blk = mix(vec3(0.24, 0.2, 0.16), vec3(0.32, 0.28, 0.22), vnoise(wp.xz / 7.0)); rough = 0.95; } // construction ground
  vec3 col = blk;
  float inS = max(sx.x, sz.x);
  if (inS > 0.0) {
    vec3 sc;
    if (sx.x >= sz.x) sc = streetDetail(sx.y * sx.z, wp.z, sx.z, step(sx.z, uGridA.w * 0.5 + 0.1) * step(uGridA.w * 0.5 - 0.1, sx.z), rough, emis, h, far);
    else sc = streetDetail(sz.y * sz.z, wp.x, sz.z, step(sz.z, uGridA.w * 0.5 + 0.1) * step(uGridA.w * 0.5 - 0.1, sz.z), rough, emis, h, far);
    // crossings: plain asphalt
    float cross = sx.x * sz.x;
    sc = mix(sc, uStreet, cross * 0.8);
    col = mix(col, sc, inS);
  }
  o.alb = col; o.rough = rough; o.metal = 0.0; o.emis = emis; o.h = h * (1.0 - far); o.ao = 1.0;
  return o;
}

CS groundPolar(vec3 wp, float level, float bandIn, float bandOut) {
  // terrace tops: ring promenades and radial avenues around the spire
  CS o;
  float fw = fwidth(wp.x) + fwidth(wp.z);
  float far = smoothstep(2.0, 9.0, fw);
  vec2 d = vec2(wp.x - uPolar.x, (wp.z - uPolar.y) * uPolar.z);
  float r = length(d);
  float th = atan(d.x, d.y);
  float spokes = r < 1400.0 ? 12.0 : (r < 2600.0 ? 24.0 : (r < 3800.0 ? 36.0 : 48.0));
  float sector = th / 6.28318 * spokes;
  float along = th * r;
  float dSpoke = (sector - floor(sector + 0.5)) * 6.28318 / spokes * r;
  float fwa = max(fwidth(dSpoke), 1e-4);
  float rough = 0.7, h = 0.0; vec3 emis = vec3(0.0);
  vec2 pc = vec2(along, r) / 6.0; vec2 pw = max(fwidth(pc), vec2(1e-5));
  float joints = max(fln(pc.x, pw.x, 0.04), fln(pc.y, pw.y, 0.04)) * (1.0 - smoothstep(0.3, 1.0, max(pw.x, pw.y)));
  float tone = hashI(vec2(floor(sector), floor(r / uPolar.w)));
  vec3 col = uPave * mix(0.9, 1.05, tone) * (1.0 - 0.18 * joints);
  // ring streets every ring pitch
  float rk = r / uPolar.w;
  float dRing = (fract(rk + 0.5) - 0.5) * uPolar.w;
  float hwR = uPolarB.y * 0.5;
  float mR = 1.0 - smoothstep(hwR - fw, hwR + fw, abs(dRing));
  float hwA = uPolarB.x * 0.5;
  float mA = 1.0 - smoothstep(hwA - fwa, hwA + fwa, abs(dSpoke));
  if (mR > 0.0) col = mix(col, streetDetail(dRing, along, hwR, 0.0, rough, emis, h, far), mR);
  if (mA > 0.0) col = mix(col, streetDetail(dSpoke, r, hwA, 1.0, rough, emis, h, far), mA * (1.0 - mR));
  o.alb = col; o.rough = rough; o.metal = 0.0; o.emis = emis; o.h = h * (1.0 - far); o.ao = 1.0;
  return o;
}
`;

// ------------------------------------------------------------------ biome terrain and water
const TERRAIN = /* glsl */ `
uniform vec4 uTerr;    // water level, sand band, rock slope threshold, style (0 lake, 1 forest, 2 orchard)
uniform vec3 uTerrC;   // terrain centre (x, z) and radius
struct CS { vec3 alb; float rough; float metal; vec3 emis; float h; float ao; };
CS terrain(vec3 wp, vec3 wn) {
  CS o;
  float fw = fwidth(wp.x) + fwidth(wp.z);
  float far = smoothstep(1.5, 8.0, fw);
  float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
  float n1 = fbm2(wp.xz / 40.0), n2 = vnoise(wp.xz / 6.0);
  vec3 grassA = vec3(0.07, 0.13, 0.04), grassB = vec3(0.16, 0.22, 0.07), dry = vec3(0.3, 0.28, 0.14);
  vec3 col = mix(grassA, grassB, smoothstep(0.3, 0.7, n1));
  col = mix(col, dry, smoothstep(0.62, 0.8, n1) * 0.5);
  col *= mix(0.85, 1.12, mix(n2, 0.5, far));
  vec3 rock = mix(vec3(0.3, 0.28, 0.26), vec3(0.46, 0.43, 0.38), vnoise(wp.xz / 12.0 + wp.y / 9.0));
  float strata = 0.5 + 0.5 * sin(wp.y * 0.35 + n1 * 6.0);
  rock *= mix(0.85, 1.1, strata);
  float r = smoothstep(uTerr.z - 0.08, uTerr.z + 0.08, slope);
  col = mix(col, rock, r);
  // beaches
  float sand = 1.0 - smoothstep(uTerr.x + 1.0, uTerr.x + uTerr.y, wp.y);
  col = mix(col, vec3(0.62, 0.56, 0.42), sand * (1.0 - r));
  // under water: darker silt
  col = mix(col, vec3(0.12, 0.13, 0.1), 1.0 - smoothstep(uTerr.x - 6.0, uTerr.x, wp.y));
  if (uTerr.w > 1.5) {
    // orchard: concentric crop terraces in bands of colour, with planting rows
    float rr = length(wp.xz - uTerrC.xy);
    float band = floor(rr / 88.0);
    float hb = hashI(vec2(band, 7.0));
    vec3 crop = hb < 0.25 ? vec3(0.55, 0.45, 0.16) : (hb < 0.45 ? vec3(0.32, 0.26, 0.42) : (hb < 0.7 ? vec3(0.12, 0.22, 0.06) : (hb < 0.85 ? vec3(0.5, 0.2, 0.12) : vec3(0.2, 0.3, 0.08))));
    float rows = fpc(rr / 3.2, max(fwidth(rr / 3.2), 1e-4), 0.55);
    crop *= mix(0.7, 1.1, rows);
    col = mix(col, crop, (1.0 - r) * step(uTerr.x + 2.0, wp.y));
  }
  o.alb = col; o.rough = mix(0.85, 0.7, r); o.metal = 0.0; o.emis = vec3(0.0);
  o.h = (n2 * 0.6 + r * strata * 1.5) * (1.0 - far); o.ao = mix(0.8, 1.0, n1);
  return o;
}
`;

const WATER = /* glsl */ `
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
struct CS { vec3 alb; float rough; float metal; vec3 emis; float h; float ao; };
CS water(vec3 wp) {
  CS o;
  float t = uCityTime;
  float fw = fwidth(wp.x) + fwidth(wp.z);
  float far = smoothstep(0.6, 4.0, fw);
  float w1 = vnoise(wp.xz / 7.0 + vec2(t * 0.11, t * 0.07));
  float w2 = vnoise(wp.xz / 2.6 - vec2(t * 0.17, -t * 0.13));
  float w3 = vnoise(wp.xz / 23.0 + vec2(-t * 0.03, t * 0.05));
  o.h = (w1 * 0.35 + w2 * 0.15 + w3 * 0.6) * (1.0 - far) * 0.8;
  o.alb = mix(uWaterDeep, uWaterShallow, w3 * 0.4);
  o.rough = mix(0.035, 0.09, far); o.metal = 0.0; o.emis = vec3(0.0); o.ao = 1.0;
  return o;
}
`;

// ------------------------------------------------------------------ foliage (tree crowns)
const FOLIAGE = /* glsl */ `
struct CS { vec3 alb; float rough; float metal; vec3 emis; float h; float ao; };
CS foliage(vec3 wp, vec3 base, vec3 wn) {
  CS o;
  float fw = fwidth(wp.x) + fwidth(wp.y) + fwidth(wp.z);
  float far = smoothstep(0.25, 2.0, fw);
  vec3 q = wp * 0.85;
  float n = vnoise(q.xz + q.y * 0.71) * 0.55 + vnoise(q.zy * 2.3 + q.x * 0.3) * 0.3 + vnoise(q.xy * 4.9) * 0.15;
  float clump = mix(n, 0.5, far);
  float top = clamp(wn.y * 0.5 + 0.5, 0.0, 1.0);
  o.alb = base * mix(0.55, 1.3, clump) * mix(0.75, 1.12, top);
  o.rough = 0.82; o.metal = 0.0; o.emis = vec3(0.0);
  o.h = clump * 0.9 * (1.0 - far); o.ao = mix(0.65, 1.0, clump * 0.6 + top * 0.4);
  return o;
}
`;

// ------------------------------------------------------------------ material patching
const VERT_PARS = /* glsl */ `
attribute vec2 aFac;
attribute float aZone;
varying vec2 vFacC;
varying float vZoneC;
varying float vSeedC;
varying vec3 vWorldC;
varying vec3 vWNormC;
varying float vStyleC;
uniform float uSeed;
uniform float uStyle;
#ifdef USE_INSTANCING
attribute float aStyle;
#endif
`;
const VERT_MAIN = /* glsl */ `
{
  float sH = 1.0, sV = 1.0;
  vec4 wpc = vec4(transformed, 1.0);
  vec3 wnc = objectNormal;
  vSeedC = uSeed;
  vStyleC = uStyle;
#ifdef USE_INSTANCING
  if (uStyle < 0.0) vStyleC = aStyle;
  sH = length(instanceMatrix[0].xyz); sV = length(instanceMatrix[1].xyz);
  wpc = instanceMatrix * wpc;
  wnc = mat3(instanceMatrix) * wnc;
  vec3 tr = instanceMatrix[3].xyz;
  vSeedC = hashI(floor(tr.xz * 0.5) + vec2(floor(tr.y), 0.0));
#endif
  wpc = modelMatrix * wpc;
  vWorldC = wpc.xyz;
  vWNormC = normalize(mat3(modelMatrix) * wnc);
  vFacC = aFac * vec2(sH, sV);
  if (aZone > 2.5 && aZone < 3.5) vFacC = aFac * sH;
  vZoneC = aZone;
}
`;

/**
 * Patch a MeshStandardMaterial into a city material.
 * kind: 'facade' | 'plating' | 'ground' | 'haze' (haze only, keeps the material's own look)
 */
export function cityPatch(mat, kind, uniforms = {}, { groundMode = 'cart', key = '' } = {}) {
  const U = { ...CITY_U, uSeed: { value: Math.random() }, uStyle: { value: 0 }, ...uniforms };
  mat.userData.cityUniforms = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    const usesAttr = kind === 'facade';
    let vp = (usesAttr ? VERT_PARS : VERT_PARS.replace('attribute vec2 aFac;\nattribute float aZone;\n', '').replace('#ifdef USE_INSTANCING\nattribute float aStyle;\n#endif', '').replace('if (uStyle < 0.0) vStyleC = aStyle;', ''));
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${CITY_COMMON}\n${vp}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${usesAttr ? VERT_MAIN : VERT_MAIN.replace('if (uStyle < 0.0) vStyleC = aStyle;', '').replace('vFacC = aFac * vec2(sH, sV);', 'vFacC = vec2(0.0);').replace('if (aZone > 2.5 && aZone < 3.5) vFacC = aFac * sH;', '').replace('vZoneC = aZone;', 'vZoneC = 0.0;')}`);
    let surf = '', call = '';
    if (kind === 'facade') { surf = FACADE; call = 'CS cs = citySurface(vFacC, vZoneC, vSeedC, vWorldC);'; }
    else if (kind === 'plating') { surf = PLATING; call = 'CS cs = plating(vWorldC, normalize(vWNormC), uSeed * 31.0);'; }
    else if (kind === 'foliage') { surf = FOLIAGE; call = 'CS cs = foliage(vWorldC, diffuseColor.rgb, normalize(vWNormC));'; }
    else if (kind === 'terrain') { surf = TERRAIN; call = 'CS cs = terrain(vWorldC, normalize(vWNormC));'; }
    else if (kind === 'water') { surf = WATER; call = 'CS cs = water(vWorldC);'; }
    else if (kind === 'ground') {
      surf = GROUND;
      call = groundMode === 'polar' ? 'CS cs = groundPolar(vWorldC, 0.0, 0.0, 0.0);' : 'CS cs = groundCart(vWorldC);';
    }
    const fragPars = `${CITY_COMMON}\n${CITY_FRAG_COMMON}\nuniform float uCityTime;\nuniform float uSeed;\n${CITY_HAZE}\nvarying vec2 vFacC;\nvarying float vZoneC;\nvarying float vSeedC;\nvarying vec3 vWorldC;\nvarying vec3 vWNormC;\n${surf}`;
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>\n${fragPars}`);
    if (kind !== 'haze') {
      fs = fs
        .replace('#include <color_fragment>', `#include <color_fragment>\n${call}\ndiffuseColor.rgb = cs.alb;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = cs.rough;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = cs.metal;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = cityBump(-vViewPosition, normal, cs.h);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cs.emis;')
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= cs.ao;\nreflectedLight.indirectSpecular *= mix(1.0, cs.ao, 0.7);\nreflectedLight.directDiffuse *= mix(1.0, cs.ao, 0.35);');
    }
    fs = fs.replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = applyHaze(gl_FragColor.rgb, vWorldC);' + (DEBUG && kind === 'facade' ? '\ngl_FragColor.rgb = vec3(fract(vFacC / 20.0), vZoneC / 9.0);' : ''));
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `city-${kind}-${groundMode}-${key}`;
  return mat;
}

export const HAZE_GLSL = CITY_HAZE;
export const COMMON_GLSL = CITY_COMMON;
