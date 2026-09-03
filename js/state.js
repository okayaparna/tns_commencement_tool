// Default document state, size presets, templates and built-in looks.

export const BRAND = {
  blue: '#5E8DEA', pink: '#FF4FA1', green: '#18D24A', red: '#E52A1F', white: '#FFFFFF', black: '#111111',
};

export const SIZE_PRESETS = [
  { id: 'wide',    label: 'Screen · 1920 × 1080',            w: 1920, h: 1080 },
  { id: 'square',  label: 'Instagram post · 1080 × 1080',   w: 1080, h: 1080 },
  { id: 'story',   label: 'Story / Reel · 1080 × 1920',     w: 1080, h: 1920 },
  { id: 'poster',  label: 'Poster 24 × 36 in · 2400 × 3600', w: 2400, h: 3600 },
  { id: 'letter',  label: 'Program cover 8.5 × 11 in',       w: 2550, h: 3300 },
  { id: 'spread',  label: 'Program spread 17 × 11 in',       w: 5100, h: 3300 },
  { id: 'ribbon',  label: 'Arena ribbon · 3840 × 960',       w: 3840, h: 960 },
  { id: 'banner',  label: 'Web banner · 1600 × 500',         w: 1600, h: 500 },
  { id: 'badge',   label: 'Name badge 4 × 3 in · 1200 × 900', w: 1200, h: 900 },
  { id: 'custom',  label: 'Custom',                          w: 1600, h: 1000 },
];

export const TEMPLATES = [
  { id: 'rays',      label: 'Rays from focus', hint: 'Beams radiate from one point' },
  { id: 'weave',     label: 'Weave',           hint: 'Straight streamers crossing' },
  { id: 'streamers', label: 'Streamers',       hint: 'Curved ribbons merging' },
];

export const MOCKUPS = [
  { id: 'none',    label: 'Asset only',       ratio: null },
  { id: 'arena',   label: 'Arena jumbotron',  ratio: 16 / 9 },
  { id: 'booklet', label: 'Program booklet',  ratio: 16 / 10 },
  { id: 'poster',  label: 'Poster on wall',   ratio: 4 / 3 },
  { id: 'phone',   label: 'Phone story',      ratio: 9 / 16 },
  { id: 'social',  label: 'Social post',      ratio: 4 / 5 },
  { id: 'badge',   label: 'Name badge',       ratio: 4 / 3 },
];

export const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'difference', 'hard-light'];

export const DEFAULT_STATE = {
  version: 1,
  size: { preset: 'wide', w: 1920, h: 1080 },
  background: BRAND.blue,
  palette: [BRAND.pink, BRAND.green, BRAND.red, BRAND.blue],
  shape: {
    template: 'weave',
    count: 9,
    baseWidth: 0.09,      // fraction of the short side
    widthVariation: 0.35, // 0..1 random variation of width
    flare: 0.6,           // rays only: how much wider at the far end
    flareCurve: 1.4,      // rays only: power curve of the flare
    focusX: 0.5, focusY: 0.5,   // anchor point (focus / crossing / merge)
    angle: -18,           // degrees, main direction
    span: 34,             // degrees of angular spread
    spread: 0.9,          // perpendicular spread of beams (weave / streamers)
    twoSided: true,       // rays: extend through the focus both ways
    pinch: 0.35,          // streamers: narrowing at the merge point (0..1)
    tension: 0.45,        // streamers: curve tension
    jitter: 0.5,          // 0..1 randomness in angle / offset
    seed: 7,
    rotate: 0, scale: 1, offsetX: 0, offsetY: 0,
  },
  fill: {
    mode: 'gradient',     // solid | gradient | stripes
    colorStep: 1,         // palette index step per beam
    runSpread: 1,         // colours per beam length (1 = one pair)
    blendSpace: 'oklab',  // oklab | srgb | hard  — how colours transition along a beam
    phase: 0,             // static gradient offset
    stripes: 3,           // stripes mode: sub-bands per beam
    seam: 0.06,           // gap between stripes (fraction of beam width)
    blend: 'normal',
    opacity: 1,
    edge: 0,              // optional outline stroke width (px at 1000px short side)
    edgeColor: '#FFFFFF',
  },
  motion: {
    enabled: true,
    speed: 0.25,          // gradient run cycles per second
    sway: 0,              // degrees of angle oscillation
    swaySpeed: 0.2,
    drift: 0,             // focus point drift (fraction)
    duration: 6,          // seconds for video export
    fps: 30,
  },
  headline: {
    enabled: true, text: '2025', font: 'Neue Display Next Variable', weight: '800',
    wdth: 100, slnt: 0,   // variable-font axes (ignored by static fonts)
    size: 0.62,           // fraction of asset height
    letterSpacing: -0.04, // em
    lineHeight: 0.86,
    color: BRAND.white, x: 0.5, y: 0.5, align: 'center', valign: 'middle',
    behind: false, rotate: 0,
  },
  caption: {
    enabled: false, text: 'EIGHTY-NINTH ANNUAL UNIVERSITY COMMENCEMENT CEREMONY\nBARCLAYS CENTER, BROOKLYN, NEW YORK · MAY 16', font: 'Neue Display Next Medium', weight: '500',
    wdth: 100, slnt: 0,
    size: 0.028, letterSpacing: 0.02, lineHeight: 1.35,
    color: BRAND.white, x: 0.04, y: 0.95, align: 'left', valign: 'bottom', behind: false, rotate: 0,
  },
  logo: { enabled: false, src: null, x: 0.96, y: 0.05, width: 0.12, align: 'right', valign: 'top', opacity: 1 },
  mockup: { id: 'none', showGuides: true },
};

