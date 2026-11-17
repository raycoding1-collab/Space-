// The keel: a 5.5 km hexagonal space-frame carrying the pressurised core, maglev transit tubes
// and the energy conduits that feed every system forward of the reactors.
import * as THREE from 'three';
import { lathe, beamMatrix, Batch, Instancer, cyl, tiledCylinderZ, surfaceMatrix } from '../lib/geo.js';
import { RNG, TAU, DEG } from '../lib/rng.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG, HASH } from '../lib/glsl.js';
import { scatterCylinder, pipeRuns, GREEBLE_TONES } from './greebles.js';
import { LightSet, NAV } from './lights.js';
import { SHIP } from '../world.js';

export const SPINE = {
  z0: -2620,
  z1: 2900,
  R: 58,
  bay: 46,
  gaps: [[SHIP.arcadia.z0 - 70, SHIP.arcadia.z1 + 70]],
  tubes: [90, 210, 330].map((a) => ({ phi: a * DEG, r: 33 })),
  conduits: [30, 150, 270].map((a) => ({ phi: a * DEG, r: 44 })),
};

const CONDUIT_VERT = /* glsl */ `
${LOGDEPTH_VERT_PARS}
varying vec3 vPos;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGDEPTH_VERT}
}
`;
const CONDUIT_FRAG = /* glsl */ `
${LOGDEPTH_FRAG_PARS}
${HASH}
uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uBase;
varying vec3 vPos;
varying vec3 vN;
varying vec3 vView;
void main() {
  float s = vPos.z - uTime * uSpeed;
  float k = floor(s / 180.0);
  float f = fract(s / 180.0);
  float on = step(0.45, hash11(k * 1.37 + 0.5));
  float packet = exp(-pow((f - 0.5) * 9.0, 2.0)) * on;
  float fine = pow(0.5 + 0.5 * sin(s * 0.35), 6.0) * 0.25;
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.5);
  vec3 c = uColor * (uBase + fine + packet * 9.0) * (0.55 + 0.45 * fres);
  gl_FragColor = vec4(c, 1.0);
  ${LOGDEPTH_FRAG}
}
`;

export function makeConduitMaterial(color = new THREE.Vector3(0.3, 0.8, 1.0), speed = 260, base = 0.9) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: color }, uSpeed: { value: speed }, uBase: { value: base } },
    vertexShader: CONDUIT_VERT,
    fragmentShader: CONDUIT_FRAG,
  });
  m.userData.castShadow = false;
  return m;
}

function inGap(z) {
  for (const [a, b] of SPINE.gaps) if (z > a && z < b) return true;
  return false;
}

