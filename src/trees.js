// The trees beyond the walls, after those around the real garden: Japanese
// red pines with crooked, red-barked trunks and flat pads of needles; maples
// (momiji) that turn red in November; the weeping cherry (shidare-zakura)
// that leans over the wall in spring; and behind them a dense mass of
// evergreen oaks and cedars.
//
// Each tree has real trunk and branch geometry. Foliage is made of many small
// alpha-tested cards drawn with leaves, needles or blossoms, lit as if each
// crown were a soft volume, swaying slightly, and glowing when the sun is
// behind them. Seasons follow the date in Kyoto.

(function (RJ) {
'use strict';
const { GARDEN, mulberry32, smoothstep } = RJ;
let season = 'summer';

// ---------------------------------------------------------------------------
// Leaf atlas: four 512 px cells, drawn on a canvas.
// ---------------------------------------------------------------------------
const CELL = 512, ATLAS = 1024;
const CELLS = { broad: [0, 0], maple: [1, 0], needle: [0, 1], blossom: [1, 1] };

function leafAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(2718);
  const grey = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;

  const inCell = (name, draw) => {
    const [cx, cy] = CELLS[name];
    ctx.save();
    ctx.translate(cx * CELL, cy * CELL);
    ctx.beginPath(); ctx.rect(10, 10, CELL - 20, CELL - 20); ctx.clip();
    draw();
    ctx.restore();
  };

  // A spray of twigs from the bottom centre; returns sample points on them.
  const twigs = (n, shade, width) => {
    const pts = [];
    for (let t = 0; t < n; t++) {
      const x0 = 256 + (rnd() - 0.5) * 40, y0 = 256 + (rnd() - 0.5) * 40;
      const a = (t / n) * Math.PI * 2 + (rnd() - 0.5) * 0.8;
      const len = 130 + rnd() * 90;
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      const mx = (x0 + x1) / 2 + (rnd() - 0.5) * 90, my = (y0 + y1) / 2 + (rnd() - 0.5) * 60;
      ctx.strokeStyle = grey(shade); ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
      for (let k = 0; k < 40; k++) {
        const s = 0.15 + 0.85 * (k / 39), u = 1 - s;
        pts.push([u * u * x0 + 2 * u * s * mx + s * s * x1, u * u * y0 + 2 * u * s * my + s * s * y1, a]);
      }
    }
    return pts;
  };

  // Broad leaves: evergreen oak, camellia, cherry in summer.
  inCell('broad', () => {
    const pts = twigs(6, 70, 4);
    for (let i = 0; i < 190; i++) {
      const [x, y, a] = pts[Math.floor(rnd() * pts.length)];
      const ang = a + (rnd() - 0.5) * 2.2;
      const L = 26 + rnd() * 16, W = 10 + rnd() * 6;
      ctx.save();
      ctx.translate(x + Math.cos(ang) * L * 0.8, y + Math.sin(ang) * L * 0.8);
      ctx.rotate(ang);
      ctx.fillStyle = grey(150 + rnd() * 100);
      ctx.beginPath(); ctx.ellipse(0, 0, L, W, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = grey(110); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-L * 0.9, 0); ctx.lineTo(L * 0.9, 0); ctx.stroke();
      ctx.restore();
    }
  });

  // Palmate maple leaves.
  inCell('maple', () => {
    const pts = twigs(6, 80, 3);
    for (let i = 0; i < 260; i++) {
      const [x, y, a] = pts[Math.floor(rnd() * pts.length)];
      const ang = a + (rnd() - 0.5) * 2.6;
      const s = 17 + rnd() * 11;
      ctx.save();
      ctx.translate(x + Math.cos(ang) * s, y + Math.sin(ang) * s);
      ctx.rotate(ang + Math.PI / 2);
      ctx.fillStyle = grey(165 + rnd() * 90);
      ctx.beginPath();
      const lobes = 7;
      for (let k = 0; k <= lobes * 2; k++) {
        const t = k / (lobes * 2);
        const th = -Math.PI / 2 + (t - 0.5) * Math.PI * 1.75;
        const tip = k % 2 === 0;
        const reach = tip ? s * (0.55 + 0.45 * Math.cos((t - 0.5) * Math.PI * 1.1)) : s * 0.3;
        const px = Math.cos(th) * reach, py = Math.sin(th) * reach;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  });

  // Pine needles, in brush-like tufts.
  inCell('needle', () => {
    twigs(4, 75, 5);
    for (let i = 0; i < 110; i++) {
      const cx = 256 + (rnd() - 0.5) * 400, cy = 256 + (rnd() - 0.5) * 380;
      const dir = Math.atan2(cy - 330, cx - 256) + (rnd() - 0.5) * 0.6;
      for (let k = 0; k < 26; k++) {
        const a = dir + (rnd() - 0.5) * 2.0;
        const L = 26 + rnd() * 26;
        ctx.strokeStyle = grey(120 + rnd() * 110); ctx.lineWidth = 1.7;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); ctx.stroke();
      }
    }
  });

  // Cherry blossom along hanging strands.
  inCell('blossom', () => {
    for (let t = 0; t < 6; t++) {
      const x0 = 60 + t * 80 + (rnd() - 0.5) * 30;
      ctx.strokeStyle = 'rgb(92,70,62)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x0, 12); ctx.bezierCurveTo(x0 + 20, 160, x0 - 20, 340, x0 + (rnd() - 0.5) * 30, 500); ctx.stroke();
    }
    for (let i = 0; i < 260; i++) {
      const x = 30 + rnd() * 452, y = 25 + rnd() * 462;
      const f = rnd();
      const pr = 248 - f * 14, pg = 236 - f * 66, pb = 240 - f * 48;
      const r = 5 + rnd() * 2.5;
      ctx.fillStyle = `rgb(${pr | 0},${pg | 0},${pb | 0})`;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + rnd();
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.85, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgb(205,110,135)';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
  });

  // Copy out, and give transparent pixels the cell's mean colour so that
  // filtering doesn't draw dark fringes around every leaf.
  const img = ctx.getImageData(0, 0, ATLAS, ATLAS).data;
  const data = new Uint8Array(img.length);
  data.set(img);
  for (const [cx, cy] of Object.values(CELLS)) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = cy * CELL; y < (cy + 1) * CELL; y++) for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
      const k = (y * ATLAS + x) * 4;
      if (data[k + 3] > 200) { r += data[k]; g += data[k + 1]; b += data[k + 2]; n++; }
    }
    r /= n || 1; g /= n || 1; b /= n || 1;
    for (let y = cy * CELL; y < (cy + 1) * CELL; y++) for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
      const k = (y * ATLAS + x) * 4;
      if (data[k + 3] < 200) { data[k] = r; data[k + 1] = g; data[k + 2] = b; }
    }
  }
  const tex = new THREE.DataTexture(data, ATLAS, ATLAS, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Small vector helpers (plain arrays).
// ---------------------------------------------------------------------------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// ---------------------------------------------------------------------------
// Builder: accumulates bark geometry and foliage cards.
// ---------------------------------------------------------------------------
class Grove {
  constructor(seed) {
    this.rnd = mulberry32(seed);
    this.bark = { pos: [], nor: [], col: [], idx: [] };
    this.cards = { broad: [], maple: [], needle: [], blossom: [] };
  }

  // A tapered tube along a polyline. colorAt(t) gives the bark colour.
  tube(points, radii, colorAt, sides = 6) {
    const B = this.bark;
    const base = B.pos.length / 3;
    let prevN = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const t = norm(i < points.length - 1 ? add(points[i + 1], mul(p, -1)) : add(p, mul(points[i - 1], -1)));
      let n = prevN ? norm(add(prevN, mul(t, -(prevN[0] * t[0] + prevN[1] * t[1] + prevN[2] * t[2])))) : norm(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      if (!isFinite(n[0])) n = norm(cross(t, [1, 0, 0]));
      prevN = n;
      const bnr = cross(t, n);
      const col = colorAt(i / (points.length - 1));
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const d = add(mul(n, Math.cos(a)), mul(bnr, Math.sin(a)));
        const v = add(p, mul(d, radii[i]));
        B.pos.push(v[0], v[1], v[2]);
        B.nor.push(d[0], d[1], d[2]);
        const shade = 0.85 + 0.15 * Math.cos(a - 1);
        B.col.push(col[0] * shade, col[1] * shade, col[2] * shade);
      }
    }
    for (let i = 0; i < points.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
        const a = base + i * sides + k, b = base + i * sides + ((k + 1) % sides);
        const c = a + sides, d = b + sides;
        B.idx.push(a, c, b, b, c, d);
      }
    }
  }

  // A wandering branch from p in direction dir.
  branch(p, dir, length, r0, r1, segs, wander, colorAt, droop = 0) {
    const pts = [p], rad = [r0];
    let d = norm(dir), q = p;
    const rnd = this.rnd;
    for (let i = 1; i <= segs; i++) {
      d = norm(add(d, [(rnd() - 0.5) * wander, (rnd() - 0.5) * wander * 0.5 - droop, (rnd() - 0.5) * wander]));
      q = add(q, mul(d, length / segs));
      pts.push(q);
      rad.push(r0 + (r1 - r0) * (i / segs));
    }
    this.tube(pts, rad, colorAt, r0 > 0.08 ? 7 : 5);
    return pts;
  }

  // One foliage card.
  card(type, pos, size, normalHint, color, orient) {
    const rnd = this.rnd;
    let e;
    if (orient === 'flat') e = [-Math.PI / 2 + (rnd() - 0.5) * 0.9, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.6];
    else if (orient === 'hang') e = [(rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.3];
    else e = [rnd() * Math.PI * 2, rnd() * Math.PI * 2, rnd() * Math.PI * 2];
    // Keep leaves out of the walls and above the visitor's head in the garden.
    const insideX = pos[0] > -0.6 && pos[0] < GARDEN.width + 0.6;
    const insideZ = pos[2] > -GARDEN.depth - 0.6 && pos[2] < 0.6;
    if (insideX && insideZ && pos[1] < 2.55) pos = [pos[0], 2.55 + rnd() * 0.2, pos[2]];
    this.cards[type].push({ pos, size, n: norm(normalHint), color, e });
  }

  // Fill an ellipsoid crown with cards, mostly near its surface.
  crown(type, c, r, count, size, palette, opts = {}) {
    const rnd = this.rnd;
    for (let i = 0; i < count; i++) {
      let u;
      do { u = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; } while (len(u) > 1 || len(u) < 0.05);
      u = norm(u);
      if (opts.flatTop && u[1] < -0.3) u[1] *= 0.4;
      const depth = Math.pow(rnd(), 0.35);           // biased to the outside
      const p = [c[0] + u[0] * r[0] * depth, c[1] + u[1] * r[1] * depth, c[2] + u[2] * r[2] * depth];
      const grad = norm([u[0] / r[0], u[1] / r[1] + (opts.up ?? 0.4) / r[1], u[2] / r[2]]);
      const ao = 0.5 + 0.5 * smoothstep(0.3, 1.0, depth) * (0.75 + 0.25 * (u[1] * 0.5 + 0.5));
      let col = palette(u, depth, rnd);
      col = mul(col, ao * (0.88 + rnd() * 0.24));
      this.card(type, p, size * (0.8 + rnd() * 0.45), grad, col, opts.orient);
    }
  }
}

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------
const BARK_GREY = hex(0x55504a), BARK_DARK = hex(0x3a332e), PINE_RED = hex(0x7e5444), CEDAR_RED = hex(0x5e4234);

