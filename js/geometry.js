// Turns the document state into a list of beams (ribbons) in asset pixel space.
// A beam = centreline points + per-point widths + colour sets (one per stripe).
import { mulberry32, lerp, clamp, TAU, cycleColorOklab as cycleColor, mod } from './util.js';

const bell = (t, width = 0.18) => Math.exp(-(((t - 0.5) / width) ** 2));

// Liang–Barsky clip of segment p0→p1 to the rectangle expanded by `margin`.
function clipSegment(p0, p1, W, H, margin) {
  let t0 = 0, t1 = 1;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const checks = [[-dx, p0.x + margin], [dx, W + margin - p0.x], [-dy, p0.y + margin], [dy, H + margin - p0.y]];
  for (const [p, q] of checks) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [{ x: p0.x + dx * t0, y: p0.y + dy * t0 }, { x: p0.x + dx * t1, y: p0.y + dy * t1 }];
}

function sampleLine(a, b, N) {
  const pts = [];
  for (let k = 0; k <= N; k++) pts.push({ x: lerp(a.x, b.x, k / N), y: lerp(a.y, b.y, k / N) });
  return pts;
}
function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

// Closed colour cycle that reads as a plain A→B(→C) gradient at phase 0 and loops seamlessly.
export function colorCycle(colors) {
  if (colors.length <= 2) return colors.slice();
  return colors.concat(colors.slice(1, -1).reverse());
}
// Gradient stops for the visible window of the cycle, shifted by phase (0..1 = one full loop).
// space: 'oklab' (smooth, keeps chroma), 'srgb' (browser default lerp), 'hard' (crisp colour bands).
export function gradientStops(colors, phase, space = 'oklab') {
  if (colors.length === 1) return [{ pos: 0, color: colors[0] }, { pos: 1, color: colors[0] }];
  const cycle = colorCycle(colors);
  const n = cycle.length;
  const win = (colors.length - 1) / n;         // fraction of the cycle shown on the ribbon
  const u0 = mod(phase, 1), u1 = u0 + win;
  const at = u => (u - u0) / win;

  if (space === 'hard') {
    // Each colour holds its full band, then jumps: two stops at every boundary.
    const stops = [{ pos: 0, color: cycleColorHard(cycle, u0) }];
    for (let j = 0; j <= 2 * n; j++) {
      const u = j / n;
      if (u <= u0 || u >= u1) continue;
      stops.push({ pos: at(u), color: cycleColorHard(cycle, u - 1e-6) });
      stops.push({ pos: at(u), color: cycleColorHard(cycle, u + 1e-6) });
    }
    stops.push({ pos: 1, color: cycleColorHard(cycle, u1 - 1e-6) });
    return stops;
  }
  // 'srgb' uses only the palette colours as stops and lets the browser interpolate between them.
  // 'oklab' sub-samples each segment so the browser's sRGB lerp follows the OKLab path.
  const SUB = space === 'srgb' ? 1 : 6;
  const us = new Set([u0, u1]);
  for (let j = 0; j <= 2 * n * SUB; j++) { const u = j / (n * SUB); if (u > u0 && u < u1) us.add(u); }
  return [...us].sort((a, b) => a - b).map(u => ({ pos: at(u), color: cycleColor(cycle, u) }));
}
// Nearest palette entry, with no interpolation.
function cycleColorHard(cycle, u) { return cycle[Math.floor(mod(u, 1) * cycle.length) % cycle.length]; }

