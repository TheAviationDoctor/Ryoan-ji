// Everything in the garden that isn't gravel: stones, moss, walls, veranda,
// eaves, trees, sky and light.


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

(function (RJ) {
'use strict';
const { GARDEN, STONES, buildStone, icosphere, islandRadius, makeNoise3, mulberry32, fbm, smoothstep, clamp, kyotoToday } = RJ;

function canvasTexture(w, h, paint, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  paint(img.data, w, h);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const put = (d, k, r, g, b) => {
  d[k] = clamp(r, 0, 255); d[k + 1] = clamp(g, 0, 255); d[k + 2] = clamp(b, 0, 255); d[k + 3] = 255;
};

// ---------------------------------------------------------------------------
// Stones
// ---------------------------------------------------------------------------
function buildStoneMeshes() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  const raw = [];
  const meshes = STONES.map((def, i) => {
    const m = buildStone(def, 4);
    raw.push(m);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.stone = i;
    mesh.userData.top = new THREE.Vector3(...m.top);
    return mesh;
  });
  return { meshes, raw };
}

// ---------------------------------------------------------------------------
// Moss
// ---------------------------------------------------------------------------
function buildMoss(islands) {
  const group = new THREE.Group();
  const detail = canvasTexture(256, 256, (d, w, h) => {
    const rnd = mulberry32(31);
    for (let k = 0; k < w * h * 4; k += 4) {
      const v = 200 + (rnd() - 0.5) * 110;
      put(d, k, v, v, v);
    }
  }, { srgb: false });
  detail.repeat.set(9, 9);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
    bumpMap: detail, bumpScale: 2.5,
  });

  const RINGS = 22, SEG = 192;
  for (const isl of islands) {
    const noise = makeNoise3(500 + isl.g);
    const pos = [], col = [], idx = [];
    const H = 0.055;
    // Centre vertex + rings out to just beyond the edge (a rounded lip).
    for (let r = 0; r <= RINGS; r++) {
      const rho = r / RINGS * 1.03;
      for (let s = 0; s < SEG; s++) {
        const th = (s / SEG) * Math.PI * 2;
        const R = islandRadius(isl, th) * rho;
        const x = isl.cx + Math.cos(th) * R, z = isl.cz + Math.sin(th) * R;
        const n = fbm(noise, x * 1.8, z * 1.8, 0.3, 4);
        const fine = noise(x * 7, z * 7, 2.1);
        // Domed, with a soft rounded shoulder where it meets the gravel.
        let y;
        if (rho <= 1) y = H * Math.sqrt(Math.max(0, 1 - Math.pow(rho, 10))) * (0.85 + 0.25 * n) + 0.012 * fine;
        else y = -0.02;
        pos.push(x, y, z);
        // Greens: deep in the shade of the stones, brighter at the edges.
        const g = 0.5 + 0.5 * n;
        const lime = smoothstep(0.55, 0.85, rho) * 0.25;
        const patch = smoothstep(0.1, 0.5, fbm(noise, x * 4.5 + 9, z * 4.5, 1.7, 3));
        const brown = smoothstep(0.25, 0.6, fbm(noise, x * 2.2 - 4, z * 2.2, 3.3, 3)) * 0.6;
        let mr = 0.050 + 0.040 * g + 0.020 * lime + 0.010 * fine + 0.025 * patch;
        let mg = 0.090 + 0.070 * g + 0.030 * lime + 0.012 * fine + 0.040 * patch;
        let mb = 0.018 + 0.012 * g + 0.006 * patch;
        mr += (0.075 - mr) * brown; mg += (0.075 - mg) * brown; mb += (0.035 - mb) * brown;
        col.push(mr, mg, mb);
      }
    }
    for (let r = 0; r < RINGS; r++) {
      for (let s = 0; s < SEG; s++) {
        const a = r * SEG + s, b = r * SEG + ((s + 1) % SEG);
        const c = (r + 1) * SEG + s, d = (r + 1) * SEG + ((s + 1) % SEG);
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // Planar UVs for the detail bump.
    const uv = [];
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 0.5, pos[i + 2] * 0.5);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.name = 'moss';
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------------------
// Earthen walls (abura-dobei) with tiled caps
// ---------------------------------------------------------------------------
function wallTexture() {
  // 4096 px spans 26 m; 512 px spans 3.25 m of height.
  const noise = makeNoise3(2024);
  return canvasTexture(4096, 512, (d, w, h) => {
    const rnd = mulberry32(8);
    // Drip streak strengths per column.
    const drip = new Float32Array(w);
    for (let i = 0; i < w; i++) drip[i] = Math.max(0, noise(i * 0.045, 3.3, 0.7)) * (0.5 + 0.5 * noise(i * 0.004, 1.1, 0.2));
    for (let j = 0; j < h; j++) {
      const v = j / h; // 0 top, 1 bottom
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        const x = i / w * 26, y = (1 - v) * 3.25;
        // Large oil stains — the walls' famous mottled figures.
        const stain = fbm(noise, x * 0.32, y * 0.5, 4.2, 5);
        const blot = smoothstep(-0.05, 0.35, stain);
        // Rammed-earth layering.
        const layer = 0.5 + 0.5 * Math.sin(y * 21 + noise(x * 0.3, y, 1) * 2.5);
        const fine = noise(x * 9, y * 9, 9.1) * 0.5 + (rnd() - 0.5) * 0.35;
        // Streaks run down from the cap.
        const streak = drip[i] * smoothstep(0.0, 0.25, v) * (1 - smoothstep(0.3, 0.95, v + 0.2 * noise(x * 2, 5, 3)));
        const splash = smoothstep(0.78, 1.0, v) * (0.6 + 0.4 * noise(x * 3, y * 3, 7));
        let r = 190, g = 152, b = 108;
        const dark = 0.20 * blot + 0.035 * layer + 0.16 * streak + 0.22 * splash;
        r *= 1 - dark; g *= 1 - dark * 1.05; b *= 1 - dark * 1.1;
        const pale = smoothstep(0.25, 0.6, -stain) * 0.12;
        r += (205 - r) * pale; g += (178 - g) * pale; b += (140 - b) * pale;
        r += fine * 14; g += fine * 12; b += fine * 10;
        put(d, k, r, g, b);
      }
    }
  }, { repeat: false });
}

// The wall's cap is roofed with layered cypress bark (hiwada-buki), as
// restored in 1977, not with tiles.
function barkRoofTexture() {
  const noise = makeNoise3(61);
  return canvasTexture(256, 256, (d, w, h) => {
    const rnd = mulberry32(3);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      // Thin courses of bark laid along the wall, each slightly overlapping.
      const course = (j % 16) / 16;
      const lip = course > 0.86 ? 0.62 : 1 - 0.18 * course;
      const fibre = 0.9 + 0.1 * noise(i * 0.35, j * 0.02, 0.5) + (rnd() - 0.5) * 0.12;
      const weather = 0.85 + 0.15 * noise(i * 0.02, j * 0.05, 3.3);
      const v = lip * fibre * weather;
      put(d, k, 118 * v, 86 * v, 62 * v);
    }
  });
}

function buildWall(material, roofMat, { x0, z0, x1, z1, h0, h1, uOffset }) {
  const g = new THREE.Group();
  const L = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(z1 - z0, x1 - x0);
  const T = 0.5;
  // Body: a box whose top slopes from h0 to h1.
  const geo = new THREE.BoxGeometry(L, 1, T, 64, 1, 1);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i), ly = p.getY(i);
    const f = (lx + L / 2) / L;
    const top = h0 + (h1 - h0) * f;
    const y = ly > 0 ? top : -0.05;
    p.setY(i, y);
    // UVs in metres along the 26 m texture.
    uv.setXY(i, (uOffset + lx + L / 2) / 26, y / 3.25);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, material);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // Tiled cap: a shallow gable with overhang, plus a ridge.
  const roof = new THREE.BufferGeometry();
  const segs = 48, over = 0.34, rise = 0.26;
  const verts = [], uvs = [], ids = [];
  for (let s = 0; s <= segs; s++) {
    const f = s / segs;
    const lx = -L / 2 - 0.12 + f * (L + 0.24);
    const top = h0 + (h1 - h0) * clamp((lx + L / 2) / L, 0, 1);
    // Front eave, ridge, back eave.
    verts.push(lx, top + 0.02, -T / 2 - over, lx, top + rise, 0, lx, top + 0.02, T / 2 + over);
    uvs.push(lx * 4, 0, lx * 4, 1.5, lx * 4, 3);
  }
  for (let s = 0; s < segs; s++) {
    const a = s * 3, b = (s + 1) * 3;
    ids.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }
  roof.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roof.setIndex(ids);
  roof.computeVertexNormals();
  const roofMesh = new THREE.Mesh(roof, roofMat);
  roofMesh.castShadow = true; roofMesh.receiveShadow = true;
  g.add(roofMesh);
  // Underside of the cap (dark), and the ridge.
  const under = new THREE.Mesh(new THREE.BoxGeometry(L + 0.24, 0.09, T + 2 * over), new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.95 }));
  under.position.set(0, (h0 + h1) / 2 + 0.0, 0);
  under.scale.y = 1;
  // Slope the underside by shearing the vertices to follow the wall top.
  const up = under.geometry.attributes.position;
  for (let i = 0; i < up.count; i++) {
    const f = clamp((up.getX(i) + L / 2) / L, 0, 1);
    up.setY(i, up.getY(i) + (h0 + (h1 - h0) * f) - (h0 + h1) / 2);
  }
  under.geometry.computeVertexNormals();
  g.add(under);
  const ridgeGeo = new THREE.CylinderGeometry(0.075, 0.075, L + 0.3, 8, 24, false);
  ridgeGeo.rotateZ(Math.PI / 2);
  const rp = ridgeGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const f = clamp((rp.getX(i) + L / 2) / L, 0, 1);
    rp.setY(i, rp.getY(i) + h0 + (h1 - h0) * f + rise + 0.02);
  }
  ridgeGeo.computeVertexNormals();
  const ridge = new THREE.Mesh(ridgeGeo, roofMat);
  ridge.castShadow = true;
  g.add(ridge);

  // The thick, rounded edge of the bark roofing along both sides of the cap.
  for (const side of [-1, 1]) {
    const eg = new THREE.CylinderGeometry(0.055, 0.055, L + 0.24, 10, 24);
    eg.rotateZ(Math.PI / 2);
    const ep = eg.attributes.position;
    for (let i = 0; i < ep.count; i++) {
      const f = clamp((ep.getX(i) + L / 2) / L, 0, 1);
      ep.setY(i, ep.getY(i) + h0 + (h1 - h0) * f + 0.03);
      ep.setZ(i, ep.getZ(i) + side * (T / 2 + over));
    }
    eg.computeVertexNormals();
    const eave = new THREE.Mesh(eg, roofMat);
    eave.castShadow = true;
    g.add(eave);
  }

  // Plinth.
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(L, 0.16, T + 0.06), new THREE.MeshStandardMaterial({ color: 0x4a4744, roughness: 0.9 }));
  plinth.position.y = 0.05;
  plinth.receiveShadow = true;
  g.add(plinth);

  g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  g.rotation.y = -ang;
  return g;
}

