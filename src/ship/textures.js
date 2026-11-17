// Procedural texture factory: hull plating, window decks, habitat landscapes, clouds.
// Everything is generated at load time from seeded noise — no image assets.
import * as THREE from 'three';
import { RNG, clamp, smoothstep, lerp } from '../lib/rng.js';
import { TileNoise, makeCanvas, writeRGB, heightToNormal } from '../lib/canvasNoise.js';

function canvasTexture(canvas, { srgb = false, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------------------------------ */
/* Hull plating                                                                                */
/* ------------------------------------------------------------------------------------------ */

export function makeHullTextures(S = 2048, aniso = 8) {
  const rng = new RNG(1977);
  const noise = new TileNoise(31, 512);
  const N = S * S;
  const H = new Float32Array(N);
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const rough = new Float32Array(N), metal = new Float32Array(N);
  // window deck variant arrays (filled later)
  const leaves = [];

  const snap = 8;
  function split(x, y, w, h, depth) {
    const area = w * h;
    const stop = depth > 1 && (area < 96 * 96 || rng.chance(depth > 4 ? 0.6 : 0.2));
    if (stop || w < 40 || h < 40) { leaves.push({ x, y, w, h }); return; }
    const vertical = w > h * 1.3 ? true : h > w * 1.3 ? false : rng.chance(0.5);
    if (vertical) {
      const s = Math.round((w * rng.range(0.25, 0.75)) / snap) * snap;
      if (s < 8 || w - s < 8) { leaves.push({ x, y, w, h }); return; }
      split(x, y, s, h, depth + 1); split(x + s, y, w - s, h, depth + 1);
    } else {
      const s = Math.round((h * rng.range(0.25, 0.75)) / snap) * snap;
      if (s < 8 || h - s < 8) { leaves.push({ x, y, w, h }); return; }
      split(x, y, w, s, depth + 1); split(x, y + s, w, h - s, depth + 1);
    }
  }
  // Start from a regular grid of large plates so the hull reads as engineered, then subdivide.
  const big = S / 4;
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) split(gx * big, gy * big, big, big, 0);

  for (const L of leaves) {
    const type = rng.weighted([
      ['plain', 74], ['riveted', 9], ['hatch', 6], ['vent', 3], ['dark', 5], ['tiles', 2], ['stripe', 0.4],
    ]);
    let tone = rng.range(0.86, 0.95);
    let rgh = rng.range(0.34, 0.5);
    let mtl = rng.range(0.15, 0.35);
    let tint = [1, 1, 1];
    if (type === 'dark') { tone = rng.range(0.66, 0.76); rgh = rng.range(0.4, 0.55); mtl = 0.45; }
    if (type === 'tiles') { tone = rng.range(0.6, 0.7); rgh = 0.6; mtl = 0.1; }
    if (rng.chance(0.06)) tint = [1.0, 0.985, 0.96];
    if (rng.chance(0.05)) tint = [0.97, 0.98, 1.0];
    const level = rng.range(0, 0.35);
    for (let y = L.y; y < L.y + L.h; y++) {
      for (let x = L.x; x < L.x + L.w; x++) {
        const i = y * S + x;
        const lx = x - L.x, ly = y - L.y;
        // bevelled edge
        const e = Math.min(lx, ly, L.w - 1 - lx, L.h - 1 - ly);
        let h = level + Math.min(1, e / 3) * 0.6;
        let t = tone, rr = rgh, mm = mtl;
        let tr = tint[0], tg = tint[1], tb = tint[2];
        if (e < 1) { h = -0.6; t *= 0.62; rr = 0.7; }
        else if (type === 'riveted' && e >= 4 && e < 6 && ((lx + ly) % 18) < 3 && (lx < 7 || ly < 7 || L.w - lx < 8 || L.h - ly < 8)) { h += 0.5; t *= 0.93; }
        else if (type === 'vent' && e > 6 && (ly % 7) < 2) { h -= 0.5; t *= 0.7; rr = 0.8; }
        else if (type === 'hatch') {
          const ix = lx - L.w * 0.2, iy = ly - L.h * 0.2, iw = L.w * 0.6, ih = L.h * 0.6;
          const ie = Math.min(ix, iy, iw - ix, ih - iy);
          if (ie >= 0 && ie < 1.5) { h -= 0.5; t *= 0.78; }
          else if (ie >= 1.5) { h += 0.15; }
        } else if (type === 'tiles') {
          if ((lx % 16) === 0 || (ly % 16) === 0) { h -= 0.3; t *= 0.85; }
        } else if (type === 'stripe' && e > 2) {
          const s = ((lx + ly) % 28) < 14;
          if (s) { tr = 1.0; tg = 0.72; tb = 0.22; t = 0.75; } else { t = 0.12; }
        }
        H[i] = h;
        R[i] = t * tr; G[i] = t * tg; B[i] = t * tb;
        rough[i] = rr; metal[i] = mm;
      }
    }
  }
  // Grime, weathering streaks and micro-variation (tileable)
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const i = y * S + x;
      const g1 = noise.fbm(u, v, 8, 5);
      const streak = noise.fbm2(u, v, 64, 4, 3);
      const fine = noise.noise(u, v, 512);
      const k = 0.9 + 0.12 * g1 - 0.04 * smoothstep(0.55, 0.8, streak) + 0.02 * (fine - 0.5);
      R[i] *= k; G[i] *= k; B[i] *= k;
      rough[i] = clamp(rough[i] + 0.18 * (g1 - 0.5) + 0.08 * (fine - 0.5), 0.05, 1);
      H[i] += (fine - 0.5) * 0.04;
    }
  }

  const albedo = writeRGB(makeCanvas(S, S), R, G, B);
  const normal = heightToNormal(H, S, S, 1.6);
  const zero = new Float32Array(N);
  const rm = writeRGB(makeCanvas(S, S), zero, rough, metal);

  // ---------- Window-deck variant (habitation sections) ----------
  const eR = new Float32Array(N), eG = new Float32Array(N), eB = new Float32Array(N);
  const hR = R.slice(), hG = G.slice(), hB = B.slice();
  const hRough = rough.slice(), hMetal = metal.slice();
  const DECKS = 28;
  const deck = Math.round(S / DECKS); // deck pitch in px (tile 96 m → ~3.4 m decks)
  const bandsOn = new Uint8Array(DECKS);
  for (let k = 0; k < DECKS; k++) bandsOn[k] = rng.chance(0.8) ? 1 : 0;
  const winW = 12, winH = Math.round(deck * 0.45), pitch = 20;
  const warm = [[1.0, 0.72, 0.42], [1.0, 0.8, 0.55], [1.0, 0.88, 0.7], [0.85, 0.92, 1.0], [1.0, 0.66, 0.36]];
  for (let k = 0; k < DECKS; k++) {
    if (!bandsOn[k]) continue;
    const y0 = k * deck + Math.round((deck - winH) / 2);
    let litRun = rng.chance(0.5);
    let runCol = rng.pick(warm);
    const lounge = rng.chance(0.12);
    for (let wx = 0; wx < S; wx += pitch) {
      if (rng.chance(0.12)) litRun = !litRun;
      if (rng.chance(0.08)) runCol = rng.pick(warm);
      const lit = lounge || (litRun ? rng.chance(0.86) : rng.chance(0.18));
      const bright = lit ? rng.range(0.55, 1.0) : 0;
      const ww = lounge ? pitch - 4 : winW;
      for (let y = y0; y < y0 + winH; y++) {
        for (let x = wx; x < wx + ww && x < S; x++) {
          const i = y * S + x;
          const ex = Math.min(x - wx, wx + ww - 1 - x, y - y0, y0 + winH - 1 - y);
          if (ex < 1) { hR[i] *= 0.4; hG[i] *= 0.4; hB[i] *= 0.4; continue; }
          hR[i] = 0.03; hG[i] = 0.035; hB[i] = 0.045; hRough[i] = 0.08; hMetal[i] = 0.9;
          // interior falloff: brighter at top of window (ceiling lights)
          const fy = (y - y0) / winH;
          const f = bright * (0.75 + 0.25 * (1 - fy));
          eR[i] = runCol[0] * f; eG[i] = runCol[1] * f; eB[i] = runCol[2] * f;
        }
      }
    }
  }
  const habAlbedo = writeRGB(makeCanvas(S, S), hR, hG, hB);
  const habRM = writeRGB(makeCanvas(S, S), zero, hRough, hMetal);
  const habEmissive = writeRGB(makeCanvas(S, S), eR, eG, eB);

  return {
    albedo: canvasTexture(albedo, { srgb: true, aniso }),
    normal: canvasTexture(normal, { aniso }),
    rm: canvasTexture(rm, { aniso }),
    habAlbedo: canvasTexture(habAlbedo, { srgb: true, aniso }),
    habRM: canvasTexture(habRM, { aniso }),
    habEmissive: canvasTexture(habEmissive, { srgb: true, aniso }),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Crinkled gold multi-layer insulation                                                         */
/* ------------------------------------------------------------------------------------------ */
export function makeFoilNormal(S = 512) {
  const n = new TileNoise(99, 256);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    H[y * S + x] = Math.abs(n.fbm(u, v, 6, 5) - 0.5) * 2 + n.noise(u, v, 48) * 0.4;
  }
  return canvasTexture(heightToNormal(H, S, S, 6));
}

