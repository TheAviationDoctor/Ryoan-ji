// Sun position for Ryoan-ji, and the look of the light at a given solar
// elevation. Times are Japan Standard Time (UTC+9, no daylight saving).

(function (RJ) {
'use strict';

const KYOTO = { lat: 35.0345, lon: 135.7182 };
const RAD = Math.PI / 180;

// Low-precision solar position (accurate to a fraction of a degree), adequate
// for lighting. Returns degrees: elevation above the horizon and azimuth
// clockwise from north.
function solarPosition(date, lat = KYOTO.lat, lon = KYOTO.lon) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lon) * RAD;
  const H = lst - ra;
  const phi = lat * RAD;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H));
  return { elevation: el / RAD, azimuth: ((az / RAD) + 360) % 360 };
}

// World direction towards a sky position. The garden faces south: -z is
// south, +x is west, so the morning sun comes from the viewer's left.
function skyDirection(elevationDeg, azimuthDeg) {
  const el = elevationDeg * RAD, az = azimuthDeg * RAD;
  return [-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
}

// Today's date in Kyoto, and a Date for a given JST clock time on it.
function kyotoToday(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600e3);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth(), d: k.getUTCDate() };
}
function kyotoTime(hours, now = new Date()) {
  const { y, m, d } = kyotoToday(now);
  return new Date(Date.UTC(y, m, d, 0, 0, 0) + (hours - 9) * 3600e3);
}

// First time after `fromH` (JST hours) at which the elevation crosses `deg`.
function crossing(deg, rising, now) {
  let prev = solarPosition(kyotoTime(rising ? 3 : 12, now)).elevation;
  for (let m = (rising ? 3 : 12) * 60 + 2; m < (rising ? 12 : 22) * 60; m += 2) {
    const e = solarPosition(kyotoTime(m / 60, now)).elevation;
    if (rising ? prev < deg && e >= deg : prev > deg && e <= deg) return m / 60;
    prev = e;
  }
  return rising ? 6.5 : 17;
}

const PRESETS = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night', 'kyoto'];
const PRESET_LABEL = {
  dawn: 'Dawn', morning: 'Morning', noon: 'Midday', afternoon: 'Afternoon',
  dusk: 'Dusk', night: 'Night', kyoto: 'Kyoto, now',
};

function presetDate(name, now = new Date()) {
  switch (name) {
    case 'dawn': return kyotoTime(crossing(2.5, true, now) + 0.1, now);
    case 'morning': return kyotoTime(9.25, now);
    case 'noon': return kyotoTime(12.0, now);
    case 'afternoon': return kyotoTime(14.75, now);
    case 'dusk': return kyotoTime(crossing(4, false, now) - 0.05, now);
    case 'night': return kyotoTime(21.5, now);
    default: return now;
  }
}

function kyotoClock(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600e3);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// The colour of the light, keyed on solar elevation (degrees).
// ---------------------------------------------------------------------------
const KEYS = [
  // el,   sun rgb,               sunI, sky rgb,             gnd rgb,             hemiI, top rgb,            horizon rgb,        exposure
  [-18, [0.55, 0.65, 1.00], 0.00, [0.22, 0.27, 0.42], [0.06, 0.06, 0.08], 0.55, [0.008, 0.012, 0.030], [0.040, 0.052, 0.090], 1.45],
  [-8,  [0.70, 0.60, 0.80], 0.00, [0.26, 0.28, 0.42], [0.08, 0.07, 0.08], 0.55, [0.040, 0.060, 0.140], [0.240, 0.200, 0.250], 1.25],
  [-2,  [1.00, 0.55, 0.35], 0.00, [0.42, 0.40, 0.50], [0.14, 0.11, 0.10], 0.70, [0.120, 0.180, 0.340], [0.780, 0.520, 0.420], 1.05],
  [2,   [1.00, 0.55, 0.32], 1.10, [0.55, 0.55, 0.65], [0.22, 0.17, 0.13], 0.85, [0.250, 0.380, 0.600], [0.980, 0.700, 0.500], 1.00],
  [7,   [1.00, 0.76, 0.52], 2.60, [0.66, 0.70, 0.82], [0.36, 0.31, 0.25], 1.25, [0.300, 0.460, 0.720], [0.900, 0.800, 0.700], 1.05],
  [15,  [1.00, 0.88, 0.72], 3.30, [0.70, 0.77, 0.90], [0.42, 0.38, 0.31], 1.35, [0.270, 0.450, 0.750], [0.780, 0.840, 0.900], 1.00],
  [30,  [1.00, 0.95, 0.88], 3.70, [0.70, 0.78, 0.92], [0.44, 0.41, 0.35], 1.40, [0.220, 0.420, 0.760], [0.700, 0.800, 0.900], 0.95],
  [70,  [1.00, 0.98, 0.95], 3.90, [0.68, 0.78, 0.94], [0.45, 0.42, 0.36], 1.45, [0.180, 0.380, 0.740], [0.660, 0.780, 0.900], 0.92],
];

function lightAt(elevation) {
  let i = 0;
  while (i < KEYS.length - 2 && elevation > KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = Math.min(1, Math.max(0, (elevation - a[0]) / (b[0] - a[0])));
  const mix = (u, v) => (Array.isArray(u) ? u.map((x, k) => x + (v[k] - x) * t) : u + (v - u) * t);
  return {
    sunColor: mix(a[1], b[1]), sunIntensity: mix(a[2], b[2]),
    skyColor: mix(a[3], b[3]), groundColor: mix(a[4], b[4]), hemiIntensity: mix(a[5], b[5]),
    skyTop: mix(a[6], b[6]), skyHorizon: mix(a[7], b[7]), exposure: mix(a[8], b[8]),
    night: Math.min(1, Math.max(0, (-elevation - 4) / 10)),
  };
}

Object.assign(RJ, { KYOTO, solarPosition, skyDirection, kyotoToday, kyotoTime, PRESETS, PRESET_LABEL, presetDate, kyotoClock, lightAt });
})(globalThis.RJ = globalThis.RJ || {});
