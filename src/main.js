(function (RJ) {
'use strict';
const { GARDEN, VIEW, STONES, GROUP_COUNT, buildIslands, Gravel, RAKE_SPACING, RAKE_TINES, buildStoneMeshes, buildMoss, buildWalls, buildPebbles, buildVeranda, buildTrees, buildSky, seasonFor, solarPosition, skyDirection, lightAt, presetDate, PRESETS, PRESET_LABEL, kyotoClock, Soundscape } = RJ;

const params = new URLSearchParams(location.search);
const store = {
  get: (k, d) => { try { return localStorage.getItem('ryoanji.' + k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('ryoanji.' + k, v); } catch { /* private mode */ } },
};
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------
const canvas = $('garden');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
  preserveDrawingBuffer: params.has('shot'),
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb0c0d0, 45, 260);

const camera = new THREE.PerspectiveCamera(Number(params.get('fov') ?? 60), window.innerWidth / window.innerHeight, 0.05, 700);
camera.rotation.order = 'YXZ';

// ---------------------------------------------------------------------------
// The garden
// ---------------------------------------------------------------------------
const { meshes: stoneMeshes, raw: stoneRaw } = buildStoneMeshes();
stoneMeshes.forEach((m) => scene.add(m));
const islands = buildIslands(STONES, stoneRaw, GROUP_COUNT);
const gravel = new Gravel(islands);
scene.add(gravel.mesh);
const moss = buildMoss(islands);
scene.add(moss);
scene.add(buildWalls());
scene.add(buildPebbles());
const veranda = buildVeranda();
scene.add(veranda);
const season = seasonFor();
scene.add(buildTrees(season));
const { sky, stars, uniforms: skyU } = buildSky();
scene.add(sky, stars);

const hemi = new THREE.HemisphereLight(0xaabbdd, 0x554433, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 110;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 2.5;
sun.target.position.set(GARDEN.width / 2, 0, -GARDEN.depth / 2 + 1);
scene.add(sun, sun.target);

// ---------------------------------------------------------------------------
// Light: presets, or the real sun over Kyoto right now
// ---------------------------------------------------------------------------
const MOON_DIR = new THREE.Vector3(...skyDirection(38, 165)).normalize();
let lightName = params.get('light') ?? store.get('light', 'afternoon');
if (!PRESETS.includes(lightName)) lightName = 'afternoon';
const cur = { sunDir: new THREE.Vector3(), first: true };
let lightTarget = null;
let lastKyotoUpdate = 0;

function computeLight() {
  const date = lightName === 'kyoto' ? new Date() : presetDate(lightName);
  const { elevation, azimuth } = solarPosition(date);
  const L = lightAt(elevation);
  L.sunDir = new THREE.Vector3(...skyDirection(Math.max(elevation, 1.5), azimuth)).normalize();
  L.elevation = elevation;
  return L;
}

function lerpArr(a, b, t) { return a.map((x, i) => x + (b[i] - x) * t); }

function applyLight(dt) {
  if (!lightTarget) return false;
  const T = lightTarget;
  const t = cur.first ? 1 : Math.min(1, dt * 1.6);
  if (cur.first) Object.assign(cur, JSON.parse(JSON.stringify({ ...T, sunDir: undefined })));
  for (const k of ['sunColor', 'skyColor', 'groundColor', 'skyTop', 'skyHorizon']) cur[k] = lerpArr(cur[k], T[k], t);
  for (const k of ['sunIntensity', 'hemiIntensity', 'exposure', 'night']) cur[k] += (T[k] - cur[k]) * t;
  if (cur.first) cur.sunDir.copy(T.sunDir); else cur.sunDir.lerp(T.sunDir, t).normalize();
  cur.first = false;

  const moonI = 0.95 * cur.night;
  const useMoon = cur.sunIntensity < moonI;
  const dir = useMoon ? MOON_DIR : cur.sunDir;
  sun.position.copy(sun.target.position).addScaledVector(dir, 50);
  if (useMoon) sun.color.setRGB(0.66, 0.76, 1.0); else sun.color.setRGB(...cur.sunColor);
  sun.intensity = Math.max(cur.sunIntensity, moonI);
  hemi.color.setRGB(...cur.skyColor);
  hemi.groundColor.setRGB(...cur.groundColor);
  hemi.intensity = cur.hemiIntensity;
  skyU.top.value.setRGB(...cur.skyTop);
  skyU.horizon.value.setRGB(...cur.skyHorizon);
  skyU.sunDir.value.copy(cur.sunDir);
  skyU.sunColor.value.setRGB(...cur.sunColor);
  skyU.sunGlow.value = Math.min(1, cur.sunIntensity / 2.5) * (1 - cur.night);
  scene.fog.color.setRGB(...cur.skyHorizon);
  stars.material.opacity = cur.night * 0.9;
  renderer.toneMappingExposure = cur.exposure;
  renderer.shadowMap.needsUpdate = true;
  const done = T.sunDir.distanceTo(cur.sunDir) < 1e-3 && Math.abs(T.sunIntensity - cur.sunIntensity) < 1e-3;
  if (done) lightTarget = null;
  return true;
}

function setLight(name, announce = true) {
  lightName = name;
  store.set('light', name);
  lightTarget = computeLight();
  if (announce) toast(name === 'kyoto' ? `${PRESET_LABEL.kyoto} · ${kyotoClock()}` : PRESET_LABEL[name]);
}

// ---------------------------------------------------------------------------
// The visitor
// ---------------------------------------------------------------------------
const me = {
  x: clamp(Number(params.get('x') ?? store.get('x', 12.6)), VIEW.xMin, VIEW.xMax),
  vx: 0,
  yaw: Number(params.get('yaw') ?? 0) * Math.PI / 180,
  pitch: Number(params.get('pitch') ?? -9) * Math.PI / 180,
  yawT: 0, pitchT: 0,
  stand: params.has('stand') ? 1 : 0,
  lastMove: -1e9,
  bob: 0,
};
me.yawT = me.yaw; me.pitchT = me.pitch;
const keys = new Set();
let walkDir = 0;     // touch buttons
let wheelV = 0;

function updateVisitor(dt, now) {
  let desired = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) desired -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) desired += 1;
  desired = desired * 1.0 + walkDir * 1.0 + wheelV;
  wheelV *= Math.exp(-dt * 2.5);
  if (Math.abs(wheelV) < 0.01) wheelV = 0;

  if (Math.abs(desired) > 0.02) me.lastMove = now;
  const wantStand = params.has('stand') || now - me.lastMove < 1.3 ? 1 : 0;
  // Rising is quicker than settling back down onto the boards.
  const rate = wantStand > me.stand ? 1 / 0.75 : 1 / 1.4;
  me.stand = clamp(me.stand + Math.sign(wantStand - me.stand) * rate * dt, 0, 1);

  // You stand up before you walk.
  const canWalk = clamp((me.stand - 0.6) / 0.4, 0, 1);
  const v = desired * canWalk;
  me.vx += (v - me.vx) * Math.min(1, dt * 3.5);
  me.x += me.vx * dt;
  if (me.x < VIEW.xMin || me.x > VIEW.xMax) { me.x = clamp(me.x, VIEW.xMin, VIEW.xMax); me.vx = 0; }
  me.bob += Math.abs(me.vx) * dt * 5.2;

  if (keys.has('ArrowUp') || keys.has('KeyW')) me.pitchT += dt * 0.6;
  if (keys.has('ArrowDown') || keys.has('KeyS')) me.pitchT -= dt * 0.6;
  me.yawT = clamp(me.yawT, -1.45, 1.45);
  me.pitchT = clamp(me.pitchT, -0.75, 0.42);
  me.yaw += (me.yawT - me.yaw) * Math.min(1, dt * 9);
  me.pitch += (me.pitchT - me.pitch) * Math.min(1, dt * 9);

  const s = smooth(me.stand);
  const eye = VIEW.seatedEye + (VIEW.standingEye - VIEW.seatedEye) * s + Math.sin(me.bob) * 0.012 * Math.min(1, Math.abs(me.vx));
  camera.position.set(me.x, eye, VIEW.seatZ + 0.12 * s);
  camera.rotation.set(me.pitch, me.yaw, 0);
}

// ---------------------------------------------------------------------------
// The rake
// ---------------------------------------------------------------------------
let raking = params.has('rake');
const rake = { active: false, tx: 0, tz: 0, hx: 0, hz: 0, dx: 0, dz: -1, speed: 0, hover: false };
const raycaster = new THREE.Raycaster();
const pickables = [gravel.mesh, moss, ...stoneMeshes, veranda];

const rakeGhost = (() => {
  const g = new THREE.Group();
  const W = RAKE_TINES * RAKE_SPACING;
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8, transparent: true, opacity: 0.92 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, 0.035, 0.04), wood);
  bar.position.y = 0.07;
  g.add(bar);
  for (let i = 0; i < RAKE_TINES; i++) {
    const tine = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.07, 0.018), wood);
    tine.position.set(-W / 2 + RAKE_SPACING * (i + 0.5), 0.03, 0);
    g.add(tine);
  }
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.7, 8), wood);
  handle.geometry.translate(0, 0.85, 0);
  handle.rotation.x = -1.05; // leaning back towards whoever holds it
  handle.position.y = 0.08;
  g.add(handle);
  g.visible = false;
  scene.add(g);
  return g;
})();