function palettes(season) {
  const pick = (list) => (u, d, rnd) => hex(list[Math.floor(rnd() * list.length)]);
  const maple = {
    sakura: [0x8db04e, 0x9cbc58, 0x7da244],
    summer: [0x557f2e, 0x5f8a34, 0x4a7328],
    'early-autumn': [0x6f8a30, 0x9a8a2a, 0xb87a26, 0x7d8a2e],
    koyo: null,
    winter: null,
  }[season];
  // Peak colour: crimson at the sunlit top and edges, orange and gold within.
  const koyo = (u, d, rnd) => {
    const outer = smoothstep(0.55, 1.0, d) * (0.6 + 0.4 * (u[1] * 0.5 + 0.5));
    const reds = [0xb01e14, 0xc42a16, 0x9c1a12, 0xd23a18];
    const golds = [0xd8641c, 0xe08a26, 0xc8a030, 0xd0761e];
    const list = rnd() < 0.25 + 0.7 * outer ? reds : golds;
    return hex(list[Math.floor(rnd() * list.length)]);
  };
  const cherryLeaves = {
    summer: [0x5a7d33, 0x648a3a], 'early-autumn': [0x7a7a30, 0x9a6a2a],
    koyo: [0xb0682a, 0xa04a24, 0xc08a34], sakura: null, winter: null,
  }[season];
  return {
    maple: season === 'koyo' ? koyo : maple ? pick(maple) : null,
    cherry: cherryLeaves ? pick(cherryLeaves) : null,
    blossom: season === 'sakura' ? pick([0xffffff, 0xfbf3f5, 0xf4e6ea]) : null,
    oak: pick([0x34502a, 0x3c5a30, 0x2c4624, 0x456236]),
    pine: pick([0x2f4c2c, 0x385634, 0x284326]),
    cedar: pick([0x2c4228, 0x243a22, 0x324a2c]),
    shrub: pick([0x2e4a28, 0x38562e, 0x40602f]),
  };
}

