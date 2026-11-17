// ELYSION material library: facade styles, hull plating, deck ground, glass, water and glows.
import * as THREE from 'three';
import { cityPatch, CITY_U } from './shaders.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
const V = (c) => new THREE.Vector3(c.r, c.g, c.b);

/** A facade material: one architectural language (floor height, bays, pattern, palette, lighting). */
export function facadeMat(o = {}) {
  const S = {
    floorH: 4.2, bay: 3.2, colEvery: 4, mech: 0, pat: 0, podPat: 1, litP: 0.35, warm: 0.6,
    podTop: 0, podFloor: 5.5, lobby: 0, segment: 0,
    frame: C(0.62, 0.63, 0.64), glass: C(0.1, 0.13, 0.17), panel: C(0.7, 0.68, 0.64), accent: C(0.85, 0.66, 0.38),
    trim: C(1.0, 0.75, 0.45), roof: C(0.42, 0.42, 0.42), litI: 0.75, trimI: 2.6, ao: 1, seed: 0.5, ...o,
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 1, envMapIntensity: 1.0 });
  cityPatch(m, 'facade', {
    uFacA: { value: new THREE.Vector4(S.floorH, S.bay, S.colEvery, S.mech) },
    uFacB: { value: new THREE.Vector4(S.pat, S.podPat, S.litP, S.warm) },
    uFacC: { value: new THREE.Vector4(S.podTop, S.podFloor, S.lobby, S.segment) },
    uFrame: { value: V(S.frame) }, uGlass: { value: V(S.glass) }, uPanel: { value: V(S.panel) },
    uAccent: { value: V(S.accent) }, uTrim: { value: V(S.trim) }, uRoof: { value: V(S.roof) },
    uLitI: { value: S.litI }, uTrimI: { value: S.trimI }, uAO: { value: S.ao }, uSeed: { value: S.seed },
  });
  m.userData.style = S;
  return m;
}

export function platingMat(o = {}) {
  const S = {
    a: C(0.3, 0.29, 0.28), b: C(0.12, 0.12, 0.12), pw: 48, ph: 24, rows: 4, lamp: 2.4, seam: C(1.0, 0.7, 0.4),
    metal: 0.75, rough: 0.48, seed: 0.3, ...o,
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 1 });
  cityPatch(m, 'plating', {
    uPlateA: { value: V(S.a) }, uPlateB: { value: V(S.b) },
    uPlateS: { value: new THREE.Vector4(S.pw, S.ph, S.rows, S.lamp) },
    uSeamCol: { value: V(S.seam) }, uPlateMetal: { value: S.metal }, uPlateRough: { value: S.rough }, uSeed: { value: S.seed },
  }, { key: S.key || '' });
  return m;
}

/** Haze only: keeps a standard material's own look but places it inside the city's air. */
export function hazed(mat) { return cityPatch(mat, 'haze'); }

