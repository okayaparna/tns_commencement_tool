// Turns the document state into a list of beams (ribbons) in asset pixel space.
// A beam = centreline points + per-point widths + colour sets (one per stripe).
import { mulberry32, lerp, clamp, TAU, cycleColorOklab, cycleColorOklch, mixHex, mod } from './util.js';

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
// space: 'oklch' (hue-arc, keeps mixes saturated), 'oklab' (straight line), 'hard' (crisp bands).
export function gradientStops(colors, phase, space = 'oklch', vividness = 0) {
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
  // The browser only lerps in sRGB between the stops we hand it, so sub-sample each
  // segment finely enough that its straight lines follow the perceptual path we want.
  const mix = space === 'oklab' ? cycleColorOklab : (c, u) => cycleColorOklch(c, u, vividness);
  const SUB = 8;
  const us = new Set([u0, u1]);
  for (let j = 0; j <= 2 * n * SUB; j++) { const u = j / (n * SUB); if (u > u0 && u < u1) us.add(u); }
  return [...us].sort((a, b) => a - b).map(u => ({ pos: at(u), color: mix(cycle, u) }));
}
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
  const mb = mo.beams;
  const sway = mo.enabled ? Math.sin(time * mb.swaySpeed * TAU) * mb.sway : 0;
  if (mo.enabled && mb.drift) {
    anchor.x += Math.cos(time * 0.21 * TAU) * mb.drift * W * 0.5;
    anchor.y += Math.sin(time * 0.17 * TAU) * mb.drift * H * 0.5;
  }
  const ang = (s.angle + sway) * Math.PI / 180;
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  const nor = { x: -dir.y, y: dir.x };
  const local = (u, v) => ({ x: anchor.x + u * dir.x + v * nor.x, y: anchor.y + u * dir.y + v * nor.y });
  const frac = i => (n === 1 ? 0.5 : i / (n - 1));
  // `pack` closes the gaps: it drives each beam's width toward the spacing between
  // neighbours, so they meet edge to edge, and quiets the jitter that would reopen them.
  const pack = clamp(s.pack ?? 0, 0, 1);
  const gap = 1 - pack;
  const spacing = tgt => (n > 1 ? tgt / (n - 1) : m * s.baseWidth);
  const varyOf = i => Math.max(0.15, 1 + J[i].w * 2 * s.widthVariation * gap);
  const widthOf = (i, packed) => {
    const base = m * s.baseWidth * varyOf(i);
    return packed == null ? base : lerp(base, packed, pack);
  };

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
  // How far the anchor is from the furthest corner of the region that maps onto the canvas.
  // Beams have to out-reach this or their ends show; Scale, Rotate and Offset all move it.
  const reach = Math.max(
    Math.hypot(clipRect.x0 - anchor.x, clipRect.y0 - anchor.y),
    Math.hypot(clipRect.x1 - anchor.x, clipRect.y0 - anchor.y),
    Math.hypot(clipRect.x1 - anchor.x, clipRect.y1 - anchor.y),
    Math.hypot(clipRect.x0 - anchor.x, clipRect.y1 - anchor.y));

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
      // A stroke is described by its two ends — the width at the focus and the width out at the
      // edge — with a curve between, rather than by a flare piled on top of a base width. The
      // profile is measured over the stretch you can see, so "outer edge" is the width where the
      // stroke leaves the frame; pegging it to the geometric length instead made most of the
      // ramp happen off-canvas and left the outer width unreachable.
      const lenRef = Math.max(reach, m * 0.25);
      const len = Math.max(lenRef * 1.06, reach * 1.1), N = 96;
      // Neighbours are span/(n-1) apart, so at lenRef they are lenRef*span/(n-1) apart: an outer
      // edge exactly that wide leaves no wedge of background between them, and the stroke has to
      // start from nothing at the focus for the fan to close up all the way in.
      const outer = lerp(m * s.outerWidth, n > 1 ? lenRef * span / (n - 1) : m * s.outerWidth, pack);
      const curve = lerp(s.edgeCurve, 1, pack);
      for (let i = 0; i < n; i++) {
        const a = ang - span / 2 + span * frac(i) + J[i].a * s.jitter * gap * span / Math.max(2, n - 1);
        const d = { x: Math.cos(a), y: Math.sin(a) };
        const t0 = s.twoSided ? -1 : 0;
        const w0 = m * s.baseWidth * varyOf(i) * gap, w1 = outer * varyOf(i);
        // Warp combs the fan: strokes bow away from its axis, the outer ones most, and none of
        // it at the focus so they still converge to a point.
        const bow = s.warp * m * (frac(i) - 0.5) * 2;
        const pts = [], widths = [];
        for (let k = 0; k <= N; k++) {
          const t = lerp(t0, 1, k / N);
          const u = clamp(Math.abs(t) * len / lenRef, 0, 1);
          const off = bow * Math.pow(u, 1.6);
          pts.push({ x: anchor.x + d.x * t * len - d.y * off, y: anchor.y + d.y * t * len + d.x * off });
          widths.push(lerp(w0, w1, Math.pow(u, curve)));
        }
        push(i, pts, widths);
      }
      break;
    }
    case 'weave': {
      const span = s.span * Math.PI / 180;
      for (let i = 0; i < n; i++) {
        const a = ang + (frac(i) - 0.5) * span + J[i].a * s.jitter * gap * span * 0.6;
        const d = { x: Math.cos(a), y: Math.sin(a) }, nn = { x: -d.y, y: d.x };
        const off = (frac(i) - 0.5) * s.spread * m + J[i].o * s.jitter * gap * m * 0.35;
        const c = { x: anchor.x + nn.x * off, y: anchor.y + nn.y * off };
        const w = widthOf(i, spacing(s.spread * m));
        const seg = clipToView({ x: c.x - d.x * diag * 4, y: c.y - d.y * diag * 4 }, { x: c.x + d.x * diag * 4, y: c.y + d.y * diag * 4 }, w);
        if (!seg) continue;
        push(i, sampleLine(seg[0], seg[1], 8), new Array(9).fill(w));
      }
      break;
    }
    case 'streamers': {
      const L = Math.max(diag * 1.3, reach * 2.2);
      const order = [...Array(n).keys()].sort((a, b) => J[a].s - J[b].s); // shuffled exits so ribbons cross
      for (let i = 0; i < n; i++) {
        const vA = (frac(i) - 0.5) * s.spread * H + J[i].o * s.jitter * gap * H * 0.25;
        // Shuffled exits make the ribbons cross, but they also stop the ends tiling. As pack
        // rises the exits settle into a straight reversal — a clean X, flush at both edges.
        const vB = lerp((frac(order[i]) - 0.5) * s.spread * H, (frac(n - 1 - i) - 0.5) * s.spread * H, pack)
          + J[i].a * s.jitter * gap * H * 0.25;
        const vM = J[i].c * s.jitter * gap * m * 0.06 * (i % 2 ? 1 : -1);
        const A = { x: -L / 2, y: vA }, M = { x: 0, y: vM }, B = { x: L / 2, y: vB };
        const k = s.tension * L / 2;
        const N = 30, pts = [], widths = [];
        for (let j = 0; j <= 2 * N; j++) {
          const t = j / (2 * N);
          const p = t <= 0.5
            ? cubic(A, { x: A.x + k, y: A.y }, { x: M.x - k * 0.6, y: M.y }, M, t * 2)
            : cubic(M, { x: M.x + k * 0.6, y: M.y }, { x: B.x - k, y: B.y }, B, (t - 0.5) * 2);
          pts.push(local(p.x, p.y));
          widths.push(widthOf(i, spacing(s.spread * H)) * (1 - s.pinch * bell(t, 0.16)));
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
  const phase = mod(f.phase + (mo.enabled ? time * mo.beams.speed : 0), 1);
  const stripes = f.mode === 'stripes' ? Math.max(1, Math.round(f.stripes)) : 1;
  for (const b of beams) {
    const base = Math.round(b.i * f.colorStep);
    b.stripes = [];
    for (let j = 0; j < stripes; j++) {
      const colors = [];
      const cnt = f.mode === 'solid' ? 1 : Math.max(1, Math.round(f.runSpread)) + 1;
      for (let c = 0; c < cnt; c++) colors.push(pal[mod(base + j + c, pal.length)]);
      b.stripes.push({ colors, stops: gradientStops(colors, phase, f.blendSpace, f.vividness) });
    }
    b.phase = phase;
  }
  return beams;
}

// The stretch of a beam's centreline that is actually on the canvas. A ray runs thousands of
// pixels past the frame, and hanging the gradient off its full length leaves the visible part
// showing one stretched mid-mix instead of the palette.
export function visibleSpan(pts, W, H, margin = 0) {
  let lo = -1, hi = -1;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x >= -margin && p.x <= W + margin && p.y >= -margin && p.y <= H + margin) {
      if (lo < 0) lo = i;
      hi = i;
    }
  }
  if (lo < 0) return [pts[0], pts[pts.length - 1]];
  return [pts[Math.max(0, lo - 1)], pts[Math.min(pts.length - 1, hi + 1)]];
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

// A beam split into quads along its length, each carrying the edge-to-edge axis to paint
// a gradient ACROSS the stroke. A single along-the-length gradient leaves every beam flat
// in section, which is what makes it read as coloured tape; a bright centre reads as light.
export function ribbonQuads(pts, widths, f0 = -0.5, f1 = 0.5, tol = 0.05, wtol = 0.012) {
  const N = pts.length, out = [];
  const normalAt = i => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    return { x: -ty / len, y: tx / len };
  };
  const nrm = pts.map((_, i) => normalAt(i));
  // Consecutive slices merge into one quad only when the cross-section is genuinely the same:
  // parallel within `tol` (the sine of the angle allowed to accumulate) AND the same width
  // within `wtol`. Width matters because the caller hangs a gradient off the quad's own end
  // section — merge across a taper and that gradient gets stretched over a stroke it no longer
  // spans, which collapses the fill onto the centreline.
  for (let i = 0, j = 0; i < N - 1; i = j) {
    j = i + 1;
    while (j < N - 1
      && Math.abs(nrm[i].x * nrm[j + 1].y - nrm[i].y * nrm[j + 1].x) < tol
      && Math.abs(widths[j + 1] - widths[i]) <= wtol * Math.max(widths[i], widths[j + 1], 1e-6)) j++;
    const p0 = pts[i], p1 = pts[j];
    const n0 = nrm[i], n1 = nrm[j];
    const w0 = widths[i] / 2, w1 = widths[j] / 2;
    // The axis always spans the whole stroke, even when the quad covers only a sub-band, so
    // a seam or a stripe cuts a hole in one continuous cross-section instead of restarting it.
    const a = { x: p0.x + n0.x * w0, y: p0.y + n0.y * w0 };
    const z = { x: p0.x - n0.x * w0, y: p0.y - n0.y * w0 };
    const at = (p, nn, w, f) => ({ x: p.x + nn.x * w * f * 2, y: p.y + nn.y * w * f * 2 });
    out.push({ a, z, poly: [at(p0, n0, w0, f1), at(p1, n1, w1, f1), at(p1, n1, w1, f0), at(p0, n0, w0, f0)] });
  }
  return out;
}

