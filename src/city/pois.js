// Points of interest, 3D labels and the guided tour for ELYSION.
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export const POIS = [
  {
    id: 'overview', name: 'Overview', kicker: 'Flying city-ship', title: 'ELYSION',
    text: 'A city that flies: thirty-two kilometres of towers, terraces, glass biomes and harbours on a sculpted foundation. Four point two million people live aboard.',
    stats: [['Length', '32.0 km'], ['Beam', '12.4 km'], ['Citizens', '4.2 million'], ['Crown spire', '5.2 km'], ['Cruise', '0.0094 c']],
    pos: v(21000, 9500, 26000), target: v(0, 0, -1500), fov: 40,
  },
];

export const LABELS = [
  { text: 'Crown Spire', pos: v(0, 5300, -2600) },
];

export const TOUR = [
  {
    title: 'ELYSION', caption: 'The Free City of the Reach, under way above Aurelis.',
    from: { pos: v(30000, 13000, 36000), target: v(0, 0, -1500) }, to: { pos: v(21000, 9500, 26000), target: v(0, 0, -1500) }, dur: 18, fov: 40,
  },
];
