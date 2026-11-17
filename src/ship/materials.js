// Material library for the ship. Physically based hull + HDR emissive systems.
import * as THREE from 'three';
import { makeHullTextures, makeFoilNormal, makeRadiatorTextures, makeBayTexture } from './textures.js';

export function createMaterials({ texSize = 2048, aniso = 8 } = {}) {
  const T = makeHullTextures(texSize, aniso);
  const foil = makeFoilNormal(512);
  const rad = makeRadiatorTextures(1024, 1024);
  const bay = makeBayTexture();

  const hullBase = {
    map: T.albedo,
    normalMap: T.normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: T.rm,
    metalnessMap: T.rm,
    roughness: 1.0,
    metalness: 1.0,
    envMapIntensity: 1.0,
  };

  const M = {};
  // Off-white ceramic composite — the primary hull skin
  M.hull = new THREE.MeshStandardMaterial({ ...hullBase, color: new THREE.Color(0.86, 0.87, 0.88) });
  // Warmer ivory accent plating
  M.hullWarm = new THREE.MeshStandardMaterial({ ...hullBase, color: new THREE.Color(0.9, 0.86, 0.78) });
  // Gunmetal structural plating
  M.hullDark = new THREE.MeshStandardMaterial({ ...hullBase, color: new THREE.Color(0.36, 0.38, 0.42) });
  // Charcoal heat-shield tiling
  M.hullBlack = new THREE.MeshStandardMaterial({ ...hullBase, color: new THREE.Color(0.17, 0.18, 0.2), metalness: 0.6 });

  // Inhabited decks: windows lit from within
  M.hab = new THREE.MeshStandardMaterial({
    map: T.habAlbedo,
    normalMap: T.normal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: T.habRM,
    metalnessMap: T.habRM,
    roughness: 1.0,
    metalness: 1.0,
    emissiveMap: T.habEmissive,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: 3.2,
    color: new THREE.Color(0.88, 0.88, 0.89),
  });
  M.habDark = M.hab.clone();
  M.habDark.color = new THREE.Color(0.42, 0.44, 0.48);

  // Gold multi-layer insulation
  M.gold = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1.0, 0.72, 0.32),
    metalness: 1.0,
    roughness: 0.34,
    normalMap: foil,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
  M.copper = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.85, 0.48, 0.3), metalness: 1.0, roughness: 0.4 });
  M.chrome = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.9, 0.92, 0.95), metalness: 1.0, roughness: 0.12 });
  M.dish = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.85, 0.86, 0.88), metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide });

  // Structural members (instanced; no UVs needed)
  M.truss = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.64, 0.68), metalness: 0.75, roughness: 0.42 });
  M.trussDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.24, 0.25, 0.28), metalness: 0.7, roughness: 0.5 });
  M.greeble = new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 1, 1), metalness: 0.55, roughness: 0.5 });

  // Glass
  M.glass = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.32, 0.42, 0.52),
    metalness: 0.0,
    roughness: 0.03,
    transparent: true,
    opacity: 0.12,
    envMapIntensity: 1.6,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  M.glass.userData.castShadow = false;
  M.glassTube = M.glass.clone();
  M.glassTube.opacity = 0.14;

  // Radiators
  M.radiator = new THREE.MeshStandardMaterial({
    map: rad.albedo,
    roughnessMap: rad.rm,
    metalnessMap: rad.rm,
    roughness: 1,
    metalness: 1,
    emissiveMap: rad.emissive,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: 1.5,
    side: THREE.DoubleSide,
  });

  M.container = new THREE.MeshStandardMaterial({ color: new THREE.Color(1, 1, 1), metalness: 0.35, roughness: 0.62 });
  M.bayField = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.3, 0.75, 1.0).multiplyScalar(0.22),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  M.bayField.userData.castShadow = false;

  // Bay interiors
  M.bay = new THREE.MeshBasicMaterial({ map: bay, color: new THREE.Color(2.2, 2.2, 2.2) });

  // Emissive accents (HDR; bloom picks these up)
  const glow = (r, g, b, k) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b).multiplyScalar(k) });
    m.userData.castShadow = false;
    return m;
  };
  M.glowCyan = glow(0.25, 0.78, 1.0, 3.6);
  M.glowCyanSoft = glow(0.25, 0.75, 1.0, 1.5);
  M.glowWarm = glow(1.0, 0.72, 0.42, 5);
  M.glowWhite = glow(1.0, 0.97, 0.92, 6);
  M.glowAmber = glow(1.0, 0.5, 0.12, 3.5);
  M.glowRed = glow(1.0, 0.12, 0.08, 6);
  M.glowViolet = glow(0.5, 0.4, 1.0, 3.2);
  M.glowSun = glow(1.0, 0.86, 0.62, 30);

  M._textures = { ...T, foil, rad, bay };
  return M;
}
