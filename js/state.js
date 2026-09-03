// Default document state, size presets and the pattern templates.

export const FONT = 'Neue Display Next Variable';

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

// Each pattern carries the shape settings that make it read as itself. Width, outer edge, span and
// spread mean different things per template, so carrying them across turns a good fan into a
// pile of wedges — picking a pattern applies its own numbers (and Undo puts yours back).
export const TEMPLATES = [
  { id: 'rays', label: 'Rays from focus', hint: 'Beams fan out from one point', defaults: {
    count: 14, baseWidth: 0.006, widthVariation: 0.6, outerWidth: 0.14, edgeCurve: 1.3, warp: 0,
    focusX: 0.5, focusY: -0.15, angle: 90, span: 50, twoSided: true, jitter: 0.6, pack: 1,
    rotate: 0, scale: 1, offsetX: 0, offsetY: 0,
  } },
  { id: 'weave', label: 'Weave', hint: 'Straight ribbons crossing at one point', defaults: {
    count: 12, baseWidth: 0.08, widthVariation: 0.2, spread: 1.2, focusX: 0.5, focusY: 0.5,
    angle: -8, jitter: 0.4, pack: 1, rotate: 0, scale: 1, offsetX: 0, offsetY: 0,
  } },
];

export const MOCKUPS = [
  { id: 'none',    label: 'Asset only',       ratio: null },
  { id: 'arena',   label: 'Arena jumbotron',  ratio: 16 / 9 },
  { id: 'booklet', label: 'Program booklet',  ratio: 16 / 10 },
  { id: 'poster',  label: 'Poster on wall',   ratio: 4 / 3 },
  { id: 'phone',   label: 'Phone story',      ratio: 9 / 16, bare: true },
  { id: 'social',  label: 'Social post',      ratio: 5 / 4, bare: true },
  { id: 'badge',   label: 'Name badge',       ratio: 4 / 3 },
];

export const DEFAULT_STATE = {
  version: 12,
  size: { preset: 'wide', w: 1920, h: 1080 },
  background: BRAND.blue,
  palette: [BRAND.pink, BRAND.green, BRAND.red],
  shape: {
    template: 'weave',
    count: 12,
    baseWidth: 0.08,      // fraction of the short side
    widthVariation: 0.2,  // 0..1 random variation of width
    outerWidth: 0.14,     // rays: stroke width where it leaves the frame (short-side fraction)
    edgeCurve: 1.4,       // rays: easing from the stroke width to the outer edge
    warp: 0,              // rays: how far the outer strokes bow away from the axis
    focusX: 0.5, focusY: 0.5,   // anchor point (focus / crossing / merge)
    angle: -8,            // degrees, main direction
    span: 50,             // degrees of angular spread
    spread: 1.2,          // perpendicular spread of the beams
    twoSided: true,       // rays: mirror through the focus, running both ways
    pack: 1,              // 0..1 close the gaps: widths grow toward the spacing between beams
    jitter: 0.4,          // 0..1 randomness in angle / offset
    seed: 7,
    rotate: 0, scale: 1, offsetX: 0, offsetY: 0,
  },
  fill: {
    mode: 'gradient',     // solid | gradient
    colorStep: 1,         // palette index step per beam
    runSpread: 1,         // colours per beam length (1 = one pair)
    phase: 0,             // static gradient offset
    centreSeam: 0,        // gap carved down the middle of every stroke, splitting it in two
    core: 0,              // brightness of the lit centreline of each beam (0 = flat section)
    coreFocus: 2.2,       // how tightly that brightness is gathered on the centreline
  },
  motion: {
    enabled: true,
    duration: 6,          // seconds for video export
    fps: 30,
    beams: {
      speed: 0.25,        // gradient run cycles per second
    },
  },
  headline: {
    enabled: true, text: '2025', font: FONT,
    wght: 800, wdth: 100, slnt: 0,   // variable-font axes
    size: 0.62,           // fraction of asset height
    letterSpacing: -0.04, // em
    lineHeight: 0.86,
    color: BRAND.white, x: 0.5, y: 0.5, align: 'center', valign: 'middle',
    depth: 1,             // share of beams drawn behind the text: 1 = all, 0 = none, between = woven
    rotate: 0,
  },
  // The mark is the only logo, so it carries a colour rather than a source image.
  logo: { enabled: true, colour: '#FFFFFF', x: 0.95, y: 0.06, width: 0.16, align: 'right', valign: 'top', opacity: 1 },
  mockup: { id: 'none', showGuides: true, showRulers: false },
};
