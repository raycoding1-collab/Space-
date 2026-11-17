// ELYSION — assembly of the flying city-ship.
import * as THREE from 'three';
import { createCityMaterials } from './materials.js';
import { cityPatch } from './shaders.js';
import { buildFoundation } from './foundation.js';
import { buildDistricts } from './districts.js';
import { buildSpire } from './spire.js';
import { buildDomes } from './domes.js';
import { buildCanal } from './canal.js';
import { buildIndustry } from './industry.js';
import { buildHarbours } from './harbours.js';
import { buildUndercity } from './undercity.js';
import { buildStern } from './stern.js';
import { buildLife } from './life.js';
import { InstanceCuller } from './culling.js';
import { buildExtras } from './extras.js';
import { GRID, POLAR, SPIRE, CITY_DETAIL } from './layout.js';
import { lightUniforms } from '../ship/lights.js';
import { conduitTime } from '../ship/conduit.js';

/** Configure the two deck materials with the block-type texture produced by the district planner. */
export function setupGround(M, blocks) {
  const common = {
    uPave: { value: new THREE.Vector3(0.36, 0.345, 0.325) },
    uStreet: { value: new THREE.Vector3(0.075, 0.075, 0.08) },
    uStreetLights: { value: 3.2 },
    uGridA: { value: new THREE.Vector4(GRID.px, GRID.pz, GRID.street, GRID.blvd) },
    uGridB: { value: new THREE.Vector4(GRID.every, blocks.i0, blocks.j0, 0) },
    uBlockTex: { value: blocks.tex },
    uPolar: { value: new THREE.Vector4(SPIRE.x, SPIRE.z, 0.955, POLAR.ring) },
    uPolarB: { value: new THREE.Vector4(POLAR.avenue, POLAR.ringStreet, 0, 0) },
  };
  cityPatch(M.ground, 'ground', { ...common }, { groundMode: 'cart' });
  cityPatch(M.groundPolar, 'ground', { ...common }, { groundMode: 'polar' });
}

export function emptyBlocks() {
  const NI = 52, NJ = 100;
  const data = new Uint8Array(NI * NJ * 4);
  for (let i = 0; i < NI * NJ; i++) { data[i * 4] = 0; data[i * 4 + 1] = (i * 97) % 255; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, NI, NJ, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.needsUpdate = true;
  return { tex, data, NI, NJ, i0: NI / 2, j0: NJ / 2 };
}

export async function buildCity({ quality, step, scene }) {
  const root = new THREE.Group();
  root.name = 'ELYSION';
  const ctx = { animated: [], frame: [] };
  CITY_DETAIL.k = quality.detail ?? 1;
  await step('Casting the keel-leaf', 0.3);
  const M = createCityMaterials();
  const blocks = emptyBlocks();
  setupGround(M, blocks);
  root.add(buildFoundation(M, ctx));
  await step('Raising the districts', 0.45);
  root.add(buildDistricts(M, ctx, blocks));
  await step('Raising the Crown Spire', 0.6);
  root.add(buildSpire(M, ctx));
  await step('Sealing the biome domes', 0.7);
  root.add(buildDomes(M, ctx, scene.background));
  await step('Flooding the Grand Canal', 0.74);
  root.add(buildCanal(M, ctx, scene.background));
  await step('Firing the smelters', 0.77);
  root.add(buildIndustry(M, ctx));
  await step('Mooring the harbours', 0.8);
  root.add(buildHarbours(M, ctx));
  await step('Lighting the reactor suns', 0.84);
  root.add(buildUndercity(M, ctx));
  await step('Warming the drives', 0.88);
  root.add(buildStern(M, ctx));
  await step('Waking the city', 0.92);
  root.add(buildLife(M, ctx, { envTex: scene.background, quality, lib: ctx.lib }));

  await step('Adding the fine detail', 0.95);
  root.add(buildExtras(M, ctx, ctx.lib));
  // per-frame culling of every static instance (buildings, trees, ships, frames…)
  {
    const culler = new InstanceCuller();
    culler.registerTree(root, [ctx.halo, ctx.vespera].filter(Boolean));
    ctx.culler = culler;
    ctx.frame.push((camera) => culler.update(camera, lightUniforms.uViewH.value));
    console.log(`[city] culler: ${culler.sets.length} meshes, ${culler.stats.total} instances`);
  }
  {
    const count = (name) => { let n = 0; root.traverse((o) => { if (o.name === name) n += o.isInstancedMesh ? o.count : 1; }); return n; };
    console.log(`[city] stats ${JSON.stringify({ bridges: (ctx.bridges || []).length, cranes: (ctx.cranes || []).length, piers: (ctx.piers || []).length,
      freighters: count('freighter'), tankers: count('tanker'), liners: count('liner'), haulers: count('hauler'), tugs: count('tug'), gantries: count('gantry') })}`);
  }
  ctx.animated.push((t) => { M.U.uCityTime.value = t; conduitTime.value = t; lightUniforms.uTime.value = t; });
  return {
    root, M, ctx,
    update(t) { for (const f of ctx.animated) f(t); },
    frame(camera, t) { for (const f of ctx.frame) f(camera, t); },
  };
}
