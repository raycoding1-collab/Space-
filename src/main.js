// VESPERA — entry point.
import * as THREE from 'three';
import { WORLD } from './world.js';
import { bakeSky } from './env/sky.js';
import { createStars } from './env/stars.js';
import { createPlanetSystem } from './env/planet.js';
import { createSun } from './env/sun.js';
import { buildShip } from './ship/ship.js';
import { buildTraffic } from './life/traffic.js';
import { lightUniforms } from './ship/lights.js';
import { PostFX } from './post/post.js';
import { CameraRig, Tour } from './ui/controls.js';
import { HUD } from './ui/hud.js';
import { POIS, TOUR, LABELS } from './data/pois.js';

const params = new URLSearchParams(location.search);
const DPR = window.devicePixelRatio || 1;

const PRESETS = {
  test: { label: 'Test', pr: 1, sky: 1024, texSize: 1024, shadow: 4096, samples: 4, aniso: 4, planetTex: 2048 },
  low: { label: 'Low', pr: Math.min(DPR, 1), sky: 1024, texSize: 1024, shadow: 2048, samples: 2, aniso: 4, planetTex: 2048 },
  high: { label: 'High', pr: Math.min(DPR, 1.5), sky: 2048, texSize: 2048, shadow: 4096, samples: 4, aniso: 8, planetTex: 4096 },
  ultra: { label: 'Ultra', pr: Math.min(Math.max(DPR, 1.5), 2), sky: 2048, texSize: 2048, shadow: 8192, samples: 4, aniso: 16, planetTex: 4096 },
};
const quality = { ...(PRESETS[params.get('q')] || PRESETS.high) };
const SCALE_STEPS = [0.6, 0.8, 1.0, 1.25, 1.5, 2.0];

const STILL = params.has('still');
const loaderFill = document.getElementById('loader-fill');
const loaderStage = document.getElementById('loader-stage');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function step(label, p) {
  loaderStage.textContent = label;
  loaderFill.style.width = `${Math.round(p * 100)}%`;
  await nextFrame();
}

let resolveReady;
const ready = new Promise((r) => { resolveReady = r; });