function buildWalls() {
  const group = new THREE.Group();
  const tex = wallTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97, metalness: 0 });
  const bark = barkRoofTexture();
  const roofMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95, metalness: 0 });
  const T = 0.25;
  // South wall: it famously steps down in height towards the west.
  group.add(buildWall(mat, roofMat, { x0: -0.5, z0: -GARDEN.depth - T, x1: GARDEN.width + 0.5, z1: -GARDEN.depth - T, h0: 2.0, h1: 1.78, uOffset: 0 }));
  // West wall.
  group.add(buildWall(mat, roofMat, { x0: GARDEN.width + T, z0: -GARDEN.depth - 0.5, x1: GARDEN.width + T, z1: 0.6, h0: 1.78, h1: 1.82, uOffset: 3 }));
  // East wall.
  group.add(buildWall(mat, roofMat, { x0: -T, z0: 0.6, x1: -T, z1: -GARDEN.depth - 0.5, h0: 1.95, h1: 2.0, uOffset: 13 }));
  return group;
}

// ---------------------------------------------------------------------------
// Pebble gutters (along the veranda and at the foot of the walls)
// ---------------------------------------------------------------------------
function buildPebbles() {
  const group = new THREE.Group();
  const rnd = mulberry32(606);
  const make = (x0, x1, z0, z1, size, detail, density, tint) => {
    const area = (x1 - x0) * (z1 - z0);
    const n = Math.floor(area * density);
    const base = new THREE.IcosahedronGeometry(1, detail);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, flatShading: detail === 0 });
    const inst = new THREE.InstancedMesh(base, mat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const sz = size * (0.55 + rnd() * 0.9);
      p.set(x0 + rnd() * (x1 - x0), sz * 0.25 - 0.015, z0 + rnd() * (z1 - z0));
      e.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28);
      q.setFromEuler(e);
      s.set(sz, sz * (0.45 + rnd() * 0.3), sz * (0.7 + rnd() * 0.4));
      m4.compose(p, q, s);
      inst.setMatrixAt(i, m4);
      const v = tint[0] + rnd() * tint[1];
      c.setRGB(v, v * 0.98, v * 0.95);
      inst.setColorAt(i, c);
    }
    inst.receiveShadow = true;
    inst.castShadow = false;
    return inst;
  };
  // Under the eaves: dark river stones.
  group.add(make(-0.5, GARDEN.width + 0.5, 0.0, GARDEN.verandaEdgeZ + 0.05, 0.045, 1, 420, [0.09, 0.12]));
  // A dark stone kerb between gutter and gravel.
  const kerb = new THREE.Mesh(new THREE.BoxGeometry(GARDEN.width + 1, 0.08, 0.07), new THREE.MeshStandardMaterial({ color: 0x5b5753, roughness: 0.85 }));
  kerb.position.set(GARDEN.width / 2, 0.015, 0.0);
  kerb.receiveShadow = true;
  group.add(kerb);
  // Narrow gutters of grey stones at the foot of the walls.
  group.add(make(-0.2, GARDEN.width + 0.2, -GARDEN.depth - 0.02, -GARDEN.depth + 0.16, 0.04, 0, 380, [0.22, 0.12]));
  group.add(make(GARDEN.width - 0.16, GARDEN.width + 0.02, -GARDEN.depth, 0.0, 0.04, 0, 380, [0.22, 0.12]));
  group.add(make(-0.02, 0.16, -GARDEN.depth, 0.0, 0.04, 0, 380, [0.22, 0.12]));
  return group;
}

