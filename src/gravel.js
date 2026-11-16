// The gravel bed: a single-channel heightmap that holds the rake pattern.
// It is rendered as a bump map, so raking only rewrites bytes in an array.

(function (RJ) {
'use strict';
const { GARDEN, islandDistance, mulberry32, makeNoise3, fbm } = RJ;

const PX = 128;                       // heightmap pixels per metre
const RAKE_SPACING = 0.11;           // distance between tines (m)
const RAKE_TINES = 5;                 // teeth on the rake
const RINGS = 4;                      // concentric rings around each island
const EDGE_BAND = 0.36;               // lines that follow the garden's edge
const SEAM = 0.035;                   // width of the groove where patterns meet
const smoothstep01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

class Gravel {
  constructor(islands) {
    this.islands = islands;
    this.W = Math.round(GARDEN.width * PX);
    this.H = Math.round(GARDEN.depth * PX);
    const n = this.W * this.H;
    this.height = new Uint8Array(n);
    this.target = new Uint8Array(n);   // the traditional pattern
    this.mask = new Uint8Array(n);     // 255 where the rake may go
    this.grain = new Int8Array(n);     // fixed pebble texture

    this._buildGrain();
    this._buildPattern();
    this.height.set(this.target);

    this.texture = new THREE.DataTexture(this.height, this.W, this.H, THREE.RedFormat, THREE.UnsignedByteType);
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.anisotropy = 8;
    this.texture.needsUpdate = true;
    this.dirty = false;

    this.restore = null; // animated re-raking state
    this.mesh = this._buildMesh();
  }

  // Pixel <-> world. Row 0 is the veranda side (z = 0), rows run south.
  toPixel(x, z) { return [x * PX, -z * PX]; }

  _buildGrain() {
    const rnd = mulberry32(4242);
    const noise = makeNoise3(77);
    const { W, H } = this;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const coarse = noise(i * 0.35, j * 0.35, 0.5);   // ~2–3 cm clumps
        this.grain[j * W + i] = Math.round((rnd() - 0.5) * 34 + coarse * 22);
      }
    }
  }

  static profile(u) {
    // u in metres across the lines; ridges at multiples of the spacing.
    const c = Math.cos((2 * Math.PI * u) / RAKE_SPACING);
    return 0.5 + 0.5 * Math.sign(c) * Math.pow(Math.abs(c), 0.8);
  }

  _value(p, k) {
    const v = 30 + p * 190 + this.grain[k];
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }

  _buildPattern() {
    const { W, H, islands } = this;
    const gw = GARDEN.width, gd = GARDEN.depth;
    const ringZone = (RINGS + 0.5) * RAKE_SPACING;
    for (let j = 0; j < H; j++) {
      const z = -(j + 0.5) / PX;
      for (let i = 0; i < W; i++) {
        const x = (i + 0.5) / PX;
        const k = j * W + i;
        // Nearest and second-nearest island.
        let d = Infinity, d2 = Infinity;
        for (const isl of islands) {
          const di = islandDistance(isl, x, z);
          if (di < d) { d2 = d; d = di; } else if (di < d2) d2 = di;
        }
        // Distance to the rectangular boundary of the gravel.
        const edge = Math.min(x, gw - x, -z, gd + z);
        let p, seam = Infinity;
        if (d < 0.015) {
          p = 0.55;                               // under the moss
        } else if (d < ringZone) {
          p = Gravel.profile(d);                  // concentric rings
          seam = Math.min(ringZone - d, d2 < ringZone ? (d2 - d) * 0.5 : Infinity);
        } else if (edge < EDGE_BAND) {
          p = Gravel.profile(edge + RAKE_SPACING * 0.5);
          seam = Math.min(EDGE_BAND - edge, d - ringZone);
        } else {
          p = Gravel.profile(-z - EDGE_BAND);     // long east–west lines
          seam = Math.min(d - ringZone, edge - EDGE_BAND);
        }
        // Where two patterns meet, both sink into a shared groove, so the
        // surface stays continuous (no bright seams in the bump shading).
        if (seam < SEAM) p *= smoothstep01(seam / SEAM);
        this.target[k] = this._value(p, k);
        this.mask[k] = d > 0.03 && edge > 0.03 ? 255 : 0;
      }
    }
  }

  _buildMesh() {
    const geo = new THREE.PlaneGeometry(GARDEN.width, GARDEN.depth, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(GARDEN.width / 2, 0, -GARDEN.depth / 2);

    // Colour: pale granite gravel, finely speckled, tiled.
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(512, 512);
    const rnd = mulberry32(99);
    const noise = makeNoise3(5);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const k = (y * 512 + x) * 4;
        // Tileable large-scale variation.
        const a = (x / 512) * Math.PI * 2, b = (y / 512) * Math.PI * 2;
        const lv = fbm(noise, Math.cos(a) * 1.2, Math.sin(a) * 1.2, Math.cos(b) * 1.2 + Math.sin(b) * 0.7, 3);
        let v = 0.86 + lv * 0.06 + (rnd() - 0.5) * 0.10;
        const speck = rnd();
        if (speck < 0.05) v *= 0.62;            // dark grains
        else if (speck > 0.985) v *= 1.08;     // bright quartz
        const warm = (rnd() - 0.5) * 0.03;
        img.data[k] = Math.min(255, (v + warm) * 236);
        img.data[k + 1] = Math.min(255, v * 232);
        img.data[k + 2] = Math.min(255, (v - warm) * 222);
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(GARDEN.width / 0.9, GARDEN.depth / 0.9);
    map.anisotropy = 8;

    // Matte: granite gravel scatters light; a specular term only produces
    // distracting glints along the ridges when looking towards the sun.
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map,
      bumpMap: this.texture,
      bumpScale: 2.2,
    });
    // Grooves hold a little shadow; ridges catch light.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float gH = texture2D( bumpMap, vBumpMapUv ).x;
         diffuseColor.rgb *= mix( 0.80, 1.05, smoothstep( 0.05, 0.95, gH ) );`
      );
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'gravel';
    return mesh;
  }

  inGravel(x, z) {
    return x > 0 && x < GARDEN.width && z < 0 && z > -GARDEN.depth;
  }

  // Drag the rake from one pose to the next. A pose is the head's centre
  // (x, z) and the direction of its bar (ux, uz), in world units. Each tine
  // cuts its own groove along its own path, so walking straight gives
  // parallel lines and turning on the spot sweeps concentric arcs.
  // Returns the fraction of the rake that touched gravel (for the sound).
  rakeMove(ax, az, aux, auz, bx, bz, bux, buz) {
    const dist = Math.hypot(bx - ax, bz - az);
    // The outer tines travel furthest when turning; keep every step short.
    const half = ((RAKE_TINES - 1) / 2) * RAKE_SPACING;
    const turn = Math.abs(Math.atan2(aux * buz - auz * bux, aux * bux + auz * buz)) * half;
    const steps = Math.max(1, Math.ceil((dist + turn) / 0.012));
    const a0 = Math.atan2(auz, aux), a1 = a0 + Math.atan2(aux * buz - auz * bux, aux * bux + auz * buz);
    let touched = 0;
    let px = ax, pz = az, pux = aux, puz = auz;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ang = a0 + (a1 - a0) * t;
      const qx = ax + (bx - ax) * t, qz = az + (bz - az) * t;
      const qux = Math.cos(ang), quz = Math.sin(ang);
      touched += this._stampTines(px, pz, pux, puz, qx, qz, qux, quz);
      px = qx; pz = qz; pux = qux; puz = quz;
    }
    return touched / steps;
  }

  _stampTines(ax, az, aux, auz, bx, bz, bux, buz) {
    const { W, H } = this;
    const s = RAKE_SPACING * PX;              // tine spacing in pixels
    const n = RAKE_TINES, mid = (n - 1) / 2;
    // Tine endpoints in pixel space.
    const A = [], B = [];
    for (let k = 0; k < n; k++) {
      const o = (k - mid) * RAKE_SPACING;
      A.push([(ax + aux * o) * PX, -(az + auz * o) * PX]);
      B.push([(bx + bux * o) * PX, -(bz + buz * o) * PX]);
    }
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    for (const [x, y] of [...A, ...B]) {
      i0 = Math.min(i0, x); i1 = Math.max(i1, x); j0 = Math.min(j0, y); j1 = Math.max(j1, y);
    }
    const pad = s * 0.55;
    i0 = Math.max(0, Math.floor(i0 - pad)); i1 = Math.min(W - 1, Math.ceil(i1 + pad));
    j0 = Math.max(0, Math.floor(j0 - pad)); j1 = Math.min(H - 1, Math.ceil(j1 + pad));
    if (i0 > i1 || j0 > j1) return 0;

    // Centre and bar direction (pixel space: z is flipped).
    const cx = (A[mid | 0][0] + B[mid | 0][0]) / 2, cy = (A[mid | 0][1] + B[mid | 0][1]) / 2;
    const ux = (aux + bux) / 2, uy = -(auz + buz) / 2;
    const ul = Math.hypot(ux, uy) || 1;
    const outerEdge = mid * s;

    let touched = 0, total = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i + 0.5, y = j + 0.5;
        // Distance to the nearest tine's path. Only pixels alongside a
        // path count: rounded caps at the ends would overwrite the grooves
        // the previous step has just cut. A pixel of overlap avoids seams.
        let d2 = Infinity;
        for (let t = 0; t < n; t++) {
          const sx = A[t][0], sy = A[t][1];
          const ex = B[t][0] - sx, ey = B[t][1] - sy;
          const l2 = ex * ex + ey * ey;
          let u = 0;
          if (l2 > 1e-6) {
            const l = Math.sqrt(l2);
            u = ((x - sx) * ex + (y - sy) * ey) / l2;
            if (u < -1 / l || u > 1 + 1 / l) continue;
            u = u < 0 ? 0 : u > 1 ? 1 : u;
          }
          const dx = x - sx - ex * u, dy = y - sy - ey * u;
          const dd = dx * dx + dy * dy;
          if (dd < d2) d2 = dd;
        }
        const d = Math.sqrt(d2);
        if (d > s * 0.5) continue;
        total++;
        const k = j * W + i;
        if (!this.mask[k]) continue;
        touched++;
        // Groove under each tine, ridge half-way between tines.
        const v = this._value(1 - Gravel.profile(d / PX), k);
        // Outside the outermost tines, feather into what was there.
        const along = Math.abs(((x - cx) * ux + (y - cy) * uy) / ul);
        let w = 1;
        if (along > outerEdge) {
          const f = 1 - (d - s * 0.15) / (s * 0.35);
          w = f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f);
        }
        this.height[k] = Math.round(this.height[k] * (1 - w) + v * w);
      }
    }
    if (touched) this.dirty = true;
    return total ? touched / total : 0;
  }

  // Slowly re-rake the whole garden into its traditional pattern,
  // sweeping from west to east as a monk would work along it.
  beginRestore(seconds = 9) {
    this.restore = { t: 0, dur: seconds, col: this.W };
  }

  update(dt) {
    if (this.restore) {
      const r = this.restore;
      r.t += dt;
      const f = Math.min(1, r.t / r.dur);
      const eased = f * f * (3 - 2 * f);
      const col = Math.floor(this.W * (1 - eased));
      const { W, H } = this;
      for (let i = col; i < r.col; i++) {
        for (let j = 0; j < H; j++) this.height[j * W + i] = this.target[j * W + i];
      }
      r.col = col;
      this.dirty = true;
      if (f >= 1) this.restore = null;
    }
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }
}

Object.assign(RJ, { RAKE_SPACING, RAKE_TINES, Gravel });
})(globalThis.RJ = globalThis.RJ || {});
