// Engineering: eight fusion reactors in magnetic containment and four kilometre-wide radiator
// wings that shed their waste heat as a dull red-orange glow.
import * as THREE from 'three';
import { lathe, beamMatrix, Batch, Instancer, cyl, tiledCylinderZ, surfaceMatrix } from '../lib/geo.js';
import { RNG, TAU, DEG } from '../lib/rng.js';
import { scatterCylinder } from './greebles.js';
import { LightSet, NAV } from './lights.js';
import { SHIP } from '../world.js';

export function buildEngineering(M, ctx) {
  const group = new THREE.Group();
  group.name = 'engineering';
  const rng = new RNG(707);
  const batch = new Batch();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const darkI = new Instancer(box, M.trussDark);
  const trussI = new Instancer(box, M.truss);
  const greebleI = new Instancer(box, M.greeble, { colors: true });
  const lights = new LightSet();
  const m4 = new THREE.Matrix4();
  const reactors = [];

  // ======================= Reactors =======================
  const Rr = 60, orbit = 186;
  SHIP.reactorsZ.forEach((rz, station) => {
    for (let k = 0; k < 4; k++) {
      const phi = k * 90 * DEG + (station ? 0 : 0);
      const c = cyl(orbit, phi, rz);
      const T = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
      // shell
      const shell = new THREE.SphereGeometry(Rr, 64, 40);
      const uv = shell.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 4);
      batch.add(shell, M.hullDark, T);
      // equatorial belt & glowing slit
      batch.add(lathe([[Rr - 2, -12], [Rr + 4, -9], [Rr + 4, 9], [Rr - 2, 12]], { segments: 96, tile: 24 }), M.gold, T);
      batch.add(lathe([[Rr + 4.4, -2], [Rr + 4.4, 2]], { segments: 96 }), M.glowCyan, T);
      // polar caps
      for (const s of [-1, 1]) {
        const cap = tiledCylinderZ(20, 24, 10, 32);
        batch.add(cap, M.hull, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z + s * (Rr - 3)));
      }
      // glowing meridian windows into the plasma
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * TAU + 11 * DEG;
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const th = -1.05 + (i / 16) * 2.1;
          pts.push(new THREE.Vector3(Math.cos(a) * Math.cos(th) * (Rr + 0.6), Math.sin(a) * Math.cos(th) * (Rr + 0.6), Math.sin(th) * (Rr + 0.6)).add(c));
        }
        // break around the belt
        const top = pts.filter((p) => p.z - c.z > 13), bot = pts.filter((p) => p.z - c.z < -13);
        for (const seg of [top, bot]) if (seg.length > 2) batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seg), 20, 1.1, 5, false), M.glowCyanSoft);
      }
      // containment rings (animated)
      const rings = new THREE.Group();
      rings.position.copy(c);
      const rb = new Batch();
      for (let q = 0; q < 2; q++) {
        const tor = new THREE.TorusGeometry(Rr + 22, 3.2, 10, 128);
        const rot = new THREE.Matrix4().makeRotationX(q ? 0.42 : -0.42);
        rb.add(tor, M.chrome, rot);
        rb.add(new THREE.TorusGeometry(Rr + 22, 1.4, 6, 128).translate(0, 0, 3.4).applyMatrix4(rot), M.glowCyan);
      }
      rb.build(rings, { name: 'containment' });
      group.add(rings);
      const sp = (k % 2 ? 1 : -1) * (0.11 + 0.03 * station);
      ctx.animated.push((t) => { rings.rotation.z = t * sp; });
      // mounting struts to the spine
      const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
      for (const dz of [-34, 34]) {
        const a = radial.clone().multiplyScalar(58).setZ(rz + dz * 1.4);
        const b = radial.clone().multiplyScalar(orbit - Rr + 6).setZ(rz + dz * 0.6);
        beamMatrix(a, b, 7, 7, null, m4); trussI.add(m4);
      }
      // coolant lines to the radiator roots on either side
      for (const s of [-1, 1]) {
        const rootPhi = phi + s * 45 * DEG;
        const p0 = cyl(orbit - 10, phi + s * 14 * DEG, rz);
        const p1 = cyl(orbit - 12, phi + s * 30 * DEG, rz + 20);
        const p2 = cyl(SHIP.radiators.r0 - 6, rootPhi, rz + 30);
        const curve = new THREE.CatmullRomCurve3([p0, p1, p2]);
        batch.add(new THREE.TubeGeometry(curve, 16, 3.6, 8, false), M.copper);
      }
      lights.add(cyl(orbit + Rr + 26, phi, rz), NAV.cyan, { period: 2.2, phase: k / 4 + station * 0.5, duty: 0.08, size: 2, intensity: 9 });
      reactors.push({ centre: c, phi, z: rz });
    }
  });
  // reactor station collars on the spine
  for (const rz of SHIP.reactorsZ) {
    batch.add(lathe([[48, rz - 70], [72, rz - 56], [72, rz + 56], [48, rz + 70]], { segments: 6, faceted: true, phiStart: 30 * DEG, tile: 48 }), M.hab);
    scatterCylinder(greebleI, rng, { r: 72, z0: rz - 50, z1: rz + 50, count: 120, w: [2, 7], h: [0.6, 3], d: [2, 9] });
  }

  // ======================= Radiators =======================
  const { z0, z1, r0, r1 } = SHIP.radiators;
  const panelLen = z1 - z0;
  const span = r1 - r0;
  const nSub = 4, gap = 14;
  const subW = (span - gap * (nSub - 1)) / nSub;
  for (let k = 0; k < 4; k++) {
    const phi = k * 90 * DEG + 45 * DEG;
    const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
    const tangent = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
    const axis = new THREE.Vector3(0, 0, 1);
    const basis = new THREE.Matrix4().makeBasis(radial, axis, tangent.clone().negate()); // X radial, Y axis, Z normal
    for (let j = 0; j < nSub; j++) {
      const ra = r0 + j * (subW + gap);
      const g = new THREE.PlaneGeometry(subW, panelLen, 1, 1);
      // UVs: continuous heat gradient across the whole wing
      const uvA = g.attributes.uv;
      for (let i = 0; i < uvA.count; i++) {
        const u = uvA.getX(i), v = uvA.getY(i);
        uvA.setXY(i, (ra - r0 + u * subW) / span, v);
      }
      const mid = radial.clone().multiplyScalar(ra + subW / 2).setZ((z0 + z1) / 2);
      batch.add(g, M.radiator, basis.clone().setPosition(mid));
      // panel frame
      const corners = [
        radial.clone().multiplyScalar(ra).setZ(z0), radial.clone().multiplyScalar(ra + subW).setZ(z0),
        radial.clone().multiplyScalar(ra + subW).setZ(z1), radial.clone().multiplyScalar(ra).setZ(z1),
      ];
      for (let q = 0; q < 4; q++) {
        beamMatrix(corners[q], corners[(q + 1) % 4], 3.4, 3.4, tangent, m4, 3);
        darkI.add(m4);
      }
      // ribs across the panel
      for (let z = z0 + panelLen / 8; z < z1 - 1; z += panelLen / 8) {
        beamMatrix(radial.clone().multiplyScalar(ra).setZ(z), radial.clone().multiplyScalar(ra + subW).setZ(z), 1.6, 2.4, tangent, m4);
        darkI.add(m4);
      }
      // hinge joints between sub-panels
      if (j < nSub - 1) {
        for (const z of [z0 + 60, (z0 + z1) / 2, z1 - 60]) {
          beamMatrix(radial.clone().multiplyScalar(ra + subW - 2).setZ(z), radial.clone().multiplyScalar(ra + subW + gap + 2).setZ(z), 6, 6, tangent, m4);
          trussI.add(m4);
        }
      }
    }
    // root boom & manifold
    const rootA = radial.clone().multiplyScalar(r0 - 6).setZ(z0 - 20), rootB = radial.clone().multiplyScalar(r0 - 6).setZ(z1 + 20);
    beamMatrix(rootA, rootB, 12, 12, tangent, m4); trussI.add(m4);
    batch.add(tiledCylinderZ(6, 6, panelLen + 40, 12), M.copper, new THREE.Matrix4().makeTranslation(radial.x * (r0 - 2), radial.y * (r0 - 2), (z0 + z1) / 2).multiply(new THREE.Matrix4().makeTranslation(tangent.x * 9, tangent.y * 9, 0)));
    // struts from the spine to the boom
    for (let z = z0; z <= z1; z += 150) {
      beamMatrix(radial.clone().multiplyScalar(58).setZ(z), radial.clone().multiplyScalar(r0 - 6).setZ(z + 40), 4, 4, null, m4); trussI.add(m4);
    }
    // tip lights
    const port = Math.cos(phi) < 0;
    for (const z of [z0, z1]) {
      lights.add(radial.clone().multiplyScalar(r1 + 4).setZ(z), port ? NAV.red : NAV.green, { period: 2.4, phase: k * 0.17, duty: 0.25, size: 4, intensity: 12 });
    }
    lights.add(radial.clone().multiplyScalar(r1 + 4).setZ((z0 + z1) / 2), NAV.white, { period: 1.9, phase: k * 0.23, duty: 0.04, size: 4.5, intensity: 22 });
    for (let j = 1; j <= nSub; j++) {
      lights.add(radial.clone().multiplyScalar(r0 + j * (subW + gap) - gap / 2).setZ(z0 - 3), NAV.amber, { intensity: 4, size: 1.5 });
    }
  }

  batch.build(group, { name: 'engineering' });
  darkI.build(group, 'engineering-frames');
  trussI.build(group, 'engineering-truss');
  greebleI.build(group, 'engineering-greebles');
  lights.build(group, { name: 'engineering-lights' });
  return { group, reactors };
}
