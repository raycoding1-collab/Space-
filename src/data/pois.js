// Points of interest, 3D labels and the guided tour script.
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export const POIS = [
  {
    id: 'overview', name: 'Overview', kicker: 'Generation Ark', title: 'VESPERA',
    text: 'Seven kilometres from deflector to drive. Two counter-rotating halo rings, a spun habitat valley, a foundry, eight reactors and a fusion drive — all hung from a single hexagonal keel.',
    stats: [['Length', '7.04 km'], ['Ring span', '2.21 km'], ['Population', '48,212'], ['Launched', '214 years ago'], ['Cruise', '0.031 c']],
    pos: v(8600, 3700, 7800), target: v(0, -250, 0), fov: 50,
  },
  {
    id: 'bow', name: 'Bow & Deflector', kicker: 'Forward section', title: 'Command Spire',
    text: 'The command spire carries the bridge, observatory dome and the deflector array. Its magnetic bow-shock sweeps the interstellar medium aside — watch it flare as dust grains strike.',
    stats: [['Crew', '1,400'], ['Shield apex', '3.79 km fwd'], ['Deflector Ø', '492 m'], ['Dust impacts', '≈0.6 / s']],
    pos: v(860, 380, 4350), target: v(0, 0, 3260), fov: 48,
  },
  {
    id: 'halo', name: 'Halo Rings', kicker: 'Habitation', title: 'Halo I & II',
    text: 'Twin rings 2.2 km across spin in opposite directions so the ark never twists. Each holds a terraced city under a glass vault; elevators climb the spokes every few minutes.',
    stats: [['Radius', '1,090 m'], ['Spin period', '66 s'], ['Gravity', '1.00 g'], ['Residents', '17,600']],
    pos: v(2700, 1350, 4100), target: v(0, 0, 2330), fov: 50,
  },
  {
    id: 'nexus', name: 'Nexus', kicker: 'Civic & transit hub', title: 'The Nexus',
    text: 'Where the rings meet the valley. Three transports lie moored at the pylons, and the long-range dishes keep a 214-year-old conversation with home alive.',
    stats: [['Pylons', '6'], ['Moored craft', '3'], ['Dish Ø', '80 m'], ['Link delay', '6.6 years']],
    pos: v(1180, 520, 2150), target: v(0, 0, 1600), fov: 48,
  },
  {
    id: 'arcadia', name: 'Arcadia', kicker: 'Spun habitat', title: 'Arcadia Valley',
    text: 'A two-kilometre cylinder turning once every 44 seconds. Three land valleys of fields, forests, rivers and towns alternate with three glazed strips — light from the axial sunline spills out into space.',
    stats: [['Radius', '480 m'], ['Length', '2.05 km'], ['Land', '5.2 km²'], ['Residents', '29,000']],
    pos: v(1750, 820, 1900), target: v(0, 0, 150), fov: 50,
  },
  {
    id: 'interior', name: 'Inside Arcadia', kicker: 'Interior', title: 'The Valley',
    text: 'Stand inside and the land curves up and over your head. Clouds drift beneath the sunline; towns glow along the rivers; through the windows, the stars wheel past.',
    stats: [['Sunline', '7 m Ø, 2.05 km'], ['Cloud deck', '76 m'], ['Towns', '21'], ['Day length', '24 h']],
    pos: v(120, -330, 1020), target: v(-40, 160, -700), fov: 70, frame: 'arcadia',
  },
  {
    id: 'foundry', name: 'Foundry & Docks', kicker: 'Industry', title: 'Foundry',
    text: 'Four hangar bays service the ark’s shuttle fleet. Behind them, the cargo yard; on the solid faces, gantry cranes and smelters turn asteroid ore into hull plate.',
    stats: [['Bays', '4'], ['Shuttle fleet', '64'], ['Containers', '≈1,100'], ['Smelters', '20']],
    pos: v(980, 560, -760), target: v(0, 0, -1320), fov: 48,
  },
  {
    id: 'reactors', name: 'Reactors', kicker: 'Engineering', title: 'Reactor Array',
    text: 'Eight spherical fusion reactors in two stations, each wrapped in counter-spinning containment rings. Energy conduits carry their output forward along the keel — the pulses never stop.',
    stats: [['Reactors', '8'], ['Output', '41 TW'], ['Core temp', '410 MK'], ['Conduits', '3']],
    pos: v(640, 330, -1520), target: v(140, 40, -2050), fov: 52,
  },
  {
    id: 'radiators', name: 'Radiator Wings', kicker: 'Thermal control', title: 'Radiator Wings',
    text: 'Four wings, each a kilometre long, shed the reactors’ waste heat. They glow hottest at the root and cool to a dull ember at the tips.',
    stats: [['Span', '2.36 km'], ['Area', '3.7 km²'], ['Root temp', '1,350 K'], ['Rejection', '22 TW']],
    pos: v(2650, -650, -1150), target: v(250, 150, -2150), fov: 50,
  },
  {
    id: 'engines', name: 'Drive', kicker: 'Propulsion', title: 'Fusion Drive',
    text: 'A magnetic-nozzle fusion drive ringed by six auxiliaries. At cruise it barely whispers, but its plume still stretches three kilometres behind the ark.',
    stats: [['Main bell Ø', '392 m'], ['Exhaust', '0.08 c'], ['Thrust', '18 MN'], ['Plume', '3.2 km']],
    pos: v(1450, -620, -4500), target: v(0, 0, -3100), fov: 50,
  },
];

