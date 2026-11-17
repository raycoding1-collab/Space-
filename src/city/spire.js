// The Crown Spire and the Halo Promenade.
// The spire is a 4.6 km hexafoil tower that twists a sixth of a turn as it rises, with gilded ribs on
// its lobes, luminous glass bands, twelve ring sky-terraces, six buttress fins that flare out over the
// top terrace like roots, and a crystalline crown with a pulsing beacon. The Halo, a 3.4 km garden ring,
// hangs around it on cables and turns slowly.
import * as THREE from 'three';
import { Shape, ShapeBatch, Z, circle } from './geo.js';
import { SPIRE, HALO, PLATEAUS } from './layout.js';
import { TAU, RNG } from '../lib/rng.js';
import { LightSet, NAV } from '../ship/lights.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG } from '../lib/glsl.js';
import { CITY_U, HAZE_GLSL, COMMON_GLSL } from './shaders.js';
import { buildTrees } from './districts.js';

const Y0 = PLATEAUS[4].h; // 620
const H = SPIRE.top - Y0; // 4580
const CROWN = 0.885; // fraction of the height where the crown begins
const TWIST = Math.PI / 3;

export const spireR = (y) => {
  const t = Math.min(1, Math.max(0, (y - Y0) / H));
  return 58 + 362 * Math.pow(1 - t, 1.45) + 40 * Math.exp(-t * 30);
};
export const spireTwist = (y) => TWIST * Math.pow(Math.max(0, (y - Y0) / H), 0.9);
const LOBE = 0.15;
const lobeR = (R, th) => R * (1 + LOBE * Math.cos(6 * th));

const CRYSTAL_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vL = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}`;
const CRYSTAL_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${COMMON_GLSL}
uniform float uCityTime;
uniform float uBase;
${HAZE_GLSL}
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  vec3 N = normalize(vN);
  float ndv = abs(dot(N, V));
  float fres = pow(1.0 - ndv, 3.0);
  float h = vL.y;
  // light rising through the crystal: warm at the root, cool toward the tips, with drifting veins
  float pulse = 0.78 + 0.22 * sin(uCityTime * 0.9 - h * 0.02);
  float ang = atan(vL.x, vL.z);
  float veins = vnoise(vec2(ang * 7.0, h * 0.025 - uCityTime * 0.08)) * 0.6 + vnoise(vec2(ang * 19.0, h * 0.07)) * 0.4;
  vec3 tint = mix(vec3(1.0, 0.66, 0.36), vec3(0.62, 0.8, 1.0), smoothstep(0.0, 520.0, h));
  vec3 inner = tint * (0.3 + 0.7 * pow(ndv, 1.5)) * pulse * mix(0.55, 1.25, veins);
  // facets: every flat face catches light differently; their edges glint
  float facet = 0.5 + 0.5 * sin(dot(N, vec3(13.0, 7.0, 11.0)));
  float edge = clamp(length(fwidth(N)) * 6.0, 0.0, 1.0);
  vec3 refl = vec3(0.7, 0.8, 1.0) * fres * 1.1 + vec3(1.0, 0.92, 0.8) * pow(max(dot(reflect(-V, N), uSunDirC), 0.0), 80.0) * 4.0;
  vec3 col = inner * uBase * (0.45 + 0.55 * facet) + refl + tint * edge * 1.6;
  gl_FragColor = vec4(applyHaze(col, vW), 1.0);
  ${LOGDEPTH_FRAG}
}`;

/** Glowing crystal: inner light rising through faceted glass (crown shards, bow beacon). */
export function crystalMat(base = 1.6) {
  return new THREE.ShaderMaterial({
    uniforms: { uCityTime: CITY_U.uCityTime, uSunDirC: CITY_U.uSunDirC, uBase: { value: base },
      uHazeC: CITY_U.uHazeC, uHazeR: CITY_U.uHazeR, uHazeK: CITY_U.uHazeK, uHazeFloor: CITY_U.uHazeFloor, uHazeCol: CITY_U.uHazeCol },
    vertexShader: CRYSTAL_VERT, fragmentShader: CRYSTAL_FRAG,
  });
}

