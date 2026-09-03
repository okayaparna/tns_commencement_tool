// Small shared helpers: math, seeded random, colour.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (a, n) => ((a % n) + n) % n;

// Deterministic PRNG so "jitter" is stable for a given seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}
export function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Colour at cyclic position u in [0,1) along a closed loop of colours.
export function cycleColor(colors, u) {
  const n = colors.length;
  if (n === 1) return colors[0];
  const x = mod(u, 1) * n;
  const k = Math.floor(x);
  return mixHex(colors[k % n], colors[(k + 1) % n], x - k);
}

// Gradient stops (position, colour) for a colour loop shifted by `phase`.
// The loop repeats `repeats` times across [0,1] so a full phase shift of 1 is seamless.
export function loopStops(colors, phase, repeats = 1) {
  const n = colors.length;
  const set = new Set([0, 1]);
  for (let r = 0; r < repeats; r++) {
    for (let k = 0; k < n; k++) set.add(mod((k / n + r) / repeats - phase / repeats, 1));
  }
  const positions = [...set].sort((a, b) => a - b);
  return positions.map(p => ({ pos: p, color: cycleColor(colors, p * repeats + phase) }));
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
export function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch || {})) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], patch[k]);
    } else out[k] = patch[k];
  }
  return out;
}
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// OKLab mixing keeps pink→green style gradients from turning muddy.
function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function linearToSrgb(c) { c = clamp(c, 0, 1); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055); }
export function hexToOklab(hex) {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function oklabToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return rgbToHex([linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]);
}
export function mixOklab(a, b, t) {
  const A = hexToOklab(a), B = hexToOklab(b);
  return oklabToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}
export function cycleColorOklab(colors, u) {
  const n = colors.length;
  if (n === 1) return colors[0];
  const x = mod(u, 1) * n, k = Math.floor(x);
  return mixOklab(colors[k % n], colors[(k + 1) % n], x - k);
}