/* ------------------------------------------------------------------------------------------ */
/* Radiator panel: heat pipes, manifolds, structural frames                                    */
/* ------------------------------------------------------------------------------------------ */
export function makeRadiatorTextures(W = 1024, Hh = 1024) {
  const rng = new RNG(404);
  const noise = new TileNoise(5, 256);
  const N = W * Hh;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const eR = new Float32Array(N), eG = new Float32Array(N), eB = new Float32Array(N);
  const rough = new Float32Array(N), metal = new Float32Array(N), zero = new Float32Array(N);
  // u (x): radial distance from spine (0 = root), v (y): along ship
  const cellsV = 8;
  const cellH = Hh / cellsV;
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const u = x / W;
      const inCell = y % cellH;
      const frame = inCell < 3 || x % 128 < 3 || x < 6;
      const pipe = (y % 6) < 2;
      let t = 0.16 + 0.04 * noise.noise(x / W, y / Hh, 64);
      if (pipe) t += 0.06;
      if (frame) t = 0.34;
      R[i] = t; G[i] = t * 0.98; B[i] = t * 0.97;
      rough[i] = frame ? 0.45 : 0.62; metal[i] = frame ? 0.7 : 0.4;
      if (!frame) {
        // heat: hottest at the root, fading toward the tips, with per-cell variation
        const cell = Math.floor(y / cellH);
        const k = 0.85 + 0.3 * ((cell * 0.618) % 1);
        const heat = Math.pow(1 - u, 2.3) * k * (0.75 + 0.25 * noise.fbm(u, y / Hh, 4, 3));
        const p = pipe ? 1.0 : 0.05;
        const e = heat * p;
        // blackbody-ish ramp: deep red -> orange -> pale amber
        const T = clamp(heat, 0, 1);
        eR[i] = e * 1.0;
        eG[i] = e * lerp(0.12, 0.5, T * T);
        eB[i] = e * lerp(0.02, 0.18, T * T * T);
      }
    }
  }
  return {
    albedo: canvasTexture(writeRGB(makeCanvas(W, Hh), R, G, B), { srgb: true, repeat: false }),
    emissive: canvasTexture(writeRGB(makeCanvas(W, Hh), eR, eG, eB), { srgb: true, repeat: false }),
    rm: canvasTexture(writeRGB(makeCanvas(W, Hh), zero, rough, metal), { repeat: false }),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Arcadia interior landscape (one land strip)                                                  */
/* ------------------------------------------------------------------------------------------ */
// u: across the strip (0..1 ≈ 800 m), v: along the habitat (0..1 ≈ 2000 m)
export function makeLandTextures(W = 1024, Hh = 2048, seed = 11) {
  const rng = new RNG(seed);
  const n = new TileNoise(seed * 3 + 1, 512);
  const N = W * Hh;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const eR = new Float32Array(N), eG = new Float32Array(N), eB = new Float32Array(N);

  // Towns: centres in (u, v) with radius (in v units)
  const towns = [];
  const nTowns = 7;
  for (let t = 0; t < nTowns; t++) {
    towns.push({
      u: rng.range(0.18, 0.82),
      v: (t + rng.range(0.15, 0.85)) / nTowns,
      r: rng.range(60, 150), // metres
      dense: rng.range(0.6, 1.0),
    });
  }
  // River: meanders along v
  const riverU = (v) => 0.5 + 0.22 * Math.sin(v * 6.283 * 1.3 + 0.7) + 0.08 * Math.sin(v * 6.283 * 4.1 + 2.0);
  // Lakes
  const lakes = [];
  for (let l = 0; l < 4; l++) lakes.push({ u: rng.range(0.15, 0.85), v: rng.range(0.05, 0.95), r: rng.range(22, 60) });
  const SW = 840, SL = 2050; // strip size in metres

  const fieldPal = [
    [0.36, 0.5, 0.18], [0.45, 0.56, 0.2], [0.62, 0.6, 0.27], [0.74, 0.64, 0.32], [0.3, 0.44, 0.16],
    [0.55, 0.62, 0.24], [0.42, 0.36, 0.22], [0.68, 0.55, 0.3],
  ];
  for (let y = 0; y < Hh; y++) {
    const v = y / Hh;
    const ru = riverU(v);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const i = y * W + x;
      // warped field grid
      const wu = u + 0.02 * (n.fbm(u, v, 8, 3) - 0.5);
      const wv = v + 0.01 * (n.fbm(u + 0.3, v, 8, 3) - 0.5);
      const fu = Math.floor(wu * 22), fv = Math.floor(wv * 40);
      const h = ((fu * 73856093) ^ (fv * 19349663)) >>> 0;
      const pc = fieldPal[h % fieldPal.length];
      const rowStripe = 0.92 + 0.08 * Math.sin((h & 1 ? wu * W * 0.9 : wv * Hh * 0.45));
      let r = pc[0] * rowStripe, g = pc[1] * rowStripe, b = pc[2] * rowStripe;
      // hedgerows between fields
      const fx = (wu * 22) % 1, fy = (wv * 40) % 1;
      if (fx < 0.04 || fy < 0.06) { r = 0.16; g = 0.25; b = 0.1; }
      // forests
      const fo = n.fbm(u * 1.0, v, 6, 6);
      const forest = smoothstep(0.54, 0.58, fo);
      const tree = 0.75 + 0.5 * n.noise(u, v, 256) * n.noise(u + 0.5, v, 197);
      r = lerp(r, 0.07 * tree, forest); g = lerp(g, 0.17 * tree, forest); b = lerp(b, 0.06 * tree, forest);
      // meadows/parks
      const park = smoothstep(0.62, 0.66, n.fbm(u + 0.7, v + 0.1, 4, 4)) * (1 - forest);
      r = lerp(r, 0.32, park); g = lerp(g, 0.52, park); b = lerp(b, 0.2, park);
      // towns
      let town = 0;
      for (const t of towns) {
        const du = (u - t.u) * SW, dv = (v - t.v) * SL;
        const d = Math.sqrt(du * du + dv * dv);
        if (d < t.r) town = Math.max(town, smoothstep(t.r, t.r * 0.55, d) * t.dense);
      }
      if (town > 0.01) {
        const bx = (x % 12), by = (y % 14);
        const street = bx < 2 || by < 2;
        const roof = 0.45 + 0.35 * ((((Math.floor(x / 12) * 31) ^ (Math.floor(y / 14) * 17)) & 7) / 7);
        let tr = street ? 0.2 : roof * 0.95, tg = street ? 0.2 : roof * 0.9, tb = street ? 0.21 : roof * 0.86;
        r = lerp(r, tr, town); g = lerp(g, tg, town); b = lerp(b, tb, town);
        // street lights & windows (emissive)
        if (street && ((x * 7 + y * 13) % 9 === 0)) {
          const e = town * 1.0;
          eR[i] = e; eG[i] = e * 0.72; eB[i] = e * 0.42;
        } else if (!street && ((x * 31 + y * 17) % 23 === 0)) {
          const e = town * 0.6;
          eR[i] = e; eG[i] = e * 0.8; eB[i] = e * 0.55;
        }
      }
      // roads: along v at a few u, and across
      const roadA = Math.abs(u - (0.25 + 0.03 * Math.sin(v * 25))) * W < 1.4;
      const roadB = Math.abs(u - (0.76 + 0.02 * Math.sin(v * 31 + 1))) * W < 1.4;
      if ((roadA || roadB) && town < 0.5) {
        r = 0.33; g = 0.32; b = 0.3;
        if (y % 24 < 2) { eR[i] = 0.9; eG[i] = 0.7; eB[i] = 0.45; }
      }
      // river
      const rd = Math.abs(u - ru) * W;
      const rw = 6 + 3 * Math.sin(v * 40);
      if (rd < rw + 3) {
        const bank = smoothstep(rw + 3, rw, rd);
        r = lerp(r, 0.24, bank * 0.6); g = lerp(g, 0.3, bank * 0.6); b = lerp(b, 0.2, bank * 0.6);
        if (rd < rw) { r = 0.06; g = 0.16; b = 0.22; }
      }
      // lakes
      for (const L of lakes) {
        const du = (u - L.u) * SW, dv = (v - L.v) * SL;
        const dd = du * du + dv * dv;
        if (dd > L.r * L.r * 2) continue;
        const d = Math.sqrt(dd) / L.r * (1 + 0.3 * (n.noise(u, v, 32) - 0.5));
        if (d < 1) { r = 0.05; g = 0.14 + 0.03 * d; b = 0.2 + 0.04 * d; }
      }
      // edges of strip: retaining walls & promenades along the window strips
      const edge = Math.min(u, 1 - u) * W;
      if (edge < 10) {
        r = 0.55; g = 0.55; b = 0.52;
        if (edge < 3) { r = 0.25; g = 0.26; b = 0.27; }
        if (edge > 6 && edge < 7.5 && y % 10 < 3) { eR[i] = 1.0; eG[i] = 0.82; eB[i] = 0.55; }
      }
      R[i] = r; G[i] = g; B[i] = b;
    }
  }
  return {
    albedo: canvasTexture(writeRGB(makeCanvas(W, Hh), R, G, B), { srgb: true, repeat: false }),
    emissive: canvasTexture(writeRGB(makeCanvas(W, Hh), eR, eG, eB), { srgb: true, repeat: false }),
    towns,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Halo ring floor: dense terraced city with a central canal and linear parks                   */
/* ------------------------------------------------------------------------------------------ */
export function makeRingFloorTextures(W = 512, Hh = 4096, seed = 21) {
  const rng = new RNG(seed);
  const n = new TileNoise(seed, 512);
  const N = W * Hh;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const eR = new Float32Array(N), eG = new Float32Array(N), eB = new Float32Array(N);
  for (let y = 0; y < Hh; y++) {
    const v = y / Hh;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const i = y * W + x;
      const c = Math.abs(u - 0.5);
      let r, g, b;
      // central canal
      if (c < 0.035) { r = 0.04; g = 0.12; b = 0.18; }
      else if (c < 0.05) { r = 0.6; g = 0.58; b = 0.55; if (y % 16 < 3) { eR[i] = 1; eG[i] = 0.8; eB[i] = 0.55; } }
      else if (c < 0.17) {
        // linear park with trees
        const t = n.fbm(u, v, 16, 4);
        r = 0.18 + 0.15 * t; g = 0.36 + 0.2 * t; b = 0.12 + 0.06 * t;
        if (n.noise(u, v, 300) > 0.68) { r *= 0.5; g *= 0.6; b *= 0.5; }
      } else {
        // city blocks
        const bx = x % 22, by = y % 26;
        const street = bx < 3 || by < 3;
        const id = (Math.floor(x / 22) * 92837111) ^ (Math.floor(y / 26) * 689287499);
        const roof = 0.35 + 0.45 * ((id >>> 3) % 97) / 97;
        if (street) { r = 0.16; g = 0.16; b = 0.17; if ((x + y * 3) % 11 === 0) { eR[i] = 1; eG[i] = 0.75; eB[i] = 0.45; } }
        else {
          r = roof; g = roof * 0.97; b = roof * 0.93;
          if (((id >>> 5) % 9) === 0) { r = 0.22; g = 0.42; b = 0.17; } // roof gardens
          if ((x * 13 + y * 7) % 19 === 0) { const e = 0.7 * rng.range(0.4, 1); eR[i] = e; eG[i] = e * 0.82; eB[i] = e * 0.6; }
        }
      }
      // side terraces near the walls
      if (c > 0.46) { r = 0.5; g = 0.5; b = 0.5; if (y % 8 < 3 && x % 5 < 3) { eR[i] = 1; eG[i] = 0.78; eB[i] = 0.5; } }
      R[i] = r; G[i] = g; B[i] = b;
    }
  }
  return {
    albedo: canvasTexture(writeRGB(makeCanvas(W, Hh), R, G, B), { srgb: true }),
    emissive: canvasTexture(writeRGB(makeCanvas(W, Hh), eR, eG, eB), { srgb: true }),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Cloud deck (tileable alpha)                                                                  */
/* ------------------------------------------------------------------------------------------ */
export function makeCloudTexture(W = 1024, Hh = 1024) {
  const n = new TileNoise(77, 512);
  const N = W * Hh;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), A = new Float32Array(N);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / Hh;
    const i = y * W + x;
    const base = n.fbm2(u, v, 6, 10, 6);
    const det = n.fbm(u, v, 32, 4);
    const d = smoothstep(0.52, 0.78, base + 0.12 * (det - 0.5));
    const shade = 0.82 + 0.18 * det;
    R[i] = shade; G[i] = shade; B[i] = shade * 1.02 > 1 ? 1 : shade * 1.02;
    A[i] = d * 0.85;
  }
  return canvasTexture(writeRGB(makeCanvas(W, Hh), R, G, B, A), { srgb: true });
}

/* ------------------------------------------------------------------------------------------ */
/* Hangar interior glow (for bay openings)                                                      */
/* ------------------------------------------------------------------------------------------ */
export function makeBayTexture(W = 512, Hh = 256) {
  const c = makeCanvas(W, Hh);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, Hh);
  g.addColorStop(0, '#2a3446');
  g.addColorStop(0.5, '#0d121c');
  g.addColorStop(1, '#3a3020');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hh);
  // receding light rows
  for (let k = 0; k < 9; k++) {
    const y = 18 + k * 6;
    ctx.fillStyle = `rgba(255, 236, 200, ${0.9 - k * 0.08})`;
    for (let x = 30 + k * 12; x < W - 30 - k * 12; x += 18) ctx.fillRect(x, y, 8, 2);
  }
  // floor guide lines
  ctx.strokeStyle = 'rgba(120, 220, 255, 0.9)';
  ctx.lineWidth = 2;
  for (let k = -3; k <= 3; k++) {
    ctx.beginPath(); ctx.moveTo(W / 2 + k * 30, Hh); ctx.lineTo(W / 2 + k * 8, Hh * 0.55); ctx.stroke();
  }
  // silhouettes of parked craft
  ctx.fillStyle = 'rgba(5, 7, 12, 0.95)';
  for (let k = 0; k < 4; k++) {
    const x = 70 + k * 110, y = Hh * 0.72;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 70, y - 8); ctx.lineTo(x + 80, y + 12); ctx.lineTo(x + 6, y + 18); ctx.closePath(); ctx.fill();
  }
  // vignette edges
  const r = ctx.createRadialGradient(W / 2, Hh / 2, Hh * 0.2, W / 2, Hh / 2, W * 0.6);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, Hh);
  return canvasTexture(c, { srgb: true, repeat: false });
}
