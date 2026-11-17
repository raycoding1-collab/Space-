// Points of interest, 3D labels and the guided tour for ELYSION.
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);

export const POIS = [
  {
    id: 'overview', name: 'Overview', kicker: 'Flying city-ship', title: 'ELYSION',
    text: 'A city that flies: thirty-two kilometres of towers, terraces, glass biomes and harbours on a sculpted foundation. Four point two million people live aboard. VESPERA, 5.8 km long, flies escort.',
    stats: [['Length', '32.0 km'], ['Beam', '12.4 km'], ['Citizens', '4.2 million'], ['Buildings', 'over 14,000'], ['Cruise', '0.0094 c']],
    pos: v(21000, 9500, 26000), target: v(0, 1500, -1500), fov: 40,
  },
  {
    id: 'spire', name: 'Crown Spire', kicker: 'Civic heart', title: 'The Crown Spire',
    text: 'A 4.6 km hexafoil tower that twists a sixth of a turn as it climbs. Gilded ribs run up its lobes, luminous glass bands ring it, and six buttress fins flare out over the top terrace like roots, with elevator cars racing up their crests.',
    stats: [['Height', '5.2 km above deck'], ['Twist', '60°'], ['Sky terraces', '12'], ['Buttress fins', '6']],
    pos: v(3900, 2300, 1500), target: v(0, 2900, -2600), fov: 50,
  },
  {
    id: 'crown', name: 'The Crown', kicker: 'Crown Spire', title: 'The Crystal Crown',
    text: 'Thirteen crystal shards stand in a gilded ring at the top of the spire. Light rises through them from within, and a beacon pulses at the tip of the tallest, visible from every quarter of the city.',
    stats: [['Central shard', '560 m'], ['Shards', '13'], ['Beacon period', '2.4 s']],
    pos: v(1050, 4950, -1250), target: v(0, 4950, -2600), fov: 45,
  },
  {
    id: 'halo', name: 'Halo Promenade', kicker: 'Sky park', title: 'The Halo',
    text: 'A 3.4 km ring of gardens hanging around the spire 2.3 km above the deck, held on ninety-six cables from a collar high on the tower. It turns about once every half hour; its glazed galleries look down on the whole city.',
    stats: [['Diameter', '3.4 km'], ['Width', '150 m'], ['Cables', '96'], ['Rotation', '26 min']],
    pos: v(2750, 2530, -650), target: v(0, 2250, -2600), fov: 55,
  },
  {
    id: 'terraces', name: 'Spire District', kicker: 'Five terraces', title: 'The Spire District',
    text: 'Five terrace plateaus climb toward the spire, each a ring of radial avenues and towers. The skyline rises with them, from mid-rise blocks on the lowest terrace to supertall towers of 1.4 km at the top.',
    stats: [['Terraces', '5'], ['Top terrace', '+620 m'], ['Tallest towers', '1.4 km'], ['Avenues', '12–48 per ring']],
    pos: v(5600, 1350, 2600), target: v(0, 650, -2600), fov: 50,
  },
  {
    id: 'lake', name: 'Lake Dome', kicker: 'Biome I', title: 'The Lake Dome',
    text: 'A lake with wooded islands under a 3.8 km hex-geodesic dome. Cliffs rise along its bow side and a waterfall spills from them into the lake; the frame casts a lattice of shadows across the water.',
    stats: [['Diameter', '3.8 km'], ['Frame', 'hex geodesic'], ['Islands', '4'], ['Cliffs', '380 m']],
    pos: v(2700, 950, 2300), target: v(0, 120, 5300), fov: 55,
  },
  {
    id: 'forest', name: 'Forest Dome', kicker: 'Biome II', title: 'The Forest Dome',
    text: 'A dense forest of conifers and broadleaf trees climbs a 540 m peak under meridian ribs. Its summit is bare rock above the treeline.',
    stats: [['Diameter', '3.2 km'], ['Frame', 'meridian ribs'], ['Trees', 'over 20,000'], ['Peak', '540 m']],
    pos: v(2500, 1300, 6900), target: v(0, 380, 8800), fov: 55,
  },
  {
    id: 'orchard', name: 'Orchard Dome', kicker: 'Biome III', title: 'The Orchard Dome',
    text: 'Twelve concentric terraces of crops and orchards step up to a glasshouse at the centre, under a gilded diagrid lamella dome.',
    stats: [['Diameter', '2.3 km'], ['Frame', 'gilded diagrid'], ['Terraces', '12'], ['Centre', 'glasshouse']],
    pos: v(1500, 1450, 10100), target: v(0, 100, 12000), fov: 55,
  },
  {
    id: 'canal', name: 'Grand Canal', kicker: 'Aft boulevard', title: 'The Grand Canal',
    text: 'Nine kilometres of water under a ribbed, pointed glass vault. Canal houses line its walls, tree-lined quays run beside the water, bridges of three designs cross it and lantern boats drift along it.',
    stats: [['Length', '8 km'], ['Vault height', '460 m'], ['Bridges', '9'], ['Lantern boats', '46']],
    pos: v(70, 45, -8700), target: v(0, 10, -12500), fov: 60,
  },
  {
    id: 'cascade', name: 'The Cascade', kicker: 'Canal head', title: 'The Cascade',
    text: 'Where the spire terraces meet the canal, water spills down six falls from the lowest terrace into the head of the Grand Canal, between gilded obelisks.',
    stats: [['Falls', '6'], ['Drop', '168 m'], ['Width', '380–530 m']],
    pos: v(160, 150, -8400), target: v(0, 50, -7350), fov: 55,
  },
  {
    id: 'harbours', name: 'Harbours', kicker: 'Flank piers', title: 'The Harbours',
    text: 'Six piers on each flank reach 1.5 km out from the lowest city wall. Gantry cranes work freighters, tankers, haulers and liners at their berths, and approach lights pulse in toward each pier tip.',
    stats: [['Piers', '12'], ['Pier length', '1.5 km'], ['Ships at berth', '52'], ['Gantry cranes', '144']],
    pos: v(10600, 250, -600), target: v(7600, -620, -3600), fov: 50,
  },
  {
    id: 'industry', name: 'Industrial Stern', kicker: 'Working city', title: 'The Industrial Stern',
    text: 'Cooling towers, refineries, smelters and radiator banks crowd the stern either side of the canal. Glowing conduits carry their heat and power aft to the engine wall.',
    stats: [['Radiator fins', '408'], ['Plants', 'cooling, refining, smelting'], ['Conduits', 'to the engine wall']],
    pos: v(4300, 950, -10100), target: v(2000, 100, -13800), fov: 55,
  },
  {
    id: 'construction', name: 'Construction', kicker: 'Still growing', title: 'The Construction Quarter',
    text: 'The city is still being built. Towers rise out of their scaffolding, tower cranes slew slowly over the frontier floors, and welding arcs flicker where the next storeys are going up.',
    stats: [['Sites', '27'], ['Tower cranes', '41'], ['Tallest frame', '760 m']],
    pos: v(6000, 650, 800), target: v(4000, 380, 3300), fov: 50,
  },
  {
    id: 'undercity', name: 'Undercity', kicker: 'Beneath the keel', title: 'The Undercity',
    text: 'Towers hang from the belly like stalactites, lit from below by four caged reactor suns. Launch rails run the length of the keel, and craft streak along them through the accelerator rings.',
    stats: [['Hanging towers', '1,435'], ['Reactor suns', '4'], ['Launch rails', '2 × 24 km']],
    pos: v(1500, -3450, -3400), target: v(0, -2950, -5600), fov: 60,
  },
  {
    id: 'engines', name: 'Engine Wall', kicker: 'Propulsion', title: 'The Engine Wall',
    text: 'Seven colossal drives and twenty-four auxiliaries fill the stern wall. Their plumes run ten kilometres and more astern.',
    stats: [['Main drives', '7 × 800 m bells'], ['Auxiliaries', '24'], ['Plume length', '11 km']],
    pos: v(-7000, -600, -23000), target: v(0, -1100, -16000), fov: 50,
  },
  {
    id: 'prow', name: 'Prow & Lantern', kicker: 'Bow', title: 'The Prow',
    text: 'The deck narrows to a sharp bow. The Lantern observatory stands at the head of the city, and a 1.4 km crystal beacon points the way forward.',
    stats: [['Lantern', '510 m'], ['Bow beacon', '1.4 km crystal'], ['Observation decks', '6']],
    pos: v(2700, 600, 19300), target: v(0, 100, 14400), fov: 50,
  },
  {
    id: 'vespera', name: 'VESPERA', kicker: 'Escort', title: 'VESPERA',
    text: 'The 5.8 km capital starship VESPERA flies escort to starboard, with her own four frigates. Ferries shuttle between her hangar bays and the harbours below.',
    stats: [['Length', '5.79 km'], ['Station', '3.3 km above the deck'], ['Ferries', 'to the starboard piers']],
    pos: v(15800, 2300, 12500), target: v(9200, 3200, 2400), fov: 42,
  },
];