// Japanese red pine: crooked trunk, red-orange above, layered pads.
function redPine(G, P, x, z, H) {
  const rnd = G.rnd;
  const s = H / 12;
  const pts = [], rad = [];
  let p = [x, -0.1, z], d = norm([(rnd() - 0.5) * 0.6, 1, (rnd() - 0.5) * 0.6]);
  const n = 9;
  for (let i = 0; i <= n; i++) {
    pts.push(p); rad.push((0.26 - 0.2 * (i / n)) * s);
    d = norm(add(d, [(rnd() - 0.5) * 0.7, 0, (rnd() - 0.5) * 0.7]));
    if (d[1] < 0.6) d = norm([d[0], 0.6, d[2]]);
    p = add(p, mul(d, H / n));
  }
  G.tube(pts, rad, (t) => mix3(BARK_GREY, PINE_RED, smoothstep(0.25, 0.6, t)), 8);
  const at = (t) => {
    const f = t * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
    return mix3(pts[i], pts[i + 1], k);
  };
  const tiers = 7 + Math.floor(rnd() * 4);
  for (let k = 0; k < tiers; k++) {
    const t = 0.45 + (k / tiers) * 0.5 + rnd() * 0.04;
    const b = at(t);
    const az = rnd() * Math.PI * 2;
    const L = (1.3 + rnd() * 1.8) * (1.15 - t * 0.7) * s;
    const bp = G.branch(b, [Math.cos(az), 0.25 + rnd() * 0.3, Math.sin(az)], L, 0.07 * s, 0.025 * s, 4, 0.35,
      (tt) => mix3(PINE_RED, BARK_GREY, 0.4 + tt * 0.3), 0.04);
    const end = bp[bp.length - 1];
    const rx = (0.75 + L * 0.3) * (0.9 + rnd() * 0.3);
    G.crown('needle', add(end, [0, 0.12, 0]), [rx, 0.3 + rnd() * 0.12, rx * (0.7 + rnd() * 0.3)],
      Math.round(40 + rx * 34), 0.82 * s ** 0.5, P.pine, { orient: 'flat', up: 1.4, flatTop: true });
  }
  const top = pts[pts.length - 1];
  G.crown('needle', add(top, [0, 0.1, 0]), [1.1 * s, 0.5, 1.0 * s], 70, 0.82, P.pine, { orient: 'flat', up: 1.4 });
}

