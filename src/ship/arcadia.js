// Arcadia — a 2 km O'Neill-style habitat cylinder. Three land valleys alternate with three
// glazed strips; the axis carries an artificial sunline. Spun to 1 g (≈44 s per turn).
import * as THREE from 'three';
import { lathe, beamMatrix, Batch, Instancer, cyl, tiledCylinderZ, surfaceMatrix } from '../lib/geo.js';
import { RNG, TAU, DEG } from '../lib/rng.js';
import { scatterCylinder, GREEBLE_TONES } from './greebles.js';
import { LightSet, NAV } from './lights.js';
import { makeSurfaceMaterial, makeBuildingMaterial, makeCloudMaterial, makeGlowVolume, habitatUniforms } from './interior.js';
import { SHIP } from '../world.js';

const G = 9.81;

export function buildArcadia(M, ctx) {
  const { z0, z1, R, Ri } = SHIP.arcadia;
  const rng = new RNG(303);
  const group = new THREE.Group(); // rotating
  group.name = 'arcadia';
  const statics = new THREE.Group();
  statics.name = 'arcadia-bearings';

  const batch = new Batch();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const darkI = new Instancer(box, M.trussDark);
  const trussI = new Instancer(box, M.truss);
  const greebleI = new Instancer(box, M.greeble, { colors: true });
  const lights = new LightSet();
  const m4 = new THREE.Matrix4();

  const winW = 22 * DEG;
  const strips = [0, 1, 2].map((k) => {
    const centre = k * 120 * DEG;
    return {
      winStart: centre - winW / 2,
      landStart: centre + winW / 2,
      landLen: 120 * DEG - winW,
    };
  });
  const L = z1 - z0;
  const seg = 96;

  // ======================= EXTERIOR =======================
  const edgeBand = 4.5 * DEG;
  for (const s of strips) {
    // inhabited shoreline decks along each window edge
    batch.add(lathe([[R, z0], [R, z1]], { segments: 6, phiStart: s.landStart, phiLength: edgeBand, tile: 48 }), M.hab);
    batch.add(lathe([[R, z0], [R, z1]], { segments: 6, phiStart: s.landStart + s.landLen - edgeBand, phiLength: edgeBand, tile: 48 }), M.hab);
    // main plating
    batch.add(lathe([[R, z0], [R, z1]], { segments: seg, phiStart: s.landStart + edgeBand, phiLength: s.landLen - 2 * edgeBand, tile: 48 }), M.hull);
    // dark spine band in the middle of each land valley
    batch.add(lathe([[R + 0.4, z0], [R + 0.4, z1]], { segments: 8, phiStart: s.landStart + s.landLen / 2 - 3 * DEG, phiLength: 6 * DEG, tile: 48 }), M.hullDark);
    // window glass
    batch.add(lathe([[R - 1.5, z0], [R - 1.5, z1]], { segments: 16, phiStart: s.winStart, phiLength: winW, tile: 48 }), M.glass);
    // retaining walls closing the gap between the valley floor and the hull at each window edge
    for (const phi of [s.winStart, s.winStart + winW]) {
      surfaceMatrix(Ri - 2, phi, (z0 + z1) / 2, 1.2, R - Ri + 4, L, m4);
      darkI.add(m4);
    }
    // window frame: longitudinal mullions
    for (let j = 0; j <= 6; j++) {
      const phi = s.winStart + (j / 6) * winW;
      const w = j === 0 || j === 6 ? 4 : 1.6;
      surfaceMatrix(R - 0.5, phi, (z0 + z1) / 2, w, j === 0 || j === 6 ? 5 : 2.2, L, m4);
      darkI.add(m4);
    }
    // cross ribs every 32 m (chorded arcs)
    for (let z = z0 + 16; z < z1; z += 32) {
      const n = 6;
      for (let j = 0; j < n; j++) {
        const a = cyl(R - 0.5, s.winStart + (j / n) * winW, z);
        const b = cyl(R - 0.5, s.winStart + ((j + 1) / n) * winW, z);
        beamMatrix(a, b, 1.4, 2.2, a.clone().setZ(0).normalize(), m4, 0.6);
        darkI.add(m4);
      }
    }
    // longitudinal stringers on the plating
    for (let j = 1; j < 14; j++) {
      const phi = s.landStart + edgeBand + (j / 14) * (s.landLen - 2 * edgeBand);
      surfaceMatrix(R + 0.8, phi, (z0 + z1) / 2, 1.6, 1.6, L, m4);
      darkI.add(m4);
    }
    // surface equipment
    scatterCylinder(greebleI, rng, { r: R, z0: z0 + 20, z1: z1 - 20, phi0: s.landStart + edgeBand, phi1: s.landStart + s.landLen - edgeBand, count: 900, w: [3, 16], h: [0.6, 4], d: [4, 22] });
    // window edge lights
    for (let z = z0 + 10; z < z1; z += 40) {
      lights.add(cyl(R + 3, s.winStart - 0.4 * DEG, z), NAV.white, { intensity: 3.2, size: 1.2 });
      lights.add(cyl(R + 3, s.winStart + winW + 0.4 * DEG, z), NAV.white, { intensity: 3.2, size: 1.2 });
    }
  }

  // Structural hoops (cross over the windows)
  const hoopZs = [];
  for (let z = z0 + 128; z < z1 - 64; z += 256) hoopZs.push(z);
  for (const z of hoopZs) {
    batch.add(lathe([[R - 1, z - 6], [R + 12, z - 5], [R + 12, z + 5], [R - 1, z + 6]], { segments: 180, tile: 48 }), M.hullDark);
    batch.add(lathe([[R + 12.5, z - 2.5], [R + 12.5, z + 2.5]], { segments: 180 }), M.gold);
    for (let k = 0; k < 6; k++) lights.add(cyl(R + 16, k * 60 * DEG + 30 * DEG, z), NAV.white, { period: 3.2, phase: k / 6 + z * 0.001, duty: 0.04, size: 2.4, intensity: 14 });
  }
  // End rims
  for (const [zr, s] of [[z0, -1], [z1, 1]]) {
    batch.add(lathe([[R - 2, zr - 14], [R + 16, zr - 12], [R + 16, zr + 12], [R - 2, zr + 14]], { segments: 180, tile: 48 }), M.hull);
    batch.add(lathe([[R + 16.5, zr - 4], [R + 16.5, zr + 4]], { segments: 180 }), M.hab);
    ribsAround(darkI, { r: R + 16, z: zr, n: 72, w: 3, h: 4, d: 30 });
  }

  // End caps (domes)
  const capProfile = (s) => {
    const zr = s > 0 ? z1 : z0;
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const ang = t * Math.PI / 2;
      const r = 160 + (R + 8 - 160) * Math.cos(ang);
      const z = zr + s * (12 + 92 * Math.sin(ang));
      pts.push([r, z]);
    }
    return s > 0 ? pts : pts.reverse();
  };
  for (const s of [-1, 1]) {
    const prof = capProfile(s);
    batch.add(lathe(prof, { segments: 120, tile: 48 }), M.hull);
    const zr = s > 0 ? z1 : z0;
    // terraced window rings on the dome
    for (const [ra, rb] of [[420, 400], [330, 300]]) {
      const za = zr + s * (12 + 92 * Math.sin(Math.acos((ra - 160) / (R + 8 - 160))));
      const zb = zr + s * (12 + 92 * Math.sin(Math.acos((rb - 160) / (R + 8 - 160))));
      const band = s > 0 ? [[ra + 0.8, za], [rb + 0.8, zb]] : [[rb + 0.8, zb], [ra + 0.8, za]];
      batch.add(lathe(band, { segments: 120, tile: 48 }), M.hab);
    }
    // radial ribs on the dome
    for (let k = 0; k < 36; k++) {
      const phi = (k / 36) * TAU;
      for (let i = 0; i < prof.length - 1; i++) {
        const [ra, za] = prof[i], [rb, zb] = prof[i + 1];
        const a = cyl(ra + 2, phi, za), b = cyl(rb + 2, phi, zb);
        beamMatrix(a, b, 2.4, 3, a.clone().setZ(0).normalize(), m4, 1);
        darkI.add(m4);
      }
    }
    // axial collar
    batch.add(lathe(s > 0 ? [[160, zr + 104], [132, zr + 112], [96, zr + 112]] : [[96, zr - 112], [132, zr - 112], [160, zr - 104]], { segments: 64, tile: 48 }), M.hullDark);
    scatterCylinder(greebleI, rng, { r: 160, z0: zr + s * 96 - 6, z1: zr + s * 96 + 6, count: 60, w: [2, 6], h: [1, 4], d: [2, 5] });
    for (let k = 0; k < 12; k++) {
      const phi = (k / 12) * TAU;
      lights.add(cyl(R + 10, phi, zr + s * 20), k % 2 ? NAV.red : NAV.green, { period: 2.0, phase: k * 0.05, duty: 0.2, size: 2, intensity: 9 });
    }
  }

  // ======================= INTERIOR =======================
  const land = ctx.tex.land;
  const endRun = 70;
  const zTop = z1 - endRun, zBot = z0 + endRun;
  strips.forEach((s, k) => {
    const mat = makeSurfaceMaterial({ map: land.albedo, emissive: land.emissive, light: 1.0, emisGain: 1.2, haze: true, flip: k === 1 });
    const g = lathe([[Ri, zTop], [Ri, zBot]], { segments: 64, phiStart: s.landStart, phiLength: s.landLen, uvMode: 'unit' });
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'arcadia-land-' + k;
    group.add(mesh);
  });

  // Terraced end bowls
  const treadMat = makeSurfaceMaterial({ map: ctx.tex.ringFloor.albedo, emissive: ctx.tex.ringFloor.emissive, light: 1.0, emisGain: 1.6, repeat: [1, 10], swap: true, haze: true });
  const riserMat = makeSurfaceMaterial({ map: M._textures.habAlbedo, emissive: M._textures.habEmissive, light: 0.9, emisGain: 2.4, haze: true });
  for (const s of [-1, 1]) {
    const zStart = s > 0 ? zTop : zBot;
    const steps = 9;
    const rise = (Ri - 90) / steps;
    const run = 9;
    let r = Ri, z = zStart;
    for (let i = 0; i < steps; i++) {
      // riser (wall facing the interior)
      const rN = r - rise;
      const riser = s > 0 ? [[rN, z], [r, z]] : [[r, z], [rN, z]];
      const gR = lathe(riser, { segments: 120, tile: 48 });
      group.add(new THREE.Mesh(gR, riserMat));
      // tread (terrace floor facing the axis)
      const zN = z + s * run;
      const tread = s > 0 ? [[rN, zN], [rN, z]] : [[rN, z], [rN, zN]];
      const gT = lathe(tread, { segments: 120, uvMode: 'unit' });
      group.add(new THREE.Mesh(gT, treadMat));
      r = rN; z = zN;
    }
    // final inner wall around the axis
    const cap = s > 0 ? [[20, z], [r, z]] : [[r, z], [20, z]];
    group.add(new THREE.Mesh(lathe(cap, { segments: 120, tile: 48 }), riserMat));
  }

  // Buildings: towns from the land texture + scattered homesteads
  {
    const bMat = makeBuildingMaterial({ light: 1.0, haze: true });
    const bI = new Instancer(box, bMat, { castShadow: false, receiveShadow: false, colors: true });
    const tones = [new THREE.Color(0.9, 0.88, 0.84), new THREE.Color(0.8, 0.8, 0.8), new THREE.Color(0.95, 0.93, 0.88), new THREE.Color(0.7, 0.66, 0.6), new THREE.Color(0.62, 0.64, 0.68)];
    const SW = Ri * strips[0].landLen, SL = zTop - zBot;
    const placeBuilding = (s, k, u, v, h, w, d) => {
      const uu = k === 1 ? 1 - u : u;
      const phi = s.landStart + uu * s.landLen;
      const z = zTop - v * SL;
      const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
      const up = radial.clone().negate();
      const tangent = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1));
      m4.makeBasis(tangent.multiplyScalar(w), up.multiplyScalar(h), new THREE.Vector3(0, 0, d));
      m4.setPosition(radial.x * (Ri - h / 2 + 0.5), radial.y * (Ri - h / 2 + 0.5), z);
      bI.add(m4, rng.pick(tones));
    };
    strips.forEach((s, k) => {
      for (const t of land.towns) {
        const n = Math.round(t.r * t.dense * 1.6);
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, TAU);
          const rr = Math.sqrt(rng.next()) * t.r * 0.75;
          const u = t.u + (Math.cos(a) * rr) / SW;
          const v = t.v + (Math.sin(a) * rr) / SL;
          const centre = 1 - rr / (t.r * 0.75);
          const h = 5 + Math.pow(rng.next(), 2.2) * 34 * (0.35 + centre) * t.dense;
          placeBuilding(s, k, u, v, h, rng.range(5, 13), rng.range(6, 15));
        }
        // a landmark tower at each town centre
        placeBuilding(s, k, t.u, t.v, 48 + rng.range(0, 30), 9, 9);
      }
      for (let i = 0; i < 160; i++) {
        placeBuilding(s, k, rng.range(0.05, 0.95), rng.range(0.02, 0.98), rng.range(3, 7), rng.range(5, 10), rng.range(6, 14));
      }
    });
    bI.build(group, 'arcadia-buildings');
  }

  // Clouds (co-rotate with the cylinder, drifting slowly)
  {
    const cm = makeCloudMaterial(ctx.tex.clouds, [6, 3]);
    const cg = lathe([[396, zTop - 20], [396, zBot + 20]], { segments: 180, uvMode: 'unit' });
    const clouds = new THREE.Mesh(cg, cm);
    clouds.renderOrder = 2;
    clouds.name = 'arcadia-clouds';
    group.add(clouds);
    ctx.animated.push((t) => { cm.uniforms.uOffset.value.set(t * 0.0006, t * 0.0011); });
  }

  // Sunline glow volumes (static; axis-symmetric)
  {
    const glowA = new THREE.Mesh(tiledCylinderZ(30, 30, L - 40, 48, 48, true), makeGlowVolume(new THREE.Vector3(1.0, 0.82, 0.55).multiplyScalar(0.09), 3.0));
    glowA.position.z = (z0 + z1) / 2;
    const glowB = new THREE.Mesh(tiledCylinderZ(120, 120, L - 160, 64, 48, true), makeGlowVolume(new THREE.Vector3(1.0, 0.86, 0.65).multiplyScalar(0.018), 4.0));
    glowB.position.z = (z0 + z1) / 2;
    glowA.renderOrder = glowB.renderOrder = 3;
    statics.add(glowA, glowB);
  }

  // ======================= BEARINGS (static) =======================
  {
    const sb = new Batch();
    const sI = new Instancer(box, M.truss);
    for (const s of [-1, 1]) {
      const zr = (s > 0 ? z1 : z0) + s * 118;
      sb.add(lathe([[62, zr - 10], [150, zr - 10], [150, zr + 10], [62, zr + 10]], { segments: 64, tile: 48 }), M.hullDark);
      sb.add(new THREE.TorusGeometry(140, 9, 12, 96), M.chrome, new THREE.Matrix4().makeTranslation(0, 0, zr - s * 10));
      sb.add(lathe([[151, zr - 4], [151, zr + 4]], { segments: 64 }), M.hab);
      for (let k = 0; k < 6; k++) {
        const phi = k * 60 * DEG + 30 * DEG;
        const a = cyl(60, phi, zr + s * 70), b = cyl(148, phi, zr);
        beamMatrix(a, b, 5, 5, null, m4);
        sI.add(m4);
        lights.add(cyl(156, phi, zr), NAV.amber, { period: 1.2, phase: k / 6, duty: 0.3, size: 1.5, intensity: 7 });
      }
    }
    sb.build(statics, { name: 'arcadia-bearings' });
    sI.build(statics);
  }

  batch.build(group, { name: 'arcadia-hull' });
  darkI.build(group, 'arcadia-frames');
  trussI.build(group);
  greebleI.build(group, 'arcadia-greebles');
  lights.build(group, { name: 'arcadia-lights' });

  const omega = Math.sqrt(G / Ri);
  ctx.animated.push((t) => { group.rotation.z = t * omega + 0.4; });

  return { group, statics, omega, strips };
}

function ribsAround(inst, { r, z, n, w, h, d }) {
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    surfaceMatrix(r + h / 2, (i / n) * TAU, z, w, h, d, m);
    inst.add(m);
  }
}
