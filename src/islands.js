// Moss islands: one soft, rounded bed of moss under each group of stones.
// Each island is a star-shaped outline r(θ) around a centre. The same
// outline drives the moss mesh, the concentric rake rings and the rake mask.

(function (RJ) {
'use strict';
const { makeNoise3 } = RJ;

const N = 256;

function buildIslands(stones, meshes, groupCount) {
  const islands = [];
  for (let g = 0; g < groupCount; g++) {
    const idx = stones.map((s, i) => (s.g === g ? i : -1)).filter((i) => i >= 0);

    // Footprint points: stone vertices near ground level.
    const pts = [];
    for (const i of idx) {
      const P = meshes[i].positions;
      for (let k = 0; k < P.length; k += 3) {
        if (P[k + 1] > -0.03 && P[k + 1] < 0.12) pts.push([P[k], P[k + 2]]);
      }
    }
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x; cz += z; }
    cx /= pts.length; cz /= pts.length;

    // Support function of the footprint's convex hull, plus a margin.
    const noise = makeNoise3(900 + g);
    const r = new Float32Array(N);
    for (let a = 0; a < N; a++) {
      const th = (a / N) * Math.PI * 2;
      const ux = Math.cos(th), uz = Math.sin(th);
      let h = 0;
      for (const [x, z] of pts) h = Math.max(h, (x - cx) * ux + (z - cz) * uz);
      const wobble = 0.07 * noise(Math.cos(th) * 1.3 + g, Math.sin(th) * 1.3, 0.5)
                   + 0.03 * noise(Math.cos(th) * 3.7, Math.sin(th) * 3.7 + g, 1.5);
      r[a] = h + 0.34 + wobble;
    }
    // Smooth the outline (circular box blur, a few passes).
    for (let pass = 0; pass < 4; pass++) {
      const c = r.slice();
      for (let a = 0; a < N; a++) {
        let s = 0;
        for (let k = -4; k <= 4; k++) s += c[(a + k + N) % N];
        r[a] = s / 9;
      }
    }
    let rMax = 0;
    for (let a = 0; a < N; a++) rMax = Math.max(rMax, r[a]);
    islands.push({ g, cx, cz, r, rMax });
  }
  return islands;
}

function islandRadius(isl, th) {
  let f = (th / (Math.PI * 2)) * N;
  f = ((f % N) + N) % N;
  const i0 = Math.floor(f), t = f - i0;
  return isl.r[i0] * (1 - t) + isl.r[(i0 + 1) % N] * t;
}

// Pseudo signed distance: negative inside the moss.
function islandDistance(isl, x, z) {
  const dx = x - isl.cx, dz = z - isl.cz;
  const d = Math.hypot(dx, dz);
  if (d > isl.rMax + 3) return d - isl.rMax;
  return d - islandRadius(isl, Math.atan2(dz, dx));
}

function nearestIsland(islands, x, z) {
  let best = Infinity, bi = -1;
  for (let i = 0; i < islands.length; i++) {
    const d = islandDistance(islands[i], x, z);
    if (d < best) { best = d; bi = i; }
  }
  return { d: best, i: bi };
}

Object.assign(RJ, { buildIslands, islandRadius, islandDistance, nearestIsland });
})(globalThis.RJ = globalThis.RJ || {});
