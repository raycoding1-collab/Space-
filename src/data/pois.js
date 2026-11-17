// Points of interest, 3D labels and the guided tour script for the capital starship.
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export const POIS = [
  {
    id: 'overview', name: 'Overview', kicker: 'Capital starship', title: 'VESPERA',
    text: 'Flagship of the Outer Reach: a 5.8 km dagger of layered armour, glowing seams and machinery. Eighty-six thousand souls live and work aboard.',
    stats: [['Length', '5.79 km'], ['Beam', '1.83 km'], ['Souls aboard', '86,400'], ['Decks', '214'], ['Cruise', '0.031 c']],
    pos: v(3400, 1500, 5400), target: v(0, -120, 100), fov: 45,
  },
  {
    id: 'prow', name: 'Prow & Lance', kicker: 'Forward section', title: 'The Prow',
    text: 'The hull narrows over four kilometres to a razor prow. Dorsal and ventral blades run along it, and a 340 m sensor lance sweeps the space ahead.',
    stats: [['Lance', '340 m'], ['Blade height', '78 m'], ['Emitters', '3'], ['Armour layers', '2']],
    pos: v(560, 230, 3550), target: v(0, 20, 2350), fov: 45,
  },
  {
    id: 'tower', name: 'Command Tower', kicker: 'Bridge', title: 'Command Tower',
    text: 'Three stepped tiers rise over the dorsal trench, topped by a cantilevered flag bridge and a swept sail fin. The panoramic bridge looks straight down the length of the ship.',
    stats: [['Height', '300 m above deck'], ['Bridge crew', '420'], ['Tiers', '3 + flag bridge'], ['Masts', '5']],
    pos: v(560, 520, -420), target: v(0, 250, -1450), fov: 45,
  },
  {
    id: 'trench', name: 'Dorsal Trench', kicker: 'Core systems', title: 'The Trench',
    text: 'A three-kilometre canyon cut into the spine exposes the ship’s core: energy conduits pulse forward, maglev pods race between sections, and lit decks line both walls.',
    stats: [['Length', '3.0 km'], ['Depth', 'up to 46 m'], ['Conduits', '5'], ['Gantries', '13']],
    pos: v(0, 128, 1180), target: v(0, 118, -1300), fov: 55,
  },
  {
    id: 'flank', name: 'Energy Channel', kicker: 'Power distribution', title: 'Flank Channel',
    text: 'A glowing channel runs the full length of each flank, carrying reactor output to every section. Above and below it, window bands mark the ship’s inhabited decks.',
    stats: [['Length', '5.2 km'], ['Window decks', '≈ 28'], ['Packet speed', '320 m/s'], ['Running lights', '380']],
    pos: v(560, 60, 1050), target: v(240, -10, -1300), fov: 50,
  },
  {
    id: 'bays', name: 'Hangar Bays', kicker: 'Flight operations', title: 'Ventral Hangars',
    text: 'Six bays open from the ventral flanks behind atmosphere-retention fields. Shuttles cycle in and out round the clock, running to the escorts and down to the moon Ilex.',
    stats: [['Bays', '6'], ['Shuttles', '30+ in flight'], ['Bay depth', '16 m field + hangar'], ['Escorts', '4 frigates']],
    pos: v(700, -560, 220), target: v(150, -110, -330), fov: 48,
  },
  {
    id: 'nacelles', name: 'Nacelles', kicker: 'Outboard drives', title: 'Outboard Nacelles',
    text: 'Two outboard nacelles ride on swept pylons, fed by conduits pulsing out from the hull. Their intakes glow cyan; their drives add thrust to the stern array.',
    stats: [['Length', '2.05 km'], ['Span', '1.83 km'], ['Pylon sweep', '28°'], ['Drives', '2']],
    pos: v(1650, 420, -280), target: v(830, -24, -1450), fov: 48,
  },
  {
    id: 'engines', name: 'Engine Array', kicker: 'Propulsion', title: 'Engine Array',
    text: 'Thirteen magnetic-nozzle fusion drives: three main bells, eight auxiliaries and the two nacelle engines. At cruise their plumes run a kilometre and more astern.',
    stats: [['Drives', '13'], ['Main bell Ø', '164 m'], ['Exhaust', '0.08 c'], ['Thrust', '31 MN']],
    pos: v(1000, -420, -4300), target: v(0, 0, -2500), fov: 48,
  },
];

