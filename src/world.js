// Global world configuration: one place to art-direct the composition.
import * as THREE from 'three';

export const WORLD = {
  // Direction *toward* the sun.
  sunDir: new THREE.Vector3(0.3, 0.88, -0.36).normalize(),
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
  galNormal: new THREE.Vector3(0.734, -0.643, -0.223).normalize(),
  galCenter: new THREE.Vector3(-0.2, 0.31, -1.55), // will be orthogonalised

  skyRadius: 1.4e6,
};

// Orthogonalise galactic centre against the galactic normal.
{
  const n = WORLD.galNormal;
  const c = WORLD.galCenter;
  c.sub(n.clone().multiplyScalar(c.dot(n))).normalize();
}
