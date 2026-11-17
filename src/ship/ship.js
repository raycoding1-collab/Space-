// Builds the ship: materials, then the capital starship assembly.
import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { buildCapitalShip } from './capital.js';
import { conduitTime } from './conduit.js';

export async function buildShip({ quality, step }) {
  const ctx = { animated: [], tex: {} };
  await step('Forging armour plate', 0.32);
  const M = createMaterials({ texSize: quality.texSize, aniso: quality.aniso });
  ctx.M = M;
  await step('Laying the keel', 0.5);
  const ship = buildCapitalShip(M, ctx);
  await step('Lighting the decks', 0.8);
  ship.root.traverse((o) => {
    if (o.isMesh && o.material && o.material.userData) {
      if (o.material.userData.castShadow === false) o.castShadow = false;
      if (o.material.userData.receiveShadow === false) o.receiveShadow = false;
    }
  });
  ctx.animated.push((t) => { conduitTime.value = t; });
  return {
    root: ship.root,
    ctx,
    M,
    parts: ship,
    update(t) { for (const f of ctx.animated) f(t); },
  };
}
