// Procedural stone geometry. Pure JavaScript (no three.js) so the occlusion
// verifier in tools/ can build exactly the same meshes the browser renders.


// ---------------------------------------------------------------------------
// Icosphere (indexed), cached per subdivision level
// ---------------------------------------------------------------------------

(function (RJ) {
'use strict';
const { makeNoise3, fbm, ridged, mulberry32, clamp, smoothstep } = RJ;

const icoCache = new Map();

function icosphere(subdiv) {
  if (icoCache.has(subdiv)) return icoCache.get(subdiv);
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < subdiv; s++) {
    const mid = new Map();
    const midpoint = (a, b) => {
      const key = a < b ? a * 100000 + b : b * 100000 + a;
      if (mid.has(key)) return mid.get(key);
      const va = verts[a], vb = verts[b];
      const m = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
      const l = Math.hypot(m[0], m[1], m[2]);
      verts.push([m[0] / l, m[1] / l, m[2] / l]);
      mid.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const out = {
    positions: new Float32Array(verts.flat()),
    indices: new Uint32Array(faces.flat()),
  };
  icoCache.set(subdiv, out);
  return out;
}

function computeNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const e1x = positions[b] - positions[a], e1y = positions[b + 1] - positions[a + 1], e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a], e2y = positions[c + 1] - positions[a + 1], e2z = positions[c + 2] - positions[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Stone shaping
// ---------------------------------------------------------------------------
// def: { x, z, w, d, h, rot, seed, sink?, lean?, facets?, taper?, rough?, tone? }
//   w, d : footprint (m) along the stone's local x and z
//   h    : height above the gravel (m)
//   sink : depth buried below the gravel (m)
//   tone : [r,g,b] base colour (linear-ish 0..1)
function buildStone(def, subdiv = 4) {
  const base = icosphere(subdiv);
  const count = base.positions.length / 3;
  const pos = new Float32Array(base.positions.length);
  const noise = makeNoise3(def.seed * 7919 + 13);
  const rnd = mulberry32(def.seed * 104729 + 7);

  const sink = def.sink ?? Math.min(0.25, def.h * 0.35 + 0.05);
  const lean = def.lean ?? 0;
  const taper = def.taper ?? 0.25;
  const rough = def.rough ?? 1;
  const nFacets = (def.facets ?? 5) + 3;

  // Random cutting planes give the stone its broken, faceted character.
  const planes = [];
  for (let i = 0; i < nFacets; i++) {
    const th = rnd() * Math.PI * 2;
    const ph = Math.acos(clamp(rnd() * 1.6 - 0.6, -1, 1)); // bias towards upper/side faces
    const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
    planes.push({ nx, ny, nz, o: 0.5 + rnd() * 0.32, k: 0.92 + rnd() * 0.08 });
  }

  const cr = Math.cos(def.rot), sr = Math.sin(def.rot);
  const s = def.seed * 3.17;

  for (let i = 0; i < count; i++) {
    let x = base.positions[i * 3], y = base.positions[i * 3 + 1], z = base.positions[i * 3 + 2];

    // Large-scale lumpiness plus ridged detail.
    const r = 1
      + 0.24 * rough * fbm(noise, x * 1.1 + s, y * 1.1, z * 1.1 - s, 3)
      + 0.10 * rough * (ridged(noise, x * 2.6 - s, y * 2.6 + s, z * 2.6, 4) - 0.5)
      + 0.025 * rough * noise(x * 9 + s, y * 9, z * 9)
      + 0.010 * rough * noise(x * 23 - s, y * 23, z * 23);
    x *= r; y *= r; z *= r;

    // Soft planar cuts.
    for (const p of planes) {
      const dd = x * p.nx + y * p.ny + z * p.nz;
      if (dd > p.o) {
        const cut = (dd - p.o) * p.k;
        x -= p.nx * cut; y -= p.ny * cut; z -= p.nz * cut;
      }
    }

    // Map to final dimensions. t: 0 at the buried base, 1 at the top.
    const t = clamp((y + 1) / 2, 0, 1);
    const spread = 1 + taper * (1 - t) * (1 - t) - taper * 0.35 * t * t;
    let lx = x * (def.w / 2) * spread;
    let lz = z * (def.d / 2) * spread;
    let ly = t * (def.h + sink) - sink;
    lx += lean * t * t * def.h;

    // Rotate about y and place.
    pos[i * 3] = def.x + lx * cr - lz * sr;
    pos[i * 3 + 1] = ly;
    pos[i * 3 + 2] = def.z + lx * sr + lz * cr;
  }

  const normals = computeNormals(pos, base.indices);

  // Vertex colours: base tone, weathering, damp base, lichen and a moss collar.
  const tone = def.tone ?? [0.21, 0.2, 0.19];
  const col = new Float32Array(pos.length);
  for (let i = 0; i < count; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    const ny = normals[i * 3 + 1];
    const n1 = fbm(noise, px * 2.3, py * 2.3, pz * 2.3, 4);
    const n2 = noise(px * 9.0 + 5, py * 9.0, pz * 9.0 - 3);
    const n3 = noise(px * 23.0, py * 23.0 + 7, pz * 23.0);
    let shade = 1 + 0.45 * n1 + 0.16 * n2 + 0.10 * n3;
    shade *= 0.9 + 0.18 * smoothstep(-0.2, 0.9, ny); // sun-bleached tops
    let r = tone[0] * shade, g = tone[1] * shade, b = tone[2] * shade;

    // Darker, damp foot of the stone.
    const damp = 1 - smoothstep(0.0, 0.22, py);
    r *= 1 - 0.35 * damp; g *= 1 - 0.32 * damp; b *= 1 - 0.30 * damp;

    // Pale lichen patches on upward faces.
    const lich = smoothstep(0.42, 0.62, fbm(noise, px * 4.1 + 11, py * 4.1, pz * 4.1, 3) + 0.25 * ny);
    r += (0.34 - r) * lich * 0.5; g += (0.35 - g) * lich * 0.5; b += (0.30 - b) * lich * 0.5;

    // Moss creeping up from the bed.
    const moss = (1 - smoothstep(0.02, 0.16 + 0.06 * n2, py)) * smoothstep(-0.3, 0.3, n1 + 0.2);
    r += (0.045 - r) * moss * 0.85; g += (0.075 - g) * moss * 0.85; b += (0.02 - b) * moss * 0.85;

    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
  }

  // Top-most point (for labels) and footprint radius.
  let top = 0, topI = 0, rad = 0;
  for (let i = 0; i < count; i++) {
    if (pos[i * 3 + 1] > top) { top = pos[i * 3 + 1]; topI = i; }
    if (pos[i * 3 + 1] > -0.02) rad = Math.max(rad, Math.hypot(pos[i * 3] - def.x, pos[i * 3 + 2] - def.z));
  }

  return {
    positions: pos,
    normals,
    colors: col,
    indices: base.indices,
    top: [pos[topI * 3], top, pos[topI * 3 + 2]],
    radius: rad,
  };
}

Object.assign(RJ, { icosphere, computeNormals, buildStone });
})(globalThis.RJ = globalThis.RJ || {});
