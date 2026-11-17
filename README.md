# VESPERA & ELYSION

Two real-time, explorable 3D starships rendered in the browser with WebGL (three.js): the capital
starship **VESPERA** (5.8 km) and **ELYSION**, a 32 km flying city-ship (`?ship=city`), with VESPERA
flying escort beside it. Switch between them with the **Vespera / Elysion** buttons under the name in
the top-left corner.

![ELYSION with VESPERA flying escort](screenshots/city/02-vespera-flies-escort.jpg)

## VESPERA — Capital Starship

VESPERA is the flagship of the Outer Reach: a 5.8 km dagger of layered armour, glowing seams and
machinery, with 86,400 souls aboard. She holds high orbit over the ringed gas giant Aurelis, under a
sky of a hundred and fifty thousand stars, the Milky Way and drifting nebulae.

![VESPERA over Aurelis](screenshots/01-flagship-over-aurelis.jpg)

## Run it

It's a static site with no build step. Serve the folder with any static web server, then open it in a modern
desktop browser (Chrome, Edge, Firefox or Safari with WebGL2):

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> for VESPERA, or <http://localhost:8000/?ship=city> for ELYSION.

### The ELYSION website

`elysion/` is ELYSION's own site, served from the same folder: <http://localhost:8000/elysion/>. It has its
own name, icons and social preview, can be added to a phone's home screen, and is built for both phones
and computers:

- **Phones and tablets** get a touch layout (one finger to orbit, pinch to zoom, two fingers to pan), a
  swipeable bar of places, an info card that pulls up from the bottom, and room for notches and home
  indicators. The city is built at lighter density there (fewer trees, vehicles and signs; every landmark
  stays).
- **Every device** gets a render scale that follows the frame rate: it eases down when the GPU can't keep
  up and climbs back to full resolution when it can.
- **Smooth view changes**: every shader is compiled while the loader is showing, only the instances that
  can be seen (or whose shadows can be seen) are drawn each frame, and the shadow map is re-rendered only
  when its frame changes.

Any static host works (GitHub Pages, Netlify, an S3 bucket); upload the repository as it is.

> Opening `index.html` straight from disk (`file://`) won't work, because browsers block ES modules there.

### Quality

| URL                     | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `?q=high` *(default)*   | 2048² sky, 2K hull textures, 4K shadow map, 4× MSAA, render scale up to 1.5×          |
| `?q=ultra`              | Same as high plus an 8K shadow map, 16× anisotropy and render scale up to 2×          |
| `?q=low`                | Lighter settings for integrated GPUs                                                 |

The **Quality** button cycles the render scale live (0.6× to 2×). The app also lowers the scale
automatically if the frame rate drops well below 30 fps.

## Exploring

| Mode      | Controls                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| **Orbit** | Drag to orbit · right-drag to pan · scroll zooms toward the cursor                                    |
| **Fly**   | Click to capture the mouse · `W A S D` move · `R`/`F` up/down · `Q`/`E` roll · `Shift` boost · scroll sets speed |
| **Tour**  | A ten-shot cinematic tour with captions · `Space` next shot · `Esc` leave                              |

Other keys: `1`–`9` jump to points of interest · `L` 3D labels · `H` hide the interface ·
`P` capture a **3840 × 2160** still (also the **Capture 4K** button). Keys `T`, `O` and `V` switch to
Tour, Orbit and Fly.

## The ship

- **Hull**: lofted from 26-point angular cross-sections, sharp at every edge and smooth along the
  length, tapering over four kilometres to a razor prow and a 340 m sensor lance.
- **Layered armour**: two tiers of raised plates in graphite, titanium and near-black, with faintly glowing
  seams in the gaps and a crimson livery stripe toward the prow.
- **Dorsal trench**: a three-kilometre canyon exposing the core. It holds five pulsing energy conduits,
  maglev pods racing between sections, gantry bridges and lit decks on both walls.
- **Reactor heart**: sunk into the trench mid-ship, it turns inside three gyroscopic containment rings.
- **Circulatory network**: arteries of light carry the heart's output over the decks and into the glowing
  channels along each flank, under the keel from channel to channel, and out along the pylons to the
  nacelles. Energy packets visibly flow outward through the whole network.
