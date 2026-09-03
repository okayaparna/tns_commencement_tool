// Canvas renderer. Draws the asset into a 2D context whose transform maps (0,0)-(W,H).
import { buildBeams, ribbonPolygon, stripeRanges, ribbonQuads, coreStops } from './geometry.js';
import { clamp, TAU } from './util.js';
import { resolveFamily, fontAxes, axisRange } from './fonts.js';

export const FALLBACK_STACK = '"Helvetica Neue", Helvetica, Arial, sans-serif';
// Variable axes a text layer carries.
export const layerVars = layer => ({ wght: Number(layer.wght) || 400, wdth: layer.wdth, slnt: layer.slnt });
// A variable font bakes its weight into the axis, so the CSS weight must stay neutral —
// asking a 400-weight face for 800 makes the browser synthesise bold on top of it.
export const cssWeight = layer => (fontAxes(layer.font) ? 400 : (Number(layer.wght) || 400));
export const fontString = (layer, px) =>
  `${cssWeight(layer)} ${px}px "${resolveFamily(layer.font, layerVars(layer))}", ${FALLBACK_STACK}`;

// Shared text layout so canvas and SVG agree.
export function layoutText(layer, W, H) {
  const lines = String(layer.text || '').split('\n');
  const px = layer.size * H;
  const lineH = px * layer.lineHeight;
  const total = lineH * lines.length;
  const x = layer.x * W, y = layer.y * H;
  const top = layer.valign === 'top' ? y : layer.valign === 'bottom' ? y - total : y - total / 2;
  const baselines = lines.map((_, i) => top + i * lineH + lineH / 2 + px * 0.36);
  const ls = layer.letterSpacing * px;
  // Browsers add the letter-spacing after the last glyph too; nudge so alignment stays true.
  const nudge = layer.align === 'center' ? ls / 2 : layer.align === 'right' ? ls : 0;
  return { lines, px, lineH, total, x: x + nudge, top, baselines, ls, anchorX: x, anchorY: y };
}

export function drawTextLayer(ctx, layer, W, H) {
  if (!layer.enabled || !String(layer.text || '').trim()) return;
  const L = layoutText(layer, W, H);
  ctx.save();
  if (layer.rotate) { ctx.translate(L.anchorX, L.anchorY); ctx.rotate(layer.rotate * Math.PI / 180); ctx.translate(-L.anchorX, -L.anchorY); }
  ctx.font = fontString(layer, L.px);
  ctx.fillStyle = layer.color;
  ctx.textBaseline = 'alphabetic';
  const native = 'letterSpacing' in ctx;
  if (native) { ctx.letterSpacing = `${L.ls}px`; ctx.textAlign = layer.align; }
  L.lines.forEach((line, i) => {
    if (native) { ctx.fillText(line, L.x, L.baselines[i]); return; }
    // Manual letter-spacing fallback.
    const widths = [...line].map(ch => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + L.ls * Math.max(0, widths.length - 1);
    let cx = layer.align === 'center' ? L.anchorX - total / 2 : layer.align === 'right' ? L.anchorX - total : L.anchorX;
    ctx.textAlign = 'left';
    [...line].forEach((ch, k) => { ctx.fillText(ch, cx, L.baselines[i]); cx += widths[k] + L.ls; });
  });
  ctx.restore();
}

// --- motion applied to the type and the logo ----------------------------
// One frequency per section with fixed phase offsets, so a section loops on its own period.
// Canvas cannot set font-variation-settings, so every distinct axis value costs a FontFace:
// animated axes are quantised to keep that set small rather than minting one per frame.
const q = (v, step) => Math.round(v / step) * step;

export function animateText(state, time) {
  const layer = state.headline, mo = state.motion;
  if (!mo.enabled) return layer;
  const t = mo.text;
  if (!(t.wght || t.wdth || t.drift || t.sway)) return layer;
  const ph = time * t.speed * TAU;
  // Swings are clamped to what the face actually offers, so the ends of the cycle do not
  // sit on an axis value the font cannot render.
  const lim = (tag, v, step, fb) => {
    const r = axisRange(layer.font, tag) || fb;
    return q(clamp(v, r.min, r.max), step);
  };
  return {
    ...layer,
    wght: lim('wght', layer.wght + Math.sin(ph) * t.wght, 10, { min: 100, max: 900 }),
    wdth: lim('wdth', layer.wdth + Math.sin(ph) * t.wdth, 5, { min: 50, max: 200 }),
    x: layer.x + Math.cos(ph) * t.drift,
    y: layer.y + Math.sin(ph) * t.drift,
    rotate: layer.rotate + Math.sin(ph + TAU / 6) * t.sway,
  };
}

export function animateLogo(state, time) {
  const logo = state.logo, mo = state.motion;
  if (!mo.enabled) return logo;
  const g = mo.logo;
  if (!(g.drift || g.sway || g.fade)) return logo;
  const ph = time * g.speed * TAU;
  return {
    ...logo,
    x: logo.x + Math.cos(ph) * g.drift,
    y: logo.y + Math.sin(ph) * g.drift,
    rotate: Math.sin(ph + TAU / 6) * g.sway,
    opacity: clamp(logo.opacity - ((1 - Math.cos(ph)) / 2) * g.fade, 0, 1),
  };
}

const imgCache = new Map();
export function getImage(src, onload) {
  if (!src) return null;
  let img = imgCache.get(src);
  if (!img) {
    img = new Image(); img.src = src; imgCache.set(src, img);
    if (onload) img.onload = onload;
  }
  return img.complete && img.naturalWidth ? img : null;
}
export function logoBox(logo, W, H, img) {
  const w = logo.width * W, h = w * (img.naturalHeight / img.naturalWidth);
  const ax = logo.x * W, ay = logo.y * H;
  const x = logo.align === 'center' ? ax - w / 2 : logo.align === 'right' ? ax - w : ax;
  const y = logo.valign === 'middle' ? ay - h / 2 : logo.valign === 'bottom' ? ay - h : ay;
  return { x, y, w, h };
}
export function drawLogo(ctx, logo, W, H, onload) {
  if (!logo.enabled || !logo.src) return;
  const img = getImage(logo.src, onload);
  if (!img) return;
  const b = logoBox(logo, W, H, img);
  ctx.save();
  ctx.globalAlpha = logo.opacity;
  if (logo.rotate) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.translate(cx, cy); ctx.rotate(logo.rotate * Math.PI / 180); ctx.translate(-cx, -cy);
  }
  ctx.drawImage(img, b.x, b.y, b.w, b.h);
  ctx.restore();
}