// ---------------------------------------------------------------------------
// Veranda, building and eaves
// ---------------------------------------------------------------------------
function woodTexture(seed, base = [92, 72, 56]) {
  const noise = makeNoise3(seed);
  // 1024 x 1024 spans 4 m along the boards, 4 boards of 0.25 m... repeated.
  return canvasTexture(1024, 1024, (d, w, h) => {
    const rnd = mulberry32(seed);
    const boardTone = Array.from({ length: 8 }, () => 0.85 + rnd() * 0.3);
    for (let j = 0; j < h; j++) {
      const board = Math.floor(j / 128);
      const inBoard = (j % 128) / 128;
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        const grain = noise(i * 0.004 + board * 7, j * 0.09, 0.5);
        const fine = noise(i * 0.02, j * 0.6, 1.5);
        let v = boardTone[board] * (1 + 0.16 * grain + 0.06 * fine);
        const seam = inBoard < 0.015 || inBoard > 0.985 ? 0.35 : 1;
        // Polished wear in the middle of each board.
        v *= seam * (1 + 0.06 * Math.sin(inBoard * Math.PI));
        put(d, k, base[0] * v, base[1] * v, base[2] * v);
      }
    }
  });
}

function shojiTexture() {
  return canvasTexture(512, 512, (d, w, h) => {
    const rnd = mulberry32(12);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      const kumi = (i % 64) < 5 || (j % 85) < 5; // lattice
      const frame = i < 14 || i > w - 14 || j < 14 || j > h - 14;
      if (frame) put(d, k, 74, 58, 44);
      else if (kumi) put(d, k, 150, 128, 100);
      else { const v = 226 + (rnd() - 0.5) * 8; put(d, k, v, v - 3, v - 12); }
    }
  });
}