- **Command tower**: three stepped tiers over the trench, with a panoramic bridge, a cantilevered flag
  bridge, a 240 m sail fin, masts and sensor domes. Stepped superstructure blocks flank it fore and aft.
- **Outboard nacelles**: carried on swept pylons, with cyan intakes and their own drives.
- **Engine array**: thirteen magnetic-nozzle fusion drives with white-hot throats, coil rings, cooling
  ribs and plumes with shock diamonds.
- **Flight operations**: six ventral hangar bays behind atmosphere-retention fields, with chase lights
  leading in.
- **Exposed rib galleries** on the flanks show structure and warm-lit machinery behind the armour.
- **Thousands of lit windows** in deck bands along the flanks, trench walls and tower. They switch on
  and off over time as people move through the ship.

## Feeling alive

- Shuttles cycle through the hangar bays, run to the escorts and depart for the moon Ilex.
- Six traffic lanes carry streams of small craft past the ship in both directions.
- Four escort frigates, 330 m sister ships built from the same hull lines, hold formation alongside.
- Patrol craft orbit the ship, and maintenance drones swarm the tower, bays, nacelles and stern.
- Turrets slowly track along the dorsal shoulders, and the heart's containment rings turn.
- Navigation strobes, red and green running lights and welding arcs flicker across the hull.

## The sky

- **Milky Way and nebulae**: a procedural Milky Way with filamentary dust lanes, a glowing bulge,
  five emission/reflection nebulae and distant galaxies, baked once into a 2048² cubemap.
- **Stars**: about 150,000 point stars with blackbody colours, a power-law brightness distribution and
  diffraction spikes on the brightest, so they stay crisp at any resolution.
- **Aurelis**: a banded gas giant with storms, polar hoods, limb darkening, an atmospheric rim, and
  shadows cast between the planet and its rings.
- **Ilex**: a cratered moon.

## ELYSION — the flying city-ship (`?ship=city`)

A city that flies: thirty-two kilometres of towers, terraces, glass biomes and harbours on a sculpted
foundation, with 4.2 million people aboard. VESPERA flies escort to starboard, and looks small.

![ELYSION over Aurelis](screenshots/city/01-elysion-over-aurelis.jpg)

| | |
|---|---|
| ![](screenshots/city/03-crown-spire.jpg) | ![](screenshots/city/04-spire-district.jpg) |
| ![](screenshots/city/05-biome-domes.jpg) | ![](screenshots/city/06-inside-the-lake-dome.jpg) |
| ![](screenshots/city/07-grand-canal.jpg) | ![](screenshots/city/08-undercity-reactor-sun.jpg) |
| ![](screenshots/city/09-engine-wall.jpg) | ![](screenshots/city/10-from-above.jpg) |
| ![](screenshots/city/11-the-prow.jpg) | ![](screenshots/city/02-vespera-flies-escort.jpg) |

### Up close

Close-ups at 3840 × 2160 (in `screenshots/city/closeups/`):

| | |
|---|---|
| ![](screenshots/city/closeups/c01-street-level.jpg) | ![](screenshots/city/closeups/c02-spire-plaza.jpg) |
| ![](screenshots/city/closeups/c03-crystal-crown.jpg) | ![](screenshots/city/closeups/c04-halo-gardens.jpg) |
| ![](screenshots/city/closeups/c05-supertall-facade.jpg) | ![](screenshots/city/closeups/c06-rooftops.jpg) |
| ![](screenshots/city/closeups/c07-holographic-rings.jpg) | ![](screenshots/city/closeups/c08-harbour-pier.jpg) |
| ![](screenshots/city/closeups/c09-construction-cranes.jpg) | ![](screenshots/city/closeups/c10-undercity-close.jpg) |
| ![](screenshots/city/closeups/c11-lake-dome-sailboats.jpg) | ![](screenshots/city/closeups/c12-window-rooms.jpg) |
| ![](screenshots/city/closeups/c13-deco-skyline.jpg) | |