export const LABELS = [
  { text: 'Bow-shock shield', pos: v(0, 330, 3560) },
  { text: 'Command spire', pos: v(0, 150, 3080) },
  { text: 'Halo I', pos: v(0, 1120, 2470) },
  { text: 'Halo II', pos: v(0, -1120, 2190) },
  { text: 'Nexus', pos: v(0, 240, 1600) },
  { text: 'Arcadia', pos: v(0, 520, 600) },
  { text: 'Foundry & docks', pos: v(0, 270, -1300) },
  { text: 'Cargo yard', pos: v(0, 175, -1580) },
  { text: 'Reactor array', pos: v(0, 260, -2100) },
  { text: 'Radiator wings', pos: v(840, 840, -2400) },
  { text: 'Fusion drive', pos: v(0, 360, -3000) },
];

// Tour: each shot drifts between two framings. Captions appear during the shot.
export const TOUR = [
  {
    title: 'VESPERA', caption: 'Two hundred and fourteen years into the Crossing, the ark holds high orbit around the gas giant Aurelis.',
    from: { pos: v(15200, 6600, 12800), target: v(0, -400, 200) }, to: { pos: v(10800, 4300, 9200), target: v(0, -300, 0) }, dur: 16, fov: 46,
  },
  {
    title: 'The bow', caption: 'The command spire. Ahead of it, a magnetic bow-shock sweeps interstellar dust out of the ark’s path.',
    from: { pos: v(1300, 520, 4700), target: v(0, 40, 3300) }, to: { pos: v(-300, 260, 4500), target: v(0, 0, 3200) }, dur: 15, fov: 48,
  },
  {
    title: 'Halo I & II', caption: 'Counter-rotating habitat rings, 2.2 km across. Seventeen thousand people live under their glass vaults.',
    from: { pos: v(3100, 700, 2330), target: v(0, 0, 2330) }, to: { pos: v(1700, 380, 2330), target: v(0, 0, 2330) }, dur: 16, fov: 55,
  },
  {
    title: 'The Nexus', caption: 'Transports moored at the civic hub. The dishes still speak with a home that is six light-years behind.',
    from: { pos: v(980, 760, 2250), target: v(0, 0, 1550) }, to: { pos: v(1250, 300, 1900), target: v(0, 0, 1550) }, dur: 14, fov: 48,
  },
  {
    title: 'Arcadia', caption: 'A habitat valley spun to one gravity. Light from its sunline spills through three long windows.',
    from: { pos: v(640, 330, 1650), target: v(0, 0, 400) }, to: { pos: v(640, 330, 380), target: v(0, 0, -700) }, dur: 16, fov: 55,
  },
  {
    title: 'Inside the valley', caption: 'Inside, the land curves up and over your head. Twenty-nine thousand people call it home.',
    from: { pos: v(100, -300, 1000), target: v(-20, 180, -500) }, to: { pos: v(60, -230, 300), target: v(-20, 200, -900) }, dur: 17, fov: 72, frame: 'arcadia',
  },
  {
    title: 'Foundry', caption: 'Shuttles slip in and out of the four hangar bays. Behind them, the cargo yard.',
    from: { pos: v(1100, 260, -900), target: v(0, 0, -1320) }, to: { pos: v(820, 520, -1180), target: v(0, 0, -1380) }, dur: 14, fov: 48,
  },
  {
    title: 'Engineering', caption: 'Eight reactors in magnetic containment, and four radiator wings glowing with their waste heat.',
    from: { pos: v(2900, -600, -1050), target: v(200, 100, -2100) }, to: { pos: v(2100, -300, -1450), target: v(150, 80, -2150) }, dur: 15, fov: 50,
  },
  {
    title: 'The drive', caption: 'A magnetic-nozzle fusion drive. Even at cruise its plume runs three kilometres astern.',
    from: { pos: v(1800, -700, -4700), target: v(0, 0, -3200) }, to: { pos: v(900, -400, -4300), target: v(0, 0, -3150) }, dur: 14, fov: 50,
  },
  {
    title: 'Onward', caption: 'Forty-eight thousand people, and three generations still to come before landfall.',
    from: { pos: v(-6400, 2600, -9200), target: v(0, 0, 0) }, to: { pos: v(-9800, 3800, -13200), target: v(0, 0, 400) }, dur: 18, fov: 46,
  },
];
