// Life aboard and around the ark: shuttle traffic between bays, pylons and the rings, departures
// to the moon, maglev trains along the keel, spoke elevators and maintenance welding arcs.
import * as THREE from 'three';
import { Instancer, cyl, lathe } from '../lib/geo.js';
import { RNG, TAU, DEG, smoothstep, clamp } from '../lib/rng.js';
import { shuttleGeometry } from '../ship/craft.js';
import { LightSet, NAV } from '../ship/lights.js';
import { SPINE } from '../ship/spine.js';
import { SHIP, WORLD } from '../world.js';

const ease = (x) => x * x * (3 - 2 * x);
const easeTravel = (x) => {
  // accelerate, cruise, decelerate
  const a = 0.18;
  if (x < a) return (x * x) / (2 * a * (1 - a));
  if (x > 1 - a) return 1 - ((1 - x) * (1 - x)) / (2 * a * (1 - a));
  return (x - a / 2) / (1 - a);
};

class DynamicLights {
  constructor(set, parent, name) {
    this.points = set.build(parent, { name, minPx: 2.2 });
    this.attr = this.points.geometry.attributes.position;
    this.points.frustumCulled = false;
  }
  set(i, v) { this.attr.setXYZ(i, v.x, v.y, v.z); }
  commit() { this.attr.needsUpdate = true; }
}