export function drawBeams(ctx, state, beams) {
  if (!beams.length) return;
  const { w: W, h: H } = state.size;
  const f = state.fill;
  const m = Math.min(W, H);
  ctx.save();
  ctx.globalCompositeOperation = f.blend === 'normal' ? 'source-over' : f.blend;
  ctx.globalAlpha = f.opacity;
  const ranges = stripeRanges(beams.length ? beams[0].stripes.length : 1, f.seam);
  for (const b of beams) {
    const a = b.pts[0], z = b.pts[b.pts.length - 1];
    b.stripes.forEach((st, j) => {
      const poly = ribbonPolygon(b.pts, b.widths, ranges[j][0], ranges[j][1]);
      ctx.beginPath();
      poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      const g = ctx.createLinearGradient(a.x, a.y, z.x, z.y);
      st.stops.forEach(s => g.addColorStop(Math.min(1, Math.max(0, s.pos)), s.color));
      ctx.fillStyle = g;
      ctx.fill();
      if (f.edge > 0) { ctx.lineWidth = f.edge * m / 1000; ctx.strokeStyle = f.edgeColor; ctx.lineJoin = 'round'; ctx.stroke(); }
    });
  }
  ctx.restore();
  drawCores(ctx, state, beams);
}

// The lit centreline, painted over the colour pass. Always source-over: a multiply blend
// would swallow it, and it is light being added to the stroke, not another stroke.
export function drawCores(ctx, state, beams) {
  const f = state.fill;
  if (!(f.core > 0)) return;
  const stops = coreStops(f.core, f.coreFocus);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = f.opacity;
  for (const b of beams) {
    for (const q of ribbonQuads(b.pts, b.widths)) {
      const g = ctx.createLinearGradient(q.a.x, q.a.y, q.z.x, q.z.y);
      for (const s of stops) g.addColorStop(s.pos, `rgba(255,255,255,${s.alpha})`);
      ctx.beginPath();
      q.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }
  }
  ctx.restore();
}

// Where the text sits in the beam stack. depth 1 puts every beam behind it, 0 puts every
// beam in front, and anything between weaves the type through the ribbons.
export function textSplit(layer, count) {
  const d = layer.depth == null ? 1 : clamp(layer.depth, 0, 1);
  return Math.round(d * count);
}

export function renderAsset(ctx, state, time = 0, hooks = {}) {
  const { w: W, h: H } = state.size;
  const beams = buildBeams(state, time);
  const cut = textSplit(state.headline, beams.length);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  ctx.fillStyle = state.background; ctx.fillRect(0, 0, W, H);
  drawBeams(ctx, state, beams.slice(0, cut));
  drawTextLayer(ctx, animateText(state, time), W, H);
  drawBeams(ctx, state, beams.slice(cut));
  drawLogo(ctx, animateLogo(state, time), W, H, hooks.onImageLoad);
  ctx.restore();
  return beams;
}

// Render the asset into a fresh canvas. `longSide` limits resolution (null = full size).
export function renderAssetToCanvas(state, time = 0, longSide = null, hooks = {}) {
  const { w: W, h: H } = state.size;
  const k = longSide ? Math.min(1, longSide / Math.max(W, H)) : 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  renderAsset(ctx, state, time, hooks);
  return c;
}
