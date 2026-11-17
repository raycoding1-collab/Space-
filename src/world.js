// Global world configuration: one place to art-direct the composition.
import * as THREE from 'three';

export const WORLD = {
  // Direction *toward* the sun.
  sunDir: new THREE.Vector3(0.45, 0.42, -0.79).normalize(),
  sunColor: new THREE.Color(1.0, 0.94, 0.86),
  sunIntensity: 3.4,

  // Gas giant "Aurelis"
  planetCenter: new THREE.Vector3(-0.35, -0.5, -0.79).normalize().multiplyScalar(470000),
  planetRadius: 118000,
  // Ring plane normal (also the planet's spin axis)
  ringNormal: new THREE.Vector3(0.22, 0.95, 0.2).normalize(),
  ringInner: 1.32,
  ringOuter: 2.35,

  // Moon "Ilex"
  moonCenter: new THREE.Vector3(-0.85, -0.05, -0.35).normalize().multiplyScalar(95000),
  moonRadius: 4200,

  // Milky Way orientation
  galNormal: new THREE.Vector3(-0.35, 0.62, 0.7).normalize(),
  galCenter: new THREE.Vector3(0.9, 0.25, 0.2), // will be orthogonalised

  skyRadius: 1.4e6,
};

// Orthogonalise galactic centre against the galactic normal.
{
  const n = WORLD.galNormal;
  const c = WORLD.galCenter;
  c.sub(n.clone().multiplyScalar(c.dot(n))).normalize();
}

export const SHIP = {
  length: 7040,
  bowZ: 3700,
  sternZ: -3340,
  ringA: { z: 2470, R: 1060 },
  ringB: { z: 2190, R: 1060 },
  arcadia: { z0: -900, z1: 1150, R: 480, Ri: 472 },
  nexus: { z0: 1340, z1: 1860 },
  foundry: { z0: -1480, z1: -1130 },
  cargo: { z0: -1640, z1: -1515 },
  reactorsZ: [-1880, -2330],
  radiators: { z0: -2560, z1: -1660, r0: 150, r1: 1180 },
  engines: { z: -2940 },
};
