// Life in ELYSION: the elevated maglev network with pods, streams of air traffic over the rooftops and
// around the spire, ferries running between the harbours and VESPERA, maintenance drones, warning
// beacons on the supertall towers — and VESPERA herself, flying escort.
import * as THREE from 'three';
import { Shape, Z, rect } from './geo.js';
import { RNG, TAU } from '../lib/rng.js';
import { TRANSIT, groundY, SPIRE, HALO, Z_BOW, Z_STERN, halfWidth } from './layout.js';
import { glassShellMat } from './domes.js';
import { LightSet, NAV } from '../ship/lights.js';
import { makeConduitMaterial } from '../ship/conduit.js';
import { createMaterials } from '../ship/materials.js';
import { buildCapitalShip } from '../ship/capital.js';
import { WORLD } from '../world.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _t = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);

function aircar() {
  const s = new Shape();
  const sec = (z, w, h, y = 0) => [[-w / 2, y, z], [w / 2, y, z], [w * 0.35, y + h, z], [-w * 0.35, y + h, z]];
  s.loft([sec(-6, 0.5, 0.5, 0.6), sec(-4, 4.4, 2.2), sec(3, 4.0, 2.6), sec(6.5, 1.2, 0.8, 0.7)], Z.METAL, { closed: true, crease: 40 });
  s.prism(rect(2.6, 3.4, 0, 1.2), 2.2, 3.0, Z.DARKGLASS, Z.DARKGLASS);
  return s;
}
function pod() {
  const s = new Shape();
  const N = 10, secs = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -16 + 32 * t;
    const r = 4.2 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + t * 0.92)), 0.35);
    const ring = [];
    for (let j = 0; j < 10; j++) { const a = (j / 10) * TAU; ring.push([Math.cos(a) * r, Math.sin(a) * r * 0.9, z]); }
    secs.push(ring);
  }
  s.loft(secs, Z.GLASS, { closed: true, crease: 70, zoneFn: (i, j) => (j >= 6 && j <= 8 ? Z.METAL : (i === 0 || i === N - 1 ? Z.TRIM : Z.GLASS)) });
  return s;
}
function ferry() {
  const s = new Shape();
  const secs = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, z = -60 + 120 * t;
    const w = 26 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t)), 0.5) + 2, h = 16 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t)), 0.5) + 2;
    secs.push([[-w / 2, -h / 2, z], [w / 2, -h / 2, z], [w / 2, h / 2, z], [0, h * 0.75, z], [-w / 2, h / 2, z]]);
  }
  s.loft(secs, Z.FACADE, { closed: true, crease: 35 });
  for (const x of [-8, 8]) s.prism([[x - 3, -64], [x + 3, -64], [x + 3, -58], [x - 3, -58]], -3, 3, Z.TRIM, Z.TRIM);
  return s;
}

