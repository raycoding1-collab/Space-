// Assembles VESPERA from its sections.
import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { makeLandTextures, makeRingFloorTextures, makeCloudTexture } from './textures.js';
import { buildSpine } from './spine.js';
import { buildRing } from './rings.js';
import { buildArcadia } from './arcadia.js';
import { buildBow } from './bow.js';
import { buildNexus } from './nexus.js';
import { buildFoundry } from './foundry.js';
import { buildEngineering } from './engineering.js';
import { buildEngines } from './engines.js';
import { SHIP } from '../world.js';

export async function buildShip({ quality, step }) {
  const ctx = { animated: [], tex: {} };
  const root = new THREE.Group();
  root.name = 'VESPERA';

  await step('Forging hull plating', 0.30);
  const M = createMaterials({ texSize: quality.texSize, aniso: quality.aniso });
  ctx.M = M;

  await step('Seeding Arcadia valleys', 0.40);
  ctx.tex.land = makeLandTextures(quality.texSize >= 2048 ? 1024 : 512, quality.texSize >= 2048 ? 2048 : 1024, 11);
  ctx.tex.ringFloor = makeRingFloorTextures(512, quality.texSize >= 2048 ? 4096 : 2048, 21);
  ctx.tex.clouds = makeCloudTexture(1024, 1024);

  await step('Raising the keel', 0.48);
  root.add(buildSpine(M, ctx));

  await step('Spinning up Halo I & II', 0.55);
  const ringA = buildRing(M, ctx, { ...SHIP.ringA, direction: 1, seed: 11, name: 'halo-1' });
  const ringB = buildRing(M, ctx, { ...SHIP.ringB, direction: -1, seed: 12, name: 'halo-2' });
  root.add(ringA.group, ringA.statics, ringB.group, ringB.statics);

  await step('Pressurising Arcadia', 0.63);
  const arcadia = buildArcadia(M, ctx);
  root.add(arcadia.group, arcadia.statics);

  await step('Commissioning the bow', 0.7);
  const bow = buildBow(M, ctx);
  root.add(bow.group);

  await step('Docking the Nexus', 0.75);
  const nexus = buildNexus(M, ctx);
  root.add(nexus.group);

  await step('Lighting the foundry', 0.79);
  const foundry = buildFoundry(M, ctx);
  root.add(foundry.group);

  await step('Igniting reactors', 0.83);
  const eng = buildEngineering(M, ctx);
  root.add(eng.group);
  const engines = buildEngines(M, ctx);
  root.add(engines.group);

  // Shadow flags: instanced/merged meshes honour material.userData.castShadow
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.userData && o.material.userData.castShadow === false) o.castShadow = false;
    if (o.isMesh && o.material && o.material.userData && o.material.userData.receiveShadow === false) o.receiveShadow = false;
  });

  return {
    root,
    ctx,
    M,
    parts: { ringA, ringB, arcadia, bow, nexus, foundry, eng, engines },
    update(t) { for (const f of ctx.animated) f(t); },
  };
}
