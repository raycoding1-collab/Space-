// Nexus — civic and transit hub between the rings and Arcadia: docking pylons with moored
// transports, long-range communication dishes and the ark's administrative decks.
import * as THREE from 'three';
import { lathe, beamMatrix, Batch, Instancer, cyl, tiledCylinderZ, surfaceMatrix, tiledBox } from '../lib/geo.js';
import { RNG, TAU, DEG } from '../lib/rng.js';
import { scatterCylinder } from './greebles.js';
import { LightSet, NAV } from './lights.js';
import { addTransport } from './craft.js';
import { SHIP } from '../world.js';

export function buildNexus(M, ctx) {
  const group = new THREE.Group();
  group.name = 'nexus';
  const rng = new RNG(505);
  const batch = new Batch();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const darkI = new Instancer(box, M.trussDark);
  const trussI = new Instancer(box, M.truss);
  const greebleI = new Instancer(box, M.greeble, { colors: true });
  const lights = new LightSet();
  const m4 = new THREE.Matrix4();
  const { z0, z1 } = SHIP.nexus;
  const zc = (z0 + z1) / 2;
  const Rn = 205;

  const hex = { segments: 6, faceted: true, tile: 48 };
  batch.add(lathe([[64, z0], [150, z0 + 30], [Rn, z0 + 72]], hex), M.hull);
  batch.add(lathe([[Rn, z1 - 72], [150, z1 - 30], [64, z1]], hex), M.hull);
  const bands = [
    [z0 + 72, z0 + 130, M.hullDark], [z0 + 130, zc - 22, M.hab], [zc - 22, zc - 12, M.gold],
    [zc - 12, zc + 12, M.hullDark], [zc + 12, zc + 22, M.gold], [zc + 22, z1 - 130, M.hab], [z1 - 130, z1 - 72, M.hullWarm],
  ];
  for (const [a, b, mat] of bands) batch.add(lathe([[Rn, a], [Rn, b]], hex), mat);
  // raised armour ribs at the hex corners
  for (let k = 0; k < 6; k++) {
    const phi = k * 60 * DEG;
    const a = cyl(Rn + 2, phi, z0 + 72), b = cyl(Rn + 2, phi, z1 - 72);
    beamMatrix(a, b, 7, 6, a.clone().setZ(0).normalize(), m4); darkI.add(m4);
  }
  scatterCylinder(greebleI, rng, { r: Rn * 0.93, z0: z0 + 80, z1: z0 + 125, count: 220, w: [3, 12], h: [1, 5], d: [3, 12] });
  scatterCylinder(greebleI, rng, { r: Rn * 0.93, z0: z1 - 125, z1: z1 - 78, count: 220, w: [3, 12], h: [1, 5], d: [3, 12] });

  // ---------------- Docking pylons with moored transports ----------------
  for (let k = 0; k < 6; k++) {
    const phi = k * 60 * DEG + 30 * DEG;
    const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
    const tangent = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
    const docking = k % 2 === 0;
    const r0 = Rn * Math.cos(30 * DEG) - 2;
    const r1 = docking ? 470 : 330;
    // pressurised arm
    const len = r1 - r0;
    const arm = tiledCylinderZ(10, 10, len, 16, 48, true);
    const am = new THREE.Matrix4().makeBasis(tangent, new THREE.Vector3(0, 0, 1), radial).setPosition(radial.clone().multiplyScalar(r0 + len / 2).setZ(zc));
    batch.add(arm, M.hab, am);
    // truss around the arm
    for (const off of [[-16, -14], [16, -14], [0, 18]]) {
      const o = tangent.clone().multiplyScalar(off[0]).add(new THREE.Vector3(0, 0, off[1]));
      const a = radial.clone().multiplyScalar(r0).add(o).setZ(zc + off[1]);
      const b = radial.clone().multiplyScalar(r1 - 8).add(o).setZ(zc + off[1]);
      beamMatrix(a, b, 2.4, 2.4, radial, m4); trussI.add(m4);
    }
    for (let rr = r0 + 10; rr < r1 - 8; rr += 28) {
      const p = radial.clone().multiplyScalar(rr).setZ(zc);
      const a = p.clone().addScaledVector(tangent, -16).setZ(zc - 14), b = p.clone().addScaledVector(tangent, 16).setZ(zc - 14), c = p.clone().setZ(zc + 18);
      beamMatrix(a, b, 1.3, 1.3, null, m4); darkI.add(m4);
      beamMatrix(b, c, 1.3, 1.3, null, m4); darkI.add(m4);
      beamMatrix(c, a, 1.3, 1.3, null, m4); darkI.add(m4);
    }
    // end module
    const endP = radial.clone().multiplyScalar(r1).setZ(zc);
    const endG = tiledBox(40, 34, 44, 48);
    const em = new THREE.Matrix4().makeBasis(tangent, radial, new THREE.Vector3(0, 0, 1)).setPosition(endP);
    batch.add(endG, M.hullWarm, em);
    lights.add(endP.clone().addScaledVector(radial, 22), NAV.white, { period: 2.2, phase: k / 6, duty: 0.05, size: 3, intensity: 16 });
    if (docking) {
      // transport moored alongside, parallel to the ship axis
      const tp = radial.clone().multiplyScalar(r1 + 52).setZ(zc + (k === 2 ? 30 : -10));
      const tm = new THREE.Matrix4().makeBasis(tangent, radial, new THREE.Vector3(0, 0, 1)).setPosition(tp);
      addTransport(batch, M, tm, k);
      // docking clamp arms
      for (const dz of [-30, 30]) {
        const a = endP.clone().addScaledVector(radial, 16).setZ(zc + dz), b = tp.clone().addScaledVector(radial, -16).setZ(zc + dz);
        beamMatrix(a, b, 5, 5, null, m4); darkI.add(m4);
      }
      for (let j = 0; j < 7; j++) lights.add(tp.clone().addScaledVector(radial, 24).setZ(tp.z - 60 + j * 20), NAV.amber, { period: 1.4, phase: j * 0.1, duty: 0.25, size: 1.4, intensity: 6 });
    } else {
      // high-gain antenna on a gimbal
      const dish = new THREE.Group();
      dish.position.copy(endP).addScaledVector(radial, 40);
      const dB = new Batch();
      const bowl = new THREE.SphereGeometry(70, 48, 10, 0, TAU, Math.PI - 0.62, 0.62).translate(0, 70, 0);
      dB.add(bowl, M.dish);
      dB.add(tiledCylinderZ(2.2, 2.2, 32, 8).rotateX(Math.PI / 2).translate(0, 16, 0), M.trussDark);
      dB.add(new THREE.SphereGeometry(4.5, 12, 8).translate(0, 33, 0), M.hullDark);
      dB.add(tiledCylinderZ(9, 12, 14, 16).rotateX(Math.PI / 2).translate(0, -6, 0), M.hullDark);
      const rimR = 70 * Math.sin(0.62), rimY = 70 - 70 * Math.cos(0.62);
      for (let q = 0; q < 3; q++) {
        const a = q * 120 * DEG + 0.3;
        const p0 = new THREE.Vector3(Math.cos(a) * rimR * 0.96, rimY, Math.sin(a) * rimR * 0.96);
        dB.add(new THREE.BoxGeometry(1, 1, 1), M.trussDark, beamMatrix(p0, new THREE.Vector3(0, 33, 0), 1.2, 1.2, null, new THREE.Matrix4()));
      }
      dB.build(dish, { name: 'dish' });
      // orient: dish axis (+Y) points outward, then tilted toward a target
      const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);
      dish.quaternion.copy(base);
      group.add(dish);
      const phase = k * 1.3;
      ctx.animated.push((t) => {
        const tilt = 0.35 + 0.12 * Math.sin(t * 0.03 + phase);
        const yaw = 0.5 * Math.sin(t * 0.017 + phase);
        dish.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0)));
      });
      lights.add(dish.position.clone().addScaledVector(radial, 36), NAV.red, { period: 1.0, phase: k * 0.2, duty: 0.5, size: 2, intensity: 8 });
    }
  }

  // ---------------- Lights ----------------
  for (let k = 0; k < 6; k++) {
    const phi = k * 60 * DEG;
    for (const z of [z0 + 76, z1 - 76]) lights.add(cyl(Rn + 7, phi, z), NAV.white, { period: 2.8, phase: k / 6, duty: 0.04, size: 2.5, intensity: 14 });
    for (let z = z0 + 140; z < z1 - 140; z += 24) lights.add(cyl(Rn + 6, phi, z), NAV.warm, { intensity: 2.4, size: 1 });
  }

  batch.build(group, { name: 'nexus' });
  darkI.build(group, 'nexus-frames');
  trussI.build(group, 'nexus-truss');
  greebleI.build(group, 'nexus-greebles');
  lights.build(group, { name: 'nexus-lights' });
  return { group };
}
