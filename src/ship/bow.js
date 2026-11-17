// The bow: command spire, observation dome, deflector array and the shimmering bow-shock shield
// that sweeps interstellar dust from the ark's path.
import * as THREE from 'three';
import { lathe, beamMatrix, Batch, Instancer, cyl, tiledCylinderZ, surfaceMatrix } from '../lib/geo.js';
import { RNG, TAU, DEG, lerp } from '../lib/rng.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG, HASH } from '../lib/glsl.js';
import { scatterCylinder } from './greebles.js';
import { LightSet, NAV } from './lights.js';

// Command hull radius as a function of z (smooth ogive)
const CTRL = [
  [2830, 62], [2870, 112], [2930, 132], [3010, 136], [3110, 128], [3220, 110],
  [3320, 86], [3410, 58], [3480, 34], [3530, 15], [3556, 5],
];
function hullR(z) {
  if (z <= CTRL[0][0]) return CTRL[0][1];
  for (let i = 0; i < CTRL.length - 1; i++) {
    const [za, ra] = CTRL[i], [zb, rb] = CTRL[i + 1];
    if (z <= zb) {
      const t = (z - za) / (zb - za);
      const s = t * t * (3 - 2 * t);
      return lerp(ra, rb, 0.5 * t + 0.5 * s);
    }
  }
  return CTRL[CTRL.length - 1][1];
}
function profile(za, zb, n = 16, dr = 0) {
  const p = [];
  for (let i = 0; i <= n; i++) {
    const z = za + ((zb - za) * i) / n;
    p.push([hullR(z) + dr, z]);
  }
  return p;
}

