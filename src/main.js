(function (RJ) {
'use strict';
const { GARDEN, VIEW, STONES, GROUP_COUNT, buildIslands, islandDistance, Gravel, RAKE_SPACING, RAKE_TINES, buildStoneMeshes, buildMoss, buildWalls, buildPebbles, buildVeranda, buildTrees, buildSky, seasonFor, solarPosition, skyDirection, lightAt, presetDate, PRESETS, PRESET_LABEL, kyotoClock, Soundscape } = RJ;

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
// You can be on the veranda boards or out on the gravel. You can sit only on
// the veranda. Walls bound the garden, and the moss beds are not to be
// walked on.
const BODY = 0.24;               // keep this far from moss and walls (m)
const VERANDA = { x0: -2.7, x1: 27.7, z0: GARDEN.verandaEdgeZ + 0.06, z1: GARDEN.verandaBackZ - 0.3 };
const YARD = { x0: BODY, x1: GARDEN.width - BODY, z0: -GARDEN.depth + BODY, z1: GARDEN.verandaEdgeZ + 0.3 };
const SEATED_EYE = VIEW.seatedEye - GARDEN.verandaFloorY;     // above the boards
const STANDING_EYE = VIEW.standingEye - GARDEN.verandaFloorY; // above whatever you stand on
const WALK = 1.15, RAKE_WALK = 0.55;                          // m/s
const STRIDE = 0.72;                                          // m between footsteps

function onVeranda(x, z) {
  return x > VERANDA.x0 && x < VERANDA.x1 && z >= GARDEN.verandaEdgeZ && z < VERANDA.z1;
}
function groundAt(x, z) { return onVeranda(x, z) ? GARDEN.verandaFloorY : 0; }
function walkable(x, z) {
  const inV = x > VERANDA.x0 && x < VERANDA.x1 && z > VERANDA.z0 && z < VERANDA.z1;
  const inY = x > YARD.x0 && x < YARD.x1 && z > YARD.z0 && z < YARD.z1;
  if (!inV && !inY) return false;
  if (!inV) for (const isl of islands) if (islandDistance(isl, x, z) < BODY) return false;
  return true;
}

// Start where the URL says, or seated where you last sat on the veranda.
const savedX = clamp(Number(store.get('x', 12.6)) || 12.6, VIEW.xMin, VIEW.xMax);
let startX = Number(params.get('x') ?? savedX), startZ = Number(params.get('z') ?? VIEW.seatZ);
if (!walkable(startX, startZ)) { startX = savedX; startZ = VIEW.seatZ; }
const me = {
  x: startX,
  z: startZ,
  vf: 0, vs: 0,                 // forward and sideways speed
  yaw: Number(params.get('yaw') ?? 0) * Math.PI / 180,
  pitch: Number(params.get('pitch') ?? -9) * Math.PI / 180,
  yawT: 0, pitchT: 0,
  seated: !params.has('stand'),
  rise: params.has('stand') ? 1 : 0,   // 0 seated … 1 standing
  ground: 0,
  bob: 0,
  stepDist: 0,
};
me.seated = me.seated && onVeranda(me.x, me.z);
me.rise = me.seated ? 0 : 1;
me.ground = groundAt(me.x, me.z);
me.yawT = me.yaw; me.pitchT = me.pitch;
const keys = new Set();
const pad = { f: 0, s: 0 };     // touch d-pad

function sit() {
  if (me.seated) { me.seated = false; toast('Standing'); refreshButtons(); return; }
  if (!onVeranda(me.x, me.z)) { toast('Step back onto the veranda to sit'); return; }
  me.seated = true;
  me.vf = me.vs = 0;
  toast('Sitting');
  refreshButtons();
}

function updateVisitor(dt) {
  let f = 0, sd = 0;
  if (keys.has('KeyW')) f += 1;
  if (keys.has('KeyS')) f -= 1;
  if (keys.has('KeyD')) sd += 1;
  if (keys.has('KeyA')) sd -= 1;
  f += pad.f; sd += pad.s;
  const len = Math.hypot(f, sd);
  if (len > 1) { f /= len; sd /= len; }

  // Starting to walk while seated means getting up first.
  if (me.seated && len > 0) { me.seated = false; refreshButtons(); }
  const rate = me.seated ? 1 / 1.3 : 1 / 0.7;   // settle slowly, rise briskly
  me.rise = clamp(me.rise + (me.seated ? -1 : 1) * rate * dt, 0, 1);
  const canWalk = clamp((me.rise - 0.65) / 0.35, 0, 1);

  const speed = (raking && rake.down ? RAKE_WALK : WALK) * canWalk;
  const k = Math.min(1, dt * 6);
  me.vf += (f * speed - me.vf) * k;
  me.vs += (sd * speed - me.vs) * k;

  // Turning with the arrow keys; looking up and down.
  if (keys.has('ArrowLeft')) me.yawT += dt * 1.6;
  if (keys.has('ArrowRight')) me.yawT -= dt * 1.6;
  if (keys.has('ArrowUp')) me.pitchT += dt * 0.9;
  if (keys.has('ArrowDown')) me.pitchT -= dt * 0.9;
  me.pitchT = clamp(me.pitchT, -1.35, 1.2);
  const turn = Math.min(1, dt * 10);
  me.yaw += (me.yawT - me.yaw) * turn;
  me.pitch += (me.pitchT - me.pitch) * turn;

  // Move, sliding along whatever stops you.
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
  const dx = (fx * me.vf + rx * me.vs) * dt, dz = (fz * me.vf + rz * me.vs) * dt;
  const ox = me.x, oz = me.z;
  if (walkable(me.x + dx, me.z)) me.x += dx;
  if (walkable(me.x, me.z + dz)) me.z += dz;
  const moved = Math.hypot(me.x - ox, me.z - oz);

  // Stepping down to the gravel, or up onto the boards.
  const g = groundAt(me.x, me.z);
  if (Math.abs(g - me.ground) > 0.3 && moved > 0) sound.step(g > me.ground ? 'wood' : 'gravel', 1.3);
  me.ground += (g - me.ground) * Math.min(1, dt * (g < me.ground ? 9 : 7));

  // Footsteps: no footprints, but you hear every one.
  if (!me.seated && me.rise > 0.9) {
    me.stepDist += moved;
    if (me.stepDist > STRIDE) {
      me.stepDist -= STRIDE;
      sound.step(onVeranda(me.x, me.z) ? 'wood' : 'gravel', 0.7 + 0.4 * Math.min(1, moved / dt / WALK));
    }
  }
  if (moved < 1e-4) me.stepDist = Math.min(me.stepDist, STRIDE * 0.6);
  me.bob += moved * 8.7;

  const r = smooth(me.rise);
  const eyeH = SEATED_EYE + (STANDING_EYE - SEATED_EYE) * r;
  const bob = Math.sin(me.bob) * 0.014 * Math.min(1, moved / Math.max(dt, 1e-3) / WALK);
  camera.position.set(me.x, me.ground + eyeH + bob, me.z);
  camera.rotation.set(me.pitch, me.yaw, 0);
}

// ---------------------------------------------------------------------------
// The rake
// ---------------------------------------------------------------------------
// The rake is in your hands: its head rests on the ground a couple of metres
// in front of you, across your line of sight. Hold the mouse button (or the
// space bar) to lower it into the gravel, then walk or turn to draw lines.
let raking = params.has('rake');
const REACH = 1.9;
const rake = {
  down: false, mouse: false, lift: 0.14,
  x: 0, z: 0, ux: 1, uz: 0, has: false,
};

const rakeModel = (() => {
  const g = new THREE.Group();
  const W = (RAKE_TINES - 1) * RAKE_SPACING + 0.12;
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 });
  const head = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.05), wood);
  bar.position.y = 0.075;
  head.add(bar);
  for (let i = 0; i < RAKE_TINES; i++) {
    const tine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.02), wood);
    tine.position.set((i - (RAKE_TINES - 1) / 2) * RAKE_SPACING, 0.03, 0);
    head.add(tine);
  }
  g.add(head);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1, 8), wood);
  g.add(handle);
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  g.visible = false;
  scene.add(g);
  return { g, head, handle };
})();

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function updateRake(dt) {
  if (!raking) { rakeModel.g.visible = false; rake.has = false; return 0; }
  rake.down = (rake.mouse || keys.has('Space')) && me.rise > 0.5;
  rake.lift += ((rake.down ? 0 : 0.14) - rake.lift) * Math.min(1, dt * 10);

  // Head position: in front of your feet, across your view.
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  const nx = me.x + fx * REACH, nz = me.z + fz * REACH;
  const ux = Math.cos(me.yaw), uz = -Math.sin(me.yaw);
  let speed = 0;
  if (rake.down && rake.lift < 0.03 && rake.has) {
    const touched = gravel.rakeMove(rake.x, rake.z, rake.ux, rake.uz, nx, nz, ux, uz);
    const half = ((RAKE_TINES - 1) / 2) * RAKE_SPACING;
    const sweep = Math.hypot(nx - rake.x, nz - rake.z) + Math.abs(Math.asin(clamp(rake.ux * uz - rake.uz * ux, -1, 1))) * half;
    speed = (sweep / Math.max(dt, 1e-3)) * touched;
  }
  rake.x = nx; rake.z = nz; rake.ux = ux; rake.uz = uz; rake.has = true;

  // Model: head on the ground (or just above it), handle up to your hands.
  const gy = groundAt(nx, nz) + (islands.some((i) => islandDistance(i, nx, nz) < 0) ? 0.05 : 0);
  rakeModel.g.visible = true;
  rakeModel.head.position.set(nx, gy + rake.lift, nz);
  rakeModel.head.rotation.set(0, me.yaw, 0);
  const hands = _b.set(
    me.x + fx * 0.32 + ux * 0.16,
    camera.position.y - 0.62 + (1 - me.rise) * 0.2,
    me.z + fz * 0.32 + uz * 0.16,
  );
  const foot = _a.set(nx, gy + rake.lift + 0.09, nz);
  const dir = hands.clone().sub(foot);
  const L = dir.length() + 0.25;
  rakeModel.handle.position.copy(foot).addScaledVector(dir.normalize(), L / 2);
  rakeModel.handle.quaternion.setFromUnitVectors(_up, dir);
  rakeModel.handle.scale.set(1, L, 1);
  renderer.shadowMap.needsUpdate = true; // the rake casts a moving shadow
  return speed;
}