export function buildTraffic(ship, M) {
  const group = new THREE.Group();
  group.name = 'traffic';
  const rng = new RNG(1234);
  const { bays } = ship.ctx;
  const updates = [];

  // ---------------------------------------------------------------- routes
  const routes = [];
  const pylonPhis = [30, 150, 270].map((a) => a * DEG);
  const nexusZ = (SHIP.nexus.z0 + SHIP.nexus.z1) / 2;
  const gapZ = (SHIP.ringA.z + SHIP.ringB.z) / 2;
  const moonDir = WORLD.moonCenter.clone().normalize();

  for (const bay of bays) {
    const out = (d) => bay.centre.clone().addScaledVector(bay.normal, d);
    const start = out(30);
    // Bay → Nexus pylon
    for (const pp of pylonPhis) {
      const mid = (bay.phi + pp) / 2 + (Math.abs(bay.phi - pp) > Math.PI ? Math.PI : 0);
      const pts = [start, out(140), out(320).setZ(bay.centre.z + 120), cyl(820, bay.phi, -500), cyl(860, mid, 300), cyl(820, pp, 1150), cyl(660, pp, nexusZ - 40), cyl(600, pp, nexusZ + 90)];
      routes.push({ curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), speed: rng.range(90, 140), wait: rng.range(6, 14), count: 2 });
    }
    // Bay → between the Halo rings → hub
    {
      const phi = bay.phi;
      const pts = [start, out(160), cyl(700, phi, -1000), cyl(1300, phi + 0.2, 200), cyl(1420, phi + 0.25, 1700), cyl(1400, phi + 0.25, gapZ), cyl(820, phi + 0.25, gapZ), cyl(260, phi + 0.25, gapZ)];
      routes.push({ curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), speed: rng.range(110, 160), wait: rng.range(8, 16), count: 2 });
    }
    // Departures toward the moon Ilex (and arrivals)
    {
      const far = moonDir.clone().multiplyScalar(26000).add(new THREE.Vector3(rng.range(-3000, 3000), rng.range(-2000, 2000), rng.range(-3000, 3000)));
      const pts = [start, out(260), out(900).add(new THREE.Vector3(0, 0, -300)), out(2600).lerp(far, 0.2), far];
      routes.push({ curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), speed: rng.range(260, 380), wait: rng.range(4, 10), count: 2 });
    }
  }
  // Bow ↔ Nexus courier runs
  for (const pp of pylonPhis) {
    const pts = [cyl(600, pp, nexusZ + 90), cyl(760, pp, nexusZ + 300), cyl(1350, pp + 0.6, 2000), cyl(1350, pp + 0.6, 2700), cyl(460, pp + 0.6, 3020), cyl(330, pp + 0.6, 3090)];
    routes.push({ curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), speed: rng.range(100, 150), wait: rng.range(10, 20), count: 1 });
  }
  // Security patrol loops (closed orbits around sections, clear of all structure)
  const loops = [];
  for (const [R, zc, A, speed, count] of [[1450, 600, 260, 85, 3], [1650, -2110, 160, 90, 3], [720, 3330, 90, 60, 2]]) {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, zc + A * Math.sin(2 * a)));
    }
    loops.push({ curve: new THREE.CatmullRomCurve3(pts, true, 'centripetal'), speed, count });
  }

  // Pre-measure
  for (const r of routes) { r.length = r.curve.getLength(); r.T = r.length / r.speed; }
  for (const l of loops) { l.length = l.curve.getLength(); l.T = l.length / l.speed; }

  // ---------------------------------------------------------------- shuttles
  const agents = [];
  for (const r of routes) for (let i = 0; i < r.count; i++) agents.push({ kind: 'route', r, phase: rng.range(0, 1), scale: rng.range(0.85, 1.35) });
  for (const l of loops) for (let i = 0; i < l.count; i++) agents.push({ kind: 'loop', r: l, phase: i / l.count + rng.range(0, 0.1), scale: 0.9 });

  const sGeo = shuttleGeometry(1);
  const shuttles = new THREE.InstancedMesh(sGeo, M.hullWarm, agents.length);
  shuttles.castShadow = true;
  shuttles.receiveShadow = true;
  shuttles.frustumCulled = false;
  shuttles.name = 'shuttles';
  group.add(shuttles);

  const sl = new LightSet();
  for (let i = 0; i < agents.length; i++) {
    sl.add(new THREE.Vector3(), new THREE.Color(0.55, 0.75, 1.0), { intensity: 14, size: 2.6 });
    sl.add(new THREE.Vector3(), new THREE.Color(0.55, 0.75, 1.0), { intensity: 14, size: 2.6 });
    sl.add(new THREE.Vector3(), NAV.white, { period: 1.3 + rng.range(0, 0.6), phase: rng.next(), duty: 0.06, size: 1.8, intensity: 14 });
  }
  const shuttleLights = new DynamicLights(sl, group, 'shuttle-lights');

  const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), tan = new THREE.Vector3(), up = new THREE.Vector3();
  const q = new THREE.Quaternion(), s = new THREE.Vector3();
  const eL = new THREE.Vector3(), eR = new THREE.Vector3(), strobe = new THREE.Vector3();
  const zero = new THREE.Vector3();

  updates.push((t) => {
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      let u, dir = 1;
      if (a.kind === 'route') {
        const R = a.r;
        const cycle = 2 * (R.T + R.wait);
        const c = ((t / cycle + a.phase) % 1) * cycle;
        if (c < R.T) { u = easeTravel(c / R.T); }
        else if (c < R.T + R.wait) { u = 1; }
        else if (c < 2 * R.T + R.wait) { u = 1 - easeTravel((c - R.T - R.wait) / R.T); dir = -1; }
        else { u = 0; dir = -1; }
      } else {
        u = ((t / a.r.T) + a.phase) % 1;
      }
      a.r.curve.getPointAt(clamp(u, 0, 1), pos);
      a.r.curve.getTangentAt(clamp(u, 0.0005, 0.9995), tan);
      if (dir < 0) tan.negate();
      up.set(pos.x, pos.y, 0).normalize();
      if (up.lengthSq() < 0.5) up.set(0, 1, 0);
      mtx.lookAt(tan, zero, up);
      q.setFromRotationMatrix(mtx);
      s.setScalar(a.scale);
      mtx.compose(pos, q, s);
      shuttles.setMatrixAt(i, mtx);
      // lights
      eL.set(-7.5 * a.scale, -0.8 * a.scale, -19 * a.scale).applyQuaternion(q).add(pos);
      eR.set(7.5 * a.scale, -0.8 * a.scale, -19 * a.scale).applyQuaternion(q).add(pos);
      strobe.set(0, 4 * a.scale, -14 * a.scale).applyQuaternion(q).add(pos);
      shuttleLights.set(i * 3, eL);
      shuttleLights.set(i * 3 + 1, eR);
      shuttleLights.set(i * 3 + 2, strobe);
    }
    shuttles.instanceMatrix.needsUpdate = true;
    shuttleLights.commit();
  });

  // ---------------------------------------------------------------- maglev trains
  {
    const trainGeo = lathe([[0.6, -36], [3.4, -32], [3.8, -20], [3.8, 20], [3.4, 32], [0.6, 36]], { segments: 10, tile: 12 });
    const trainMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.82, 0.6).multiplyScalar(3.2) });
    trainMat.userData.castShadow = false;
    const trains = [];
    for (const tube of SPINE.tubes) {
      for (let i = 0; i < 7; i++) trains.push({ tube, phase: rng.range(0, 1), speed: rng.range(110, 170), wait: rng.range(5, 12) });
    }
    const inst = new THREE.InstancedMesh(trainGeo, trainMat, trains.length);
    inst.frustumCulled = false;
    inst.castShadow = false;
    inst.name = 'trains';
    group.add(inst);
    const tl = new LightSet();
    for (let i = 0; i < trains.length; i++) tl.add(new THREE.Vector3(), NAV.white, { intensity: 10, size: 2.2 });
    const trainLights = new DynamicLights(tl, group, 'train-lights');
    const za = SPINE.z0 + 60, zb = SPINE.z1 - 60, len = zb - za;
    const p = new THREE.Vector3();
    updates.push((t) => {
      trains.forEach((tr, i) => {
        const T = len / tr.speed;
        const cycle = 2 * (T + tr.wait);
        const c = ((t / cycle + tr.phase) % 1) * cycle;
        let u, d = 1;
        if (c < T) u = easeTravel(c / T);
        else if (c < T + tr.wait) u = 1;
        else if (c < 2 * T + tr.wait) { u = 1 - easeTravel((c - T - tr.wait) / T); d = -1; }
        else { u = 0; d = -1; }
        const z = za + u * len;
        p.set(tr.tube.r * Math.cos(tr.tube.phi), tr.tube.r * Math.sin(tr.tube.phi), z);
        mtx.makeTranslation(p.x, p.y, p.z);
        inst.setMatrixAt(i, mtx);
        p.z += d * 37;
        trainLights.set(i, p);
      });
      inst.instanceMatrix.needsUpdate = true;
      trainLights.commit();
    });
  }

  // ---------------------------------------------------------------- spoke elevators
  for (const ring of [ship.parts.ringA, ship.parts.ringB]) {
    const cars = [];
    ring.spokes.forEach((sp, k) => { for (let i = 0; i < 2; i++) cars.push({ sp, phase: rng.range(0, 1), T: rng.range(26, 38) }); });
    const geo = new THREE.BoxGeometry(7, 7, 12);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.55).multiplyScalar(4) });
    const inst = new THREE.InstancedMesh(geo, mat, cars.length);
    inst.frustumCulled = false;
    inst.castShadow = false;
    ring.group.add(inst);
    const m = new THREE.Matrix4();
    updates.push((t) => {
      cars.forEach((c, i) => {
        const x = ((t / c.T + c.phase) % 1);
        const u = x < 0.5 ? ease(x * 2) : ease(2 - x * 2);
        const r = c.sp.r0 + 20 + u * (c.sp.r1 - c.sp.r0 - 40);
        const radial = new THREE.Vector3(Math.cos(c.sp.phi), Math.sin(c.sp.phi), 0);
        const tangent = new THREE.Vector3(-Math.sin(c.sp.phi), Math.cos(c.sp.phi), 0);
        m.makeBasis(tangent, new THREE.Vector3(0, 0, 1), radial);
        m.setPosition(radial.multiplyScalar(r).addScaledVector(tangent, (i % 2 ? 1 : -1) * 13.5));
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- welding arcs
  {
    const ws = new LightSet();
    const spots = [];
    for (const bay of bays) {
      for (let i = 0; i < 3; i++) spots.push(bay.centre.clone().addScaledVector(bay.tangent, rng.range(-90, 90)).addScaledVector(bay.normal, 4).setZ(bay.centre.z + rng.range(-150, 150)));
    }
    for (let i = 0; i < 8; i++) spots.push(cyl(176, rng.range(0, TAU), rng.range(SHIP.cargo.z0, SHIP.cargo.z1)));
    for (let i = 0; i < 6; i++) spots.push(cyl(212, rng.range(0, TAU), rng.range(SHIP.nexus.z0 + 80, SHIP.nexus.z1 - 80)));
    for (const p of spots) {
      ws.add(p, new THREE.Color(0.75, 0.88, 1.0), { intensity: 30, size: 1.0, period: rng.range(0.09, 0.23), phase: rng.next(), duty: rng.range(0.25, 0.6) });
    }
    ws.build(group, { name: 'welding', minPx: 1.6 });
  }

  return {
    group,
    update(t) { for (const f of updates) f(t); },
  };
}