function buildVeranda() {
  const group = new THREE.Group();
  const G = GARDEN;
  const len = G.width + 6;
  const cx = G.width / 2;
  const depth = G.verandaBackZ - G.verandaEdgeZ;

  const floorTex = woodTexture(71);
  floorTex.repeat.set(len / 4, depth / 4); // boards run along the veranda
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.48, metalness: 0.0 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, depth), floorMat);
  floor.position.set(cx, G.verandaFloorY - 0.04, (G.verandaEdgeZ + G.verandaBackZ) / 2);
  floor.receiveShadow = true; floor.castShadow = true;
  floor.name = 'veranda';
  group.add(floor);

  const darkWood = new THREE.MeshStandardMaterial({ color: 0x2c221b, roughness: 0.8 });
  // Edge beam and the dark space beneath the boards.
  const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.14), darkWood);
  beam.position.set(cx, G.verandaFloorY - 0.18, G.verandaEdgeZ + 0.07);
  beam.castShadow = true;
  group.add(beam);
  const under = new THREE.Mesh(new THREE.BoxGeometry(len, G.verandaFloorY, depth), new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 1 }));
  under.position.set(cx, G.verandaFloorY / 2 - 0.05, (G.verandaEdgeZ + G.verandaBackZ) / 2 + 0.12);
  group.add(under);
  // Short posts under the beam.
  for (let x = -2.5; x <= G.width + 2.5; x += 1.82) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, G.verandaFloorY - 0.25, 0.12), darkWood);
    post.position.set(x, (G.verandaFloorY - 0.25) / 2, G.verandaEdgeZ + 0.12);
    group.add(post);
  }

  // The hall behind: shoji and pillars.
  const shoji = shojiTexture();
  shoji.repeat.set(len / 1.82, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: shoji, roughness: 0.9 });
  const hall = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.3), wallMat);
  hall.position.set(cx, G.verandaFloorY + 1.15, G.verandaBackZ + 0.05);
  hall.rotation.y = Math.PI;
  group.add(hall);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a2d22, roughness: 0.7 });
  for (let x = -2.5; x <= G.width + 2.5; x += 3.64) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 0.22), pillarMat);
    p.position.set(x, G.verandaFloorY + 1.5, G.verandaBackZ - 0.05);
    p.castShadow = true;
    group.add(p);
  }
  // Plaster panel between the lintel and the eaves.
  const kokabe = new THREE.Mesh(new THREE.BoxGeometry(len, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.95 }));
  kokabe.position.set(cx, G.verandaFloorY + 3.0, G.verandaBackZ + 0.02);
  group.add(kokabe);

  // The hall turns the corner at each end of the veranda.
  for (const x of [cx - len / 2 + 0.05, cx + len / 2 - 0.05]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.75, depth + 0.2), wallMat);
    end.position.set(x, G.verandaFloorY + 1.37, (G.verandaEdgeZ + G.verandaBackZ) / 2);
    end.castShadow = true;
    group.add(end);
  }
  // A lintel above the shoji.
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.15), pillarMat);
  lintel.position.set(cx, G.verandaFloorY + 2.55, G.verandaBackZ - 0.02);
  group.add(lintel);

  // Eaves: a sloping soffit with exposed rafters and a fascia board.
  const backY = G.verandaFloorY + 2.85, backZ = G.verandaBackZ, edgeY = G.eaveEdgeY, edgeZ = G.eaveEdgeZ;
  const run = backZ - edgeZ, drop = backY - edgeY;
  const slope = Math.atan2(drop, run);
  const soffitTex = woodTexture(88, [70, 56, 44]);
  soffitTex.rotation = 0;
  soffitTex.repeat.set(len / 4, run / 4);
  const soffitMat = new THREE.MeshStandardMaterial({ map: soffitTex, roughness: 0.9 });
  const soffit = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, Math.hypot(run, drop) + 0.2), soffitMat);
  soffit.position.set(cx, (backY + edgeY) / 2 + 0.11, (backZ + edgeZ) / 2);
  soffit.rotation.x = -slope;
  soffit.castShadow = true; soffit.receiveShadow = true;
  group.add(soffit);

  const rafterGeo = new THREE.BoxGeometry(0.065, 0.09, Math.hypot(run, drop) + 0.15);
  const count = Math.floor(len / 0.3);
  const rafters = new THREE.InstancedMesh(rafterGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.85 }), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-slope, 0, 0));
  for (let i = 0; i < count; i++) {
    m4.compose(new THREE.Vector3(cx - len / 2 + 0.15 + i * 0.3, (backY + edgeY) / 2 + 0.03, (backZ + edgeZ) / 2), q, new THREE.Vector3(1, 1, 1));
    rafters.setMatrixAt(i, m4);
  }
  rafters.castShadow = true;
  group.add(rafters);
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(len, 0.26, 0.09), new THREE.MeshStandardMaterial({ color: 0x3b2f25, roughness: 0.8 }));
  fascia.position.set(cx, edgeY + 0.08, edgeZ - 0.02);
  fascia.castShadow = true;
  group.add(fascia);
  // The roof above, as a thick dark slab (it is only ever seen as a shadow).
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len, 0.35, Math.hypot(run, drop) + 0.4), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.8 }));
  roof.position.set(cx, (backY + edgeY) / 2 + 0.4, (backZ + edgeZ) / 2);
  roof.rotation.x = -slope;
  roof.castShadow = true;
  group.add(roof);

  return group;
}