export const LABELS = [
  { text: 'Crown Spire', pos: v(0, 5800, -2600) },
  { text: 'Halo Promenade', pos: v(1700, 2400, -2600) },
  { text: 'Spire District', pos: v(-3200, 900, -2600) },
  { text: 'Lake Dome', pos: v(0, 1300, 4700) },
  { text: 'Forest Dome', pos: v(0, 1100, 8800) },
  { text: 'Orchard Dome', pos: v(0, 800, 12000) },
  { text: 'Grand Canal', pos: v(0, 500, -11000) },
  { text: 'The Cascade', pos: v(0, 220, -7400) },
  { text: 'Harbours', pos: v(7800, -500, -3600) },
  { text: 'Harbours', pos: v(-7800, -500, -3600) },
  { text: 'Industrial Stern', pos: v(-3000, 400, -13500) },
  { text: 'Construction Quarter', pos: v(4100, 700, 3800) },
  { text: 'Undercity', pos: v(0, -3000, -2000) },
  { text: 'Reactor suns', pos: v(0, -3000, -5600) },
  { text: 'Engine wall', pos: v(0, 300, -16100) },
  { text: 'The Lantern', pos: v(0, 600, 14300) },
  { text: 'Bow beacon', pos: v(0, 0, 16600) },
  { text: 'VESPERA', pos: v(9900, 3700, 3200) },
];

