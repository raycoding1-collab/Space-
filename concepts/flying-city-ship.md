# ELYSION — The Flying City-Ship (design spec)

> Status: **built** (`?ship=city`). This document is the blueprint and the build checklist.

## Pitch
A city that flies. Not a hull with rooms inside it, but a living metropolis lifted into space on a
sculpted, 32-kilometre foundation: tiers of towers climbing to a 4.6 km crown spire, glass biomes
holding a lake, a forest and orchard terraces, a glass-vaulted Grand Canal, harbours bristling with
ships, and an undercity of inverted towers hanging beneath the keel. VESPERA (5.8 km) flies escort —
and looks small.

## Scale
| | |
|---|---|
| Length | 32 km (bow z = +16 km, stern z = −16 km) |
| Beam | 12.4 km |
| Deck | y = 0 (terraces rise to +620 m around the spire) |
| Crown spire top | ≈ +5.2 km |
| Keel | ≈ −2.4 km; undercity spires hang to ≈ −3.8 km |
| Population | 4.2 million |

## Quality rules (every part must survive a close-up)
1. **Resolution-independent detail.** Facades, hull plating and dome frames are computed procedurally in
   shaders from object/world coordinates with `fwidth` anti-aliasing — crisp at 50 m and calm at 30 km.
2. **No generic boxes.** Every building archetype has a designed silhouette (setbacks, chamfers, fins,
   crowns) and a facade style. Every district has its own architectural language.
3. **Hierarchy of scale.** Mega-structure → district → building → floor → window. Something to read at
   every zoom level.
4. **Everything connects.** Transit tubes, conduits and bridges physically link the districts.
5. **Alive.** Lights cycle, pods run, ferries cross, aircraft stream over the rooftops, beacons pulse.

## Districts
1. **Keel-Leaf foundation.** Arrowhead plan, blunt stern for the engines. Edges step down in three
   lit "city wall" tiers; the belly is ribbed and converges to a keel. Triplanar procedural plating.
2. **Crown Spire** (z ≈ −2.6 km). A 4.6 km twisting hexafoil tower; six buttress fins flare at the base
   like roots; glass bands; twelve ring sky-terraces; a crystalline crown with a pulsing beacon;
   elevator lights race up the fins.
3. **Halo Promenade.** A 3.4 km ring floating around the spire at +1.9 km, held by cables, slowly
   turning; gardens on top, lights beneath, craft docking.
4. **Spire District.** Five elliptical terrace plateaus around the spire; mega-towers (300–1,400 m) in
   several archetypes: blade, twin-tower, stepped ziggurat, twisted, needle, crowned cylinder.
5. **Grand Canal.** A 9 km water boulevard down the aft centreline under a ribbed glass vault, with
   bridges and lantern boats.
6. **Biome domes** on the forward centreline, getting smaller toward the bow:
   - *Lake Dome* (R 1.9 km): a lake with islands, cliffs and a waterfall; hex-geodesic frame.
   - *Forest Dome* (R 1.6 km): a dense instanced forest over a central peak; meridian-rib frame.
   - *Orchard Dome* (R 1.15 km): concentric stepped agricultural terraces; diagrid frame.
7. **Harbours.** Six long piers on each flank with gantry cranes, moored ships and approach lights.
8. **Garden quarters** between the domes: low-rise courtyard blocks and parks.
9. **Industrial stern.** Cooling towers, refinery spheres, glowing smelters and radiator banks.
10. **Construction quarter.** Unfinished towers in scaffolding, tower cranes and welding arcs.
11. **Undercity.** Inverted stalactite towers, four reactor "suns" in cages, ventral launch rails.
12. **Engines.** A stern engine wall of seven colossal drives and twenty-four auxiliaries; sculpted lift
    vanes along the flanks with glowing edges.
13. **Prow.** A tapering bow carrying the Lantern observatory and a crystalline beacon.
14. **Transit.** An elevated maglev network of glass tubes linking spire, domes, canal and harbours,
    with pods running; elevator lights; sky-traffic lanes above the rooftops.

## Build checklist
- [x] Engine refactor: `?ship=city` entry, per-ship POIs/tour/intro, ship switcher in the HUD
- [x] City shader library: procedural facades (AA), triplanar hull, glass, water, foliage
- [x] Foundation (plan shape, tiers, belly, terraces)
- [x] Building archetypes + district placement
- [x] Crown spire + Halo promenade
- [x] Biome domes (lake, forest, orchard)
- [x] Grand canal
- [x] Harbours with piers, cranes, ships
- [x] Industrial stern + construction quarter
- [x] Undercity + reactor suns
- [x] Engines + lift vanes + prow
- [x] Transit network + life (pods, sky traffic, ferries, drones, beacons)
- [x] VESPERA escort for scale
- [x] POIs, labels, tour
- [x] Visual iteration at every zoom level
- [x] 4K hero stills in `screenshots/city/`

## Reusable pieces from the first prototype
The generation-ark prototype (commit `069ac8c`) has self-lit habitat surfaces, instanced buildings with
lit windows, cloud decks and interior haze (`src/ship/interior.js`), procedural land/city textures, and
spline-routed traffic.