export function buildSpire(M, ctx) {
  const root = new THREE.Group();
  root.name = 'crown-spire';
  const B = new ShapeBatch();
  const rng = new RNG(5200);
  const spireMat = M.spireTower;
  const lights = new LightSet();

  // ---------------------------------------------------------------- tower body
  const NA = 96, NS = 128;
  const yTop = Y0 + H * CROWN;
  const rings = [];
  for (let i = 0; i <= NS; i++) {
    const y = Y0 - 4 + (yTop - Y0 + 4) * (i / NS);
    const R = spireR(y), tw = spireTwist(y);
    const ring = [];
    for (let j = 0; j < NA; j++) {
      const th = (j / NA) * TAU;
      const r = lobeR(R, th);
      ring.push([SPIRE.x + Math.sin(th + tw) * r, y, SPIRE.z + Math.cos(th + tw) * r]);
    }
    rings.push(ring);
  }
  // zones: gilded ribs on the lobe crests, luminous glass bands every ~360 m, curtain wall elsewhere
  const bandEvery = Math.round(NS / 13);
  const zoneFn = (i, j) => {
    if (j % (NA / 6) === 0) return Z.METAL;
    const k = i % bandEvery;
    if (k === bandEvery - 1) return Z.GLASS;
    return Z.FACADE;
  };
  B.get(spireMat).loft(rings, Z.FACADE, { closed: true, crease: 50, zoneFn });
  // the base sits in a gilded collar
  B.get(M.metal).prism(circle(spireR(Y0) * 1.22, 96, SPIRE.x, SPIRE.z), Y0 - 2, Y0 + 26, Z.METAL, Z.STONE);

  // ---------------------------------------------------------------- ring sky-terraces
  for (let k = 0; k < 12; k++) {
    const y = Y0 + H * CROWN * ((k + 1) / 13.2);
    const R = spireR(y), tw = spireTwist(y);
    const out = 34 + 46 * Math.sin((k / 11) * Math.PI);
    const ringAt = (dr, yy) => {
      const pts = [];
      for (let j = 0; j < NA; j++) {
        const th = (j / NA) * TAU;
        const r = lobeR(R, th) * 0.96 + dr;
        pts.push([SPIRE.x + Math.sin(th + tw) * r, yy, SPIRE.z + Math.cos(th + tw) * r]);
      }
      return pts;
    };
    const sh = B.get(M.metal);
    // underside (lit trim), outer edge (gilded), top (garden)
    sh.loft([ringAt(0, y - 9), ringAt(out * 0.92, y - 9)], Z.TRIM, { closed: true, orient: [0, -1, 0] });
    sh.loft([ringAt(out * 0.92, y - 9), ringAt(out, y - 2), ringAt(out, y + 3)], Z.METAL, { closed: true, crease: 60, orient: (p) => [p[0] - SPIRE.x, 0, p[2] - SPIRE.z] });
    sh.loft([ringAt(out, y + 3), ringAt(out * 0.6, y + 3)], Z.GARDEN, { closed: true, orient: [0, 1, 0] });
    sh.loft([ringAt(out * 0.6, y + 3), ringAt(0, y + 3)], Z.STONE, { closed: true, orient: [0, 1, 0] });
    for (let j = 0; j < 24; j++) {
      const th = (j / 24) * TAU;
      const r = lobeR(R, th) * 0.96 + out + 1;
      lights.add(new THREE.Vector3(SPIRE.x + Math.sin(th + tw) * r, y - 5, SPIRE.z + Math.cos(th + tw) * r), NAV.warm, { intensity: 4, size: 3 });
    }
  }

  // ---------------------------------------------------------------- buttress fins (roots)
  const finTop = Y0 + 1500;
  const fins = [];
  for (let f = 0; f < 6; f++) {
    const th0 = (f / 6) * TAU;
    const secs = [];
    const N = 40;
    const edge = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const y = Y0 + (finTop - Y0) * Math.pow(s, 1.25);
      const R = lobeR(spireR(y), 0);
      const reach = (1060 - lobeR(spireR(Y0), 0)) * Math.pow(1 - s, 2.3);
      const rOut = R + 6 + reach;
      const w = 46 * (1 - s) + 14;
      const tw = spireTwist(y);
      const a = th0 + tw;
      const ca = Math.sin(a), sa = Math.cos(a), px = Math.cos(a), pz = -Math.sin(a);
      const r0 = R * 0.82;
      // section: thin rectangle in the radial plane
      secs.push([
        [SPIRE.x + ca * r0 + px * w / 2, y, SPIRE.z + sa * r0 + pz * w / 2],
        [SPIRE.x + ca * rOut + px * w * 0.32, y, SPIRE.z + sa * rOut + pz * w * 0.32],
        [SPIRE.x + ca * rOut - px * w * 0.32, y, SPIRE.z + sa * rOut - pz * w * 0.32],
        [SPIRE.x + ca * r0 - px * w / 2, y, SPIRE.z + sa * r0 - pz * w / 2],
      ]);
      edge.push(new THREE.Vector3(SPIRE.x + ca * (rOut + 2), y, SPIRE.z + sa * (rOut + 2)));
    }
    B.get(M.metal).loft(secs, Z.METAL, { closed: true, crease: 35 });
    // a lit seam along the crest of each fin
    const seam = secs.map((q) => {
      const a = q[1], b = q[2];
      return [[(a[0] + b[0]) / 2, a[1] + 0.5, (a[2] + b[2]) / 2]];
    });
    const seamRings = [];
    for (let i = 0; i < seam.length; i++) {
      const p = seam[i][0], e = edge[i];
      const dx = e.x - p[0], dz = e.z - p[2], l = Math.hypot(dx, dz) || 1;
      const o = 1.6;
      const side = [-dz / l * 3, dx / l * 3];
      seamRings.push([[p[0] + dx / l * o + side[0], p[1], p[2] + dz / l * o + side[1]], [p[0] + dx / l * o - side[0], p[1], p[2] + dz / l * o - side[1]]]);
    }
    B.get(M.metal).loft(seamRings, Z.TRIM, { closed: false, orient: (p) => [p[0] - SPIRE.x, 0.3, p[2] - SPIRE.z] });
    fins.push(new THREE.CatmullRomCurve3(edge));
  }
  ctx.spireFins = fins;

  // ---------------------------------------------------------------- crystalline crown
  const crystalMat = new THREE.ShaderMaterial({
    uniforms: { uCityTime: CITY_U.uCityTime, uSunDirC: CITY_U.uSunDirC, uBase: { value: 1.05 },
      uHazeC: CITY_U.uHazeC, uHazeR: CITY_U.uHazeR, uHazeK: CITY_U.uHazeK, uHazeFloor: CITY_U.uHazeFloor, uHazeCol: CITY_U.uHazeCol },
    vertexShader: CRYSTAL_VERT, fragmentShader: CRYSTAL_FRAG,
  });
  {
    const crown = new Shape();
    const yb = yTop - 30;
    const Rb = spireR(yTop);
    // gilded crown ring the shards stand in
    B.get(M.metal).loft([
      circle(Rb * 1.25, 48, SPIRE.x, SPIRE.z).map(([x, z]) => [x, yb, z]),
      circle(Rb * 1.4, 48, SPIRE.x, SPIRE.z).map(([x, z]) => [x, yb + 40, z]),
      circle(Rb * 1.3, 48, SPIRE.x, SPIRE.z).map(([x, z]) => [x, yb + 52, z]),
    ], Z.METAL, { closed: true, crease: 50 });
    B.get(M.metal).cap(circle(Rb * 1.3, 48, SPIRE.x, SPIRE.z), yb + 52, Z.STONE);
    const shard = (cx, cz, r, y0, len, tilt, rot) => {
      // hexagonal bipyramid, tilted outward
      const ax = new THREE.Vector3(Math.sin(rot) * Math.sin(tilt), Math.cos(tilt), Math.cos(rot) * Math.sin(tilt));
      const base = new THREE.Vector3(cx, y0, cz);
      const u = new THREE.Vector3(1, 0, 0).cross(ax).normalize(), v = new THREE.Vector3().crossVectors(ax, u);
      const ring = (t, rr) => {
        const c = base.clone().addScaledVector(ax, len * t);
        const out = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + 0.3;
          const p = c.clone().addScaledVector(u, Math.cos(a) * rr).addScaledVector(v, Math.sin(a) * rr);
          out.push([p.x - SPIRE.x, p.y - yb, p.z - SPIRE.z]);
        }
        return out;
      };
      crown.loft([ring(0, r * 0.25), ring(0.22, r), ring(0.7, r * 0.82), ring(1, r * 0.02)], 0, { closed: true, crease: 20 });
    };
    shard(SPIRE.x, SPIRE.z, 34, yb + 30, 560, 0, 0);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + spireTwist(yTop);
      const rr = Rb * 0.95;
      shard(SPIRE.x + Math.sin(a) * rr, SPIRE.z + Math.cos(a) * rr, 22, yb + 20, 300 + 60 * (k % 2), 0.16, a);
      const a2 = a + TAU / 12;
      shard(SPIRE.x + Math.sin(a2) * rr * 0.8, SPIRE.z + Math.cos(a2) * rr * 0.8, 14, yb + 30, 190, 0.1, a2);
    }
    const g = crown.toGeometry();
    const mesh = new THREE.Mesh(g, crystalMat);
    mesh.position.set(SPIRE.x, yb, SPIRE.z);
    mesh.castShadow = true;
    mesh.name = 'crown';
    root.add(mesh);
    // beacon at the crown's tip
    const beacon = new LightSet();
    beacon.add(new THREE.Vector3(SPIRE.x, yb + 30 + 560 + 12, SPIRE.z), new THREE.Color(1.0, 0.85, 0.6), { intensity: 40, size: 26, period: 2.4, duty: 0.5 });
    beacon.add(new THREE.Vector3(SPIRE.x, yb + 30 + 560 + 12, SPIRE.z), new THREE.Color(1.0, 0.9, 0.75), { intensity: 6, size: 14 });
    beacon.build(root, { name: 'beacon', minPx: 4 });
    ctx.crownTop = new THREE.Vector3(SPIRE.x, yb + 600, SPIRE.z);
  }

  // ---------------------------------------------------------------- the Halo Promenade
  {
    const halo = new THREE.Group();
    halo.name = 'halo';
    halo.position.set(SPIRE.x, 0, SPIRE.z);
    const HB = new ShapeBatch();
    const seg = 256;
    const R = HALO.r, y = HALO.y, w = HALO.width;
    const ringAt = (r, yy) => circle(r, seg).map(([x, z]) => [x, yy, z]);
    // lens section: garden deck on top, glazed galleries on both rims, a keel of lights beneath
    const prof = [
      [R - w / 2 - 6, y + 4], [R - w / 2, y + 12], [R - w / 2 + 14, y + 16],
      [R - 9, y + 16], [R + 9, y + 16], [R + w / 2 - 14, y + 16], [R + w / 2, y + 12], [R + w / 2 + 6, y + 4],
      [R + w / 2 - 10, y - 14], [R + 18, y - 34], [R - 18, y - 34], [R - w / 2 + 10, y - 14],
    ];
    const zones = [Z.GLASS, Z.METAL, Z.GARDEN, Z.STONE, Z.GARDEN, Z.METAL, Z.GLASS, Z.FACADE, Z.CLAD, Z.TRIM, Z.CLAD, Z.FACADE];
    for (let i = 0; i < prof.length; i++) {
      const a = prof[i], b = prof[(i + 1) % prof.length];
      HB.get(M.haloMat).loft([ringAt(a[0], a[1]), ringAt(b[0], b[1])], zones[i], { closed: true, crease: 60, orient: (p) => {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        // outward from the section's centroid
        const c = [R, y - 6];
        return [p[0] / Math.hypot(p[0], p[2]) * (mx - c[0]), my - c[1], p[2] / Math.hypot(p[0], p[2]) * (mx - c[0])];
      } });
    }
    // cables from a collar on the spire
    const cy = HALO.cableY;
    const rc = spireR(cy) * 1.18;
    HB.get(M.metal).loft([circle(rc, 64).map(([x, z]) => [x, cy - 30, z]), circle(rc + 14, 64).map(([x, z]) => [x, cy, z]), circle(rc, 64).map(([x, z]) => [x, cy + 30, z])], Z.METAL, { closed: true, crease: 60 });
    const NC = 48;
    for (let k = 0; k < NC; k++) {
      const a = (k / NC) * TAU;
      const top = [Math.sin(a) * (rc + 8), cy, Math.cos(a) * (rc + 8)];
      for (const dr of [-w / 2 + 8, w / 2 - 8]) {
        const bot = [Math.sin(a) * (R + dr), y + 16, Math.cos(a) * (R + dr)];
        HB.get(M.metal).beam(top, bot, 2.4, 2.4, Z.METAL);
      }
      lights.add(new THREE.Vector3(SPIRE.x + Math.sin(a) * (R + 22), y - 36, SPIRE.z + Math.cos(a) * (R + 22)), NAV.warm, { intensity: 5, size: 4 });
    }
    HB.build(halo, { name: 'halo' });
    // trees along the garden deck
    const trees = [];
    for (let k = 0; k < 900; k++) {
      const a = rng.range(0, TAU);
      let r = R + rng.range(-w / 2 + 22, w / 2 - 22);
      if (Math.abs(r - R) < 14) r += Math.sign(r - R || 1) * 14;
      trees.push([Math.sin(a) * r, y + 16, Math.cos(a) * r, rng.range(0.7, 1.2), rng.next()]);
    }
    buildTrees(halo, trees, M, 'halo-trees', { fine: true });
    const hl = new LightSet();
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * TAU;
      for (const dr of [-w / 2 - 6, w / 2 + 6]) hl.add(new THREE.Vector3(Math.sin(a) * (R + dr), y + 5, Math.cos(a) * (R + dr)), NAV.white, { intensity: 3, size: 2.5, period: 4, phase: k / 96, duty: 0.5 });
    }
    hl.build(halo, { name: 'halo-lights' });
    root.add(halo);
    ctx.halo = halo;
    ctx.animated.push((t) => { halo.rotation.y = t * 0.004; });
  }

  // elevator cars racing up the fins
  {
    const cars = new LightSet();
    const defs = [];
    fins.forEach((curve, f) => {
      for (let k = 0; k < 4; k++) {
        defs.push({ curve, ph: k / 4 + f * 0.13, sp: 0.018 + 0.006 * ((k + f) % 3) });
        cars.add(new THREE.Vector3(), new THREE.Color(1.0, 0.82, 0.55), { intensity: 9, size: 7 });
      }
    });
    const pts = cars.build(root, { name: 'elevators', minPx: 2.5 });
    pts.frustumCulled = false;
    const attr = pts.geometry.attributes.position;
    const tmp = new THREE.Vector3();
    ctx.animated.push((t) => {
      defs.forEach((d, i) => {
        let u = (t * d.sp + d.ph) % 1;
        u = u < 0.5 ? u * 2 : 2 - u * 2; // up and back down
        d.curve.getPointAt(Math.min(0.999, u), tmp);
        attr.setXYZ(i, tmp.x, tmp.y, tmp.z);
      });
      attr.needsUpdate = true;
    });
  }

  B.build(root, { name: 'spire' });
  lights.build(root, { name: 'spire-lights' });
  return root;
}
