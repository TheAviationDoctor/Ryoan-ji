// Verifies the garden's defining property: from every position on the
// veranda, at least one of the fifteen stones is completely hidden behind
// the others.
//
// It builds the exact stone meshes the browser renders, then sweeps the eye
// along the veranda (seated, standing and in between, and at the front and
// back of the boards), casting a ray to every above-ground vertex of every
// stone. A stone counts as visible if any vertex, pushed 8 mm out along its
// normal, can be reached without crossing a stone surface.
//
// Needs only Node.js (no npm, no packages):
//
//   node tools/verify-occlusion.mjs            summary
//   node tools/verify-occlusion.mjs --detail   per-position listing
//   node tools/verify-occlusion.mjs --quick    fewer eye positions, for tuning
//   --step=0.05                                spacing along the veranda (m)

import { readFileSync } from 'node:fs';
import { runInContext, createContext } from 'node:vm';

// Load the browser's own scripts into a sandbox, so the verifier checks
// exactly the stones the page draws.
const sandbox = createContext({});
for (const f of ['noise.js', 'layout.js', 'stones.js']) {
  const url = new URL(`../src/${f}`, import.meta.url);
  runInContext(readFileSync(url, 'utf8'), sandbox, { filename: url.pathname });
}
const { STONES, VIEW, buildStone } = sandbox.RJ;

const detail = process.argv.includes('--detail');
const STEP = Number(process.argv.find((a) => a.startsWith('--step='))?.slice(7) ?? 0.05);

const meshes = STONES.map((s) => {
  const m = buildStone(s, 4);
  // Bounding sphere.
  let cx = 0, cy = 0, cz = 0;
  const n = m.positions.length / 3;
  for (let i = 0; i < n; i++) { cx += m.positions[i * 3]; cy += m.positions[i * 3 + 1]; cz += m.positions[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  let r = 0;
  for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(m.positions[i * 3] - cx, m.positions[i * 3 + 1] - cy, m.positions[i * 3 + 2] - cz));
  // Sample points: above-ground vertices, inflated slightly, highest first.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const y = m.positions[i * 3 + 1];
    if (y < 0.04) continue;
    pts.push([
      m.positions[i * 3] + m.normals[i * 3] * 0.008,
      y + m.normals[i * 3 + 1] * 0.008,
      m.positions[i * 3 + 2] + m.normals[i * 3 + 2] * 0.008,
    ]);
  }
  pts.sort((a, b) => b[1] - a[1]);
  return { ...m, cx, cy, cz, r, pts };
});

function segmentHitsSphere(ox, oy, oz, dx, dy, dz, L, m) {
  const px = m.cx - ox, py = m.cy - oy, pz = m.cz - oz;
  let t = px * dx + py * dy + pz * dz;
  if (t < 0) t = 0; else if (t > L) t = L;
  const qx = ox + dx * t - m.cx, qy = oy + dy * t - m.cy, qz = oz + dz * t - m.cz;
  return qx * qx + qy * qy + qz * qz <= m.r * m.r;
}

// Möller–Trumbore against one mesh; true if any hit with 0 < t < L.
function segmentHitsMesh(ox, oy, oz, dx, dy, dz, L, m) {
  const P = m.positions, I = m.indices;
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
    const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-6 && t < L) return true;
  }
  return false;
}

function stoneVisible(eye, si) {
  const [ex, ey, ez] = eye;
  for (const [tx, ty, tz] of meshes[si].pts) {
    let dx = tx - ex, dy = ty - ey, dz = tz - ez;
    const L = Math.hypot(dx, dy, dz);
    dx /= L; dy /= L; dz /= L;
    let blocked = false;
    for (let k = 0; k < meshes.length && !blocked; k++) {
      const m = meshes[k];
      if (!segmentHitsSphere(ex, ey, ez, dx, dy, dz, L, m)) continue;
      if (segmentHitsMesh(ex, ey, ez, dx, dy, dz, L, m)) blocked = true;
    }
    if (!blocked) return true;
  }
  return false;
}

function hiddenFrom(eye) {
  const hidden = [];
  for (let i = 0; i < meshes.length; i++) if (!stoneVisible(eye, i)) hidden.push(i);
  return hidden;
}

const quick = process.argv.includes('--quick');
const heights = quick ? [VIEW.seatedEye, VIEW.standingEye] : [VIEW.seatedEye, (VIEW.seatedEye + VIEW.standingEye) / 2, VIEW.standingEye];
const depths = quick ? [VIEW.seatZ - 0.3, VIEW.seatZ + 0.3] : [VIEW.seatZ - 0.3, VIEW.seatZ, VIEW.seatZ + 0.3];
let failures = 0, total = 0, worst = Infinity;
const t0 = Date.now();

for (const y of heights) {
  for (const z of depths) {
    const runs = [];
    for (let x = VIEW.xMin; x <= VIEW.xMax + 1e-9; x += STEP) {
      const h = hiddenFrom([x, y, z]);
      total++;
      worst = Math.min(worst, h.length);
      if (h.length === 0) failures++;
      const key = h.join(',') || 'NONE';
      if (runs.length && runs[runs.length - 1].key === key) runs[runs.length - 1].x1 = x;
      else runs.push({ key, x0: x, x1: x });
    }
    const fails = runs.filter((r) => r.key === 'NONE');
    console.log(`eye ${y.toFixed(2)} m, z ${z.toFixed(2)}: ${fails.length ? 'FAIL ' + fails.map((r) => `${r.x0.toFixed(2)}–${r.x1.toFixed(2)}`).join(' ') : 'ok'}`);
    if (detail) for (const r of runs) console.log(`   x ${r.x0.toFixed(2)}–${r.x1.toFixed(2)}  hidden: ${r.key}`);
  }
}

console.log(`\n${total} viewpoints, ${failures} with all fifteen visible; fewest hidden anywhere: ${worst}. (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failures ? 1 : 0);
