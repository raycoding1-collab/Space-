// Life around the capital ship: shuttles cycling through the ventral hangar bays, runs to the escort
// frigates and the moon, patrol orbits, maglev pods racing along the dorsal trench, welding arcs.
import * as THREE from 'three';
import { lathe } from '../lib/geo.js';
import { RNG, TAU, clamp } from '../lib/rng.js';
import { shuttleGeometry } from '../ship/craft.js';
import { LightSet, NAV, lightUniforms } from '../ship/lights.js';
import { LOGDEPTH_VERT_PARS, LOGDEPTH_VERT, LOGDEPTH_FRAG_PARS, LOGDEPTH_FRAG } from '../lib/glsl.js';
import { hullParams } from '../ship/hull.js';
import { TRENCH } from '../ship/capital.js';
import { WORLD } from '../world.js';

const ease = (x) => x * x * (3 - 2 * x);
const easeTravel = (x) => {
  const a = 0.2;
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
  const bays = ship.ctx.bays;
  const updates = [];
  const routes = [];
  const moonDir = WORLD.moonCenter.clone().normalize();
  const escortSpots = [new THREE.Vector3(1900, 420, 900), new THREE.Vector3(-2100, -380, 300), new THREE.Vector3(1500, -700, -1700), new THREE.Vector3(-1350, 820, 2100)];

  bays.forEach((bay, bi) => {
    const out = (d) => bay.centre.clone().addScaledVector(bay.normal, d);
    const start = out(-6);
    const side = Math.sign(bay.centre.x) || 1;
    // departures toward the moon
    {
      const far = moonDir.clone().multiplyScalar(24000).add(new THREE.Vector3(rng.range(-2500, 2500), rng.range(-2000, 2000), rng.range(-2500, 2500)));
      const pts = [start, out(70), out(320), out(900).add(new THREE.Vector3(0, -200, -400)), out(2600).lerp(far, 0.25), far];
      routes.push({ curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), speed: rng.range(240, 360), wait: rng.range(4, 10), count: 2 });
    }
    // runs to an escort frigate on the same side
    {
      const cands = escortSpots.filter((p) => Math.sign(p.x) === side);
      const tgt = cands[bi % cands.length].clone();
      const dock = tgt.clone().add(new THREE.Vector3(-side * 60, -40, 0));
      const mid = new THREE.Vector3(side * 1250, Math.min(-200, tgt.y - 300), (bay.centre.z + tgt.z) / 2);
      const pts = [start, out(70), out(380), mid, dock];
      routes.push({ curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), speed: rng.range(110, 170), wait: rng.range(8, 16), count: 1 });
    }
    // sweeping arrivals from aft
    {
      const pts = [new THREE.Vector3(side * 1700, -900, -6500 + bi * 300), new THREE.Vector3(side * 900, -650, -3200), out(700), out(240), out(60), start];
      routes.push({ curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), speed: rng.range(150, 230), wait: rng.range(6, 12), count: 1 });
    }
  });

  // Patrol orbits (closed, clear of the hull, nacelles and escorts)
  const loops = [];
  for (const [R, zc, A, speed, count, tilt] of [[1500, -200, 300, 95, 4, 0.15], [1750, -1900, 200, 85, 3, -0.2], [880, 2300, 120, 70, 3, 0.3]]) {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const p = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, zc + A * Math.sin(2 * a));
      p.applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
      pts.push(p);
    }
    loops.push({ curve: new THREE.CatmullRomCurve3(pts, true, 'centripetal'), speed, count });
  }
  for (const r of routes) { r.length = r.curve.getLength(); r.T = r.length / r.speed; }
  for (const l of loops) { l.length = l.curve.getLength(); l.T = l.length / l.speed; }

  // ---------------------------------------------------------------- shuttles
  const agents = [];
  for (const r of routes) for (let i = 0; i < r.count; i++) agents.push({ kind: 'route', r, phase: rng.range(0, 1), scale: rng.range(0.9, 1.4) });
  for (const l of loops) for (let i = 0; i < l.count; i++) agents.push({ kind: 'loop', r: l, phase: i / l.count + rng.range(0, 0.1), scale: 1.1 });

  const shuttles = new THREE.InstancedMesh(shuttleGeometry(1), M.armorLight, agents.length);
  shuttles.castShadow = true;
  shuttles.receiveShadow = true;
  shuttles.frustumCulled = false;
  shuttles.name = 'shuttles';
  group.add(shuttles);

  const sl = new LightSet();
  for (let i = 0; i < agents.length; i++) {
    sl.add(new THREE.Vector3(), new THREE.Color(0.5, 0.75, 1.0), { intensity: 12, size: 2.6 });
    sl.add(new THREE.Vector3(), new THREE.Color(0.5, 0.75, 1.0), { intensity: 12, size: 2.6 });
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
        if (c < R.T) u = easeTravel(c / R.T);
        else if (c < R.T + R.wait) u = 1;
        else if (c < 2 * R.T + R.wait) { u = 1 - easeTravel((c - R.T - R.wait) / R.T); dir = -1; }
        else { u = 0; dir = -1; }
      } else {
        u = ((t / a.r.T) + a.phase) % 1;
      }
      a.r.curve.getPointAt(clamp(u, 0, 1), pos);
      a.r.curve.getTangentAt(clamp(u, 0.0005, 0.9995), tan);
      if (dir < 0) tan.negate();
      up.set(0, 1, 0);
      mtx.lookAt(tan, zero, up);
      q.setFromRotationMatrix(mtx);
      s.setScalar(a.scale);
      mtx.compose(pos, q, s);
      shuttles.setMatrixAt(i, mtx);
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

  // ---------------------------------------------------------------- maglev pods in the dorsal trench
  {
    const podGeo = lathe([[0.6, -22], [3.0, -19], [3.4, -10], [3.4, 10], [3.0, 19], [0.6, 22]], { segments: 10, tile: 12 });
    const podMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.55).multiplyScalar(3.0) });
    podMat.userData.castShadow = false;
    const pods = [];
    for (const lane of [-8, 8, -19.5, 19.5]) for (let i = 0; i < 5; i++) pods.push({ lane, phase: rng.range(0, 1), speed: rng.range(120, 190) * (lane > 0 ? 1 : -1), wait: rng.range(3, 8) });
    const inst = new THREE.InstancedMesh(podGeo, podMat, pods.length);
    inst.frustumCulled = false;
    inst.name = 'pods';
    group.add(inst);
    const pl = new LightSet();
    for (let i = 0; i < pods.length; i++) pl.add(new THREE.Vector3(), NAV.white, { intensity: 9, size: 2 });
    const podLights = new DynamicLights(pl, group, 'pod-lights');
    const za = TRENCH.z0 + 40, zb = TRENCH.z1 - 60, len = zb - za;
    const p = new THREE.Vector3();
    updates.push((t) => {
      pods.forEach((pd, i) => {
        const T = len / Math.abs(pd.speed);
        const cycle = T + pd.wait;
        const c = ((t / cycle + pd.phase) % 1) * cycle;
        const u = c < T ? easeTravel(c / T) : 1;
        const z = pd.speed > 0 ? za + u * len : zb - u * len;
        const hp = hullParams(z);
        p.set(pd.lane, hp.Ht - hp.td + 5.5, z);
        mtx.makeTranslation(p.x, p.y, p.z);
        inst.setMatrixAt(i, mtx);
        p.z += Math.sign(pd.speed) * 23;
        podLights.set(i, p);
      });
      inst.instanceMatrix.needsUpdate = true;
      podLights.commit();
    });
  }

  // ---------------------------------------------------------------- welding arcs
  {
    const ws = new LightSet();
    for (let i = 0; i < 26; i++) {
      const z = rng.range(-2300, 2000);
      const hp = hullParams(z);
      const sx = rng.sign();
      const pick = rng.int(0, 2);
      const v = pick === 0 ? new THREE.Vector3(sx * rng.range(0.1, 0.4) * hp.W, hp.Ht + 6, z)
        : pick === 1 ? new THREE.Vector3(sx * (hp.W * 0.86), hp.Ht * 0.45, z)
          : new THREE.Vector3(sx * rng.range(0.4, 0.75) * hp.W, -hp.Hb * 0.8, z);
      ws.add(v, new THREE.Color(0.75, 0.88, 1.0), { intensity: 30, size: 1.0, period: rng.range(0.09, 0.23), phase: rng.next(), duty: rng.range(0.25, 0.6) });
    }
    ws.build(group, { name: 'welding', minPx: 1.6 });
  }

  // ---------------------------------------------------------------- traffic lanes (GPU-animated)
  {
    const lanes = [
      [1380, 260, -1, 190], [1560, -160, 1, 240], [-1420, 220, 1, 210], [-1300, -320, -1, 170], [240, 1250, 1, 260], [-180, -1150, -1, 200],
    ];
    const perLane = 110;
    const seeds = [], laneIdx = [], pos = [];
    for (let l = 0; l < lanes.length; l++) for (let i = 0; i < perLane; i++) { seeds.push(rng.next()); laneIdx.push(l); pos.push(0, 0, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    g.setAttribute('aLane', new THREE.Float32BufferAttribute(laneIdx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20000);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: lightUniforms.uTime, uPx: lightUniforms.uPx, uViewH: lightUniforms.uViewH,
        uLanes: { value: lanes.map((l) => new THREE.Vector4(...l)) },
        uZ0: { value: -9000 }, uL: { value: 19000 },
      },
      vertexShader: `
        ${LOGDEPTH_VERT_PARS}
        attribute float aSeed; attribute float aLane;
        uniform float uTime; uniform float uPx; uniform float uViewH; uniform vec4 uLanes[6]; uniform float uZ0; uniform float uL;
        varying vec3 vCol; varying float vFade;
        void main() {
          vec4 L = uLanes[int(aLane + 0.5)];
          float z = uZ0 + mod(aSeed * uL + L.z * uTime * L.w * (0.85 + 0.3 * fract(aSeed * 17.0)), uL);
          float ph = aSeed * 61.0;
          vec3 p = vec3(L.x + 70.0 * sin(z * 0.0009 + aLane) + 30.0 * sin(ph), L.y + 45.0 * sin(z * 0.0007 + aLane * 2.0) + 22.0 * cos(ph * 1.3), z);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = max(-mv.z, 1.0);
          float px = 2.6 * projectionMatrix[1][1] * uViewH * 0.5 / dist;
          gl_PointSize = clamp(max(px * 6.0, 1.8 * uPx), 1.0, 48.0);
          vFade = smoothstep(uZ0, uZ0 + 1800.0, z) * (1.0 - smoothstep(uZ0 + uL - 1800.0, uZ0 + uL, z));
          vCol = L.z > 0.0 ? vec3(0.75, 0.88, 1.0) * 3.6 : vec3(1.0, 0.45, 0.2) * 3.2;
          ${LOGDEPTH_VERT}
        }`,
      fragmentShader: `
        ${LOGDEPTH_FRAG_PARS}
        varying vec3 vCol; varying float vFade;
        void main() {
          vec2 q = (gl_PointCoord - 0.5) * 2.0;
          float r = length(q);
          float I = (exp(-r * r * 20.0) * 1.6 + exp(-r * 4.5) * 0.3) * (1.0 - smoothstep(0.85, 1.0, r));
          if (I * vFade < 0.003) discard;
          gl_FragColor = vec4(vCol * I * vFade, 1.0);
          ${LOGDEPTH_FRAG}
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.name = 'traffic-lanes';
    group.add(pts);
  }

  // ---------------------------------------------------------------- maintenance drone swarms
  {
    const anchors = [];
    const addAnchor = (p, n, R) => anchors.push({ p, n, R });
    for (const bay of bays) addAnchor(bay.centre.clone().addScaledVector(bay.normal, 30), 5, 35);
    for (const z of [-1700, -1400, -1100]) for (const s of [-1, 1]) { const hp = hullParams(z); addAnchor(new THREE.Vector3(s * 150, hp.Ht + 90, z), 4, 45); }
    for (const z of [-600, 600, 1400, 2200]) for (const s of [-1, 1]) { const hp = hullParams(z); addAnchor(new THREE.Vector3(s * hp.W * 0.7, hp.Ht * 0.6 + 20, z), 4, 40); }
    for (const s of [-1, 1]) addAnchor(new THREE.Vector3(s * 830, 70, -1600), 5, 60);
    addAnchor(new THREE.Vector3(0, -60, -2700), 6, 120);
    const drones = [];
    const dl = new LightSet();
    for (const a of anchors) for (let i = 0; i < a.n; i++) {
      drones.push({ a, f: [rng.range(0.05, 0.16), rng.range(0.05, 0.16), rng.range(0.05, 0.16)], ph: [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)], R: a.R * rng.range(0.4, 1) });
      dl.add(new THREE.Vector3(), rng.chance(0.5) ? NAV.amber : NAV.white, { intensity: 8, size: 0.9, period: rng.range(0.8, 1.6), phase: rng.next(), duty: 0.35 });
    }
    const droneLights = new DynamicLights(dl, group, 'drones');
    const v = new THREE.Vector3();
    updates.push((t) => {
      drones.forEach((d, i) => {
        v.set(Math.sin(t * d.f[0] + d.ph[0]) * d.R, Math.sin(t * d.f[1] + d.ph[1]) * d.R * 0.5, Math.cos(t * d.f[2] + d.ph[2]) * d.R).add(d.a.p);
        droneLights.set(i, v);
      });
      droneLights.commit();
    });
  }

  return { group, update(t) { for (const f of updates) f(t); } };
}