/** Instanced movers along curves: matrices and paired light sprites updated every frame. */
class Movers {
  constructor(parent, geo, mat, style, list, lightDefs, name) {
    this.list = list;
    if (style !== null) geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(list.length).fill(style), 1));
    this.mesh = new THREE.InstancedMesh(geo, mat, list.length);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.name = name;
    parent.add(this.mesh);
    const L = new LightSet();
    this.ld = lightDefs;
    for (let i = 0; i < list.length; i++) for (const d of lightDefs) L.add(new THREE.Vector3(), d.color, d.opts);
    this.pts = L.build(parent, { name: name + '-lights', minPx: 1.6 });
    this.pts.frustumCulled = false;
    this.attr = this.pts.geometry.attributes.position;
  }
  update(t) {
    const nl = this.ld.length;
    this.list.forEach((m, i) => {
      let u = (m.ph + t * m.speed / m.len) % 1;
      if (u < 0) u += 1;
      m.curve.getPointAt(u, _p);
      m.curve.getTangentAt(u, _t);
      if (m.dir < 0) _t.negate();
      if (m.off) _p.add(m.off);
      _q.setFromUnitVectors(_z, _t);
      _s.setScalar(m.scale || 1);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      for (let k = 0; k < nl; k++) {
        const o = this.ld[k].at;
        const v = new THREE.Vector3(o[0], o[1], o[2]).multiplyScalar(m.scale || 1).applyQuaternion(_q).add(_p);
        this.attr.setXYZ(i * nl + k, v.x, v.y, v.z);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.attr.needsUpdate = true;
  }
}

export function buildLife(M, ctx, { envTex, quality, lib }) {
  const root = new THREE.Group();
  root.name = 'life';
  const rng = new RNG(777);
  const lights = new LightSet();
  const movers = [];

  // ---------------------------------------------------------------- maglev network
  const glass = glassShellMat(envTex, { tint: new THREE.Color(0.6, 0.75, 0.85) });
  const railMat = makeConduitMaterial({ color: new THREE.Vector3(0.35, 0.82, 1.0), axis: new THREE.Vector3(0, 0, 1), speed: 200, base: 0.9, packet: 2.5, spacing: 140 });
  const pylon = new Shape();
  const podList = [];
  const curves = TRANSIT.map((r) => new THREE.CatmullRomCurve3(r.pts.map((p) => new THREE.Vector3(...p)), r.closed, 'centripetal'));
  ctx.transit = curves;
  curves.forEach((curve, k) => {
    const len = curve.getLength();
    const segs = Math.max(20, Math.round(len / 40));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 11, 12, TRANSIT[k].closed), glass);
    tube.renderOrder = 3;
    root.add(tube);
    const guide = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 2.2, 6, TRANSIT[k].closed), M.steelPlain);
    guide.position.y = -8;
    guide.castShadow = true;
    root.add(guide);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.8, 5, TRANSIT[k].closed), railMat);
    rail.position.y = -5.6;
    root.add(rail);
    // pylons
    const n = Math.floor(len / 230);
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / Math.max(1, n));
      const gy = groundY(p.x, p.z);
      if (p.y - gy < 20) continue;
      pylon.prism(rect(7, 7, p.x, p.z), gy, p.y - 10, Z.STONE, null);
      pylon.prism(rect(26, 5, p.x, p.z), p.y - 13, p.y - 9, Z.METAL, Z.METAL);
      lights.add(new THREE.Vector3(p.x, p.y + 12, p.z), NAV.warm, { intensity: 2.5, size: 2 });
    }
    // pods
    const count = Math.max(2, Math.round(len / 1400));
    for (let i = 0; i < count; i++) {
      const dir = TRANSIT[k].closed ? 1 : (i % 2 ? 1 : -1);
      podList.push({ curve, len, ph: i / count + rng.range(0, 0.05), speed: dir * rng.range(110, 160), dir, off: new THREE.Vector3(0, -1, 0) });
    }
  });
  const pyl = new THREE.Mesh(pylon.toGeometry(), M.stone);
  pyl.castShadow = true; pyl.receiveShadow = true;
  root.add(pyl);
  movers.push(new Movers(root, pod().toGeometry(), M.buildings, M.style.shipWhite, podList, [
    { at: [0, 0, 17], color: new THREE.Color(1.0, 0.95, 0.85), opts: { intensity: 7, size: 3 } },
    { at: [0, 0, -17], color: NAV.red, opts: { intensity: 4, size: 2 } },
  ], 'pods'));

  // ---------------------------------------------------------------- sky traffic
  const lanes = [];
  const lane = (pts, closed = false) => { const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, 'centripetal'); lanes.push(c); return c; };
  for (const x of [-3300, -1900, 1900, 3300]) {
    for (const [dy, dx] of [[0, -35], [40, 35]]) {
      const pts = [];
      for (let z = Z_STERN + 1200; z <= Z_BOW - 2600; z += 1500) {
        const W = halfWidth(z);
        const xx = Math.sign(x) * Math.min(Math.abs(x), W - 400) + dx;
        const y = 420 + dy + (Math.abs(z - SPIRE.z) < 5000 ? 520 : 0) + 120 * Math.sin(z * 0.0004 + x);
        pts.push([xx, y, z]);
      }
      lane(pts);
    }
  }
  for (const [r, y] of [[2300, 1150], [2700, 1650], [3200, 900], [2050, 2950]]) {
    const pts = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; pts.push([SPIRE.x + Math.sin(a) * r, y + 60 * Math.sin(a * 3), SPIRE.z + Math.cos(a) * r * 1.05]); }
    lane(pts, true);
  }
  // cross-town lanes from the harbours to the spire
  for (const z of [-6100, 1400, -11000, 6100]) {
    for (const s of [-1, 1]) lane([[s * 6600, -300, z], [s * 5600, 300, z], [s * 3000, 600, z + (SPIRE.z - z) * 0.3], [s * 1800, 1000, SPIRE.z + (z - SPIRE.z) * 0.5]]);
  }
  const carList = [];
  lanes.forEach((c, k) => {
    const len = c.getLength();
    const n = Math.round(len / 260);
    const dir = k % 2 ? 1 : -1;
    for (let i = 0; i < n; i++) carList.push({ curve: c, len, ph: i / n + rng.range(-0.002, 0.002), speed: dir * rng.range(70, 110), dir, scale: rng.range(0.9, 1.6) });
  });
  movers.push(new Movers(root, aircar().toGeometry(), M.buildings, M.style.shipDark, carList, [
    { at: [0, 0.8, 6.6], color: new THREE.Color(1.0, 0.96, 0.9), opts: { intensity: 5, size: 1.6 } },
    { at: [0, 0.8, -6.2], color: NAV.red, opts: { intensity: 3.5, size: 1.4 } },
  ], 'aircars'));

  // ---------------------------------------------------------------- VESPERA, flying escort
  {
    const VM = createMaterials({ texSize: quality.texSize, aniso: quality.aniso });
    const vctx = { animated: [], tex: {} };
    const v = buildCapitalShip(VM, vctx);
    v.root.traverse((o) => {
      if (o.isMesh && o.material && o.material.userData) {
        if (o.material.userData.castShadow === false) o.castShadow = false;
        if (o.material.userData.receiveShadow === false) o.receiveShadow = false;
      }
    });
    const holder = new THREE.Group();
    holder.name = 'VESPERA-escort';
    holder.add(v.root);
    const base = new THREE.Vector3(9900, 3300, 3200);
    holder.position.copy(base);
    root.add(holder);
    ctx.vespera = holder;
    ctx.animated.push((t) => {
      for (const f of vctx.animated) f(t);
      holder.position.set(base.x + 60 * Math.sin(t * 0.02), base.y + 30 * Math.sin(t * 0.031), base.z + 80 * Math.sin(t * 0.013));
      holder.rotation.set(0.006 * Math.sin(t * 0.04), 0.01 * Math.sin(t * 0.017), -0.04 + 0.01 * Math.sin(t * 0.023));
    });
    // ferries between the starboard harbours and VESPERA's hangar bays
    const ferries = [];
    for (const pz of [1400, -1100, 3900]) {
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(8300, -620, pz), new THREE.Vector3(8900, -200, pz + 200), new THREE.Vector3(9700, 900, (pz + base.z) / 2),
        new THREE.Vector3(base.x + 300, base.y - 300, base.z - 300), new THREE.Vector3(base.x + 60, base.y - 160, base.z - 420),
      ], false, 'centripetal');
      const len = c.getLength();
      for (let i = 0; i < 3; i++) ferries.push({ curve: c, len, ph: i / 3, speed: (i % 2 ? 1 : -1) * 60, dir: i % 2 ? 1 : -1, scale: 1 });
    }
    // and out to the moon Ilex
    const moonDir = WORLD.moonCenter.clone().normalize();
    for (const pz of [-6100, -8600]) {
      for (const s of [-1, 1]) {
        const start = new THREE.Vector3(s * 8100, -620, pz);
        const far = moonDir.clone().multiplyScalar(30000).add(new THREE.Vector3(s * 2000, 0, pz));
        const c = new THREE.CatmullRomCurve3([start, start.clone().add(new THREE.Vector3(s * 800, 200, 300)), start.clone().lerp(far, 0.3).add(new THREE.Vector3(0, 1500, 0)), far], false, 'centripetal');
        const len = c.getLength();
        for (let i = 0; i < 3; i++) ferries.push({ curve: c, len, ph: i / 3 + rng.next() * 0.1, speed: 160, dir: 1, scale: 1.4 });
      }
    }
    movers.push(new Movers(root, ferry().toGeometry(), M.buildings, M.style.shipWhite, ferries, [
      { at: [0, 0, 62], color: NAV.white, opts: { intensity: 10, size: 3 } },
      { at: [0, 0, -66], color: new THREE.Color(0.5, 0.75, 1.0), opts: { intensity: 9, size: 5 } },
      { at: [14, 0, 0], color: NAV.green, opts: { intensity: 5, size: 2 } },
      { at: [-14, 0, 0], color: NAV.red, opts: { intensity: 5, size: 2 } },
    ], 'ferries'));
  }

  // ---------------------------------------------------------------- drones and beacons
  {
    const D = new LightSet();
    const drones = [];
    const crown = ctx.crownTop || new THREE.Vector3(SPIRE.x, SPIRE.top, SPIRE.z);
    for (let i = 0; i < 70; i++) {
      const c = i < 40 ? crown.clone().add(new THREE.Vector3(0, -rng.range(200, 1600), 0)) : new THREE.Vector3(SPIRE.x, HALO.y + 30, SPIRE.z);
      const r = i < 40 ? rng.range(120, 420) : HALO.r + rng.range(-120, 120);
      drones.push({ c, r, ph: rng.range(0, TAU), sp: rng.range(0.05, 0.2) * rng.sign() * (i < 40 ? 1 : 0.1), dy: rng.range(10, 60) });
      D.add(new THREE.Vector3(), i % 3 ? NAV.white : NAV.cyan, { intensity: 4, size: 1.5, period: 1.1, phase: rng.next(), duty: 0.5 });
    }
    const pts = D.build(root, { name: 'drones', minPx: 1.4 });
    pts.frustumCulled = false;
    const attr = pts.geometry.attributes.position;
    ctx.animated.push((t) => {
      drones.forEach((d, i) => {
        const a = d.ph + t * d.sp;
        attr.setXYZ(i, d.c.x + Math.sin(a) * d.r, d.c.y + Math.sin(a * 2.3) * d.dy, d.c.z + Math.cos(a) * d.r);
      });
      attr.needsUpdate = true;
    });
    for (const [x, y, z] of (lib ? lib.tops : [])) lights.add(new THREE.Vector3(x, y, z), NAV.red, { intensity: 7, size: 5, period: 2.2, phase: (x * 0.0007 + z * 0.0003) % 1, duty: 0.25 });
  }

  lights.build(root, { name: 'life-lights' });
  ctx.animated.push((t) => { for (const m of movers) m.update(t); });
  for (const m of movers) m.update(0);
  return root;
}