// Japanese maple: low fork, spreading leaders, a wide layered dome.
function maple(G, P, x, z, H, lean = [0, 0]) {
  const rnd = G.rnd;
  const fork = 1.2 + rnd() * 0.8;
  G.tube([[x, -0.1, z], [x + lean[0] * 0.2, fork, z + lean[1] * 0.2]], [0.17, 0.14], () => BARK_GREY, 7);
  const base = [x + lean[0] * 0.2, fork, z + lean[1] * 0.2];
  const leaders = 3 + Math.floor(rnd() * 3);
  const c = [x + lean[0], H * 0.6, z + lean[1]];
  const r = [H * 0.42, H * 0.34, H * 0.4];
  const tips = [];
  for (let i = 0; i < leaders; i++) {
    const a = (i / leaders) * Math.PI * 2 + rnd() * 0.6;
    const dir = [Math.cos(a) * 0.7 + lean[0] * 0.15, 1, Math.sin(a) * 0.7 + lean[1] * 0.15];
    const pts = G.branch(base, dir, H * 0.48, 0.1, 0.03, 5, 0.3, () => BARK_GREY);
    for (let j = 2; j < pts.length; j += 2) {
      const sa = a + (rnd() - 0.5) * 2;
      const sp = G.branch(pts[j], [Math.cos(sa), 0.35, Math.sin(sa)], H * 0.28, 0.035, 0.012, 3, 0.4, () => BARK_GREY, 0.05);
      tips.push(sp[sp.length - 1]);
    }
  }
  if (!P.maple) {
    // Bare in winter: each branch tip divides into finer and finer twigs.
    const divide = (from, dir, L, r, depth) => {
      const pts = G.branch(from, dir, L, r, r * 0.55, 3, 0.55, () => BARK_GREY, -0.02);
      if (depth === 0) return;
      const end = pts[pts.length - 1];
      const kids = depth > 1 ? 3 : 2;
      for (let k = 0; k < kids; k++) {
        const d = norm(add(dir, [(rnd() - 0.5) * 1.4, 0.25 + (rnd() - 0.3) * 0.6, (rnd() - 0.5) * 1.4]));
        divide(end, d, L * (0.55 + rnd() * 0.2), r * 0.6, depth - 1);
      }
    };
    for (const tip of tips) {
      const out = norm([tip[0] - c[0] + (rnd() - 0.5), 0.5, tip[2] - c[2] + (rnd() - 0.5)]);
      divide(tip, out, 1.1 + rnd() * 0.6, 0.02, 2);
    }
    return;
  }
  G.crown('maple', c, r, Math.round(440 + rnd() * 140), 0.74, P.maple, { up: 0.6 });
}

