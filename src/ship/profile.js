// Ship profile for VESPERA: everything main.js needs to know about this ship (UI copy, camera ranges,
// shadow coverage, points of interest) plus its async builder.
import * as THREE from 'three';
import { POIS, TOUR, LABELS } from '../data/pois.js';
import { buildShip } from './ship.js';
import { buildTraffic } from '../life/traffic.js';

export const PROFILE = {
  id: 'vespera',
  name: 'VESPERA',
  sub: 'Capital Starship · CS-01',
  loaderSub: 'Capital Starship · Hull 01',
  docTitle: 'VESPERA — Capital Starship',
  intro: {
    kicker: 'Flagship of the Outer Reach · High orbit of Aurelis',
    text: 'Five point eight kilometres of layered armour, light and machinery. Eighty-six thousand souls aboard. A city that crosses between stars.',
  },
  telemetry: [['Souls aboard', '86,400'], ['Length', '5.79 km']],
  clockLabel: 'Fleet clock',
  clockEpoch: 214 * 365.25 + 132,
  velocity: (t) => `${(0.0312 + 0.00002 * Math.sin(t * 0.01)).toFixed(4)} c`,
  pois: POIS,
  labels: LABELS,
  tour: TOUR,
  labelFade: 16000,
  rig: { maxDistance: 90000, minDistance: 25, flySpeed: 160, flyMax: 6000, arc: 'axis' },
  // Fixed shadow frustum around the whole ship.
  shadow: { adaptive: false, center: new THREE.Vector3(0, 0, 300), halfX: 1150, halfZ: 3350, dist: 10000, near: 100, far: 22000, normalBias: 1.2 },
  async build({ quality, step }) {
    const ship = await buildShip({ quality, step });
    await step('Scheduling shuttle traffic', 0.88);
    const traffic = buildTraffic(ship, ship.M);
    const root = new THREE.Group();
    root.add(ship.root, traffic.group);
    return {
      root,
      update(t) { ship.update(t); traffic.update(t); },
    };
  },
};