export function buildSpine(M, ctx) {
  const group = new THREE.Group();
  group.name = 'spine';
  const rng = new RNG(101);
  const batch = new Batch();
  const beam = new THREE.BoxGeometry(1, 1, 1);
  const trussI = new Instancer(beam, M.truss);
  const trussDarkI = new Instancer(beam, M.trussDark);
  const greebleI = new Instancer(beam, M.greeble, { colors: true });
  const pipeGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateX(Math.PI / 2);
  const pipeI = new Instancer(pipeGeo, M.greeble, { colors: true });
  const lights = new LightSet();

  const { R, bay } = SPINE;
  const corners = (z) => {
    const pts = [];
    for (let i = 0; i < 6; i++) pts.push(cyl(R, i * 60 * DEG + 30 * DEG, z));
    return pts;
  };

  // Truss segments (skip through Arcadia, where the habitat axis is the sunline)
  const segments = [[SPINE.z0, SPINE.gaps[0][0]], [SPINE.gaps[0][1], SPINE.z1]];
  const m = new THREE.Matrix4();
  for (const [za, zb] of segments) {
    // longerons
    const ca = corners(za), cb = corners(zb);
    for (let i = 0; i < 6; i++) {
      beamMatrix(ca[i], cb[i], 4.2, 4.2, new THREE.Vector3(0, 0, 1).cross(ca[i]).normalize(), m);
      trussI.add(m);
      // secondary longeron (inner rail)
      const ia = cyl(R - 7, i * 60 * DEG + 30 * DEG, za), ib = cyl(R - 7, i * 60 * DEG + 30 * DEG, zb);
      beamMatrix(ia, ib, 1.6, 1.6, null, m);
      trussDarkI.add(m);
    }
    const nb = Math.round((zb - za) / bay);
    const step = (zb - za) / nb;
    for (let k = 0; k <= nb; k++) {
      const z = za + k * step;
      const c = corners(z);
      for (let i = 0; i < 6; i++) {
        const a = c[i], b = c[(i + 1) % 6];
        beamMatrix(a, b, 2.6, 3.2, a.clone().add(b).normalize(), m, 2);
        trussI.add(m);
      }
      // cross bracing in the frame plane (every other bay)
      if (k % 2 === 0) {
        for (let i = 0; i < 3; i++) {
          beamMatrix(c[i], c[i + 3], 1.2, 1.2, null, m);
          trussDarkI.add(m);
        }
      }
      if (k < nb) {
        const c2 = corners(z + step);
        for (let i = 0; i < 6; i++) {
          const flip = (k + i) % 2 === 0;
          const a = flip ? c[i] : c[(i + 1) % 6];
          const b = flip ? c2[(i + 1) % 6] : c2[i];
          beamMatrix(a, b, 1.5, 1.5, null, m);
          trussI.add(m);
        }
      }
    }
  }

  // Pressurised core tube (inhabited service spine)
  for (const [za, zb] of segments) {
    const g = lathe([[16, za], [16, zb]], { segments: 32, tile: 48 });
    batch.add(g, M.hab);
  }

  // Transit tubes (glass) – continuous, including through Arcadia
  for (const t of SPINE.tubes) {
    const g = tiledCylinderZ(5.5, 5.5, SPINE.z1 - SPINE.z0, 20, 48, true);
    const mm = new THREE.Matrix4().makeTranslation(t.r * Math.cos(t.phi), t.r * Math.sin(t.phi), (SPINE.z0 + SPINE.z1) / 2);
    batch.add(g, M.glassTube, mm);
    // rails beneath the tube
    const rail = tiledCylinderZ(1.2, 1.2, SPINE.z1 - SPINE.z0, 8, 48);
    const mr = new THREE.Matrix4().makeTranslation((t.r - 6.5) * Math.cos(t.phi), (t.r - 6.5) * Math.sin(t.phi), (SPINE.z0 + SPINE.z1) / 2);
    batch.add(rail, M.hullDark, mr);
    // tube collars every bay
    for (let z = SPINE.z0 + 20; z < SPINE.z1; z += 92) {
      const col = lathe([[6.4, z - 1.5], [6.4, z + 1.5]], { segments: 20 });
      batch.add(col, M.hullDark, new THREE.Matrix4().makeTranslation(t.r * Math.cos(t.phi), t.r * Math.sin(t.phi), 0));
    }
  }

  // Energy conduits (animated)
  const conduitMat = makeConduitMaterial();
  ctx.animated.push((t) => { conduitMat.uniforms.uTime.value = t; });
  for (const c of SPINE.conduits) {
    const g = tiledCylinderZ(2.4, 2.4, SPINE.z1 - SPINE.z0 + 300, 16, 48, true);
    const mesh = new THREE.Mesh(g, conduitMat);
    mesh.position.set(c.r * Math.cos(c.phi), c.r * Math.sin(c.phi), (SPINE.z0 + SPINE.z1) / 2 - 150);
    group.add(mesh);
    // sheath clamps
    for (let z = SPINE.z0; z < SPINE.z1; z += 46) {
      if (inGap(z)) continue;
      surfaceMatrix(c.r, c.phi, z, 7, 7, 3, m);
      trussDarkI.add(m);
    }
  }

  // Utility pipe runs on the outside of the core tube
  for (const [za, zb] of segments) {
    pipeRuns(pipeI, rng, { r: 16, z0: za, z1: zb, count: 18, radius: [0.8, 1.8] });
  }

  // Node collars: pressurised junction modules every ~280 m, each a little different
  const nodes = [];
  for (let z = SPINE.z0 + 140; z < SPINE.z1 - 60; z += 276) {
    if (inGap(z) || inGap(z + 40) || inGap(z - 40)) continue;
    if (Math.abs(z - SHIP.ringA.z) < 120 || Math.abs(z - SHIP.ringB.z) < 120) continue;
    if (z > SHIP.nexus.z0 - 40 && z < SHIP.nexus.z1 + 40) continue;
    if (z > SHIP.foundry.z0 - 220 && z < SHIP.foundry.z1 + 40) continue;
    if (z < SHIP.radiators.z1 + 30) continue;
    nodes.push(z);
  }
  for (const z of nodes) {
    const len = rng.range(22, 40);
    const prof = [[40, z - len / 2 - 8], [64, z - len / 2], [64, z + len / 2], [40, z + len / 2 + 8]];
    batch.add(lathe(prof, { segments: 6, faceted: true, phiStart: 30 * DEG, tile: 48 }), rng.chance(0.5) ? M.hab : M.hull);
    const band = [[64.6, z - 3], [64.6, z + 3]];
    batch.add(lathe(band, { segments: 6, faceted: true, phiStart: 30 * DEG }), M.gold);
    scatterCylinder(greebleI, rng, { r: 64, z0: z - len / 2 + 2, z1: z + len / 2 - 2, count: 40, w: [2, 7], h: [0.5, 3], d: [2, 8] });
    for (let i = 0; i < 6; i++) {
      lights.add(cyl(70, i * 60 * DEG + 30 * DEG, z), i % 2 ? NAV.amber : NAV.white, { period: 2.4, phase: i * 0.08 + z * 0.0003, duty: 0.06, size: 1.6, intensity: 7 });
    }
  }

  // Steady marker lights along the longerons
  for (let z = SPINE.z0; z < SPINE.z1; z += 92) {
    if (inGap(z)) continue;
    for (let i = 0; i < 6; i += 2) lights.add(cyl(R + 3, i * 60 * DEG + 30 * DEG, z), NAV.cyan, { intensity: 3, size: 0.9 });
  }

  // Sunline inside Arcadia (the habitat's artificial sun runs along the axis)
  {
    const { z0, z1 } = SHIP.arcadia;
    const core = new THREE.Mesh(tiledCylinderZ(7, 7, z1 - z0, 32, 48, true), M.glowSun);
    core.position.z = (z0 + z1) / 2;
    group.add(core);
    // lattice cage around the sunline
    for (let z = z0; z <= z1; z += 60) {
      const ringG = new THREE.TorusGeometry(10, 0.7, 6, 24);
      const rm = new THREE.Matrix4().makeTranslation(0, 0, z);
      batch.add(ringG, M.trussDark, rm);
    }
    ctx.sunline = core;
  }

  batch.build(group);
  trussI.build(group, 'spine-truss');
  trussDarkI.build(group, 'spine-truss-dark');
  greebleI.build(group, 'spine-greebles');
  pipeI.build(group, 'spine-pipes');
  lights.build(group, { name: 'spine-lights' });
  return group;
}