// Weeping cherry: a stout trunk, arching limbs, and long hanging strands.
function weepingCherry(G, P, x, z, H, lean) {
  const rnd = G.rnd;
  G.tube([[x, -0.1, z], [x + lean[0] * 0.3, 2.6, z + lean[1] * 0.3]], [0.36, 0.3], () => BARK_DARK, 8);
  const crownC = [x + lean[0] * 1.2, H - 1.0, z + lean[1] * 1.2];
  const limbs = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd() * 0.5;
    const pts = G.branch([x + lean[0] * 0.3, 2.5, z + lean[1] * 0.3],
      [Math.cos(a) * 0.8 + lean[0] * 0.5, 1.1, Math.sin(a) * 0.8 + lean[1] * 0.5], H * 0.55, 0.16, 0.05, 5, 0.25, () => BARK_DARK);
    limbs.push(...pts.slice(2));
  }
  const strands = 80;
  for (let i = 0; i < strands; i++) {
    const from = limbs[Math.floor(rnd() * limbs.length)];
    let out = norm([from[0] - x + (rnd() - 0.5) * 2 + lean[0], 0, from[2] - z + (rnd() - 0.5) * 2 + lean[1]]);
    const drop = 2.6 + rnd() * 2.6;
    const reach = 0.6 + rnd() * 1.2;
    const pts = [], rad = [];
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      // Out and slightly up, then falling as a curtain.
      let y = from[1] + 0.35 * Math.sin(t * Math.PI * 0.6) - drop * Math.pow(t, 1.7);
      const q = [from[0] + out[0] * reach * Math.sqrt(t), y, from[2] + out[2] * reach * Math.sqrt(t)];
      const inX = q[0] > -0.6 && q[0] < GARDEN.width + 0.6, inZ = q[2] > -GARDEN.depth - 0.6 && q[2] < 0.6;
      if (inX && inZ) q[1] = Math.max(q[1], 2.6);
      if (!(inX && inZ)) q[1] = Math.max(q[1], 1.2);
      pts.push(q); rad.push(0.022 - 0.014 * t);
    }
    G.tube(pts, rad, () => BARK_DARK, 4);
    const type = P.blossom ? 'blossom' : P.cherry ? 'broad' : null;
    if (!type) continue;
    const pal = P.blossom ?? P.cherry;
    const per = type === 'blossom' ? 12 : season === 'koyo' ? 3 : 8;
    for (let k = 0; k < per; k++) {
      const t = 0.2 + 0.8 * rnd();
      const f = t * n, j = Math.min(n - 1, Math.floor(f));
      const q = mix3(pts[j], pts[j + 1], f - j);
      const col = mul(pal(null, 1, rnd), 0.85 + rnd() * 0.2);
      G.card(type, add(q, [(rnd() - 0.5) * 0.15, 0, (rnd() - 0.5) * 0.15]), 0.62 + rnd() * 0.25, add(out, [0, 0.5, 0]), col, 'hang');
    }
  }
  if (P.blossom) G.crown('blossom', crownC, [2.4, 1.2, 2.4], 320, 0.75, P.blossom, { up: 0.8 });
  else if (P.cherry && season !== 'koyo') G.crown('broad', crownC, [2.4, 1.2, 2.4], 240, 0.75, P.cherry, { up: 0.8 });
}
// Evergreen broadleaf (oaks, camphor): billowing clumps.
function evergreenOak(G, P, x, z, H, detail = 1) {
  const rnd = G.rnd;
  G.tube([[x, -0.1, z], [x, H * 0.5, z]], [0.2 * H / 12, 0.12 * H / 12], () => BARK_DARK, 6);
  const clumps = 4 + Math.floor(rnd() * 4);
  const c0 = [x, H * 0.62, z];
  for (let i = 0; i < clumps; i++) {
    const u = norm([rnd() - 0.5, rnd() * 1.2 - 0.5, rnd() - 0.5]);
    const c = [c0[0] + u[0] * H * 0.22, c0[1] + u[1] * H * 0.24, c0[2] + u[2] * H * 0.22];
    const R = (1.1 + rnd() * 0.9) * H / 11;
    G.crown('broad', c, [R, R * 0.8, R], Math.round((60 + R * 22) * detail), (0.95 + R * 0.14) / Math.sqrt(detail), P.oak, { up: 0.5 });
  }
}

