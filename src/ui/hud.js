// DOM interface: points of interest, info card, telemetry, captions, 3D labels, toasts.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor({ pois, labels, onPoi, onMode, onCapture, onQuality, onToggleLabels }) {
    this.pois = pois;
    this.labelDefs = labels;
    this.showLabels = false;
    this.el = {
      hud: $('hud'), list: $('poi-list'), kicker: $('info-kicker'), title: $('info-title'), text: $('info-text'),
      stats: $('info-stats'), caption: $('caption'), hint: $('hint'), clock: $('t-clock'), spin: $('t-spin'),
      range: $('t-range'), labels: $('labels'), fade: $('fade'), toast: $('toast'), quality: $('btn-quality'),
      labelsBtn: $('btn-labels'), info: $('info'),
    };
    // POI buttons
    pois.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'poi';
      b.dataset.id = p.id;
      b.innerHTML = `<span class="tick"></span>${p.name}`;
      b.addEventListener('click', () => onPoi(p, i));
      this.el.list.appendChild(b);
    });
    // modes
    document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => onMode(b.dataset.mode)));
    $('btn-capture').addEventListener('click', () => onCapture());
    $('btn-quality').addEventListener('click', () => onQuality());
    $('btn-hide').addEventListener('click', () => this.toggleUI());
    this.el.labelsBtn.addEventListener('click', () => { this.setLabels(!this.showLabels); onToggleLabels?.(this.showLabels); });
    // labels
    this.labelEls = labels.map((l) => {
      const d = document.createElement('div');
      d.className = 'label';
      d.innerHTML = `<span>${l.text}</span>`;
      this.el.labels.appendChild(d);
      return d;
    });
    this.setLabels(false);
    this._v = new THREE.Vector3();
  }

  show() { this.el.hud.classList.remove('hidden'); }
  toggleUI(force) {
    const hide = force !== undefined ? force : !document.body.classList.contains('ui-hidden');
    document.body.classList.toggle('ui-hidden', hide);
  }
  setLabels(on) {
    this.showLabels = on;
    this.el.labels.style.opacity = on ? 1 : 0;
    this.el.labelsBtn.classList.toggle('on', on);
  }
  setMode(mode) {
    document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    document.body.classList.toggle('mode-fly', mode === 'fly');
    const hints = {
      orbit: 'Drag to orbit · Right-drag to pan · Scroll to zoom toward the cursor · <kbd>L</kbd> labels · <kbd>H</kbd> hide UI',
      fly: 'Click to capture mouse · <kbd>W A S D</kbd> move · <kbd>R</kbd>/<kbd>F</kbd> up/down · <kbd>Q</kbd>/<kbd>E</kbd> roll · <kbd>Shift</kbd> boost · scroll = speed',
      tour: 'Guided tour · <kbd>Space</kbd> next shot · <kbd>Esc</kbd> exit tour',
    };
    this.el.hint.innerHTML = hints[mode] || '';
    if (mode !== 'tour') this.caption(null);
  }
  setActivePoi(id) {
    this.el.list.querySelectorAll('.poi').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    const p = this.pois.find((x) => x.id === id);
    if (!p) return;
    this.el.kicker.textContent = p.kicker;
    this.el.title.textContent = p.title;
    this.el.text.textContent = p.text;
    this.el.stats.innerHTML = p.stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }
  caption(shot) {
    const c = this.el.caption;
    if (!shot) { c.classList.remove('show'); return; }
    c.classList.remove('show');
    clearTimeout(this._capT);
    this._capT = setTimeout(() => {
      c.innerHTML = `<span class="cap-title">${shot.title}</span>${shot.caption}`;
      c.classList.add('show');
    }, 900);
  }
  setFade(x) { this.el.fade.style.transition = 'none'; this.el.fade.style.opacity = x; }
  fadeTo(x, ms = 900) { this.el.fade.style.transition = `opacity ${ms}ms ease`; this.el.fade.style.opacity = x; }
  toast(msg, ms = 2400) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  setQualityLabel(s) { this.el.quality.textContent = `Quality: ${s}`; }

  telemetry({ simTime, ringPeriod, range }) {
    const days = 214 * 365.25 + 132 + simTime / 86400;
    const yr = Math.floor(days / 365.25);
    const d = Math.floor(days - yr * 365.25);
    const sec = Math.floor(simTime + 51840) % 86400;
    const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    this.el.clock.textContent = `Y${yr} · D${String(d).padStart(3, '0')} · ${hh}:${mm}:${ss}`;
    this.el.spin.textContent = `${ringPeriod.toFixed(1)} s / rev`;
    this.el.range.textContent = range > 2000 ? `${(range / 1000).toFixed(2)} km` : `${Math.round(range)} m`;
  }

  updateLabels(camera, w, h) {
    if (!this.showLabels) return;
    const v = this._v;
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    this.labelDefs.forEach((l, i) => {
      const el = this.labelEls[i];
      v.copy(l.pos);
      const toL = v.clone().sub(camera.position);
      const dist = toL.length();
      if (toL.dot(camDir) < 0) { el.style.display = 'none'; return; }
      v.project(camera);
      if (Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const op = THREE.MathUtils.clamp(1.4 - dist / 16000, 0.25, 1);
      el.style.opacity = op;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
  }
}
