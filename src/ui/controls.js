// Camera rig: orbit (inspect), fly (6-DOF free flight), tour (cinematic), and smooth fly-to arcs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp } from '../lib/rng.js';

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.mode = 'orbit';
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.06;
    this.orbit.rotateSpeed = 0.55;
    this.orbit.zoomSpeed = 1.1;
    this.orbit.panSpeed = 0.9;
    this.orbit.minDistance = 25;
    this.orbit.maxDistance = 90000;
    this.orbit.zoomToCursor = true;
    this.orbit.screenSpacePanning = true;
    this.transition = null;
    this.onModeChange = null;

    // fly state
    this.keys = new Set();
    this.vel = new THREE.Vector3();
    this.flySpeed = 160;
    this.look = { dx: 0, dy: 0 };
    this.dragging = false;
    this._bindFly();
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.orbit.enabled = mode === 'orbit';
    if (mode === 'orbit') {
      // re-target in front of the camera at a sensible distance
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      const d = clamp(this.camera.position.length() * 0.6, 200, 8000);
      this.orbit.target.copy(this.camera.position).addScaledVector(dir, d);
      this.orbit.update();
    }
    if (mode !== 'fly' && document.pointerLockElement) document.exitPointerLock();
    this.vel.set(0, 0, 0);
    this.onModeChange?.(mode);
  }

  /** Smoothly fly the camera along an arc to (pos, target). */
  flyTo(pos, target, { duration = null, fov = null, onDone = null } = {}) {
    const p0 = this.camera.position.clone();
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const t0 = this.mode === 'orbit' ? this.orbit.target.clone() : p0.clone().addScaledVector(dir, p0.distanceTo(target));
    const dist = p0.distanceTo(pos);
    const dur = duration ?? clamp(2.2 + Math.log10(1 + dist) * 1.1, 2.5, 7.5);
    // control point lifted away from the ship axis to avoid flying through structure
    const mid = p0.clone().add(pos).multiplyScalar(0.5);
    const radial = new THREE.Vector3(mid.x, mid.y, 0);
    if (radial.lengthSq() < 1) radial.set(1, 0.4, 0);
    radial.normalize();
    const lift = Math.max(600, dist * 0.35);
    const ctrl = mid.clone().addScaledVector(radial, lift);
    this.transition = {
      p0, p1: pos.clone(), c: ctrl, t0, t1: target.clone(), start: performance.now() / 1000, dur,
      fov0: this.camera.fov, fov1: fov ?? this.camera.fov, onDone,
    };
  }

  cancelTransition() { this.transition = null; }

  set(pos, target, fov = null) {
    this.camera.position.copy(pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    if (fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.orbit.target.copy(target);
    this.orbit.update();
  }

  update(dt) {
    const cam = this.camera;
    if (this.transition) {
      const tr = this.transition;
      const x = clamp((performance.now() / 1000 - tr.start) / tr.dur, 0, 1);
      const e = ease(x);
      // quadratic bezier
      const a = tr.p0.clone().lerp(tr.c, e), b = tr.c.clone().lerp(tr.p1, e);
      cam.position.copy(a.lerp(b, e));
      const tgt = tr.t0.clone().lerp(tr.t1, ease(clamp(x * 1.15, 0, 1)));
      cam.up.set(0, 1, 0);
      cam.lookAt(tgt);
      cam.fov = THREE.MathUtils.lerp(tr.fov0, tr.fov1, e);
      cam.updateProjectionMatrix();
      if (x >= 1) {
        this.transition = null;
        this.orbit.target.copy(tr.t1);
        if (this.mode === 'orbit') this.orbit.update();
        tr.onDone?.();
      }
      return;
    }
    if (this.mode === 'orbit') {
      // scale zoom/pan sensitivity with distance so both 30 m and 30 km feel right
      this.orbit.update();
    } else if (this.mode === 'fly') {
      this._updateFly(dt);
    }
  }

  // ------------------------------------------------------------------ fly mode
  _bindFly() {
    const dom = this.dom;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('mousedown', (e) => {
      if (this.mode !== 'fly') return;
      if (e.button === 0 && dom.requestPointerLock) dom.requestPointerLock();
      this.dragging = true;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.mode !== 'fly') return;
      if (document.pointerLockElement === dom || this.dragging) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    dom.addEventListener('wheel', (e) => {
      if (this.mode !== 'fly') return;
      e.preventDefault();
      this.flySpeed = clamp(this.flySpeed * (e.deltaY > 0 ? 0.82 : 1.22), 4, 6000);
      this.onSpeed?.(this.flySpeed);
    }, { passive: false });
    // touch: one finger looks, two fingers move forward
    let lastTouch = null;
    dom.addEventListener('touchstart', (e) => { lastTouch = e.touches[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY, n: e.touches.length } : null; }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      if (this.mode !== 'fly' || !lastTouch) return;
      const t = e.touches[0];
      this.look.dx += (t.clientX - lastTouch.x) * 2;
      this.look.dy += (t.clientY - lastTouch.y) * 2;
      this.touchForward = e.touches.length >= 2;
      lastTouch = { x: t.clientX, y: t.clientY, n: e.touches.length };
    }, { passive: true });
    dom.addEventListener('touchend', () => { this.touchForward = false; lastTouch = null; }, { passive: true });
  }

  _updateFly(dt) {
    const cam = this.camera;
    const k = this.keys;
    // look
    const sens = 0.0021 * (cam.fov / 55);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.look.dx * sens);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.look.dy * sens);
    let roll = 0;
    if (k.has('KeyQ')) roll += 1;
    if (k.has('KeyE')) roll -= 1;
    const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll * dt * 0.9);
    cam.quaternion.multiply(qYaw).multiply(qPitch).multiply(qRoll);
    this.look.dx = this.look.dy = 0;
    // move
    const f = new THREE.Vector3();
    if (k.has('KeyW') || k.has('ArrowUp') || this.touchForward) f.z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f.z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) f.x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) f.x += 1;
    if (k.has('KeyR') || k.has('Space')) f.y += 1;
    if (k.has('KeyF') || k.has('ControlLeft') || k.has('KeyC')) f.y -= 1;
    if (f.lengthSq() > 0) f.normalize();
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 6 : 1;
    const target = f.multiplyScalar(this.flySpeed * boost).applyQuaternion(cam.quaternion);
    this.vel.lerp(target, 1 - Math.exp(-dt * 3.2));
    cam.position.addScaledVector(this.vel, dt);
  }
}