// ---------------------------------------------------------------------------
// Counting the stones you can see
// ---------------------------------------------------------------------------
// Visibility is measured exactly as the eye sees it: the stones are drawn
// from the eye in flat ID colours, in four directions so that nothing behind
// you is missed, and the distinct IDs that survive the depth test are counted.
let counting = params.has('count');
const idScene = new THREE.Scene();
idScene.background = new THREE.Color(0, 0, 0);
stoneMeshes.forEach((m, i) => {
  const mat = new THREE.MeshBasicMaterial();
  mat.color.setRGB(((i + 1) * 15) / 255, 0, 0, THREE.LinearSRGBColorSpace);
  idScene.add(new THREE.Mesh(m.geometry, mat));
});
const ID_S = 720;
const idTarget = new THREE.WebGLRenderTarget(ID_S, ID_S, { depthBuffer: true });
const idBuf = new Uint8Array(ID_S * ID_S * 4);
const idCams = [0, 0.5, 1, 1.5].map((q) => {
  const c = new THREE.PerspectiveCamera(92, 1, 0.05, 60);
  c.rotation.order = 'YXZ';
  c.rotation.set(-0.62, q * Math.PI, 0);
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
    renderer.readRenderTargetPixels(idTarget, 0, 0, ID_S, ID_S, idBuf);
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

const _v = new THREE.Vector3();
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
  stoneMeshes.forEach((m, i) => {
    const d = dots[i];
    if (!visibleSet.has(i)) { d.classList.remove('on'); return; }
    _v.copy(m.userData.top); _v.y += 0.18;
    // Skip stones behind you.
    if (_v.clone().applyMatrix4(camera.matrixWorldInverse).z > -0.1) { d.classList.remove('on'); return; }
    _v.project(camera);
    if (Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { d.classList.remove('on'); return; }
    d.style.transform = `translate(${(_v.x * 0.5 + 0.5) * window.innerWidth}px, ${(-_v.y * 0.5 + 0.5) * window.innerHeight}px)`;
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
  $('b-sit').textContent = me.seated ? 'Stand' : 'Sit';
  $('b-rake').classList.toggle('active', raking);
  $('b-count').classList.toggle('active', counting);
  $('b-sound').classList.toggle('active', sound.enabled);
  $('b-anew').hidden = !raking;
  document.body.classList.toggle('raking', raking);
}

const actions = {
  sit,
  rake() {
    raking = !raking;
    rake.mouse = false; rake.has = false;
    // Glance down at the rake when you take it up.
    if (raking) me.pitchT = Math.min(me.pitchT, -0.5);
    toast(raking ? 'Hold the mouse button or space to lower the rake, then walk' : 'The rake is put away');
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
  help() {
    const on = $('help').classList.toggle('on');
    // Free the pointer while the help is open, so it can be read and closed.
    if (on) unlockPointer(); else lockPointer();
  },
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
  document.body.classList.add('begun');
  sound.start();
  wake();
  lockPointer();
}
$('enter').addEventListener('click', begin);

const KEYMAP = { KeyC: 'sit', KeyR: 'rake', KeyT: 'count', KeyL: 'light', KeyM: 'sound', KeyN: 'anew', KeyF: 'fullscreen', Slash: 'help', KeyH: 'help' };
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  wake();
  if (!$('intro').classList.contains('gone')) {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); begin(); }
    return;
  }
  keys.add(e.code);
  if (KEYMAP[e.code] && !e.repeat) {
    if (e.code === 'KeyN' && !raking) return;
    actions[KEYMAP[e.code]]();
  }
  if (e.code === 'Escape') {
    if ($('help').classList.contains('on')) $('help').classList.remove('on');
    else if (raking) actions.rake();
  }
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); rake.mouse = false; });