// Japanese cedar: tall, straight and conical.
function cedar(G, P, x, z, H) {
  const rnd = G.rnd;
  G.tube([[x, -0.1, z], [x, H, z]], [0.3 * H / 18, 0.05], () => CEDAR_RED, 6);
  const n = Math.round(H * 24);
  for (let i = 0; i < n; i++) {
    const t = 0.3 + 0.7 * Math.pow(rnd(), 0.8);
    const R = (1 - t) * H * 0.16 + 0.25;
    const a = rnd() * Math.PI * 2, d = 0.6 + 0.4 * Math.sqrt(rnd());
    const p = [x + Math.cos(a) * R * d, t * H, z + Math.sin(a) * R * d];
    const col = mul(P.cedar(null, 1, rnd), 0.6 + 0.4 * d);
    G.card('needle', p, 0.9 + rnd() * 0.4, [Math.cos(a), 0.6, Math.sin(a)], col, 'flat');
  }
}

// Low shrubs (camellia, azalea) along the outside of the walls.
function shrub(G, P, x, z, H) {
  G.crown('broad', [x, H * 0.55, z], [H * 0.6, H * 0.5, H * 0.6], Math.round(50 + H * 26), 0.62, P.shrub, { up: 0.6 });
}

// ---------------------------------------------------------------------------
// The setting
// ---------------------------------------------------------------------------
function buildTrees(seasonName) {
  season = seasonName;
  const P = palettes(seasonName);
  const G = new Grove(1450);   // the temple's founding year
  const rnd = G.rnd;
  const W = GARDEN.width, D = GARDEN.depth;
  const occupied = [];
  const free = (x, z, r) => occupied.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > (r + or) * 0.75);
  const place = (fn, x, z, H, r, ...rest) => { occupied.push([x, z, r]); fn(G, P, x, z, H, ...rest); };

  // The weeping cherries, just outside the garden near its south-west corner,
  // leaning over the wall. (Their exact positions here are approximate.)
  place(weepingCherry, W + 1.6, -D - 0.9, 7.6, 3.2, [-0.9, 0.5]);
  place(weepingCherry, W + 1.9, -D + 5.8, 6.0, 2.6, [-0.8, 0.1]);

  // Red pines, their crooked trunks rising above the wall.
  for (const [x, z, H] of [[6.5, -12.2, 12.5], [14.8, -13.6, 13.5], [1.5, -14.8, 11], [21.2, -12.6, 10.5], [29.5, -6.5, 12], [-3.6, -6.0, 11.5], [10.2, -17.5, 14]]) {
    place(redPine, x, z, H, 2.2);
  }

  // Maples close behind the walls, some leaning over them.
  // Only a few: most of the backdrop is evergreen, the maples are accents.
  for (const [x, z, H, lx, lz] of [
    [3.4, -11.5, 6.2, 0, 0.8], [17.6, -11.6, 6.6, -0.2, 0.9], [26.8, -1.6, 5.8, -0.9, 0],
    [-1.7, -3.2, 5.4, 0.8, 0], [11.5, -16.5, 8, 0, 0], [24.5, -16.5, 7.5, 0, 0],
  ]) place(maple, x, z, H, 2.6, [lx, lz]);

  // Cedars, standing tall at the back.
  for (const [x, z, H] of [[-2, -21, 19], [5, -24, 21], [18.5, -22.5, 20], [27, -19, 18], [33, -8, 19], [-8, -14, 18], [12, 15, 21], [-4, 12, 19], [27, 13, 20]]) {
    place(cedar, x, z, H, 1.6);
  }

  // A dense evergreen backdrop, thinner in detail with distance.
  const fill = (x0, x1, z0, z1, step, hMin, hMax) => {
    for (let z = z0; z > z1; z -= step) {
      for (let x = x0; x < x1; x += step) {
        const px = x + (rnd() - 0.5) * step * 0.8, pz = z + (rnd() - 0.5) * step * 0.8;
        const H = hMin + rnd() * (hMax - hMin);
        const r = H * 0.28;
        if (!free(px, pz, r)) continue;
        const dist = Math.hypot(px - W / 2, pz + D / 2);
        place(evergreenOak, px, pz, H, r, dist > 26 ? 0.55 : dist > 18 ? 0.8 : 1);
      }
    }
  };
  fill(-12, W + 12, -11.6, -36, 4.2, 8, 15);   // south
  fill(W + 1.4, W + 14, 4, -11.5, 4.2, 7, 14);  // west
  fill(-14, -1.2, 4, -11.5, 4.2, 7, 14);        // east
  fill(-12, W + 12, 30, 7, 5.0, 10, 17);        // behind the hall

  // Shrubs at the foot of the walls, outside.
  for (let x = -0.5; x < W + 0.5; x += 1.3 + rnd()) if (free(x, -D - 1.1, 0.5)) shrub(G, P, x, -D - 1.1 - rnd() * 0.4, 1.4 + rnd() * 1.2);
  for (let z = -D; z < 0.5; z += 1.3 + rnd()) {
    if (free(W + 1.0, z, 0.5)) shrub(G, P, W + 1.0 + rnd() * 0.4, z, 1.4 + rnd() * 1.2);
    if (free(-1.0, z, 0.5)) shrub(G, P, -1.0 - rnd() * 0.4, z, 1.4 + rnd() * 1.2);
  }

  return assemble(G);
}