export const LABELS = [
  { text: 'Sensor lance', pos: v(0, 30, 3250) },
  { text: 'Prow blades', pos: v(0, 110, 2300) },
  { text: 'Dorsal trench', pos: v(0, 170, 400) },
  { text: 'Command tower', pos: v(0, 500, -1500) },
  { text: 'Energy channel', pos: v(330, 0, 300) },
  { text: 'Hangar bays', pos: v(250, -150, -330) },
  { text: 'Starboard nacelle', pos: v(830, 90, -1200) },
  { text: 'Port nacelle', pos: v(-830, 90, -1200) },
  { text: 'Engine array', pos: v(0, 180, -2500) },
];

export const TOUR = [
  {
    title: 'VESPERA', caption: 'Flagship of the Outer Reach, holding high orbit over the gas giant Aurelis.',
    from: { pos: v(7600, 3800, 11200), target: v(0, -200, 400) }, to: { pos: v(5200, 2700, 8000), target: v(0, -150, 200) }, dur: 16, fov: 42,
  },
  {
    title: 'The prow', caption: 'Four kilometres of taper end in a razor prow and a 340-metre sensor lance.',
    from: { pos: v(900, 420, 4300), target: v(0, 20, 2700) }, to: { pos: v(-300, 260, 4000), target: v(0, 0, 2500) }, dur: 14, fov: 45,
  },
  {
    title: 'Dorsal trench', caption: 'A canyon cut into the spine: conduits pulse, maglev pods race between sections, and lit decks line both walls.',
    from: { pos: v(0, 132, 1400), target: v(0, 120, -1000) }, to: { pos: v(0, 160, 300), target: v(0, 170, -1800) }, dur: 16, fov: 55, ease: 'linear',
  },
  {
    title: 'Command tower', caption: 'The bridge looks straight down the length of the ship.',
    from: { pos: v(700, 600, -300), target: v(0, 260, -1400) }, to: { pos: v(380, 420, -760), target: v(0, 280, -1450) }, dur: 14, fov: 45,
  },
  {
    title: 'The flank', caption: 'A channel of light runs the full length of each flank, carrying reactor output to every section.',
    from: { pos: v(600, 70, 1500), target: v(260, -10, -600) }, to: { pos: v(560, 40, 300), target: v(240, -10, -1700) }, dur: 15, fov: 50, ease: 'linear',
  },
  {
    title: 'Hangar bays', caption: 'Shuttles cycle through six ventral bays, running to the escorts and down to the moon Ilex.',
    from: { pos: v(900, -700, 400), target: v(150, -110, -300) }, to: { pos: v(620, -480, -100), target: v(140, -110, -420) }, dur: 14, fov: 48,
  },
  {
    title: 'Outboard nacelles', caption: 'Swept pylons carry the outboard drives, fed by conduits pulsing out from the hull.',
    from: { pos: v(1800, 520, -100), target: v(830, -24, -1300) }, to: { pos: v(1500, 200, -700), target: v(830, -24, -1700) }, dur: 14, fov: 48,
  },
  {
    title: 'Engine array', caption: 'Thirteen fusion drives. Even at cruise their plumes run a kilometre and more astern.',
    from: { pos: v(1400, -500, -4600), target: v(0, 0, -2600) }, to: { pos: v(700, -260, -4100), target: v(0, 0, -2500) }, dur: 14, fov: 48,
  },
  {
    title: 'Onward', caption: 'Eighty-six thousand souls, and the long dark still ahead.',
    from: { pos: v(-3800, 1500, -7400), target: v(0, 0, 300) }, to: { pos: v(-6200, 2400, -11400), target: v(0, 0, 600) }, dur: 18, fov: 42,
  },
];
