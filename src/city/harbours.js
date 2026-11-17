// Harbours: six piers on each flank, reaching 1.5 km out from the lowest city-wall ledge. Each has a
// terminal along its spine, gantry cranes on rails, ships of five designs moored at its berths with
// gangways, braced struts back to the wall, a control tower at the tip and sequenced approach lights.
import * as THREE from 'three';
import { Shape, ShapeBatch, Z, rect, circle, chamfer } from './geo.js';
import { RNG, TAU } from '../lib/rng.js';
import { HARBOURS, PIER } from './layout.js';
import { crossSection } from './foundation.js';
import { LightSet, NAV } from '../ship/lights.js';
import { instMatrix } from './districts.js';
import { hazed } from './materials.js';

// ------------------------------------------------------------------ ship designs (bow toward +x)
function freighter(L = 520) {
  const s = new Shape();
  s.prism(rect(L, 24), -12, 12, Z.CLAD, Z.ROOF);
  s.prism(chamfer(60, 46, 10, -L / 2 + 30, 0), -20, 46, Z.FACADE, Z.ROOF); // bridge block (aft)
  s.prism(rect(34, 30, -L / 2 + 30, 0), 46, 58, Z.DARKGLASS, Z.METAL);
  s.prism(chamfer(40, 40, 12, L / 2 - 14, 0), -16, 16, Z.METAL, Z.METAL); // bow module
  for (const z of [-12, 12]) for (const y of [-10, 10]) s.prism(circle(9, 12).map(([a, b]) => [a - L / 2 - 2, b + z]), y - 1, y + 1, Z.TRIM, Z.TRIM);
  s.prism(rect(30, 52, -L / 2 + 6, 0), -26, 26, Z.METAL, null); // engine block
  return s;
}
function tanker(L = 600) {
  const s = new Shape();
  s.prism(rect(L, 16), -8, 8, Z.METAL, Z.METAL);
  const n = 8, r = (L - 140) / n / 2;
  for (let k = 0; k < n; k++) {
    const x = -L / 2 + 90 + r + k * 2 * r;
    const rings = [];
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; rings.push(circle(Math.max(0.01, Math.cos(a) * r * 0.92), 16, x, 0).map(([p, q]) => [p, Math.sin(a) * r * 0.92, q])); }
    s.loft(rings, Z.METAL, { closed: true, crease: 80 });
    s.walls(circle(r * 0.93, 16, x, 0), -1, 1, Z.TRIM);
  }
  s.prism(chamfer(70, 40, 10, L / 2 - 40, 0), -18, 30, Z.FACADE, Z.ROOF);
  s.prism(rect(30, 60, -L / 2 + 15, 0), -30, 30, Z.CLAD, Z.METAL);
  for (const z of [-18, 18]) s.prism(circle(11, 12).map(([a, b]) => [a - L / 2 - 1, b + z]), -2, 2, Z.TRIM, Z.TRIM);
  return s;
}
function liner(L = 420) {
  const s = new Shape();
  const secs = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = -L / 2 + L * t;
    const w = 52 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.02)), 0.6) + 1;
    const h = 30 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.03)), 0.5) + 1;
    secs.push([[x, -h * 0.6, 0], [x, -h * 0.2, w / 2], [x, h * 0.6, w * 0.38], [x, h, 0], [x, h * 0.6, -w * 0.38], [x, -h * 0.2, -w / 2]]);
  }
  s.loft(secs, Z.FACADE, { closed: true, crease: 50 });
  s.cone(-30, 0, 34, 2, 26, 56, Z.GLASS, 20);
  s.walls(circle(34.5, 20, -30, 0), 25, 27, Z.TRIM);
  for (const z of [-14, 0, 14]) s.prism(circle(7, 10).map(([a, b]) => [a - L / 2 - 1, b + z]), -4, 4, Z.TRIM, Z.TRIM);
  return s;
}
function hauler(L = 700) {
  const s = new Shape();
  s.prism(rect(L, 12), -6, 6, Z.METAL, Z.METAL);
  const mods = 9, ml = (L - 160) / mods;
  for (let k = 0; k < mods; k++) {
    const x = -L / 2 + 100 + ml * (k + 0.5);
    s.prism(chamfer(ml - 8, 64, 8, x, 0), -34, 34, Z.CLAD, Z.ROOF);
    s.walls(chamfer(ml - 7, 65, 8, x, 0), 30, 31, Z.TRIM);
  }
  s.prism(chamfer(60, 48, 12, L / 2 - 30, 0), -20, 40, Z.FACADE, Z.ROOF);
  s.prism(rect(60, 80, -L / 2 + 30, 0), -40, 40, Z.CLAD, Z.METAL);
  for (const z of [-24, 0, 24]) for (const y of [-20, 20]) s.prism(circle(9, 12).map(([a, b]) => [a - L / 2 - 1, b + z]), y - 1, y + 1, Z.TRIM, Z.TRIM);
  return s;
}
function tug(L = 90) {
  const s = new Shape();
  s.prism(chamfer(L, 22, 6), -9, 9, Z.CLAD, Z.ROOF);
  s.prism(chamfer(24, 16, 4, 14, 0), 9, 16, Z.DARKGLASS, Z.METAL);
  s.prism(rect(10, 28, -L / 2 + 6, 0), -12, 12, Z.METAL, Z.METAL);
  for (const z of [-8, 8]) s.prism(circle(4, 8).map(([a, b]) => [a - L / 2, b + z]), -1, 1, Z.TRIM, Z.TRIM);
  return s;
}
function gantry() {
  const s = new Shape();
  for (const x of [-22, 22]) s.prism(rect(4, 4, x, 0), 0, 64, Z.METAL, null);
  s.prism(rect(52, 6, 0, 0), 60, 70, Z.METAL, Z.METAL);
  s.prism(rect(6, 130, 0, 50), 64, 70, Z.METAL, Z.METAL); // boom out over the berth (+z)
  s.prism(rect(10, 10, 0, 74), 56, 64, Z.CLAD, Z.ROOF); // trolley
  s.prism(rect(8, 6, 0, 74), 52, 56, Z.GLASS, null);
  s.beam([0, 70, -10], [0, 90, 0], 1, 1, Z.METAL);
  s.beam([0, 90, 0], [0, 70, 112], 0.6, 0.6, Z.METAL);
  return s;
}