export function createCityMaterials() {
  const M = {};

  // ---------------------------------------------------------------- facade languages
  // Spire district: luminous champagne-glass towers with gilded structure
  M.spireGlass = facadeMat({ pat: 0, floorH: 4.4, bay: 3.0, colEvery: 5, mech: 22, litP: 0.42, warm: 0.62,
    frame: C(0.78, 0.74, 0.66), glass: C(0.16, 0.18, 0.2), accent: C(0.92, 0.72, 0.42), lobby: 12, seed: 0.11 });
  M.spireDiagrid = facadeMat({ pat: 4, floorH: 4.3, bay: 3.2, colEvery: 0, mech: 0, litP: 0.4, warm: 0.5,
    frame: C(0.7, 0.72, 0.74), glass: C(0.09, 0.12, 0.16), accent: C(0.88, 0.86, 0.82), lobby: 10, seed: 0.21 });
  M.spireFins = facadeMat({ pat: 3, floorH: 4.2, bay: 2.6, colEvery: 0, mech: 26, litP: 0.36, warm: 0.7,
    frame: C(0.8, 0.8, 0.78), glass: C(0.08, 0.1, 0.13), accent: C(0.86, 0.84, 0.8), lobby: 9, seed: 0.31 });
  M.spireDark = facadeMat({ pat: 0, floorH: 4.0, bay: 3.6, colEvery: 3, mech: 18, litP: 0.3, warm: 0.3,
    frame: C(0.16, 0.17, 0.19), glass: C(0.05, 0.06, 0.08), accent: C(0.75, 0.6, 0.38), trim: C(0.55, 0.85, 1.0), lobby: 10, seed: 0.41 });
  M.spireBronze = facadeMat({ pat: 7, floorH: 4.0, bay: 3.0, colEvery: 6, mech: 20, litP: 0.38, warm: 0.75,
    frame: C(0.42, 0.32, 0.22), glass: C(0.1, 0.09, 0.08), accent: C(0.55, 0.4, 0.25), lobby: 9, seed: 0.51 });
  M.spireWhite = facadeMat({ pat: 5, floorH: 3.8, bay: 3.4, colEvery: 0, mech: 0, litP: 0.4, warm: 0.65,
    frame: C(0.82, 0.82, 0.8), glass: C(0.08, 0.1, 0.12), panel: C(0.86, 0.85, 0.82), lobby: 8, seed: 0.61 });
  M.spireHex = facadeMat({ pat: 6, floorH: 4.0, bay: 3.0, colEvery: 0, mech: 0, litP: 0.36, warm: 0.45,
    frame: C(0.6, 0.62, 0.64), glass: C(0.07, 0.1, 0.13), accent: C(0.82, 0.8, 0.74), lobby: 8, seed: 0.71 });

  // Central "Meridian" commercial district: crisp modern curtain walls and ribbon windows
  M.midCurtain = facadeMat({ pat: 0, floorH: 4.0, bay: 3.0, colEvery: 4, mech: 16, litP: 0.4, warm: 0.55,
    frame: C(0.66, 0.67, 0.69), glass: C(0.08, 0.11, 0.15), lobby: 8, ao: 1, seed: 0.13 });
  M.midRibbon = facadeMat({ pat: 1, floorH: 3.8, bay: 3.0, colEvery: 0, mech: 0, litP: 0.45, warm: 0.6,
    panel: C(0.8, 0.79, 0.76), glass: C(0.07, 0.09, 0.12), podPat: 0, lobby: 6, ao: 1, seed: 0.23 });
  M.midPunched = facadeMat({ pat: 2, floorH: 3.6, bay: 3.4, colEvery: 0, mech: 0, litP: 0.5, warm: 0.8,
    panel: C(0.62, 0.56, 0.5), glass: C(0.06, 0.07, 0.08), lobby: 5, ao: 1, seed: 0.33 });
  M.midFins = facadeMat({ pat: 3, floorH: 3.9, bay: 2.4, colEvery: 0, mech: 14, litP: 0.4, warm: 0.5,
    frame: C(0.74, 0.74, 0.73), glass: C(0.07, 0.09, 0.12), accent: C(0.72, 0.73, 0.74), lobby: 7, ao: 1, seed: 0.43 });
  M.midDark = facadeMat({ pat: 7, floorH: 4.0, bay: 3.2, colEvery: 5, mech: 12, litP: 0.35, warm: 0.4,
    frame: C(0.2, 0.21, 0.22), glass: C(0.05, 0.06, 0.07), accent: C(0.3, 0.31, 0.32), lobby: 8, ao: 1, seed: 0.53 });

  // Canal quarter: warm terraced residences with balconies and stone
  M.resBalcony = facadeMat({ pat: 5, floorH: 3.4, bay: 3.6, colEvery: 0, mech: 0, litP: 0.55, warm: 0.85,
    panel: C(0.82, 0.76, 0.66), glass: C(0.07, 0.07, 0.08), lobby: 4, ao: 1, seed: 0.17 });
  M.resPunched = facadeMat({ pat: 2, floorH: 3.3, bay: 3.2, colEvery: 0, mech: 0, litP: 0.55, warm: 0.9,
    panel: C(0.74, 0.62, 0.5), glass: C(0.05, 0.05, 0.06), lobby: 4, ao: 1, seed: 0.27 });
  M.resHex = facadeMat({ pat: 6, floorH: 3.5, bay: 2.8, colEvery: 0, mech: 0, litP: 0.5, warm: 0.8,
    frame: C(0.7, 0.66, 0.58), glass: C(0.06, 0.07, 0.08), accent: C(0.8, 0.74, 0.62), lobby: 4, ao: 1, seed: 0.37 });
  M.resWhite = facadeMat({ pat: 1, floorH: 3.4, bay: 3.0, colEvery: 0, mech: 0, litP: 0.5, warm: 0.8,
    panel: C(0.88, 0.87, 0.84), glass: C(0.06, 0.07, 0.09), lobby: 4, ao: 1, seed: 0.47 });

  // Garden quarters: low courtyard houses, pale stone and timber tones
  M.gardenStone = facadeMat({ pat: 2, floorH: 3.4, bay: 3.8, colEvery: 0, mech: 0, litP: 0.55, warm: 0.9,
    panel: C(0.8, 0.74, 0.64), glass: C(0.05, 0.05, 0.06), roof: C(0.32, 0.3, 0.28), lobby: 0, ao: 1, seed: 0.19 });
  M.gardenTimber = facadeMat({ pat: 7, floorH: 3.3, bay: 3.0, colEvery: 0, mech: 0, litP: 0.5, warm: 0.95,
    frame: C(0.42, 0.3, 0.2), glass: C(0.06, 0.06, 0.06), accent: C(0.5, 0.36, 0.23), roof: C(0.3, 0.32, 0.27), ao: 1, seed: 0.29 });
  M.gardenWhite = facadeMat({ pat: 5, floorH: 3.3, bay: 3.4, colEvery: 0, mech: 0, litP: 0.5, warm: 0.85,
    panel: C(0.9, 0.89, 0.86), glass: C(0.06, 0.07, 0.08), roof: C(0.35, 0.36, 0.33), ao: 1, seed: 0.39 });

  // Industrial
  M.industry = facadeMat({ pat: 2, floorH: 6.0, bay: 6.0, colEvery: 0, mech: 0, litP: 0.25, warm: 0.6,
    panel: C(0.36, 0.35, 0.33), glass: C(0.05, 0.05, 0.05), roof: C(0.25, 0.25, 0.25), accent: C(0.7, 0.42, 0.18), ao: 1, seed: 0.24 });
  M.industryLight = facadeMat({ pat: 1, floorH: 7.0, bay: 5.0, colEvery: 0, mech: 0, litP: 0.3, warm: 0.4,
    panel: C(0.6, 0.6, 0.58), glass: C(0.06, 0.07, 0.08), roof: C(0.3, 0.3, 0.3), accent: C(0.65, 0.66, 0.68), ao: 1, seed: 0.34 });

  // City walls (the terrace tiers of the foundation): long lit walls, each stretch a different building
  M.wallA = facadeMat({ pat: 5, floorH: 4.0, bay: 4.0, colEvery: 0, mech: 18, litP: 0.42, warm: 0.75, segment: 180,
    panel: C(0.78, 0.75, 0.7), glass: C(0.06, 0.07, 0.08), lobby: 0, ao: 0, seed: 0.15 });
  M.wallB = facadeMat({ pat: 2, floorH: 4.0, bay: 3.6, colEvery: 0, mech: 16, litP: 0.45, warm: 0.8, segment: 220,
    panel: C(0.7, 0.67, 0.62), glass: C(0.05, 0.05, 0.06), lobby: 0, ao: 0, seed: 0.25 });
  M.wallC = facadeMat({ pat: 0, floorH: 4.2, bay: 3.2, colEvery: 6, mech: 20, litP: 0.4, warm: 0.6, segment: 260,
    frame: C(0.55, 0.55, 0.56), glass: C(0.06, 0.08, 0.1), lobby: 0, ao: 0, seed: 0.35 });
  M.terrace = facadeMat({ pat: 5, floorH: 4.0, bay: 3.8, colEvery: 0, mech: 15, litP: 0.48, warm: 0.7, segment: 160,
    panel: C(0.84, 0.82, 0.78), glass: C(0.06, 0.07, 0.09), lobby: 0, ao: 0, seed: 0.45 });

  // Shared non-window surfaces (zones 4–9 use the same palettes, so one generic material covers them)
  M.stone = facadeMat({ panel: C(0.72, 0.69, 0.64), seed: 0.55 });
  M.metal = facadeMat({ accent: C(0.86, 0.68, 0.42), seed: 0.65 });
  M.steel = facadeMat({ accent: C(0.62, 0.64, 0.67), panel: C(0.5, 0.51, 0.52), seed: 0.75 });
  M.dark = facadeMat({ accent: C(0.16, 0.17, 0.18), panel: C(0.2, 0.2, 0.21), frame: C(0.25, 0.26, 0.27), glass: C(0.04, 0.05, 0.06), seed: 0.85 });

  // ---------------------------------------------------------------- foundation hull
  M.belly = platingMat({ a: C(0.3, 0.285, 0.27), b: C(0.1, 0.1, 0.1), pw: 64, ph: 32, rows: 5, lamp: 3.0, seam: C(1.0, 0.68, 0.38), metal: 0.72, rough: 0.46, seed: 0.2 });
  M.bellyDark = platingMat({ a: C(0.14, 0.135, 0.13), b: C(0.05, 0.05, 0.05), pw: 48, ph: 24, rows: 4, lamp: 3.5, seam: C(1.0, 0.62, 0.32), metal: 0.8, rough: 0.42, seed: 0.4 });
  M.hullLight = platingMat({ a: C(0.62, 0.6, 0.57), b: C(0.3, 0.29, 0.28), pw: 40, ph: 20, rows: 6, lamp: 2.0, seam: C(1.0, 0.75, 0.48), metal: 0.5, rough: 0.5, seed: 0.6 });
  M.engineWall = platingMat({ a: C(0.2, 0.2, 0.21), b: C(0.07, 0.07, 0.08), pw: 56, ph: 28, rows: 3, lamp: 3.0, seam: C(0.45, 0.75, 1.0), metal: 0.8, rough: 0.4, seed: 0.8 });

  // ---------------------------------------------------------------- deck ground
  M.ground = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  M.groundPolar = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });

  // ---------------------------------------------------------------- glass, water, glows
  M.glass = hazed(new THREE.MeshStandardMaterial({
    color: C(0.5, 0.62, 0.72), metalness: 0.0, roughness: 0.04, transparent: true, opacity: 0.16,
    envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide,
  }));
  M.glass.userData.castShadow = false;
  const glow = (r, g, b, k) => {
    const m = new THREE.MeshBasicMaterial({ color: C(r, g, b).multiplyScalar(k) });
    m.userData.castShadow = false;
    return m;
  };
  M.glowWarm = glow(1.0, 0.72, 0.42, 3.2);
  M.glowGold = glow(1.0, 0.8, 0.5, 4.0);
  M.glowCyan = glow(0.3, 0.78, 1.0, 3.0);
  M.glowWhite = glow(1.0, 0.96, 0.9, 5.0);
  M.glowRed = glow(1.0, 0.18, 0.08, 4.0);
  M.glowEmber = glow(1.0, 0.42, 0.12, 3.0);
  M.steelPlain = hazed(new THREE.MeshStandardMaterial({ color: C(0.55, 0.56, 0.58), metalness: 0.8, roughness: 0.4 }));
  M.darkPlain = hazed(new THREE.MeshStandardMaterial({ color: C(0.12, 0.12, 0.13), metalness: 0.7, roughness: 0.5 }));
  M.whitePlain = hazed(new THREE.MeshStandardMaterial({ color: C(0.8, 0.8, 0.78), metalness: 0.3, roughness: 0.5 }));
  M.goldPlain = hazed(new THREE.MeshStandardMaterial({ color: C(0.95, 0.74, 0.44), metalness: 1.0, roughness: 0.3 }));

  M.U = CITY_U;
  return M;
}