### The city

- **Keel-Leaf foundation**: an arrowhead deck 32 km long and 12.4 km wide. Its edges step down in three
  lit city-wall tiers with garden ledges, deep galleries and pilasters, and the ribbed belly converges to
  a keel 2.4 km below the deck.
- **Crown Spire**: a 4.6 km hexafoil tower that twists a sixth of a turn as it rises. Gilded ribs run up
  its lobes and luminous glass bands ring it, with twelve ring sky-terraces. Six buttress fins flare out
  over the top terrace like roots, with elevator cars racing up their crests. At the top, thirteen
  crystal shards form the crown, and a beacon pulses on the tallest.
- **Halo Promenade**: a 3.4 km ring of gardens hanging 2.3 km above the deck on 96 cables from a collar
  on the spire. It turns slowly.
- **Spire District**: five terrace plateaus climb toward the spire, laid out with radial avenues and ring
  streets. Supertall towers reach 1.4 km on the upper terraces.
- **Districts**: over 14,000 buildings from 21 designed archetypes (blade, twin towers, ziggurat,
  twisted, needle, crowned cylinder, trifoil, gate, crystal, stacked, courtyard blocks, terraced
  residences, villas and more) in over 50 facade styles. Each district has its own architectural language:
  the Meridian commercial core, the canal quarter's warm terraced residences, and garden quarters of
  low courtyard houses and parks.
- **The Elysian vernacular**: signatures that recur across every district and make the city one place.
  Towers step back in art-deco setbacks with garden ledges and are crowned by glowing **lanterns** under
  gilded cupolas. **Gilded ribs** climb the corners and rise past the roofline into lit finials.
  Residences wear verdigris, slate or old-bronze **copper mansards** with rows of lit dormers. Recessed
  **sky-garden storeys** cut through the towers. Two facade orders of the city's own appear everywhere:
  the *arcade* (round-headed windows with gilded architraves and keystones) and the *deco* (gilded
  piers with chevron spandrels).
- **Biome domes**: the *Lake Dome* (a lake with wooded islands, cliffs and a waterfall under a
  hex-geodesic frame), the *Forest Dome* (over 20,000 trees climbing a central peak under meridian ribs)
  and the *Orchard Dome* (twelve concentric crop terraces under a gilded diagrid).
- **Grand Canal**: 8 km of water under a ribbed, pointed glass vault 460 m high, with canal houses,
  tree-lined quays, nine bridges of three designs and lantern boats. At its head, the **Cascade** spills
  from the spire terraces in six falls.
- **Harbours**: twelve 1.5 km piers on the flanks with terminals, 144 gantry cranes, control towers and
  sequenced approach lights. Freighters stacked with containers, tankers, liners, haulers and tugs are
  moored at the berths.
- **Industrial stern**: cooling towers, refineries, smelters with glowing vents, radiator banks and tank
  farms. Glowing conduits carry their power aft to the engine wall.
- **Construction quarter**: unfinished towers in scaffolding, slewing tower cranes and welding arcs.
- **Undercity**: 1,435 towers hang from the belly like stalactites, lit from below by four caged
  reactor suns. Launch rails with accelerator rings run along the keel.
- **Engine wall**: seven colossal drives and twenty-four auxiliaries, with plumes 11 km long. Lift vanes
  with glowing leading edges sweep out from the flanks.
- **Prow**: the Lantern observatory and a 1.4 km crystal beacon pointing forward.
- **Up close**: every window is a room, with mullions and a transom, blinds pulled to different
  heights, a bright ceiling line, furniture and plants silhouetted against the light, and the odd
  television glowing in a dark flat. Ground traffic runs on every street (animated on the GPU, with head- and tail-lights),
  tree-lined boulevards with lamp posts, neon banners and holographic billboards, a holographic ring
  display over the Cascade, rooftop helipads with parked aircars, glass sky bridges between the spire
  towers, a colonnaded plaza with reflecting pools at the foot of the spire, tree-lined terrace
  promenades and sailboats on the Lake Dome.