// Fold a 0..1 stop list into an edge → centre → edge ramp, so the palette reads across the
// stroke symmetrically: the first colour on both rims, the last one down the centreline.
// `fade` carries an alpha ramp with it — a stroke that ends on a hard edge reads as a wedge of
// paint however good the colours are; one that dissolves into the ground reads as light.
export function mirrorStops(stops, fade = 0) {
  const alphaAt = pos => {
    if (!(fade > 0)) return 1;
    const u = Math.abs(pos - 0.5) * 2;          // 0 on the centreline, 1 at the rim
    return clamp(1 - u, 0, 1) >= fade ? 1 : Math.pow(clamp((1 - u) / fade, 0, 1), 0.75);
  };
  const out = [];
  for (const t of stops) out.push({ pos: t.pos / 2, color: t.color });
  for (const t of stops.slice().reverse()) out.push({ pos: 1 - t.pos / 2, color: t.color });
  return out.map(t => ({ ...t, alpha: alphaAt(t.pos) }));
}

// Colour at position t along a stop list, so a cross-slice can pick up the colour the
// along-the-length gradient would have had there.
export function sampleStops(stops, t) {
  if (!stops.length) return '#000000';
  if (t <= stops[0].pos) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].pos) {
      const span = stops[i].pos - stops[i - 1].pos;
      return span < 1e-6 ? stops[i].color : mixHex(stops[i - 1].color, stops[i].color, (t - stops[i - 1].pos) / span);
    }
  }
  return stops[stops.length - 1].color;
}