const CONTAINER_COLS = [[0.62, 0.18, 0.12], [0.12, 0.26, 0.5], [0.85, 0.45, 0.12], [0.85, 0.83, 0.78], [0.16, 0.38, 0.22], [0.8, 0.66, 0.16], [0.35, 0.36, 0.38], [0.5, 0.12, 0.22]];

export function buildHarbours(M, ctx) {
  const root = new THREE.Group();
  root.name = 'harbours';
  const B = new ShapeBatch();
  const rng = new RNG(6060);
  const lights = new LightSet();
  const designs = { freighter: freighter(), tanker: tanker(), liner: liner(), hauler: hauler(), tug: tug(), gantry: gantry() };
  const inst = Object.fromEntries(Object.keys(designs).map((k) => [k, { m: [], s: [] }]));
  const containers = [];
  const style = M.style;
  const shipStyles = ['shipWhite', 'shipGrey', 'shipDark', 'shipBlue'];
  ctx.piers = [];

  HARBOURS.forEach((zc, pi) => {
    for (const side of [-1, 1]) {
      const cs = crossSection(zc);
      const x0 = side * (cs.W + cs.o2 - 4), y = PIER.y, L = PIER.len, w = PIER.width;
      const xa = x0, xb = x0 + side * L;
      const X = (t) => xa + (xb - xa) * t;
      const poly = [[Math.min(xa, xb), zc - w / 2], [Math.max(xa, xb), zc - w / 2], [Math.max(xa, xb), zc + w / 2], [Math.min(xa, xb), zc + w / 2]];
      const sh = B.get(M.pierMat);
      // deck slab and its lit fascia
      sh.prism(poly, y - 40, y, Z.CLAD, Z.ROOF);
      sh.walls(poly.map(([a, b]) => [a, b + (b > zc ? 0.5 : -0.5)]), y - 6, y - 4.6, Z.TRIM);
      // terminal along the spine
      const tl = L * 0.78;
      const tx = (X(0.08) + X(0.08 + tl / L)) / 2;
      sh.prism(chamfer(tl, 46, 10, tx, zc), y, y + 34, Z.FACADE, Z.ROOF);
      sh.prism(chamfer(tl * 0.6, 26, 8, tx, zc), y + 34, y + 46, Z.GLASS, Z.ROOF);
      // braced struts back to the wall
      for (const t of [0.3, 0.55]) for (const dz of [-w * 0.35, w * 0.35]) {
        sh.beam([X(t), y - 40, zc + dz], [x0 - side * 10, cs.y3 + 60, zc + dz * 1.6], 14, 14, Z.METAL);
      }
      // control tower at the tip
      const tipx = X(0.97);
      sh.prism(circle(24, 20, tipx, zc), y, y + 140, Z.FACADE, null);
      sh.prism(circle(36, 20, tipx, zc), y + 140, y + 164, Z.GLASS, Z.METAL);
      sh.cone(tipx, zc, 6, 0.5, y + 164, y + 220, Z.METAL, 8);
      lights.add(new THREE.Vector3(tipx, y + 224, zc), NAV.white, { intensity: 24, size: 8, period: 2.0, phase: pi * 0.1, duty: 0.08 });
      // approach lights: a sequenced line of flashes running in toward the pier
      const n = 22;
      for (let k = 0; k < n; k++) {
        const px = X(1) + side * (40 + k * 60);
        lights.add(new THREE.Vector3(px, y - 10, zc), NAV.cyan, { intensity: 10, size: 4, period: 1.6, phase: 1 - k / n, duty: 0.06 });
      }
      for (let k = 0; k < 30; k++) for (const dz of [-w / 2, w / 2]) lights.add(new THREE.Vector3(X(k / 29), y + 2, zc + dz), NAV.warm, { intensity: 3, size: 2.2 });
      // gantry cranes along both edges
      for (const bz of [-1, 1]) {
        for (let k = 0; k < 6; k++) {
          const t = 0.12 + k * 0.14 + rng.range(-0.02, 0.02);
          inst.gantry.m.push(instMatrix(X(t), y, zc + bz * (w / 2 - 6), bz > 0 ? 0 : Math.PI, 1, 1));
          inst.gantry.s.push(style.cranes);
        }
      }
      // ships at the berths on both sides
      for (const bz of [-1, 1]) {
        let t = 0.06;
        while (t < 0.92) {
          const kind = rng.weighted([['freighter', 2], ['tanker', 1], ['liner', 1], ['hauler', 1], ['tug', 0.8]]);
          const Ls = { freighter: 520, tanker: 600, liner: 420, hauler: 700, tug: 90 }[kind];
          const beam = { freighter: 60, tanker: 80, liner: 52, hauler: 80, tug: 28 }[kind];
          const span = Ls / L;
          if (t + span > 1.02) break;
          const xc = X(t + span / 2);
          const zs = zc + bz * (w / 2 + 30 + beam / 2 + rng.range(0, 30));
          const ys = y - 20 + rng.range(-30, 30);
          const rot = side > 0 ? 0 : Math.PI;
          inst[kind].m.push(instMatrix(xc, ys, zs, rot, 1, 1));
          inst[kind].s.push(style[rng.pick(shipStyles)]);
          if (kind === 'freighter') {
            // container stacks on both sides of the spine
            for (let cx = -Ls / 2 + 90; cx < Ls / 2 - 50; cx += 13) {
              if (rng.chance(0.06)) continue;
              for (const cz of [-1, 1]) {
                const hgt = rng.int(2, 5);
                for (let lev = 0; lev < hgt; lev++) for (let row = 0; row < 3; row++) {
                  containers.push([xc + (side > 0 ? cx : -cx), ys - 8 + lev * 2.7, zs + cz * (16 + row * 2.6), rng.int(0, CONTAINER_COLS.length - 1)]);
                }
              }
            }
          }
          // gangway to the pier
          sh.beam([xc, y - 8, zc + bz * (w / 2)], [xc, ys, zs - bz * beam * 0.35], 8, 6, Z.GLASS);
          lights.add(new THREE.Vector3(xc + side * Ls / 2, ys + 20, zs), NAV.white, { intensity: 8, size: 3, period: 1.5, phase: rng.next(), duty: 0.08 });
          lights.add(new THREE.Vector3(xc, ys, zs + bz * beam / 2), bz > 0 ? NAV.green : NAV.red, { intensity: 6, size: 2.5 });
          t += span + rng.range(0.02, 0.06);
        }
      }
      ctx.piers.push({ x: X(0.5), y, z: zc, tip: new THREE.Vector3(tipx, y, zc), side });
    }
  });

  for (const [k, d] of Object.entries(inst)) {
    if (!d.m.length) continue;
    const g = designs[k].toGeometry();
    g.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(d.s), 1));
    const mesh = new THREE.InstancedMesh(g, M.buildings, d.m.length);
    d.m.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.name = k;
    root.add(mesh);
  }
  if (containers.length) {
    const cg = new THREE.BoxGeometry(12, 2.5, 2.4);
    const cm = hazed(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.4 }));
    const mesh = new THREE.InstancedMesh(cg, cm, containers.length);
    const col = new THREE.Color();
    containers.forEach(([x, y, z, c], i) => {
      mesh.setMatrixAt(i, instMatrix(x, y, z, 0, 1, 1));
      const k = CONTAINER_COLS[c];
      col.setRGB(k[0], k[1], k[2]);
      mesh.setColorAt(i, col);
    });
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  B.build(root, { name: 'piers' });
  lights.build(root, { name: 'harbour-lights' });
  void TAU;
  return root;
}