function pick(clientX, clientY) {
  const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(pickables, true)[0];
  if (hit && hit.object === gravel.mesh) return hit.point;
  return null;
}

function updateRake(dt) {
  if (!raking) { rakeGhost.visible = false; return 0; }
  let moved = 0;
  if (rake.active) {
    // The rake head follows the pointer with a little weight, which smooths
    // the line the way a real rake's drag does.
    const k = Math.min(1, dt * 7);
    const nx = rake.hx + (rake.tx - rake.hx) * k;
    const nz = rake.hz + (rake.tz - rake.hz) * k;
    const len = Math.hypot(nx - rake.hx, nz - rake.hz);
    if (len > 0.004) {
      const steps = Math.ceil(len / 0.012);
      let ax = rake.hx, az = rake.hz, touched = 0;
      for (let i = 1; i <= steps; i++) {
        const bx = rake.hx + (nx - rake.hx) * (i / steps);
        const bz = rake.hz + (nz - rake.hz) * (i / steps);
        touched += gravel.rakeSegment(ax, az, bx, bz);
        ax = bx; az = bz;
      }
      const ddx = (nx - rake.hx) / len, ddz = (nz - rake.hz) / len;
      rake.dx += (ddx - rake.dx) * 0.5; rake.dz += (ddz - rake.dz) * 0.5;
      const l = Math.hypot(rake.dx, rake.dz) || 1; rake.dx /= l; rake.dz /= l;
      rake.hx = nx; rake.hz = nz;
      moved = (len / Math.max(dt, 1e-3)) * (touched / steps);
    }
  }
  const showAt = rake.active || rake.hover;
  rakeGhost.visible = showAt;
  if (showAt) {
    rakeGhost.position.set(rake.hx, 0, rake.hz);
    // Bar across the direction of travel; the handle trails behind it.
    let dx = rake.dx, dz = rake.dz;
    if (!rake.active) { dx = rake.hx - camera.position.x; dz = rake.hz - camera.position.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    rakeGhost.rotation.y = Math.atan2(-dx, -dz);
  }
  return moved;
}

// ---------------------------------------------------------------------------
// Counting the stones you can see
// ---------------------------------------------------------------------------
// Visibility is measured exactly as the eye sees it: the stones are drawn
// from the eye in flat ID colours, wide enough to cover the whole garden,
// and the distinct IDs that survive the depth test are counted.
let counting = params.has('count');
const idScene = new THREE.Scene();
idScene.background = new THREE.Color(0, 0, 0);
stoneMeshes.forEach((m, i) => {
  const mat = new THREE.MeshBasicMaterial();
  mat.color.setRGB(((i + 1) * 15) / 255, 0, 0, THREE.LinearSRGBColorSpace);
  idScene.add(new THREE.Mesh(m.geometry, mat));
});
const ID_W = 1280, ID_H = 1024;
const idTarget = new THREE.WebGLRenderTarget(ID_W, ID_H, { depthBuffer: true });
const idBuf = new Uint8Array(ID_W * ID_H * 4);
const idCams = [-0.8, 0.8].map((yaw) => {
  const c = new THREE.PerspectiveCamera(80, ID_W / ID_H, 0.05, 60);
  c.rotation.order = 'YXZ';
  c.rotation.set(-0.38, yaw, 0);
  return c;
});
let visibleSet = new Set();
let lastCountPos = null, lastCountTime = 0;

function measureVisible() {
  const seen = new Set();
  const prevTM = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  for (const c of idCams) {
    c.position.copy(camera.position);
    c.updateMatrixWorld();
    renderer.setRenderTarget(idTarget);
    renderer.render(idScene, c);
    renderer.readRenderTargetPixels(idTarget, 0, 0, ID_W, ID_H, idBuf);
    for (let i = 0; i < idBuf.length; i += 4) {
      const v = idBuf[i];
      if (v) seen.add(Math.round(v / 15) - 1);
    }
  }
  renderer.setRenderTarget(null);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = prevTM;
  return seen;
}

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
const KANJI = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
const dots = stoneMeshes.map(() => {
  const d = document.createElement('div');
  d.className = 'dot';
  $('dots').appendChild(d);
  return d;
});

function updateCount(now) {
  const wrap = $('count');
  if (!counting) { wrap.classList.remove('on'); dots.forEach((d) => d.classList.remove('on')); return; }
  const p = camera.position;
  if (!lastCountPos || (lastCountPos.distanceTo(p) > 0.01 && now - lastCountTime > 0.25)) {
    visibleSet = measureVisible();
    lastCountPos = p.clone();
    lastCountTime = now;
    const n = visibleSet.size;
    $('count-kanji').textContent = KANJI[n];
    $('count-words').textContent = `${WORDS[n]} stone${n === 1 ? '' : 's'}`;
  }
  wrap.classList.add('on');
  const v = new THREE.Vector3();
  stoneMeshes.forEach((m, i) => {
    const d = dots[i];
    if (!visibleSet.has(i)) { d.classList.remove('on'); return; }
    v.copy(m.userData.top); v.y += 0.18;
    v.project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { d.classList.remove('on'); return; }
    d.style.transform = `translate(${(v.x * 0.5 + 0.5) * window.innerWidth}px, ${(-v.y * 0.5 + 0.5) * window.innerHeight}px)`;
    d.classList.add('on');
  });
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------
const sound = new Soundscape();
sound.enabled = store.get('sound', 'on') === 'on';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------
let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

let lastInput = performance.now();
function wake() {
  lastInput = performance.now();
  document.body.classList.remove('still');
}

function refreshButtons() {
  $('b-rake').classList.toggle('active', raking);
  $('b-count').classList.toggle('active', counting);
  $('b-sound').classList.toggle('active', sound.enabled);
  $('b-anew').hidden = !raking;
  document.body.classList.toggle('raking', raking);
}

const actions = {
  rake() {
    raking = !raking;
    rake.active = false; rake.hover = false;
    toast(raking ? 'Raking · drag across the gravel' : 'Sitting');
    refreshButtons();
  },
  count() {
    counting = !counting;
    lastCountPos = null;
    refreshButtons();
  },
  light() {
    const i = PRESETS.indexOf(lightName);
    setLight(PRESETS[(i + 1) % PRESETS.length]);
  },
  sound() {
    sound.setEnabled(!sound.enabled);
    store.set('sound', sound.enabled ? 'on' : 'off');
    toast(sound.enabled ? 'Sound on' : 'Silence');
    refreshButtons();
  },
  anew() {
    gravel.beginRestore();
    toast('The garden is raked anew');
  },
  help() { $('help').classList.toggle('on'); },
  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  },
};

document.querySelectorAll('[data-action]').forEach((b) => {
  b.addEventListener('click', (e) => { e.stopPropagation(); actions[b.dataset.action](); wake(); });
});

function begin() {
  $('intro').classList.add('gone');
  sound.start();
  wake();
}
$('enter').addEventListener('click', begin);

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  wake();
  if (!$('intro').classList.contains('gone')) {
    if (e.code === 'Enter' || e.code === 'Space') begin();
    return;
  }
  keys.add(e.code);
  const map = { KeyR: 'rake', KeyC: 'count', KeyL: 'light', KeyM: 'sound', KeyN: 'anew', KeyF: 'fullscreen', Slash: 'help', KeyH: 'help' };
  if (map[e.code] && !e.repeat) {
    if (e.code === 'KeyN' && !raking) return;
    actions[map[e.code]]();
  }
  if (e.code === 'Escape') {
    if ($('help').classList.contains('on')) $('help').classList.remove('on');
    else if (raking) actions.rake();
  }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// Pointer: look around, or rake when the rake is in hand.
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  wake();
  canvas.setPointerCapture(e.pointerId);
  if (raking && e.button === 0) {
    const p = pick(e.clientX, e.clientY);
    if (p) {
      rake.active = true;
      rake.tx = rake.hx = p.x; rake.tz = rake.hz = p.z;
      drag = { mode: 'rake', id: e.pointerId };
      return;
    }
  }
  drag = { mode: 'look', id: e.pointerId, x: e.clientX, y: e.clientY };
  document.body.classList.add('grabbing');
});
canvas.addEventListener('pointermove', (e) => {
  wake();
  if (drag && drag.id === e.pointerId && drag.mode === 'look') {
    const k = 2.2 / window.innerHeight;
    me.yawT += (e.clientX - drag.x) * k;
    me.pitchT += (e.clientY - drag.y) * k;
    drag.x = e.clientX; drag.y = e.clientY;
    return;
  }
  if (raking) {
    const p = pick(e.clientX, e.clientY);
    if (drag && drag.mode === 'rake') {
      if (p) { rake.tx = p.x; rake.tz = p.z; }
    } else {
      rake.hover = !!p;
      if (p) { rake.hx = p.x; rake.hz = p.z; }
    }
  }
});
const endDrag = (e) => {
  if (drag && drag.id === e.pointerId) {
    if (drag.mode === 'rake') rake.active = false;
    drag = null;
    document.body.classList.remove('grabbing');
  }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => { if (!drag) rake.hover = false; });