/** Cinematic tour player. Shots are {title, caption, dur, from, to, tFrom?, tTo?, fov?} */
export class Tour {
  constructor(rig, shots, { onShot, setFade }) {
    this.rig = rig;
    this.shots = shots;
    this.onShot = onShot;
    this.setFade = setFade;
    this.active = false;
    this.i = 0;
    this.t = 0;
  }
  start(i = 0) {
    this.active = true;
    this.i = i;
    this.t = 0;
    this.onShot?.(this.shots[this.i], this.i);
  }
  stop() {
    this.active = false;
    this.setFade?.(0);
  }
  update(dt) {
    if (!this.active) return;
    const s = this.shots[this.i];
    this.t += dt;
    const x = clamp(this.t / s.dur, 0, 1);
    const e = s.ease === 'linear' ? x : x * x * (3 - 2 * x) * 0.5 + x * 0.5;
    const cam = this.rig.camera;
    const pos = s.from.pos.clone().lerp(s.to.pos, e);
    const tgt = s.from.target.clone().lerp(s.to.target, e);
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    if (s.up) cam.up.copy(s.up);
    cam.lookAt(tgt);
    const fov = s.fov ?? 50;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // fades between shots
    const fadeIn = clamp(this.t / 1.1, 0, 1), fadeOut = clamp((s.dur - this.t) / 1.1, 0, 1);
    this.setFade?.(1 - Math.min(fadeIn, fadeOut));
    if (this.t >= s.dur) {
      this.i = (this.i + 1) % this.shots.length;
      this.t = 0;
      this.onShot?.(this.shots[this.i], this.i);
    }
  }
}