async function init() {
  const canvas = document.getElementById('viewport');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: STILL,
  });
  renderer.setPixelRatio(quality.pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = true;
  quality.aniso = Math.min(quality.aniso, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 4.0e6);
  camera.position.set(9000, 4000, 8000);
  camera.lookAt(0, 0, 0);

  // ---------------------------------------------------------------- environment
  await step('Charting the galaxy', 0.04);
  const skyRT = await bakeSky(renderer, Math.min(quality.sky, renderer.capabilities.maxCubemapSize), (f) => {
    loaderFill.style.width = `${Math.round((0.04 + f * 0.16) * 100)}%`;
  });
  scene.background = skyRT.texture;
  scene.backgroundIntensity = 1.0;

  await step('Placing ten thousand suns', 0.21);
  const stars = createStars();
  scene.add(stars);

  await step('Condensing Aurelis', 0.24);
  const planet = createPlanetSystem(renderer, { planetTexWidth: quality.planetTex });
  scene.add(planet.group);
  planet.group.traverse((o) => o.layers.enable(1));

  const sun = createSun({ shadowMapSize: quality.shadow });
  scene.add(sun.group, sun.light, sun.target);

  // fill light: warm planetshine from below, faint cool skylight
  const planetDir = WORLD.planetCenter.clone().normalize();
  const planetShine = new THREE.DirectionalLight(new THREE.Color(1.0, 0.8, 0.58), 0.22);
  planetShine.position.copy(planetDir).multiplyScalar(10000);
  scene.add(planetShine);
  scene.add(new THREE.AmbientLight(new THREE.Color(0.55, 0.62, 0.8), 0.035));

  // image-based lighting from the sky + planet (excluding the ship)
  await step('Measuring starlight', 0.27);
  {
    const envRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cubeCam = new THREE.CubeCamera(10, 3.0e6, envRT);
    cubeCam.layers.set(1);
    const shipBg = scene.background;
    cubeCam.update(renderer, scene);
    scene.background = shipBg;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromCubemap(envRT.texture).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 1.0;
    pmrem.dispose();
    envRT.dispose();
  }

  // ---------------------------------------------------------------- ship
  const ship = await buildShip({ quality, step });
  scene.add(ship.root);
  await step('Scheduling shuttle traffic', 0.88);
  const traffic = buildTraffic(ship, ship.M);
  scene.add(traffic.group);

  // ---------------------------------------------------------------- post & controls
  const post = new PostFX(renderer, { samples: quality.samples });
  const rig = new CameraRig(camera, canvas);

  const hud = new HUD({
    pois: POIS,
    labels: LABELS,
    onPoi: (p) => goToPoi(p),
    onMode: (m) => setMode(m),
    onCapture: () => capture(),
    onQuality: () => cycleQuality(),
  });
  const tour = new Tour(rig, TOUR, {
    onShot: (s) => hud.caption(s),
    setFade: (x) => { post.finalMat.uniforms.uFade.value = x; },
  });
  let mode = 'orbit';
  function setMode(m) {
    mode = m;
    if (m === 'tour') {
      rig.cancelTransition();
      rig.setMode('tour');
      rig.orbit.enabled = false;
      tour.start(0);
    } else {
      if (tour.active) tour.stop();
      rig.setMode(m);
    }
    hud.setMode(m);
    hud.setLabels(m !== 'tour' && hud.showLabels);
  }

  function goToPoi(p) {
    if (mode === 'tour') setMode('orbit');
    hud.setActivePoi(p.id);
    rig.flyTo(p.pos.clone(), p.target.clone(), { fov: p.fov });
  }

  // ---------------------------------------------------------------- sizing & quality
  let scaleIdx = SCALE_STEPS.indexOf(quality.pr);
  if (scaleIdx < 0) { scaleIdx = SCALE_STEPS.findIndex((s) => s >= quality.pr); if (scaleIdx < 0) scaleIdx = SCALE_STEPS.length - 1; }
  function applySize(w = window.innerWidth, h = window.innerHeight, pr = renderer.getPixelRatio()) {
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    const bw = Math.floor(w * pr), bh = Math.floor(h * pr);
    post.setSize(bw, bh);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const px = Math.max(1, bh / 1080);
    lightUniforms.uPx.value = px;
    lightUniforms.uViewH.value = bh;
    stars.material.uniforms.uPx.value = px;
  }
  function cycleQuality() {
    scaleIdx = (scaleIdx + 1) % SCALE_STEPS.length;
    applySize(undefined, undefined, SCALE_STEPS[scaleIdx]);
    hud.setQualityLabel(`${SCALE_STEPS[scaleIdx]}×`);
    hud.toast(`Render scale ${SCALE_STEPS[scaleIdx]}× · ${renderer.domElement.width}×${renderer.domElement.height}`);
    autoScale = false;
  }
  window.addEventListener('resize', () => applySize());
  applySize();
  hud.setQualityLabel(`${renderer.getPixelRatio()}×`);

  // ---------------------------------------------------------------- simulation
  let simTime = parseFloat(params.get('t') || '0');
  const timeScale = 1;

  function tick(dt) {
    ship.update(simTime);
    traffic.update(simTime);
    planet.update(simTime);
    lightUniforms.uTime.value = simTime;
    if (tour.active) {
      tour.update(dt);
    } else {
      rig.update(dt);
    }
    sun.update(camera, simTime);
    stars.position.copy(camera.position);
    post.updateSun(camera, WORLD.sunDir);
  }

  function render() {
    post.render(scene, camera, simTime);
  }

  // ---------------------------------------------------------------- capture
  function renderStill(w, h) {
    const prevPR = renderer.getPixelRatio();
    const prevW = window.innerWidth, prevH = window.innerHeight;
    applySize(w, h, 1);
    tick(0);
    render();
    const url = renderer.domElement.toDataURL('image/png');
    applySize(prevW, prevH, prevPR);
    return url;
  }
  function capture() {
    hud.toast('Rendering 3840 × 2160…', 8000);
    setTimeout(() => {
      const url = renderStill(3840, 2160);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vespera-${Date.now()}.png`;
      a.click();
      hud.toast('Saved 4K still');
    }, 60);
  }

  // ---------------------------------------------------------------- keyboard
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyH') hud.toggleUI();
    if (e.code === 'KeyL') hud.setLabels(!hud.showLabels);
    if (e.code === 'KeyP') capture();
    if (e.code === 'KeyT') setMode('tour');
    if (e.code === 'KeyO') setMode('orbit');
    if (e.code === 'KeyV' || e.code === 'KeyG') setMode('fly');
    if (e.code === 'Escape' && mode === 'tour') setMode('orbit');
    if (e.code === 'Space' && mode === 'tour') { e.preventDefault(); tour.t = tour.shots[tour.i].dur; }
    const n = parseInt(e.key, 10);
    if (!Number.isNaN(n) && mode !== 'fly') { const p = POIS[(n + 9) % 10]; if (p) goToPoi(p); }
  });

  // ---------------------------------------------------------------- start
  hud.setActivePoi('overview');
  hud.setMode('orbit');
  const start = POIS[0];
  rig.set(start.pos, start.target, start.fov);

  // Automation / deep-link API
  const api = {
    renderer, scene, camera, rig, ship, post, hud,
    setTime(t) { simTime = t; tick(0); },
    setView(view) {
      const p = typeof view === 'string' ? POIS.find((x) => x.id === view) : view;
      const pos = p.pos.clone(), tgt = p.target.clone();
      if (p.up) camera.up.copy(p.up);
      rig.set(pos, tgt, p.fov || 50);
      if (p.up) { camera.up.copy(p.up); camera.lookAt(tgt); }
    },
    renderStill,
    setUI(on) { hud.toggleUI(!on); },
  };
  window.VESPERA = api;

  await step('All systems nominal', 1.0);
  const loader = document.getElementById('loader');

  if (STILL) {
    loader.remove();
    if (params.get('view')) api.setView(params.get('view'));
    tick(0);
    render();
    resolveReady(api);
    return;
  }

  // Intro: drift on the opening shot behind the title card
  hud.show();
  hud.toggleUI(true);
  const intro = document.getElementById('intro');
  const introShot = TOUR[0];
  let introT = 0, introOn = true;
  intro.classList.remove('hidden');
  loader.classList.add('hidden');
  setTimeout(() => loader.remove(), 1800);
  document.getElementById('btn-tour').addEventListener('click', () => {
    introOn = false; intro.classList.add('hidden'); hud.toggleUI(false); setMode('tour');
  });
  document.getElementById('btn-explore').addEventListener('click', () => {
    introOn = false; intro.classList.add('hidden'); hud.toggleUI(false); setMode('orbit');
    rig.flyTo(start.pos, start.target, { fov: start.fov, duration: 4 });
  });
  if (params.get('view')) {
    introOn = false; intro.classList.add('hidden'); hud.toggleUI(false);
    api.setView(params.get('view'));
  }

  // adaptive resolution
  let autoScale = !params.has('q');
  let acc = 0, frames = 0, checks = 0;
  let last = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    simTime += dt * timeScale;
    if (introOn) {
      introT += dt;
      const x = Math.min(1, introT / 40);
      const e = 1 - Math.pow(1 - x, 2);
      camera.position.copy(introShot.from.pos).lerp(introShot.to.pos, e);
      camera.lookAt(introShot.from.target.clone().lerp(introShot.to.target, e));
      camera.fov = introShot.fov; camera.updateProjectionMatrix();
      rig.orbit.target.copy(introShot.to.target);
      tickNoRig(dt);
    } else {
      tick(dt);
    }
    render();
    hud.updateLabels(camera, window.innerWidth, window.innerHeight);
    if ((frames & 7) === 0) {
      hud.telemetry({ simTime, range: camera.position.length() });
    }
    // adaptive resolution: step down if we are well below 30 fps
    acc += dt; frames++;
    if (autoScale && acc > 2.5) {
      const fps = frames / acc;
      if (fps < 26 && scaleIdx > 0 && checks < 4) {
        scaleIdx--;
        applySize(undefined, undefined, SCALE_STEPS[scaleIdx]);
        hud.setQualityLabel(`${SCALE_STEPS[scaleIdx]}×`);
        checks++;
      } else if (fps > 50) {
        autoScale = checks > 0 ? false : autoScale;
      }
      acc = 0; frames = 0;
    }
  }
  function tickNoRig(dt) {
    ship.update(simTime);
    traffic.update(simTime);
    planet.update(simTime);
    lightUniforms.uTime.value = simTime;
    sun.update(camera, simTime);
    stars.position.copy(camera.position);
    post.updateSun(camera, WORLD.sunDir);
  }
  resolveReady(api);
  loop();
}

window.VESPERA_READY = ready;
init().catch((err) => {
  console.error(err);
  const s = document.getElementById('loader-stage');
  if (s) s.textContent = 'Failed to start: ' + (err && err.message ? err.message : err);
});
