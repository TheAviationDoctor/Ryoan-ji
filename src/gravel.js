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

  // Draw one rake stroke segment from a to b (world xz). Returns the
  // fraction of the rake that actually touched gravel (for the sound).
  rakeSegment(ax, az, bx, bz) {
    const { W, H } = this;
    const [pax, paz] = this.toPixel(ax, az);
    const [pbx, pbz] = this.toPixel(bx, bz);
    let tx = pbx - pax, tz = pbz - paz;
    const len = Math.hypot(tx, tz);
    if (len < 0.5) return 0;
    tx /= len; tz /= len;
    const nx = -tz, nz = tx;
    const halfW = (RAKE_TINES * RAKE_SPACING * PX) / 2;
    const ext = 1.0; // px of overlap with the previous segment
    const i0 = Math.max(0, Math.floor(Math.min(pax, pbx) - halfW - 2));
    const i1 = Math.min(W - 1, Math.ceil(Math.max(pax, pbx) + halfW + 2));
    const j0 = Math.max(0, Math.floor(Math.min(paz, pbz) - halfW - 2));
    const j1 = Math.min(H - 1, Math.ceil(Math.max(paz, pbz) + halfW + 2));
    let touched = 0, total = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const rx = i + 0.5 - pax, rz = j + 0.5 - paz;
        const s = rx * tx + rz * tz;
        if (s < -ext || s > len + ext) continue;
        const o = rx * nx + rz * nz;
        const ao = Math.abs(o);
        if (ao > halfW) continue;
        total++;
        const k = j * W + i;
        const m = this.mask[k];
        if (!m) continue;
        touched++;
        // Tine grooves at the centre and every spacing; ridges between.
        const u = o / PX;
        const p = 1 - Gravel.profile(u);
        const v = this._value(p, k);
        // Feather the outer edges of the rake into what was there.
        const edge = Math.min(1, (halfW - ao) / (0.6 * RAKE_SPACING * PX));
        const w = edge * edge * (3 - 2 * edge);
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
