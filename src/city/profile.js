// Ship profile for ELYSION, the flying city-ship (?ship=city).
import * as THREE from 'three';
import { buildCity } from './city.js';
import { POIS, LABELS, TOUR } from './pois.js';

export const PROFILE = {
  id: 'city',
  name: 'ELYSION',
  sub: 'Flying City-Ship · Free City of the Reach',
  loaderSub: 'Flying City-Ship · 32 km',
  docTitle: 'ELYSION — The Flying City-Ship',
  intro: {
    kicker: 'The Free City of the Reach · Under way above Aurelis',
    text: 'Thirty-two kilometres of city lifted into space: towers climbing to a crown spire, glass biomes holding a lake and a forest, a grand canal, harbours and an undercity. Four point two million people. VESPERA flies escort.',
  },
  telemetry: [['Citizens', '4,212,860'], ['Length', '32.0 km']],
  clockLabel: 'City clock',
  clockEpoch: 391 * 365.25 + 47,
  velocity: (t) => `${(0.0094 + 0.00001 * Math.sin(t * 0.007)).toFixed(4)} c`,
  liveTelemetry: (t, set) => set(0, Math.round(4212860 + 3 * t + 40 * Math.sin(t * 0.05)).toLocaleString('en-US')),
  pois: POIS,
  labels: LABELS,
  tour: TOUR,
  labelFade: 90000,
  // a lower, warmer sun than VESPERA's: side light and long shadows across the districts
  world: { sunDir: new THREE.Vector3(0.82, 0.45, 0.35), sunColor: new THREE.Color(1.0, 0.9, 0.78), sunIntensity: 3.6 },
  near: 1.0,
  rig: { maxDistance: 260000, minDistance: 20, flySpeed: 600, flyMax: 40000, arc: 'up', belowY: -900, halfBeam: 6200 },
  shadow: {
    adaptive: true, center: new THREE.Vector3(2500, 0, 0), halfX: 11500, halfZ: 19000, dist: 40000, near: 100, far: 90000,
    normalBias: 1.5, minHalf: 450, radiusK: 1.25,
  },
  async build({ quality, step, scene }) {
    return buildCity({ quality, step, scene });
  },
};