const SHIELD_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}
`;
const SHIELD_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${HASH}
uniform float uTime;
uniform vec4 uImpacts[6];
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vLocal;
varying vec3 vWorld;
varying vec3 vN;
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
  vec2 q = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
  q = abs(q);
  return 0.5 - max(dot(q, s * 0.5), q.x);
}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(normalize(vN), V));
  float fres = pow(1.0 - ndv, 3.0);
  float rho = length(vLocal.xy);
  vec2 hp = vLocal.xy / 26.0;
  float e = hexEdge(hp);
  float lines = 1.0 - smoothstep(0.0, 0.05, e);
  float cellFlicker = step(0.985, hash12(floor(hp * 1.3) + floor(uTime * 2.0)));
  float wave = pow(0.5 + 0.5 * sin(rho * 0.022 - uTime * 1.1), 18.0);
  float imp = 0.0;
  for (int i = 0; i < 6; i++) {
    vec3 c = uImpacts[i].xyz;
    float age = uTime - uImpacts[i].w;
    if (age < 0.0 || age > 4.0) continue;
    float d = length(vLocal - c);
    float ring = exp(-pow((d - age * 140.0) / 10.0, 2.0)) * exp(-age * 1.2);
    float flash = exp(-d / 16.0) * exp(-age * 5.0) * 3.0;
    imp += ring * (0.6 + lines * 2.0) + flash;
  }
  float edgeFade = smoothstep(640.0, 420.0, rho);
  float I = (fres * 0.32 + lines * (0.05 + fres * 0.5) + wave * 0.05 * (0.3 + lines) + cellFlicker * lines * 0.4 + imp) * edgeFade;
  gl_FragColor = vec4(uColor * I * uStrength, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

export function buildBow(M, ctx) {
  const group = new THREE.Group();
  group.name = 'bow';
  const rng = new RNG(808);
  const batch = new Batch();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const darkI = new Instancer(box, M.trussDark);
  const greebleI = new Instancer(box, M.greeble, { colors: true });
  const lights = new LightSet();
  const m4 = new THREE.Matrix4();

  // ---------------- Command hull ----------------
  const pieces = [
    [2830, 2950, M.hull], [2950, 2972, M.gold], [2972, 3080, M.hab], [3080, 3096, M.hullDark],
    [3096, 3230, M.hull], [3230, 3300, M.hab], [3300, 3440, M.hullWarm], [3440, 3556, M.hullDark],
  ];
  for (const [za, zb, mat] of pieces) batch.add(lathe(profile(za, zb, 18), { segments: 96, tile: 48 }), mat);
  // panel seams / armour belts
  for (const z of [2900, 3040, 3160, 3260, 3380]) {
    batch.add(lathe([[hullR(z - 3) + 0.3, z - 3], [hullR(z) + 2.2, z], [hullR(z + 3) + 0.3, z + 3]], { segments: 96 }), M.hullDark);
  }
  scatterCylinder(greebleI, rng, { r: 128, z0: 2930, z1: 3100, count: 260, w: [2, 9], h: [0.5, 3], d: [2, 10] });
  scatterCylinder(greebleI, rng, { r: 108, z0: 3120, z1: 3220, count: 160, w: [2, 7], h: [0.5, 2.5], d: [2, 8] });

  // ---------------- Blades (four swept fins give the bow its arrowhead silhouette) ----------------
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(100, 2870);
  bladeShape.lineTo(250, 2930);
  bladeShape.lineTo(262, 2965);
  bladeShape.lineTo(214, 3040);
  bladeShape.lineTo(90, 3330);
  bladeShape.lineTo(80, 3300);
  bladeShape.lineTo(80, 2880);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 5, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 1 });
  bladeGeo.translate(0, 0, -2.5);
  scaleUV(bladeGeo, 1 / 48);
  for (let k = 0; k < 4; k++) {
    const phi = k * 90 * DEG + 45 * DEG;
    const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
    const tangent = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
    const bm = new THREE.Matrix4().makeBasis(radial, new THREE.Vector3(0, 0, 1), tangent.clone().negate());
    batch.add(bladeGeo, M.hull, bm);
    // leading-edge strip
    const a = radial.clone().multiplyScalar(250).setZ(2930), b = radial.clone().multiplyScalar(262).setZ(2965);
    beamMatrix(a, b, 7, 7, tangent, m4, 4); darkI.add(m4);
    const c = radial.clone().multiplyScalar(214).setZ(3040), d = radial.clone().multiplyScalar(90).setZ(3330);
    beamMatrix(c, d, 3.2, 6.5, tangent, m4); darkI.add(m4);
    // tip strobes & running lights
    lights.add(radial.clone().multiplyScalar(266).setZ(2966), NAV.white, { period: 1.5, phase: k * 0.25, duty: 0.04, size: 3, intensity: 18 });
    const side = Math.cos(phi) > 0 ? NAV.green : NAV.red;
    lights.add(radial.clone().multiplyScalar(255).setZ(2930), side, { intensity: 9, size: 2.2 });
    for (let j = 0; j < 10; j++) {
      const t = j / 9;
      const p = c.clone().lerp(d, t).add(tangent.clone().multiplyScalar(4));
      lights.add(p, NAV.cyan, { intensity: 3, size: 1 });
    }
  }

  // ---------------- Observation dome ----------------
  {
    const zc = 3010, rDome = 36;
    const base = new THREE.Vector3(0, hullR(zc) - 6, zc);
    const glass = new THREE.SphereGeometry(rDome, 48, 24, 0, TAU, 0, Math.PI / 2);
    const gm = new THREE.Matrix4().makeTranslation(base.x, base.y, base.z);
    batch.add(glass, M.glass, gm);
    // collar
    const collar = new THREE.CylinderGeometry(rDome + 3, rDome + 6, 8, 48, 1, true);
    batch.add(collar, M.hullDark, new THREE.Matrix4().makeTranslation(base.x, base.y + 2, base.z));
    // interior: lit garden floor
    const floor = new THREE.CircleGeometry(rDome - 1, 48).rotateX(-Math.PI / 2);
    batch.add(floor, M.glowWarm, new THREE.Matrix4().makeTranslation(base.x, base.y + 3, base.z));
    // meridian ribs
    for (let k = 0; k < 10; k++) {
      const phi = (k / 10) * TAU;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const th = (i / 12) * Math.PI / 2;
        pts.push(new THREE.Vector3(Math.cos(phi) * Math.cos(th) * (rDome + 0.5), Math.sin(th) * (rDome + 0.5), Math.sin(phi) * Math.cos(th) * (rDome + 0.5)).add(base));
      }
      batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.6, 5, false), M.hullDark);
    }
  }

  // ---------------- Deflector array ----------------
  const defZ = 3200;
  {
    const rr = 246;
    batch.add(new THREE.TorusGeometry(rr, 10, 16, 256), M.hullDark, new THREE.Matrix4().makeTranslation(0, 0, defZ));
    batch.add(new THREE.TorusGeometry(rr, 3.2, 8, 256), M.glowCyan, new THREE.Matrix4().makeTranslation(0, 0, defZ + 10));
    batch.add(lathe([[rr - 6, defZ - 14], [rr + 8, defZ - 14], [rr + 8, defZ - 10], [rr - 6, defZ - 10]], { segments: 256 }), M.hull);
    for (let k = 0; k < 8; k++) {
      const phi = (k / 8) * TAU + 22.5 * DEG;
      const p = cyl(rr, phi, defZ + 6);
      batch.add(new THREE.SphereGeometry(13, 20, 12), M.hullDark, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      const q = cyl(rr, phi, defZ + 17);
      batch.add(new THREE.SphereGeometry(6, 16, 10), M.glowCyan, new THREE.Matrix4().makeTranslation(q.x, q.y, q.z));
      lights.add(cyl(rr, phi, defZ + 22), NAV.cyan, { intensity: 10, size: 6 });
      // struts back to the hull
      const a = cyl(hullR(defZ - 60) - 4, phi, defZ - 60), b = cyl(rr - 8, phi, defZ);
      beamMatrix(a, b, 6, 4, null, m4); darkI.add(m4);
      const a2 = cyl(hullR(defZ + 40) - 4, phi + 6 * DEG, defZ + 40);
      beamMatrix(a2, b, 3, 3, null, m4); darkI.add(m4);
    }
  }

  // ---------------- Forward lance & sensor crown ----------------
  batch.add(tiledCylinderZ(4, 1.4, 150, 16), M.chrome, new THREE.Matrix4().makeTranslation(0, 0, 3556 + 75));
  batch.add(tiledCylinderZ(7, 4, 30, 16), M.hullDark, new THREE.Matrix4().makeTranslation(0, 0, 3556 + 10));
  for (let k = 0; k < 3; k++) {
    const phi = (k / 3) * TAU;
    const a = cyl(20, phi, 3500), b = cyl(6, phi, 3640);
    beamMatrix(a, b, 1.2, 1.2, null, m4); darkI.add(m4);
  }
  lights.add(new THREE.Vector3(0, 0, 3707), NAV.white, { period: 2.0, phase: 0.5, duty: 0.05, size: 4, intensity: 22 });
  lights.add(new THREE.Vector3(0, 0, 3640), NAV.red, { period: 1.0, phase: 0.1, duty: 0.4, size: 2, intensity: 8 });
  for (let k = 0; k < 12; k++) {
    const phi = (k / 12) * TAU;
    const z = 3330;
    const p = cyl(hullR(z) + 3, phi, z);
    const dish = new THREE.SphereGeometry(7, 16, 8, 0, TAU, 0, Math.PI * 0.32);
    const X = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
    const Y = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0.4).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    const dm = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(p);
    batch.add(dish, M.chrome, dm);
  }

  // ---------------- Bow-shock shield ----------------
  const apex = 3790, f = 330;
  const shieldProf = [];
  for (let i = 0; i <= 40; i++) {
    const r = (i / 40) * 640;
    shieldProf.push([r, apex - (r * r) / (2 * f)]);
  }
  // r increasing, z decreasing → normals point forward/outward
  const shieldGeo = lathe(shieldProf, { segments: 128, uvMode: 'unit' });
  const impacts = [];
  for (let i = 0; i < 6; i++) impacts.push(new THREE.Vector4(0, 0, 0, -100));
  const shieldMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uImpacts: { value: impacts },
      uColor: { value: new THREE.Vector3(0.35, 0.75, 1.0) },
      uStrength: { value: 0.3 },
    },
    vertexShader: SHIELD_VERT,
    fragmentShader: SHIELD_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  shieldMat.userData.castShadow = false;
  const shield = new THREE.Mesh(shieldGeo, shieldMat);
  shield.renderOrder = 4;
  shield.name = 'bow-shield';
  group.add(shield);
  let nextImpact = 0, impIdx = 0;
  ctx.animated.push((t) => {
    shieldMat.uniforms.uTime.value = t;
    if (t > nextImpact || t < nextImpact - 30) {
      const r = Math.sqrt(rng.next()) * 420;
      const a = rng.range(0, TAU);
      impacts[impIdx].set(r * Math.cos(a), r * Math.sin(a), apex - (r * r) / (2 * f), t);
      impIdx = (impIdx + 1) % 6;
      nextImpact = t + rng.range(0.6, 2.6);
    }
  });

  batch.build(group, { name: 'bow' });
  darkI.build(group, 'bow-frames');
  greebleI.build(group, 'bow-greebles');
  lights.build(group, { name: 'bow-lights' });
  return { group, shield };
}

export function scaleUV(g, k) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}