// ---------------------------------------------------------------------------
// Season (for the trees, in trees.js)
// ---------------------------------------------------------------------------
function seasonFor(now = new Date()) {
  const q = new URLSearchParams(location.search).get('season');
  if (q) return q;
  const { m, d } = kyotoToday(now);
  const md = (m + 1) * 100 + d;
  if (md >= 325 && md <= 412) return 'sakura';
  if (md >= 1105 && md <= 1210) return 'koyo';
  if (md >= 1015 && md < 1105) return 'early-autumn';
  if (md > 1210 || md < 310) return 'winter';
  return 'summer';
}

// ---------------------------------------------------------------------------
// Sky dome and stars
// ---------------------------------------------------------------------------
function buildSky() {
  const uniforms = {
    top: { value: new THREE.Color(0.2, 0.4, 0.75) },
    horizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(1, 0.9, 0.8) },
    sunGlow: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow;
      varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * sunGlow * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  sky.renderOrder = -1;

  // Stars, visible only at night.
  const rnd = mulberry32(77);
  const n = 1400, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, y = 0.08 + rnd() * 0.92, r = Math.sqrt(1 - y * y);
    p[i * 3] = Math.cos(a) * r * 280; p[i * 3 + 1] = y * 280; p[i * 3 + 2] = Math.sin(a) * r * 280;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  return { sky, stars, uniforms };
}

Object.assign(RJ, { buildStoneMeshes, buildMoss, buildWalls, buildPebbles, buildVeranda, seasonFor, buildSky });
})(globalThis.RJ = globalThis.RJ || {});