// Scrolling walks along the veranda.
window.addEventListener('wheel', (e) => {
  wake();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  wheelV = clamp(wheelV + d * scale * 0.0022, -1.3, 1.3);
  e.preventDefault();
}, { passive: false });

// Touch walking buttons.
for (const [id, dir] of [['walk-l', -1], ['walk-r', 1]]) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); el.setPointerCapture(e.pointerId); walkDir = dir; wake(); });
  const stop = () => { walkDir = 0; };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
setLight(lightName, false);
refreshButtons();
if (params.has('shot')) $('intro').classList.add('gone');

let last = performance.now();
let lastSaved = 0;
const stats = { ms: 0, tris: 0 };
function frame(nowMs) {
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  const now = nowMs / 1000;

  updateVisitor(dt, now);
  if (lightName === 'kyoto' && now - lastKyotoUpdate > 30) {
    lastKyotoUpdate = now;
    lightTarget = computeLight();
  }
  applyLight(dt);
  const rakeSpeed = updateRake(dt);
  gravel.update(dt);
  sound.update(dt, rakeSpeed);

  renderer.render(scene, camera);
  updateCount(now);
  stats.ms += ((performance.now() - nowMs) - stats.ms) * 0.1;
  stats.tris = renderer.info.render.triangles;

  if (performance.now() - lastInput > 5000 && !drag) document.body.classList.add('still');
  if (now - lastSaved > 2) { store.set('x', me.x.toFixed(2)); lastSaved = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__garden = { me, gravel, measureVisible, camera, actions, setLight, stats };
document.body.classList.add('ready');
})(globalThis.RJ = globalThis.RJ || {});
