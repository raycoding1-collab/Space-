// Foundry & docks: an octagonal industrial hub with four lit hangar bays, gantry cranes,
// smelter vents — and the cargo yard of stacked containers behind it.
import * as THREE from 'three';
import { lathe, beamMatrix, Batch, Instancer, cyl, tiledBox, surfaceMatrix } from '../lib/geo.js';
import { RNG, TAU, DEG } from '../lib/rng.js';
import { scatterCylinder, GREEBLE_TONES } from './greebles.js';
import { LightSet, NAV } from './lights.js';
import { SHIP } from '../world.js';

export function buildFoundry(M, ctx) {
  const group = new THREE.Group();
  group.name = 'foundry';
  const rng = new RNG(606);
  const batch = new Batch();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const darkI = new Instancer(box, M.trussDark);
  const trussI = new Instancer(box, M.truss);
  const greebleI = new Instancer(box, M.greeble, { colors: true });
  const lights = new LightSet();
  const m4 = new THREE.Matrix4();
  const { z0, z1 } = SHIP.foundry;
  const zc = (z0 + z1) / 2;
  const Rf = 252;
  const oct = { segments: 8, faceted: true, tile: 48 };
  const apothem = Rf * Math.cos(22.5 * DEG);

  batch.add(lathe([[66, z0 - 24], [170, z0 - 8], [Rf, z0 + 34]], oct), M.hullDark);
  batch.add(lathe([[Rf, z1 - 34], [170, z1 + 8], [66, z1 + 24]], oct), M.hullDark);
  batch.add(lathe([[Rf, z0 + 34], [Rf, z0 + 70]], oct), M.hull);
  batch.add(lathe([[Rf, z0 + 70], [Rf, z1 - 70]], oct), M.hullWarm);
  batch.add(lathe([[Rf, z1 - 70], [Rf, z1 - 34]], oct), M.hab);
  for (const z of [z0 + 34, z0 + 70, z1 - 70, z1 - 34]) {
    batch.add(lathe([[Rf + 3, z - 2.5], [Rf + 3, z + 2.5]], oct), M.trussDark);
  }

  // ---------------- Hangar bays (four faces) ----------------
  const bays = [];
  for (let k = 0; k < 8; k++) {
    const phi = k * 45 * DEG + 22.5 * DEG;
    const n = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
    const t = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
    const z = new THREE.Vector3(0, 0, 1);
    const centre = n.clone().multiplyScalar(apothem).setZ(zc);
    const basis = new THREE.Matrix4().makeBasis(t, z, n); // local X = tangent, Y = ship axis, Z = outward
    if (k % 2 === 0) {
      const bw = 128, bh = 92, depth = 16;
      // recessed glowing interior
      const inner = new THREE.PlaneGeometry(bw - 8, bh - 8);
      batch.add(inner, M.bay, basis.clone().setPosition(centre.clone().addScaledVector(n, -depth)));
      // recess walls
      for (const [sx, sy, px, py] of [[bw, 4, 0, bh / 2], [bw, 4, 0, -bh / 2], [4, bh, bw / 2, 0], [4, bh, -bw / 2, 0]]) {
        const g = tiledBox(sx, sy, depth + 6, 24);
        const pos = centre.clone().addScaledVector(t, px).addScaledVector(z, py).addScaledVector(n, -depth / 2 + 2);
        batch.add(g, M.hullDark, basis.clone().setPosition(pos));
      }
      // heavy door frame
      for (const [sx, sy, px, py] of [[bw + 20, 10, 0, bh / 2 + 5], [bw + 20, 10, 0, -bh / 2 - 5], [10, bh, bw / 2 + 5, 0], [10, bh, -bw / 2 - 5, 0]]) {
        const pos = centre.clone().addScaledVector(t, px).addScaledVector(z, py).addScaledVector(n, 3);
        batch.add(tiledBox(sx, sy, 7, 24), M.hull, basis.clone().setPosition(pos));
      }
      // atmosphere-retention field
      const field = new THREE.PlaneGeometry(bw - 2, bh - 2);
      batch.add(field, M.bayField, basis.clone().setPosition(centre.clone().addScaledVector(n, 1)));
      // approach lights: chase pattern leading into the bay
      for (let j = 0; j < 14; j++) {
        for (const s of [-1, 1]) {
          const p = centre.clone().addScaledVector(t, s * (bw / 2 + 14)).addScaledVector(z, -bh / 2 + (j / 13) * bh).addScaledVector(n, 6);
          lights.add(p, NAV.amber, { period: 1.6, phase: -j / 14, duty: 0.12, size: 1.6, intensity: 9 });
        }
        const p2 = centre.clone().addScaledVector(z, -bh / 2 - 16).addScaledVector(t, -bw / 2 + (j / 13) * bw).addScaledVector(n, 6);
        lights.add(p2, NAV.cyan, { intensity: 4, size: 1.2 });
      }
      bays.push({ centre, normal: n, tangent: t, phi });
    } else {
      // gantry crane on the solid faces
      const base = centre.clone().addScaledVector(n, 4);
      for (const s of [-1, 1]) {
        const a = base.clone().addScaledVector(t, s * 60).setZ(z0 + 60);
        const b = base.clone().addScaledVector(t, s * 60).setZ(z1 - 60);
        beamMatrix(a, b, 5, 5, n, m4); trussI.add(m4);
      }
      const craneZ = zc + rng.range(-80, 80);
      const c0 = base.clone().addScaledVector(t, -64).setZ(craneZ), c1 = base.clone().addScaledVector(t, 64).setZ(craneZ);
      const lift = n.clone().multiplyScalar(26);
      beamMatrix(c0.clone().add(lift), c1.clone().add(lift), 6, 6, n, m4); darkI.add(m4);
      beamMatrix(c0, c0.clone().add(lift), 5, 5, null, m4); darkI.add(m4);
      beamMatrix(c1, c1.clone().add(lift), 5, 5, null, m4); darkI.add(m4);
      const hook = base.clone().addScaledVector(t, rng.range(-40, 40)).setZ(craneZ).add(lift);
      batch.add(tiledBox(20, 14, 26, 24), M.gold, basis.clone().setPosition(hook.clone().addScaledVector(n, -14)));
      lights.add(hook.clone().addScaledVector(n, 4), NAV.amber, { period: 1.0, phase: k * 0.2, duty: 0.4, size: 2, intensity: 9 });
      // smelter vents glowing along the face
      for (let j = 0; j < 5; j++) {
        const pos = centre.clone().addScaledVector(t, -70 + j * 35).setZ(z0 + 52).addScaledVector(n, 1.5);
        batch.add(tiledBox(18, 6, 2, 24), M.glowAmber, basis.clone().setPosition(pos));
      }
      scatterCylinder(greebleI, rng, { r: apothem, z0: z0 + 76, z1: z1 - 76, phi0: phi - 18 * DEG, phi1: phi + 18 * DEG, count: 160, w: [3, 12], h: [1, 6], d: [3, 14] });
    }
  }
  // corner lights
  for (let k = 0; k < 8; k++) {
    const phi = k * 45 * DEG;
    lights.add(cyl(Rf + 6, phi, z1 - 36), NAV.white, { period: 2.6, phase: k / 8, duty: 0.04, size: 3, intensity: 15 });
    lights.add(cyl(Rf + 6, phi, z0 + 36), k < 4 ? NAV.green : NAV.red, { period: 2.6, phase: k / 8 + 0.5, duty: 0.2, size: 2.2, intensity: 9 });
  }

  // ---------------- Cargo yard ----------------
  {
    const { z0: c0, z1: c1 } = SHIP.cargo;
    const palette = [
      new THREE.Color(0.85, 0.45, 0.18), new THREE.Color(0.18, 0.42, 0.55), new THREE.Color(0.86, 0.86, 0.84),
      new THREE.Color(0.5, 0.52, 0.55), new THREE.Color(0.62, 0.24, 0.16), new THREE.Color(0.16, 0.2, 0.3),
      new THREE.Color(0.75, 0.62, 0.3),
    ];
    const contI = new Instancer(tiledBox(1, 1, 1, 1), M.container, { colors: true });
    const rows = 3, L = (c1 - c0 - 12) / rows;
    for (let layer = 0; layer < 6; layer++) {
      const r = 72 + layer * 15;
      const n = Math.floor((TAU * r) / 15.5);
      for (let i = 0; i < n; i++) {
        const phi = (i / n) * TAU + layer * 0.07;
        for (let j = 0; j < rows; j++) {
          if (rng.chance(0.14 + layer * 0.05)) continue;
          const z = c0 + 6 + L * (j + 0.5);
          surfaceMatrix(r, phi, z, 12.5, 12.5, L - 3, m4);
          contI.add(m4, rng.pick(palette));
        }
      }
    }
    contI.build(group, 'cargo');
    // frame rings and radial spokes
    for (const z of [c0, c1]) {
      batch.add(lathe([[60, z - 3], [172, z - 3], [172, z + 3], [60, z + 3]], { segments: 8, faceted: true }), M.hullDark);
    }
    for (let k = 0; k < 8; k++) {
      const phi = k * 45 * DEG;
      const a = cyl(170, phi, c0), b = cyl(170, phi, c1);
      beamMatrix(a, b, 4, 4, null, m4); trussI.add(m4);
      lights.add(cyl(176, phi, (c0 + c1) / 2), NAV.amber, { period: 3, phase: k / 8, duty: 0.1, size: 2, intensity: 8 });
    }
  }

  batch.build(group, { name: 'foundry' });
  darkI.build(group, 'foundry-frames');
  trussI.build(group, 'foundry-truss');
  greebleI.build(group, 'foundry-greebles');
  lights.build(group, { name: 'foundry-lights' });
  ctx.bays = bays;
  return { group, bays };
}
