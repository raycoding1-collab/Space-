// Surface detailing: scatter instanced boxes, pipes and fixtures across hull surfaces.
import * as THREE from 'three';
import { surfaceMatrix } from '../lib/geo.js';
import { TAU } from '../lib/rng.js';

export const GREEBLE_TONES = [
  new THREE.Color(0.36, 0.37, 0.39),
  new THREE.Color(0.3, 0.31, 0.33),
  new THREE.Color(0.22, 0.23, 0.25),
  new THREE.Color(0.15, 0.16, 0.17),
  new THREE.Color(0.09, 0.095, 0.1),
  new THREE.Color(0.42, 0.3, 0.17), // bronze fittings
  new THREE.Color(0.44, 0.45, 0.47),
];
const W_TONES = [[0, 22], [1, 22], [2, 16], [3, 14], [4, 8], [5, 6], [6, 12]];

/** Scatter boxes over a cylindrical band. */
export function scatterCylinder(inst, rng, {
  r, z0, z1, phi0 = 0, phi1 = TAU, count = 200,
  w = [2, 10], h = [0.6, 4], d = [2, 14], tones = W_TONES, stack = 0.25, alignChance = 0.85,
}) {
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const phi = rng.range(phi0, phi1);
    const z = rng.range(z0, z1);
    const sw = rng.range(w[0], w[1]), sh = rng.range(h[0], h[1]), sd = rng.range(d[0], d[1]);
    const roll = rng.chance(alignChance) ? 0 : (rng.chance(0.5) ? Math.PI / 2 : rng.range(-0.3, 0.3));
    surfaceMatrix(r + sh / 2 - 0.2, phi, z, sw, sh, sd, m, roll);
    inst.add(m, GREEBLE_TONES[rng.weighted(tones)]);
    if (rng.chance(stack)) {
      const sh2 = sh * rng.range(0.4, 0.9);
      surfaceMatrix(r + sh + sh2 / 2 - 0.2, phi, z, sw * rng.range(0.3, 0.8), sh2, sd * rng.range(0.3, 0.8), m, roll);
      inst.add(m, GREEBLE_TONES[rng.weighted(tones)]);
    }
  }
}

/** Longitudinal pipe runs along a cylinder (instanced unit cylinders along Z). */
export function pipeRuns(inst, rng, { r, z0, z1, count = 12, radius = [0.6, 1.6], phi0 = 0, phi1 = TAU }) {
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const phi = rng.range(phi0, phi1);
    const pr = rng.range(radius[0], radius[1]);
    const a = rng.range(z0, z1 - 40);
    const len = rng.range(40, z1 - a);
    surfaceMatrix(r + pr, phi, a + len / 2, pr * 2, pr * 2, len, m);
    inst.add(m, GREEBLE_TONES[rng.pick([1, 2, 3, 5])]);
  }
}

/** Radial fins/ribs around a cylinder at a given z. */
export function ribsRing(inst, { r, z, n, w = 2, h = 3, d = 6, color = GREEBLE_TONES[2], phi0 = 0 }) {
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const phi = phi0 + (i / n) * TAU;
    surfaceMatrix(r + h / 2, phi, z, w, h, d, m);
    inst.add(m, color);
  }
}
