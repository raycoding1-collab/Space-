# Concept (saved for a future version): The Flying City-Ship

> Status: **parked** — to be built after the capital starship is finished.

## Pitch
A ship that *is* a city. Not a hull with rooms inside it, but a living metropolis lifted into space:
tiers of towers and terraces, glass domes holding forests and lakes, and a glowing circulatory system
of transit lines and energy conduits threading visibly through translucent sections. Docks along its
flanks swarm with traffic day and night.

## Visual pillars
- **Tiered skyline** – a broad, layered "deck-plate" foundation with districts stepping upward toward a
  central spire; each tier a different architectural character (industrial base, residential middle,
  civic crown).
- **Glass biomes** – several large domes and arcades: a forest dome, a lake/garden dome, an agricultural
  terrace dome. Visible from outside, lit from within.
- **Visible circulation** – translucent tubes carrying glowing transit pods; energy conduits pulsing
  from the reactor heart outward to every district; elevator columns running up the towers.
- **Swarming docks** – long pier structures on both flanks with hundreds of small craft arriving,
  departing and holding in queues.
- **Alive at every scale** – window lights changing over a day/night cycle, beacons, billboards/signage
  glow, maintenance drones, construction cranes on an unfinished district.

## Exploration ideas
- Fly *through* the city: between towers, under bridges, into a dome.
- Day/night cycle toggle for the interior lighting.
- District labels + "follow a transit pod" camera.

## Reusable pieces already prototyped
The first prototype on this branch (commit "Generation-ark prototype") contains modules that map well to
this concept:
- `src/ship/interior.js` – self-lit habitat surfaces, instanced buildings with lit windows, cloud decks,
  interior haze.
- `src/ship/textures.js` – procedural land / city-floor / cloud textures.
- `src/ship/arcadia.js` – terraced end-bowls, glazed strips, a co-rotating interior camera.
- `src/life/traffic.js` – spline-routed shuttle traffic, maglev trains, elevator cars, welding arcs.