// ---------------------------------------------------------------------------
// Meshes and the foliage shader
// ---------------------------------------------------------------------------
const uniforms = {
  uTime: { value: 0 },
  uSunView: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uTransl: { value: 0.12 },
};

function foliageMaterial(map) {
  const mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.38, side: THREE.DoubleSide, alphaToCoverage: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute vec3 aN;\nuniform float uTime;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // A slight flutter, out of step from card to card.
        vec3 ip = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
        float ph = dot( ip, vec3( 1.7, 0.9, 1.3 ) );
        transformed.xy += vec2( sin( uTime * 1.3 + ph ), cos( uTime * 1.1 + ph * 1.3 ) ) * 0.035;`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        // Light each card as part of a soft, rounded crown.
        vec3 faceW = normalize( mat3( instanceMatrix ) * objectNormal );
        transformedNormal = normalize( normalMatrix * normalize( aN + 0.3 * faceW ) );`);
    sh.fragmentShader = 'uniform vec3 uSunView;\nuniform vec3 uSunCol;\nuniform float uTransl;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        // Smaller mip levels average each leaf's alpha away, so distant
        // crowns would thin to nothing. Restore coverage with distance.
        vec2 texel = vMapUv * ${ATLAS.toFixed(1)};
        vec2 dx = dFdx( texel ), dy = dFdy( texel );
        float lod = 0.5 * log2( max( max( dot( dx, dx ), dot( dy, dy ) ), 1.0 ) );
        diffuseColor.a *= 1.0 + lod * 0.32;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize( vNormal ); // the same on both faces`)
      .replace('#include <opaque_fragment>', `
        // Leaves glow when the sun is behind them.
        vec3 toEye = normalize( vViewPosition );
        float back = pow( max( dot( -toEye, uSunView ), 0.0 ), 3.0 );
        outgoingLight += diffuseColor.rgb * uSunCol * back * uTransl;
        #include <opaque_fragment>`);
  };
  return mat;
}

