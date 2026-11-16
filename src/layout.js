// The garden, in metres.
//
// World axes: x runs along the veranda from east (x = 0, the viewer's left)
// to west (x = 25, the viewer's right). The gravel spans z = 0 (the veranda
// side, north) to z = -10 (the south wall). y is up; the gravel is at y = 0.
//
// The arrangement follows the real garden's 5-2-3-2-3 grouping from left to
// right as seen from the hojo veranda. Positions and sizes are an artistic
// approximation, not a survey; they have been tuned so that, as at Ryoan-ji,
// at least one stone is always hidden from anywhere on the veranda.
// `npm run verify` checks this.

(function (RJ) {
'use strict';

const GARDEN = {
  width: 25,            // east-west (m)
  depth: 10,            // north-south (m)
  verandaEdgeZ: 0.55,   // front edge of the veranda boards
  verandaFloorY: 0.72,  // veranda floor height above the gravel
  verandaBackZ: 3.6,
  eaveEdgeZ: -0.75,
  eaveEdgeY: 3.05,
};

// Where a visitor's eye can be. Seated (kneeling on the boards) and standing.
const VIEW = {
  xMin: 0.4,
  xMax: 24.6,
  seatZ: 1.35,
  seatedEye: GARDEN.verandaFloorY + 0.86,
  standingEye: GARDEN.verandaFloorY + 1.55,
};

const GREY = [0.215, 0.205, 0.192];
const WARM = [0.245, 0.212, 0.172];
const COOL = [0.180, 0.186, 0.186];
const DARK = [0.130, 0.124, 0.118];

// Five groups, read left to right from the veranda.
const STONES = [
  // Group 1 — five stones, the largest group, holding the tallest stone.
  { g: 0, x: 4.55, z: -5.30, w: 1.70, d: 0.95, h: 0.80, rot: 0.18, seed: 11, tone: WARM, facets: 6 },
  { g: 0, x: 5.75, z: -5.85, w: 0.85, d: 0.75, h: 1.08, rot: -0.35, seed: 12, tone: GREY, taper: 0.35, lean: -0.08 },
  { g: 0, x: 3.45, z: -4.75, w: 0.95, d: 0.62, h: 0.34, rot: 0.6, seed: 13, tone: DARK },
  { g: 0, x: 4.68, z: -5.92, w: 0.34, d: 0.30, h: 0.28, rot: 1.1, seed: 14, tone: COOL },
  { g: 0, x: 6.55, z: -5.05, w: 0.95, d: 0.60, h: 0.28, rot: -0.2, seed: 15, tone: GREY, facets: 4 },

  // Group 2 — two stones, set back towards the south wall.
  { g: 1, x: 9.55, z: -7.55, w: 1.25, d: 0.75, h: 0.55, rot: 0.1, seed: 21, tone: GREY },
  { g: 1, x: 10.60, z: -7.95, w: 0.62, d: 0.50, h: 0.30, rot: 0.9, seed: 22, tone: WARM },

  // Group 3 — three stones, the nearest group, near the centre.
  { g: 2, x: 13.20, z: -4.25, w: 1.45, d: 0.82, h: 0.62, rot: -0.12, seed: 31, tone: COOL, facets: 6 },
  { g: 2, x: 12.20, z: -4.55, w: 0.72, d: 0.52, h: 0.36, rot: 0.4, seed: 32, tone: GREY },
  { g: 2, x: 13.40, z: -4.85, w: 0.32, d: 0.28, h: 0.24, rot: 0.2, seed: 33, tone: DARK },

  // Group 4 — two stones.
  { g: 3, x: 17.25, z: -6.55, w: 1.30, d: 0.72, h: 0.50, rot: 0.25, seed: 41, tone: WARM },
  { g: 3, x: 18.30, z: -6.45, w: 0.52, d: 0.42, h: 0.28, rot: -0.5, seed: 42, tone: COOL },

  // Group 5 — three stones, towards the west wall.
  { g: 4, x: 21.40, z: -5.40, w: 1.55, d: 0.85, h: 0.70, rot: -0.22, seed: 51, tone: GREY, facets: 6 },
  { g: 4, x: 22.55, z: -5.30, w: 0.72, d: 0.52, h: 0.40, rot: 0.7, seed: 52, tone: WARM },
  { g: 4, x: 21.66, z: -5.98, w: 0.32, d: 0.28, h: 0.24, rot: 0.0, seed: 53, tone: DARK },
];

const GROUP_COUNT = 5;

Object.assign(RJ, { GARDEN, VIEW, STONES, GROUP_COUNT });
})(globalThis.RJ = globalThis.RJ || {});
