// Halo I & II — counter-rotating habitat rings, 2.2 km across, spun to one standard gravity.
import * as THREE from 'three';
import { lathe, beamMatrix, Batch, Instancer, cyl, tiledCylinderZ, surfaceMatrix } from '../lib/geo.js';
import { RNG, TAU, DEG } from '../lib/rng.js';
import { scatterCylinder, GREEBLE_TONES } from './greebles.js';
import { LightSet, NAV } from './lights.js';
import { makeSurfaceMaterial, makeBuildingMaterial } from './interior.js';

const G = 9.81;

export function buildRing(M, ctx, { z, R, direction = 1, seed = 1, name = 'halo' }) {
  const rng = new RNG(seed);
  const group = new THREE.Group(); // rotating
  group.name = name;
  group.position.z = z;
  const statics = new THREE.Group();
  statics.name = name + '-bearing';
  statics.position.z = z;

  const batch = new Batch();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const trussI = new Instancer(box, M.truss);
  const darkI = new Instancer(box, M.trussDark);
  const greebleI = new Instancer(box, M.greeble, { colors: true });
  const cableGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).rotateX(Math.PI / 2);
  const cableI = new Instancer(cableGeo, M.chrome, { castShadow: false });
  const lights = new LightSet();

  const W = 64;          // half width (along ship axis)
  const ri = R - 34;     // inner rim radius (toward axis)
  const ro = R + 44;     // keel radius
  const rf = ro - 14;    // interior floor radius
  const seg = 360;

  // ---------------- Hull ----------------
  // side walls with window decks
  batch.add(lathe([[ri + 4, -W], [ro - 8, -W]], { segments: seg, tile: 48 }), M.hab);
  batch.add(lathe([[ro - 8, W], [ri + 4, W]], { segments: seg, tile: 48 }), M.hab);
  // keel and chamfers
  batch.add(lathe([[ro - 8, -W], [ro, -W + 8], [ro, W - 8], [ro - 8, W]], { segments: seg, tile: 48 }), M.hull);
  // rims (where the glass meets the walls)
  batch.add(lathe([[ri, -W + 10], [ri, -W + 2], [ri + 4, -W]], { segments: seg, tile: 48 }), M.hullDark);
  batch.add(lathe([[ri + 4, W], [ri, W - 2], [ri, W - 10]], { segments: seg, tile: 48 }), M.hullDark);
  // raised rim rails
  batch.add(lathe([[ri - 3, -W + 10], [ri - 3, -W + 4], [ri, -W + 2]], { segments: seg }), M.hull);
  batch.add(lathe([[ri, W - 2], [ri - 3, W - 4], [ri - 3, W - 10]], { segments: seg }), M.hull);

  // ---------------- Glass vault ----------------
  const arch = [];
  const archN = 16;
  const bulge = 26;
  for (let i = 0; i <= archN; i++) {
    const zz = W - 10 - (i / archN) * (2 * (W - 10));
    const t = zz / (W - 10);
    arch.push([ri - 3 - bulge * Math.sqrt(Math.max(0, 1 - t * t)), zz]);
  }
  batch.add(lathe(arch, { segments: seg, tile: 48 }), M.glass);
  // vault ribs (instanced) + a longitudinal spine rib
  {
    const pts = arch.map(([r, zz]) => new THREE.Vector3(r - 0.6, 0, zz));
    const curve = new THREE.CatmullRomCurve3(pts);
    const ribGeo = new THREE.TubeGeometry(curve, 24, 0.9, 6, false);
    const ribI = new Instancer(ribGeo, M.hullDark);
    const nr = 240;
    for (let i = 0; i < nr; i++) {
      const mm = new THREE.Matrix4().makeRotationZ((i / nr) * TAU);
      ribI.add(mm);
    }
    ribI.build(group, name + '-ribs');
    for (const zz of [-28, 0, 28]) {
      const t = zz / (W - 10);
      const rr = ri - 3 - bulge * Math.sqrt(1 - t * t) - 0.8;
      batch.add(new THREE.TorusGeometry(rr, 0.9, 6, seg), M.hullDark, new THREE.Matrix4().makeTranslation(0, 0, zz));
    }
  }

  // ---------------- Interior ----------------
  const floorMat = makeSurfaceMaterial({
    map: ctx.tex.ringFloor.albedo, emissive: ctx.tex.ringFloor.emissive,
    light: 1.15, emisGain: 1.6, repeat: [1, 7], swap: true,
  });
  const floor = new THREE.Mesh(lathe([[rf, W - 2], [rf, -W + 2]], { segments: seg, uvMode: 'unit' }), floorMat);
  group.add(floor);
  // inner terraces (walls facing the interior)
  batch.add(lathe([[ri, W - 2], [rf, W - 2]], { segments: seg, tile: 48 }), M.habDark);
  batch.add(lathe([[rf, -W + 2], [ri, -W + 2]], { segments: seg, tile: 48 }), M.habDark);
  // street-level buildings
  {
    const bMat = makeBuildingMaterial({ light: 1.1 });
    const bI = new Instancer(box, bMat, { castShadow: false, receiveShadow: false, colors: true });
    const mm = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tones = [new THREE.Color(0.86, 0.84, 0.8), new THREE.Color(0.75, 0.76, 0.78), new THREE.Color(0.92, 0.9, 0.86), new THREE.Color(0.6, 0.62, 0.66)];
    for (let i = 0; i < 2600; i++) {
      const across = rng.sign() * rng.range(0.19, 0.44) * (2 * W - 4);
      const phi = rng.range(0, TAU);
      const h = Math.min(28, 4 + Math.pow(rng.next(), 3) * 30);
      const bw = rng.range(5, 12), bd = rng.range(6, 14);
      // local: X = tangent, Y = toward axis (up), Z = ship axis
      const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
      const up = radial.clone().negate();
      const tangent = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1));
      mm.makeBasis(tangent.multiplyScalar(bd), up.multiplyScalar(h), new THREE.Vector3(0, 0, bw));
      mm.setPosition(radial.x * (rf - h / 2), radial.y * (rf - h / 2), across * 0.5);
      bI.add(mm, rng.pick(tones));
    }
    bI.build(group, name + '-buildings');
  }

  // ---------------- Keel structure & details ----------------
  ribsLoop(darkI, { r: ro, n: 180, w: 3, h: 2.5, d: 2 * W - 12 });
  scatterCylinder(greebleI, rng, { r: ro + 2.2, z0: -W + 10, z1: W - 10, count: 1400, w: [3, 14], h: [0.8, 4], d: [3, 18] });
  // side-wall vertical frames
  for (let i = 0; i < 120; i++) {
    const phi = (i / 120) * TAU;
    for (const s of [-1, 1]) {
      const a = cyl(ri + 6, phi, s * (W + 1.2)), b = cyl(ro - 10, phi, s * (W + 1.2));
      beamMatrix(a, b, 3, 2.4, null, MAT, 0);
      darkI.add(MAT);
    }
  }

  // ---------------- Hub (rotates) ----------------
  const hubR = 150;
  const hubProf = [[74, -96], [118, -96], [hubR, -72], [hubR, 72], [118, 96], [74, 96]];
  batch.add(lathe(hubProf, { segments: 48, tile: 48 }), M.hull);
  batch.add(lathe([[hubR + 0.6, -40], [hubR + 0.6, 40]], { segments: 48, tile: 48 }), M.hab);
  batch.add(lathe([[hubR + 1.2, -6], [hubR + 1.2, 6]], { segments: 48 }), M.gold);
  scatterCylinder(greebleI, rng, { r: hubR, z0: -66, z1: 66, count: 220, w: [2, 8], h: [0.6, 3], d: [2, 10] });
  // docking ports on the hub faces
  for (let k = 0; k < 6; k++) {
    const phi = (k / 6) * TAU + 30 * DEG;
    for (const s of [-1, 1]) {
      const p = cyl(100, phi, s * 97);
      const portM = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
      batch.add(tiledCylinderZ(12, 12, 6, 16), M.hullDark, portM);
      lights.add(cyl(100, phi, s * 101), NAV.green, { period: 1.6, phase: k * 0.12, duty: 0.3, size: 1.4, intensity: 6 });
    }
  }

  // ---------------- Spokes ----------------
  const spokes = [];
  const nSpokes = 6;
  const spokeR0 = hubR, spokeR1 = ri - 2;
  for (let k = 0; k < nSpokes; k++) {
    const phi = (k / nSpokes) * TAU + (direction > 0 ? 0 : 30 * DEG);
    spokes.push({ phi, r0: spokeR0, r1: spokeR1 });
    const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
    const tangent = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
    const len = spokeR1 - spokeR0;
    const tube = tiledCylinderZ(9, 9, len, 20, 48, true);
    const mm = new THREE.Matrix4().makeBasis(tangent, new THREE.Vector3(0, 0, 1), radial);
    mm.setPosition(radial.clone().multiplyScalar((spokeR0 + spokeR1) / 2));
    batch.add(tube, M.hab, mm);
    // collars at both ends and midway
    for (const rr of [spokeR0 + 6, spokeR0 + len * 0.5, spokeR1 - 8]) {
      const c = tiledCylinderZ(13, 13, 8, 20);
      const cm = mm.clone().setPosition(radial.clone().multiplyScalar(rr));
      batch.add(c, M.hullDark, cm);
    }
    // triangular truss around the spoke
    const off = 20;
    const rails = [0, 120, 240].map((a) => {
      const ang = a * DEG;
      return tangent.clone().multiplyScalar(Math.cos(ang) * off).add(new THREE.Vector3(0, 0, Math.sin(ang) * off));
    });
    for (const o of rails) {
      const a = radial.clone().multiplyScalar(spokeR0 + 4).add(o);
      const b = radial.clone().multiplyScalar(spokeR1 - 4).add(o);
      beamMatrix(a, b, 2.2, 2.2, radial, MAT);
      trussI.add(MAT);
    }
    const nBr = Math.floor(len / 36);
    for (let j = 0; j <= nBr; j++) {
      const rr = spokeR0 + 4 + (j / nBr) * (len - 8);
      for (let q = 0; q < 3; q++) {
        const a = radial.clone().multiplyScalar(rr).add(rails[q]);
        const b = radial.clone().multiplyScalar(rr).add(rails[(q + 1) % 3]);
        beamMatrix(a, b, 1.2, 1.2, radial, MAT);
        darkI.add(MAT);
        if (j < nBr) {
          const rr2 = spokeR0 + 4 + ((j + 1) / nBr) * (len - 8);
          const c = radial.clone().multiplyScalar(rr2).add(rails[(q + 1) % 3]);
          beamMatrix(a, c, 0.9, 0.9, radial, MAT);
          darkI.add(MAT);
        }
      }
      if (j % 3 === 0) lights.add(radial.clone().multiplyScalar(rr).add(tangent.clone().multiplyScalar(12)), NAV.warm, { intensity: 3.5, size: 1.0 });
    }
  }
  // Tension cables (bicycle-wheel lacing between hub and rim)
  {
    const nC = 48;
    for (let k = 0; k < nC; k++) {
      const phiA = (k / nC) * TAU;
      for (const s of [-1, 1]) {
        const phiB = phiA + s * 14 * DEG;
        const a = cyl(hubR - 2, phiA, s * 88);
        const b = cyl(ri - 4, phiB, s * (W - 14));
        beamMatrix(a, b, 0.9, 0.9, null, MAT);
        cableI.add(MAT);
      }
    }
  }

  // ---------------- Lights ----------------
  for (let i = 0; i < 180; i++) {
    const phi = (i / 180) * TAU;
    for (const s of [-1, 1]) lights.add(cyl(ri - 4, phi, s * (W - 6)), NAV.white, { intensity: 2.8, size: 1.1 });
  }
  for (let i = 0; i < 8; i++) {
    const phi = (i / 8) * TAU;
    lights.add(cyl(ro + 5, phi, 0), NAV.white, { period: 1.8, phase: i / 8, duty: 0.05, size: 3, intensity: 16 });
    lights.add(cyl(ro - 2, phi + 4 * DEG, W + 2), NAV.red, { period: 2.6, phase: i / 8 + 0.3, duty: 0.25, size: 2, intensity: 8 });
    lights.add(cyl(ro - 2, phi + 4 * DEG, -W - 2), NAV.green, { period: 2.6, phase: i / 8 + 0.3, duty: 0.25, size: 2, intensity: 8 });
  }

  batch.build(group, { name });
  trussI.build(group, name + '-truss');
  darkI.build(group, name + '-truss-dark');
  greebleI.build(group, name + '-greebles');
  cableI.build(group, name + '-cables');
  lights.build(group, { name: name + '-lights' });

  // ---------------- Static bearing on the spine ----------------
  {
    const sb = new Batch();
    for (const s of [-1, 1]) {
      sb.add(lathe([[60, s * 104 - 7], [74, s * 104 - 7], [74, s * 104 + 7], [60, s * 104 + 7]], { segments: 48 }), M.hullDark);
      sb.add(new THREE.TorusGeometry(70, 5, 10, 64), M.chrome, new THREE.Matrix4().makeTranslation(0, 0, s * 99));
    }
    sb.build(statics, { name: name + '-bearing' });
  }

  const radius = ro - 14;
  const omega = direction * Math.sqrt(G / radius);
  ctx.animated.push((t) => { group.rotation.z = t * omega; });

  return { group, statics, spokes, omega, R, ri, ro, W, hubR };
}

const MAT = new THREE.Matrix4();

function ribsLoop(inst, { r, n, w, h, d }) {
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const phi = (i / n) * TAU;
    surfaceMatrix(r + h / 2, phi, 0, w, h, d, m);
    inst.add(m);
  }
}