export const TOUR = [
  {
    title: 'ELYSION', caption: 'The Free City of the Reach: thirty-two kilometres of city, under way above Aurelis.',
    from: { pos: v(33000, 14000, 39000), target: v(0, 1500, -1500) }, to: { pos: v(21000, 9500, 26000), target: v(0, 1500, -1500) }, dur: 18, fov: 40,
  },
  {
    title: 'The prow', caption: 'The Lantern observatory stands at the head of the city, and a crystal beacon points the way.',
    from: { pos: v(3600, 700, 21000), target: v(0, 100, 14400) }, to: { pos: v(1800, 420, 17800), target: v(0, 200, 13000) }, dur: 14, fov: 50,
  },
  {
    title: 'Biome domes', caption: 'Three worlds under glass: an orchard, a forest and a lake, each with its own frame.',
    from: { pos: v(4200, 1600, 13800), target: v(0, 300, 8800) }, to: { pos: v(3400, 1100, 5600), target: v(0, 200, 4700) }, dur: 16, fov: 50,
  },
  {
    title: 'The Lake Dome', caption: 'Wooded islands, cliffs and a waterfall under a hex-geodesic frame.',
    from: { pos: v(-500, 160, 3500), target: v(0, 150, 6400) }, to: { pos: v(300, 120, 4300), target: v(0, 200, 6400) }, dur: 14, fov: 58, ease: 'linear',
  },
  {
    title: 'The Spire District', caption: 'Five terraces climb toward the Crown Spire, and the skyline climbs with them.',
    from: { pos: v(6400, 900, 2200), target: v(0, 900, -2600) }, to: { pos: v(4300, 1900, 600), target: v(0, 2400, -2600) }, dur: 16, fov: 50,
  },
  {
    title: 'The Halo', caption: 'A ring of gardens hangs around the spire on ninety-six cables, turning slowly.',
    from: { pos: v(3200, 2650, 300), target: v(0, 2250, -2600) }, to: { pos: v(1500, 2500, -500), target: v(-600, 2300, -2600) }, dur: 14, fov: 55,
  },
  {
    title: 'The Crown', caption: 'Light rises through thirteen crystal shards at the top of the spire.',
    from: { pos: v(1500, 4500, -800), target: v(0, 4900, -2600) }, to: { pos: v(900, 5150, -1500), target: v(0, 5000, -2600) }, dur: 14, fov: 45,
  },
  {
    title: 'The Grand Canal', caption: 'Nine kilometres of water under a ribbed glass vault, from the Cascade to the stern.',
    from: { pos: v(80, 60, -7900), target: v(0, 20, -11000) }, to: { pos: v(40, 40, -10600), target: v(0, 20, -14000) }, dur: 16, fov: 60, ease: 'linear',
  },
  {
    title: 'The industrial stern', caption: 'Cooling towers, smelters and radiator banks; conduits carry their power aft.',
    from: { pos: v(5200, 1300, -9500), target: v(1500, 100, -13800) }, to: { pos: v(3800, 700, -11300), target: v(1000, 100, -14500) }, dur: 14, fov: 55,
  },
  {
    title: 'The engine wall', caption: 'Seven colossal drives. Their plumes run ten kilometres astern.',
    from: { pos: v(-9000, 400, -25000), target: v(0, -1100, -16000) }, to: { pos: v(-5600, -900, -21500), target: v(0, -1100, -16000) }, dur: 14, fov: 50,
  },
  {
    title: 'The undercity', caption: 'Towers hang from the keel, lit by four caged reactor suns.',
    from: { pos: v(6400, -4600, -9000), target: v(0, -2800, -5600) }, to: { pos: v(4200, -3700, -3000), target: v(0, -2700, -4500) }, dur: 16, fov: 55,
  },
  {
    title: 'The harbours', caption: 'Ships at berth along the flank piers; ferries run up to VESPERA.',
    from: { pos: v(11600, 600, -2800), target: v(7600, -620, -3600) }, to: { pos: v(11000, 1200, 2200), target: v(8000, 600, 0) }, dur: 15, fov: 50,
  },
  {
    title: 'VESPERA', caption: 'The capital starship VESPERA flies escort, and looks small.',
    from: { pos: v(17500, 5200, 12500), target: v(9900, 3300, 3200) }, to: { pos: v(14500, 4300, 9500), target: v(6000, 1500, -1500) }, dur: 15, fov: 45,
  },
  {
    title: 'Onward', caption: 'Four point two million people, and the long dark still ahead.',
    from: { pos: v(-14000, 7000, -30000), target: v(0, 500, 0) }, to: { pos: v(-24000, 12000, -50000), target: v(0, 500, 2000) }, dur: 18, fov: 42,
  },
];