export function buildBeams(state, time = 0) {
  const { w: W, h: H } = state.size;
  const s = state.shape, f = state.fill, mo = state.motion;
  const m = Math.min(W, H);
  const diag = Math.hypot(W, H);
  const n = Math.max(1, Math.round(s.count));
  const rnd = mulberry32(Math.round(s.seed) * 7919 + 13);
  const J = [];
  for (let i = 0; i < n; i++) J.push({ a: rnd() - 0.5, o: rnd() - 0.5, w: rnd() - 0.5, c: rnd(), s: rnd() });

  const anchor = { x: s.focusX * W, y: s.focusY * H };
  const sway = mo.enabled ? Math.sin(time * mo.swaySpeed * TAU) * mo.sway : 0;
  if (mo.enabled && mo.drift) {
    anchor.x += Math.cos(time * 0.21 * TAU) * mo.drift * W * 0.5;
    anchor.y += Math.sin(time * 0.17 * TAU) * mo.drift * H * 0.5;
  }
  const ang = (s.angle + sway) * Math.PI / 180;
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  const nor = { x: -dir.y, y: dir.x };
  const local = (u, v) => ({ x: anchor.x + u * dir.x + v * nor.x, y: anchor.y + u * dir.y + v * nor.y });
  const frac = i => (n === 1 ? 0.5 : i / (n - 1));
  const widthOf = i => m * s.baseWidth * Math.max(0.15, 1 + J[i].w * 2 * s.widthVariation);

  const beams = [];
  const push = (i, pts, widths) => beams.push({ i, pts, widths });

  // Straight beams are clipped to the canvas, but the global rotate/scale/offset is applied
  // afterwards — so clip to the region that *maps onto* the canvas, not the canvas itself.
  const clipRect = (() => {
    const rot = -s.rotate * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
    const inv = p => {
      const dx = p.x - s.offsetX * W - anchor.x, dy = p.y - s.offsetY * H - anchor.y;
      return { x: anchor.x + (dx * cr - dy * sr) / s.scale, y: anchor.y + (dx * sr + dy * cr) / s.scale };
    };
    const cs = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }].map(inv);
    const xs = cs.map(p => p.x), ys = cs.map(p => p.y);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  })();
  // clipSegment works on (0,0)-(W,H) plus a margin, so shift into that frame and back.
  const clipToView = (p0, p1, margin) => {
    const off = { x: clipRect.x0, y: clipRect.y0 };
    const seg = clipSegment(
      { x: p0.x - off.x, y: p0.y - off.y }, { x: p1.x - off.x, y: p1.y - off.y },
      clipRect.x1 - clipRect.x0, clipRect.y1 - clipRect.y0, margin);
    return seg && seg.map(p => ({ x: p.x + off.x, y: p.y + off.y }));
  };

  switch (s.template) {
    case 'rays': {
      const span = s.span * Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const a = ang - span / 2 + span * frac(i) + J[i].a * s.jitter * span / Math.max(2, n - 1);
        const d = { x: Math.cos(a), y: Math.sin(a) };
        const len = diag * 1.6, N = 40;
        const t0 = s.twoSided ? -1 : 0;
        const pts = [], widths = [];
        for (let k = 0; k <= N; k++) {
          const t = lerp(t0, 1, k / N);
          pts.push({ x: anchor.x + d.x * t * len, y: anchor.y + d.y * t * len });
          widths.push(widthOf(i) + m * s.flare * Math.pow(Math.abs(t), s.flareCurve));
        }
        push(i, pts, widths);
      }
      break;
    }
    case 'weave': {
      const span = s.span * Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const a = ang + (frac(i) - 0.5) * span + J[i].a * s.jitter * span * 0.6;
        const d = { x: Math.cos(a), y: Math.sin(a) }, nn = { x: -d.y, y: d.x };
        const off = (frac(i) - 0.5) * s.spread * m + J[i].o * s.jitter * m * 0.35;
        const c = { x: anchor.x + nn.x * off, y: anchor.y + nn.y * off };
        const w = widthOf(i);
        const seg = clipToView({ x: c.x - d.x * diag * 4, y: c.y - d.y * diag * 4 }, { x: c.x + d.x * diag * 4, y: c.y + d.y * diag * 4 }, w);
        if (!seg) continue;
        push(i, sampleLine(seg[0], seg[1], 8), new Array(9).fill(w));
      }
      break;
    }
    case 'streamers': {
      const L = diag * 1.3;
      const order = [...Array(n).keys()].sort((a, b) => J[a].s - J[b].s); // shuffled exits so ribbons cross
      for (let i = 0; i < n; i++) {
        const vA = (frac(i) - 0.5) * s.spread * H + J[i].o * s.jitter * H * 0.25;
        const vB = (frac(order[i]) - 0.5) * s.spread * H + J[i].a * s.jitter * H * 0.25;
        const vM = J[i].c * s.jitter * m * 0.06 * (i % 2 ? 1 : -1);
        const A = { x: -L / 2, y: vA }, M = { x: 0, y: vM }, B = { x: L / 2, y: vB };
        const k = s.tension * L / 2;
        const N = 30, pts = [], widths = [];
        for (let j = 0; j <= 2 * N; j++) {
          const t = j / (2 * N);
          const p = t <= 0.5
            ? cubic(A, { x: A.x + k, y: A.y }, { x: M.x - k * 0.6, y: M.y }, M, t * 2)
            : cubic(M, { x: M.x + k * 0.6, y: M.y }, { x: B.x - k, y: B.y }, B, (t - 0.5) * 2);
          pts.push(local(p.x, p.y));
          widths.push(widthOf(i) * (1 - s.pinch * bell(t, 0.16)));
        }
        push(i, pts, widths);
      }
      break;
    }
  }

  // Global transform: scale about the anchor, then offset.
  const ox = s.offsetX * W, oy = s.offsetY * H;
  const rot = s.rotate * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
  for (const b of beams) {
    b.pts = b.pts.map(p => {
      const dx = (p.x - anchor.x) * s.scale, dy = (p.y - anchor.y) * s.scale;
      return { x: anchor.x + dx * cr - dy * sr + ox, y: anchor.y + dx * sr + dy * cr + oy };
    });
    b.widths = b.widths.map(w => w * s.scale);
  }

  // Colours.
  const pal = state.palette.length ? state.palette : ['#FFFFFF'];
  const phase = mod(f.phase + (mo.enabled ? time * mo.speed : 0), 1);
  const stripes = f.mode === 'stripes' ? Math.max(1, Math.round(f.stripes)) : 1;
  for (const b of beams) {
    const base = Math.round(b.i * f.colorStep);
    b.stripes = [];
    for (let j = 0; j < stripes; j++) {
      const colors = [];
      const cnt = f.mode === 'solid' ? 1 : Math.max(1, Math.round(f.runSpread)) + 1;
      for (let c = 0; c < cnt; c++) colors.push(pal[mod(base + j + c, pal.length)]);
      b.stripes.push({ colors, stops: gradientStops(colors, phase, f.blendSpace) });
    }
    b.phase = phase;
  }
  return beams;
}

// Polygon (array of points) for the part of a ribbon between width fractions f0..f1 (−0.5..0.5).
export function ribbonPolygon(pts, widths, f0 = -0.5, f1 = 0.5) {
  const L = [], R = [];
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const nx = -ty, ny = tx, w = widths[i];
    L.push({ x: pts[i].x + nx * w * f1, y: pts[i].y + ny * w * f1 });
    R.push({ x: pts[i].x + nx * w * f0, y: pts[i].y + ny * w * f0 });
  }
  return L.concat(R.reverse());
}

// Width-fraction ranges for each stripe of a beam.
export function stripeRanges(count, seam) {
  const out = [];
  const g = count > 1 ? clamp(seam, 0, 0.9) / count : 0;
  for (let j = 0; j < count; j++) {
    out.push([-0.5 + j / count + g / 2, -0.5 + (j + 1) / count - g / 2]);
  }
  return out;
}

// Handle position (asset px) for the draggable anchor.
export function anchorPoint(state) {
  return { x: state.shape.focusX * state.size.w, y: state.shape.focusY * state.size.h };
}