// Looking. With a mouse, the garden captures the pointer once you sit down,
// so simply moving the mouse turns your head: right turns right, forward
// looks up. Esc releases the pointer (browsers insist on that); a click on
// the garden captures it again. With the rake in hand, holding the button
// lowers it into the gravel. Touch screens drag to look instead.
const MOUSE = 0.0022;   // radians per pixel of mouse movement
const canLock = 'requestPointerLock' in canvas && !window.matchMedia('(pointer: coarse)').matches;
let locked = false, lockedAt = 0;
function lockPointer() {
  if (!canLock || locked || !$('intro').classList.contains('gone')) return;
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch { /* not allowed right now; the hint stays up */ }
}
function unlockPointer() { if (locked) document.exitPointerLock(); }
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  lockedAt = performance.now();
  document.body.classList.toggle('locked', locked);
  if (!locked) rake.mouse = false;
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  wake();
  // Browsers can report one spurious jump just after capturing the pointer:
  // ignore movement for a moment, and clamp anything implausibly large.
  if (performance.now() - lockedAt < 150) return;
  me.yawT -= clamp(e.movementX, -200, 200) * MOUSE;
  me.pitchT -= clamp(e.movementY, -200, 200) * MOUSE;
});

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  wake();
  if (e.pointerType === 'mouse' && canLock) {
    if (!locked) { lockPointer(); return; }          // this click only re-captures
    if (raking && e.button === 0) rake.mouse = true;
    return;
  }
  // Touch (or no pointer capture available): drag to look.
  canvas.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
  if (raking && (e.button === 0 || e.pointerType === 'touch')) rake.mouse = true;
  document.body.classList.add('grabbing');
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  wake();
  // A finger drags the scene; a mouse turns the head, as when captured.
  const k = (drag.touch ? 1 : -1) * 2.2 / window.innerHeight;
  me.yawT += (e.clientX - drag.x) * k;
  me.pitchT += (e.clientY - drag.y) * k;
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = (e) => {
  if (e.pointerType === 'mouse' && locked) { if (e.button === 0) rake.mouse = false; return; }
  if (drag && drag.id === e.pointerId) {
    drag = null;
    rake.mouse = false;
    document.body.classList.remove('grabbing');
  }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// Touch d-pad.
for (const [id, f, s] of [['pad-f', 1, 0], ['pad-b', -1, 0], ['pad-l', 0, -1], ['pad-r', 0, 1]]) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); el.setPointerCapture(e.pointerId); pad.f = f; pad.s = s; wake(); });
  const stop = () => { pad.f = 0; pad.s = 0; };
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
if (params.has('shot')) { $('intro').classList.add('gone'); document.body.classList.add('begun'); }

let last = performance.now();
let lastSaved = 0;
const stats = { ms: 0, tris: 0 };
function frame(nowMs) {
  // The first frame's timestamp can precede `last`; never step backwards.
  const dt = clamp((nowMs - last) / 1000, 0, 0.05);
  last = nowMs;
  const now = nowMs / 1000;

  updateVisitor(dt);
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
  // Remember where along the veranda you were, to sit there next time.
  if (now - lastSaved > 2) {
    if (onVeranda(me.x, me.z)) store.set('x', clamp(me.x, VIEW.xMin, VIEW.xMax).toFixed(2));
    lastSaved = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__garden = { me, gravel, rake, measureVisible, camera, actions, setLight, stats, keys, sound };
document.body.classList.add('ready');
})(globalThis.RJ = globalThis.RJ || {});