// Built-in looks: partial states merged onto the defaults.
export const LOOKS = [
  { id: 'weave-blue', label: 'Weave · blue', swatch: [BRAND.blue, BRAND.pink, BRAND.green, BRAND.red], state: {
    background: BRAND.blue, palette: [BRAND.pink, BRAND.green, BRAND.red, BRAND.blue],
    shape: { template: 'weave', count: 9, baseWidth: 0.09, angle: -18, span: 34, spread: 0.9, jitter: 0.5, seed: 7 },
    fill: { mode: 'gradient', blend: 'normal' }, headline: { text: '2025', size: 0.62 },
  } },
  { id: 'fan-pink', label: 'Fan · pink poster', swatch: [BRAND.pink, BRAND.red, BRAND.blue, BRAND.green], state: {
    background: BRAND.pink, palette: [BRAND.red, BRAND.blue, BRAND.green, BRAND.pink],
    shape: { template: 'rays', count: 14, baseWidth: 0.012, flare: 0.5, flareCurve: 1.6, focusX: 0.5, focusY: -0.15, angle: 90, span: 70, twoSided: false, jitter: 0.6, seed: 3, widthVariation: 0.6 },
    fill: { mode: 'stripes', stripes: 3, seam: 0.04, blend: 'normal' },
    headline: { text: '20\n25', size: 0.42, lineHeight: 0.84, letterSpacing: -0.02 },
  } },
  { id: 'fan-green', label: 'Fan · green poster', swatch: [BRAND.green, BRAND.pink, BRAND.red, BRAND.blue], state: {
    background: BRAND.green, palette: [BRAND.pink, BRAND.red, BRAND.blue, BRAND.green],
    shape: { template: 'rays', count: 14, baseWidth: 0.012, flare: 0.5, flareCurve: 1.6, focusX: 0.55, focusY: -0.15, angle: 90, span: 70, twoSided: false, jitter: 0.6, seed: 5, widthVariation: 0.6 },
    fill: { mode: 'stripes', stripes: 3, seam: 0.04 },
    headline: { text: '20\n25', size: 0.42, lineHeight: 0.84, letterSpacing: -0.02 },
  } },
  { id: 'streamers', label: 'Streamers merge', swatch: [BRAND.blue, BRAND.green, BRAND.pink, BRAND.red], state: {
    background: BRAND.blue, palette: [BRAND.pink, BRAND.green, BRAND.red],
    shape: { template: 'streamers', count: 10, baseWidth: 0.07, spread: 1.1, pinch: 0.5, tension: 0.5, focusX: 0.5, focusY: 0.5, angle: 10, jitter: 0.6, seed: 11 },
    fill: { mode: 'gradient', blend: 'normal', runSpread: 2 },
    headline: { text: '2025', size: 0.5 },
  } },
  { id: 'multiply', label: 'Intersections · multiply', swatch: [BRAND.white, BRAND.pink, BRAND.green, BRAND.blue], state: {
    background: BRAND.white, palette: [BRAND.pink, BRAND.green, BRAND.blue, BRAND.red],
    shape: { template: 'weave', count: 8, baseWidth: 0.12, angle: 25, span: 80, spread: 0.7, jitter: 0.4, seed: 21 },
    fill: { mode: 'solid', blend: 'multiply', opacity: 0.9 },
    headline: { text: '2025', size: 0.5, color: BRAND.black },
  } },
  { id: 'ribbon', label: 'Arena ribbon', swatch: [BRAND.red, BRAND.blue, BRAND.green, BRAND.pink], state: {
    size: { preset: 'ribbon', w: 3840, h: 960 },
    background: BRAND.blue, palette: [BRAND.pink, BRAND.green, BRAND.red, BRAND.blue],
    shape: { template: 'weave', count: 12, baseWidth: 0.16, angle: -12, span: 26, spread: 1.2, jitter: 0.5, seed: 9 },
    fill: { mode: 'gradient' }, headline: { text: '2025', size: 0.8, letterSpacing: -0.03 },
    mockup: { id: 'arena' },
  } },
];