function assemble(G) {
  const group = new THREE.Group();

  // Bark.
  const B = G.bark;
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  bg.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
  bg.setIndex(B.idx);
  const bark = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(bark);

  // Foliage: one instanced mesh per kind of card, all sharing the atlas.
  const mat = foliageMaterial(leafAtlas());
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  let total = 0;
  for (const [type, list] of Object.entries(G.cards)) {
    if (!list.length) continue;
    const geo = new THREE.PlaneGeometry(1, 1);
    const [cx, cy] = CELLS[type];
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, cx * 0.5 + 0.012 + uv.getX(i) * 0.476, cy * 0.5 + 0.012 + uv.getY(i) * 0.476);
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    const aN = new Float32Array(list.length * 3);
    list.forEach((k, i) => {
      e.set(k.e[0], k.e[1], k.e[2]);
      q.setFromEuler(e);
      m4.compose(v.set(...k.pos), q, s.set(k.size, k.size, k.size));
      inst.setMatrixAt(i, m4);
      c.setRGB(k.color[0], k.color[1], k.color[2]);
      inst.setColorAt(i, c);
      aN.set(k.n, i * 3);
    });
    geo.setAttribute('aN', new THREE.InstancedBufferAttribute(aN, 3));
    inst.frustumCulled = false;
    group.add(inst);
    total += list.length;
  }

  // Ground beyond the walls.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ color: 0x2a2c1e }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(GARDEN.width / 2, -0.02, -GARDEN.depth / 2);
  group.add(ground);

  group.userData.cards = total;
  return group;
}

// Called every frame: time for the flutter, sun for the glow through leaves.
const _sv = new THREE.Vector3();
function updateTrees(time, sunDirWorld, sunColor, sunIntensity, camera) {
  uniforms.uTime.value = time;
  _sv.copy(sunDirWorld).transformDirection(camera.matrixWorldInverse);
  uniforms.uSunView.value.copy(_sv);
  uniforms.uSunCol.value.copy(sunColor).multiplyScalar(sunIntensity);
}

Object.assign(RJ, { buildTrees, updateTrees });
})(globalThis.RJ = globalThis.RJ || {});