- **Alive**: an elevated maglev network of glass tubes links the spire, the domes, the canal and the
  harbours, with pods running. Streams of air traffic fly over the rooftops and around the spire.
  Ferries shuttle between the harbours and VESPERA's hangar bays and head out to the moon Ilex, while
  drones circle the crown. Windows light up and go dark in runs, beacons blink on the supertall towers,
  and the Halo turns.

### Detail at every distance

Facades, roofs, streets and hull plating are computed in shaders from each surface's own coordinates:
floors, bays, mullions, balconies, louvres, diagrids, mechanical floors, lit window runs, paving, lane
markings and street lamps. Every pattern is box-filtered with `fwidth`, so it is crisp at 50 m and
settles to its average colour at 30 km instead of shimmering. Buildings are instanced: each instance
picks its facade style from a style table, so over 14,000 buildings need only a few hundred draw calls. A
low golden sun, a shadow map that follows the camera's focus, and a faint field-held atmosphere over the
deck give the city its scale.

### Points of interest

Overview, Crown Spire, The Crown, Halo Promenade, Spire District, Lake Dome, Forest Dome, Orchard Dome,
Grand Canal, The Cascade, Harbours, Industrial Stern, Construction, Undercity, Engine Wall,
Prow & Lantern and VESPERA. The guided tour has fourteen shots.

> ELYSION is heavy: about 5 million triangles per pass. On integrated GPUs, use `?ship=city&q=low`.

## Rendering

- **Lighting**: physically based materials with image-based lighting from the sky and planet, plus a
  directional sun with a shadow map that covers the whole ship.
- **Depth**: a logarithmic depth buffer, so a 1 m detail and a 470 km planet share the scene.
- **Post-processing**: an HDR pipeline (4× MSAA → bloom) and a final grade with occlusion-aware lens
  flare, chromatic aberration, vignette, ACES filmic tone mapping and film grain.
- **No image assets**: every texture (hull plating, window decks, the planet, the rings, the sky) is
  generated procedurally at load time from seeded noise.

## Project layout

```
index.html, styles.css      UI shell
src/main.js                 boot, render loop, capture, automation API (window.VESPERA)
src/world.js                composition: sun, planet, moon, galaxy orientation
src/env/                    sky bake, starfield, sun, planet + rings + moon
src/ship/hull.js            hull loft, armour plates, facet frames
src/ship/capital.js         ship assembly: armour, trench, heart, arteries, tower, nacelles, engines
src/ship/engines.js         engine bells and plumes
src/ship/conduit.js         pulsing conduit and artery shaders
src/ship/materials.js       material library and living windows
src/ship/textures.js        procedural textures
src/life/traffic.js         shuttles, lanes, pods, drones, welding arcs
src/post/post.js            HDR post pipeline
src/ui/                     camera rig (orbit, fly, tour) and HUD
src/ship/profile.js         VESPERA's profile (UI copy, POIs, camera ranges, shadow coverage, builder)
src/city/                   ELYSION: master plan (layout.js), shader library (shaders.js), style table
                            (materials.js), archetypes, districts, foundation, spire, domes, canal,
                            harbours, industry, undercity, stern, life, POIs and profile
vendor/three/               three.js r187 (MIT)
concepts/                   saved ideas for future versions
```

## 4K stills

| | |
|---|---|
| ![](screenshots/02-beneath-the-galactic-core.jpg) | ![](screenshots/03-reactor-heart.jpg) |
| ![](screenshots/04-dorsal-trench.jpg) | ![](screenshots/05-command-tower.jpg) |
| ![](screenshots/06-hangar-bays.jpg) | ![](screenshots/07-engine-array.jpg) |
| ![](screenshots/08-from-above.jpg) | ![](screenshots/09-flank-channel.jpg) |

The `screenshots/` folder holds 3840 × 2160 renders from the hero viewpoints (ELYSION's are in
`screenshots/city/`). To make your own, press `P` in the app. For scripted renders, load
`index.html?still&q=ultra` (add `&ship=city` for ELYSION) and call `window.VESPERA.renderStill(3840, 2160)`,
which returns a PNG data URL. See `tools/README.md` for the headless render workflow.