// The alpha ramp across a stroke on its own, for slices that carry a single colour.
export function fadeStops(fade, steps = 15) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const pos = i / (steps - 1), u = Math.abs(pos - 0.5) * 2;
    out.push({ pos, alpha: 1 - u >= fade ? 1 : Math.pow(clamp((1 - u) / fade, 0, 1), 0.75) });
  }
  return out;
}

// White-alpha profile across a stroke: nothing at the edges, `core` on the centreline.
// `focus` tightens it from a broad wash (0.6) to a hot filament (8).
export function coreStops(core, focus, steps = 11) {
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    out.push({ pos: t, alpha: +(core * Math.sin(Math.PI * t) ** focus).toFixed(4) });
  }
  return out;
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

// One stripe's range with a gap taken out of the stroke's centreline. Returns the one or two
// pieces that survive, so a stripe keeps its own colour on both sides of the seam.
export function carveCentre([lo, hi], centre) {
  const c = clamp(centre || 0, 0, 0.98);
  if (!c) return [[lo, hi]];
  const a = -c / 2, b = c / 2;
  if (hi <= a || lo >= b) return [[lo, hi]];
  const out = [];
  if (lo < a) out.push([lo, a]);
  if (hi > b) out.push([b, hi]);
  return out;
}

// Handle position (asset px) for the draggable anchor.
export function anchorPoint(state) {
  return { x: state.shape.focusX * state.size.w, y: state.shape.focusY * state.size.h };
}
