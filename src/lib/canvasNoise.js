// Tileable value noise for procedural canvas textures (CPU side).
import { mulberry32 } from './rng.js';

export class TileNoise {
  // period: lattice cells per tile (integer) so the noise wraps seamlessly.
  constructor(seed = 7, size = 256) {
    const r = mulberry32(seed);
    this.size = size;
    this.v = new Float32Array(size * size);
    for (let i = 0; i < this.v.length; i++) this.v[i] = r();
  }
  lattice(ix, iy, period) {
    const s = this.size;
    ix = ((ix % period) + period) % period;
    iy = ((iy % period) + period) % period;
    return this.v[(iy % s) * s + (ix % s)];
  }
  // u, v in [0,1) tile space
  noise(u, v, period) {
    const x = u * period, y = v * period;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this.lattice(ix, iy, period), b = this.lattice(ix + 1, iy, period);
    const c = this.lattice(ix, iy + 1, period), d = this.lattice(ix + 1, iy + 1, period);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  fbm(u, v, period, octaves = 5, gain = 0.5) {
    let amp = 0.5, sum = 0, norm = 0, p = period;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(u, v, p);
      norm += amp;
      amp *= gain;
      p *= 2;
    }
    return sum / norm;
  }
  // anisotropic: separate periods in u and v (each must be an integer for tiling)
  noise2(u, v, pu, pv) {
    const x = u * pu, y = v * pv;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const l = (i, j) => this.v[((((j % pv) + pv) % pv) % this.size) * this.size + ((((i % pu) + pu) % pu) % this.size)];
    const a = l(ix, iy), b = l(ix + 1, iy), c = l(ix, iy + 1), d = l(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  fbm2(u, v, pu, pv, octaves = 5, gain = 0.5) {
    let amp = 0.5, sum = 0, norm = 0, a = pu, b = pv;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(u, v, a, b);
      norm += amp;
      amp *= gain;
      a *= 2; b *= 2;
    }
    return sum / norm;
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Write float RGB arrays (0..1, linear-ish "display" values) into a canvas.
export function writeRGB(canvas, r, g, b, a = null) {
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  const d = img.data;
  const n = canvas.width * canvas.height;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    d[j] = r[i] * 255 + 0.5;
    d[j + 1] = g[i] * 255 + 0.5;
    d[j + 2] = b[i] * 255 + 0.5;
    d[j + 3] = a ? a[i] * 255 + 0.5 : 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Height field -> tangent-space normal map (wrapping).
export function heightToNormal(h, w, hh, strength = 2) {
  const c = makeCanvas(w, hh);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, hh);
  const d = img.data;
  for (let y = 0; y < hh; y++) {
    const ym = ((y - 1 + hh) % hh) * w, yp = ((y + 1) % hh) * w, y0 = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (h[y0 + xp] - h[y0 + xm]) * strength;
      const dy = (h[yp + x] - h[ym + x]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= l; ny *= l; nz *= l;
      const j = (y0 + x) * 4;
      d[j] = (nx * 0.5 + 0.5) * 255;
      d[j + 1] = (ny * 0.5 + 0.5) * 255;
      d[j + 2] = (nz * 0.5 + 0.5) * 255;
      d[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
