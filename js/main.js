import { DEFAULT_STATE, SIZE_PRESETS, TEMPLATES, MOCKUPS, LOOKS, BRAND, FONT } from './state.js';
import { deepClone, deepMerge, clamp } from './util.js';
import { renderAsset, layoutText, fontString, renderAssetToCanvas, getImage, logoBox, textSplit } from './paint.js';
import { anchorPoint } from './geometry.js';
import { drawMockup, lastPlacement } from './mockups.js';
import { exportPNG, exportSVG, exportVideo, exportJSON, videoMime } from './export.js';
import { buildControls, getPath, setPath } from './ui.js';
import { loadProjectFonts, onFontsChanged, fontNames, fontInstances, hasAxis, axisRange } from './fonts.js';

const $ = s => document.querySelector(s);
// The only legal backgrounds: the four brand colours plus black and white.
const BACKGROUNDS = [
  { hex: BRAND.blue, label: 'Blue' }, { hex: BRAND.pink, label: 'Pink' },
  { hex: BRAND.green, label: 'Green' }, { hex: BRAND.red, label: 'Red' },
  { hex: BRAND.white, label: 'White' }, { hex: BRAND.black, label: 'Black' },
];
// Beams are the four colours only — black and white are ground, never stroke — and never the
// colour the background is already set to, which would just cut a hole in the pattern.
const STROKE_COLOURS = BACKGROUNDS.filter(c => c.hex !== BRAND.white && c.hex !== BRAND.black);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const strokeAllowed = (hex, bg) => STROKE_COLOURS.some(c => same(c.hex, hex)) && !same(hex, bg);
// Drop anything the rules disallow, keeping at least one colour to draw with. Used when a
// document arrives from disk or storage and may predate the rules.
function legalPalette(palette, background) {
  const keep = (palette || []).filter(c => strokeAllowed(c, background));
  return keep.length ? keep : [STROKE_COLOURS.find(c => !same(c.hex, background)).hex];
}
// Changing the background only invalidates one colour, so swap that one for a spare rather
// than dropping it — otherwise cycling through backgrounds quietly eats the palette.
function repalette(palette, background) {
  const out = [];
  for (const c of palette || []) {
    if (strokeAllowed(c, background)) { out.push(c); continue; }
    const spare = STROKE_COLOURS.find(x => !same(x.hex, background) && !out.includes(x.hex) && !palette.includes(x.hex));
    if (spare) out.push(spare.hex);
  }
  return out.length ? out : legalPalette([], background);
}
const STORAGE = 'tns-studio-state-v1';

// ---------- state ----------
let state = loadState();
let history = [], lastPush = 0;
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE));
    if (s && s.version === DEFAULT_STATE.version) {
      const merged = deepMerge(DEFAULT_STATE, s);
      merged.palette = legalPalette(merged.palette, merged.background);
      return merged;
    }
  } catch (_) {}
  return deepClone(DEFAULT_STATE);
}
let saveTimer;
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (_) {} }, 250); }
function pushHistory() {
  const now = performance.now();
  if (now - lastPush > 400) { history.push(JSON.stringify(state)); if (history.length > 60) history.shift(); }
  lastPush = now;
}
function set(path, value) { pushHistory(); setPath(state, path, value); changed(); }
function patch(partial) { pushHistory(); state = deepMerge(state, partial); changed(); }
function replaceState(s) {
  pushHistory();
  state = deepMerge(DEFAULT_STATE, s);
  // A preset from disk, or an older one, can carry colours the rules no longer allow.
  state.palette = legalPalette(state.palette, state.background);
  changed();
}
function undo() { const s = history.pop(); if (s) { state = JSON.parse(s); changed(); } }
function changed() { persist(); syncUI(); requestRender(); }

// ---------- stage ----------
const canvas = $('#canvas'), stage = $('#stage'), stageInfo = $('#stage-info');
const ctx = canvas.getContext('2d');
// asset px -> canvas device px, as a matrix, so the same drag code works whether you are
// looking at the bare asset or at it sitting inside a mockup (rotated booklet included).
let view = { m: null, inv: null, s: 1, dpr: 1 };
const setView = m => { view.m = m; view.inv = m.inverse(); view.s = Math.hypot(m.a, m.b); };
let time = 0, lastT = null, raf = null, needsRender = true;
let lastMockup = null, mockupAt = 0;   // drives the mockup's entrance
// Set by draw() while a mockup is still animating in. draw() must never call requestRender()
// itself: frame() has already cleared `raf`, so that would start a second rAF chain on top of
// the one frame() is about to start, and the chains double every frame until the tab locks.
let entering = false;

function resize() {
  const r = stage.getBoundingClientRect();
  view.dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * view.dpr); canvas.height = Math.round(r.height * view.dpr);
  requestRender();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(stage);

function requestRender() { needsRender = true; if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = null;
  if (state.motion.enabled) { if (lastT != null) time += (now - lastT) / 1000; lastT = now; }
  else lastT = null;
  if (needsRender || state.motion.enabled || entering) { draw(); needsRender = false; }
  if (state.motion.enabled || entering) raf = requestAnimationFrame(frame);
}

function draw() {
  const cw = canvas.width, ch = canvas.height, dpr = view.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const mk = MOCKUPS.find(m => m.id === state.mockup.id);
  const pad = 28 * dpr;
  // Tracked against the chosen mockup, not the branch, so leaving and coming back replays it.
  if (state.mockup.id !== lastMockup) { lastMockup = state.mockup.id; mockupAt = performance.now(); }
  const enter = Math.min(1, (performance.now() - mockupAt) / 600);
  entering = enter < 1 && !!(mk && mk.ratio);
  if (mk && mk.ratio) {
    let w = cw - pad * 2, h = w / mk.ratio;
    if (h > ch - pad * 2) { h = ch - pad * 2; w = h * mk.ratio; }
    const x = (cw - w) / 2, y = (ch - h) / 2;
    const asset = renderAssetToCanvas(state, time, Math.min(2000, Math.max(w, h) * 1.2), { onImageLoad: requestRender });
    const off = document.createElement('canvas'); off.width = Math.round(w); off.height = Math.round(h);
    const place = drawMockup(off.getContext('2d'), mk.id, off.width, off.height, asset, state, enter);
    // A bare mockup sits straight on the stage, so it gets no card behind it.
    if (!mk.bare) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 30 * dpr; ctx.shadowOffsetY = 10 * dpr; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); ctx.restore();
    }
    ctx.drawImage(off, x, y);
    if (place) {
      setView(new DOMMatrix().translate(x, y).multiply(place.matrix)
        .translate(place.dx, place.dy).scale(place.dw / state.size.w, place.dh / state.size.h));
      drawRulers(); drawOverlay();
    } else view.m = null;
    stageInfo.textContent = `${mk.label} · asset ${state.size.w} × ${state.size.h}`;
    return;
  }
  const { w: W, h: H } = state.size;
  const k = Math.min((cw - pad * 2) / W, (ch - pad * 2) / H);
  const ox = (cw - W * k) / 2, oy = (ch - H * k) / 2;
  setView(new DOMMatrix([k, 0, 0, k, ox, oy]));
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 30 * dpr; ctx.shadowOffsetY = 10 * dpr; ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, W * k, H * k); ctx.restore();
  ctx.setTransform(k, 0, 0, k, ox, oy);
  renderAsset(ctx, state, time, { onImageLoad: requestRender });
  drawRulers();
  drawOverlay();
  stageInfo.textContent = `${state.size.w} × ${state.size.h} px · ${Math.round(k / dpr * 100)}%`;
}

// Asset space -> canvas device px.
const toStage = p => { const q = view.m.transformPoint(new DOMPoint(p.x, p.y)); return { x: q.x, y: q.y }; };

// The text's four corners in asset space, rotated with it so the box tracks the type.
function textCorners(layer) {
  const b = textBox(layer);
  if (!b) return null;
  const cs = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
  if (!layer.rotate) return cs;
  const L = layoutText(layer, state.size.w, state.size.h);
  const a = layer.rotate * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  return cs.map(p => {
    const dx = p.x - L.anchorX, dy = p.y - L.anchorY;
    return { x: L.anchorX + dx * ca - dy * sa, y: L.anchorY + dx * sa + dy * ca };
  });
}
const HANDLE = 7;   // device px, so handles stay grabbable at any zoom
// The grip goes on whichever corner reads as bottom-right on screen, whatever the type's
// own alignment or rotation, so it is always where the hand expects it.
function scaleGrip(layer) {
  const cs = textCorners(layer);
  if (!cs) return null;
  return cs.map(toStage).reduce((best, p) => (p.x + p.y > best.x + best.y ? p : best));
}

const RULER = 22;   // CSS px
// Tick spacing from the 1 / 2 / 5 ladder, whichever first gives labels room to breathe.
function niceStep(pxPerUnit, minPx) {
  const raw = minPx / pxPerUnit;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const mult of [1, 2, 5]) if (pow * mult >= raw) return pow * mult;
  return pow * 10;
}

// Asset-pixel rulers down the top and left edges. Only drawn when the asset maps onto the
// stage square-on — inside a tilted mockup a horizontal ruler would not measure anything.
function drawRulers() {
  if (!state.mockup.showRulers || !view.m) return;
  const m = view.m;
  if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) return;
  const dpr = view.dpr, R = RULER * dpr, cw = canvas.width, ch = canvas.height;
  const sx = m.a, sy = m.d, ox = m.e, oy = m.f;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fbfbfc';
  ctx.fillRect(0, 0, cw, R); ctx.fillRect(0, 0, R, ch);

  // The selected text's extent, shaded on both rules the way Figma shows a selection.
  const b = textBox(state.headline);
  if (b) {
    ctx.fillStyle = 'rgba(17,17,20,.10)';
    ctx.fillRect(ox + b.x * sx, 0, b.w * sx, R);
    ctx.fillRect(0, oy + b.y * sy, R, b.h * sy);
  }

  ctx.strokeStyle = '#e4e4e7'; ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(0, R - dpr / 2); ctx.lineTo(cw, R - dpr / 2);
  ctx.moveTo(R - dpr / 2, 0); ctx.lineTo(R - dpr / 2, ch);
  ctx.stroke();

  ctx.font = `${10 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.fillStyle = '#8a8a92';
  ctx.strokeStyle = '#c9c9d0';
  const tick = (from, to, step, place) => {
    const start = Math.ceil(from / step) * step;
    for (let u = start; u <= to; u += step) place(u);
  };
  // top: asset x
  const stepX = niceStep(sx, 62 * dpr);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.beginPath();
  tick(-ox / sx, (cw - ox) / sx, stepX, u => {
    const x = Math.round(ox + u * sx) + 0.5;
    ctx.moveTo(x, R - 5 * dpr); ctx.lineTo(x, R);
    ctx.fillText(String(Math.round(u)), x + 3 * dpr, R / 2);
  });
  ctx.stroke();
  // left: asset y, numbers turned to read up the rule
  const stepY = niceStep(sy, 62 * dpr);
  ctx.beginPath();
  const labels = [];
  tick(-oy / sy, (ch - oy) / sy, stepY, u => {
    const y = Math.round(oy + u * sy) + 0.5;
    ctx.moveTo(R - 5 * dpr, y); ctx.lineTo(R, y);
    labels.push([Math.round(u), y]);
  });
  ctx.stroke();
  for (const [u, y] of labels) {
    ctx.save(); ctx.translate(R / 2, y + 3 * dpr); ctx.rotate(-Math.PI / 2);
    ctx.fillText(String(u), 0, 0); ctx.restore();
  }
  ctx.fillStyle = '#fbfbfc'; ctx.fillRect(0, 0, R, R);
  ctx.strokeStyle = '#e4e4e7'; ctx.strokeRect(0.5 * dpr, 0.5 * dpr, R - dpr, R - dpr);
  ctx.restore();
}

function drawOverlay() {
  if (!view.m) return;
  const { w: W, h: H } = state.size;
  const dpr = view.dpr;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state.mockup.showGuides) {
    ctx.lineWidth = dpr;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([6 * dpr, 6 * dpr]);
    const path = [[{ x: W / 2, y: 0 }, { x: W / 2, y: H }], [{ x: 0, y: H / 2 }, { x: W, y: H / 2 }]];
    ctx.beginPath();
    for (const [p0, p1] of path) { const a = toStage(p0), b = toStage(p1); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
    ctx.setLineDash([]);
    const a = toStage(anchorPoint(state));
    ctx.beginPath(); ctx.arc(a.x, a.y, 9 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    ctx.beginPath(); ctx.arc(a.x, a.y, 3.2 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
  }
  // The text frame and its corner grip are always live — that is how you move and scale.
  const cs = textCorners(state.headline);
  if (cs) {
    const pts = cs.map(toStage);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = dpr; ctx.stroke();
    const g = scaleGrip(state.headline);
    const r = HANDLE * dpr;
    ctx.beginPath(); ctx.rect(g.x - r, g.y - r, r * 2, r * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  }
  ctx.restore();
}

const measureCtx = document.createElement('canvas').getContext('2d');
function textBox(layer) {
  if (!layer.enabled || !String(layer.text || '').trim()) return null;
  const { w: W, h: H } = state.size;
  const L = layoutText(layer, W, H);
  measureCtx.font = fontString(layer, L.px);
  if ('letterSpacing' in measureCtx) measureCtx.letterSpacing = `${L.ls}px`;
  const wmax = Math.max(...L.lines.map(l => measureCtx.measureText(l).width));
  const x = layer.align === 'center' ? L.anchorX - wmax / 2 : layer.align === 'right' ? L.anchorX - wmax : L.anchorX;
  return { x, y: L.top, w: wmax, h: L.total };
}

// ---------- pointer interaction: move / scale text, drag anchor and logo ----------
let drag = null;
function toAsset(e) {
  const r = canvas.getBoundingClientRect();
  const p = view.inv.transformPoint(new DOMPoint((e.clientX - r.left) * view.dpr, (e.clientY - r.top) * view.dpr));
  return { x: p.x, y: p.y };
}
function toDevice(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * view.dpr, y: (e.clientY - r.top) * view.dpr };
}
const inBox = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
// Hit the grip in device space so it stays the same size however the mockup scales the asset.
function onGrip(e) {
  const g = scaleGrip(state.headline);
  if (!g) return false;
  const d = toDevice(e);
  return Math.abs(d.x - g.x) < (HANDLE + 3) * view.dpr && Math.abs(d.y - g.y) < (HANDLE + 3) * view.dpr;
}

canvas.addEventListener('pointerdown', e => {
  if (!view.m) return;
  const p = toAsset(e);
  const { w: W, h: H } = state.size;
  if (state.headline.enabled && onGrip(e)) {
    const L = layoutText(state.headline, W, H);
    drag = { kind: 'scale', anchor: { x: L.anchorX, y: L.anchorY }, d0: Math.hypot(p.x - L.anchorX, p.y - L.anchorY), size: state.headline.size };
  } else {
    const a = anchorPoint(state);
    if (state.mockup.showGuides && Math.hypot(p.x - a.x, p.y - a.y) < 20 / view.s * view.dpr)
      drag = { kind: 'anchor', start: p, sx: state.shape.focusX, sy: state.shape.focusY };
    else if (inBox(p, textBox(state.headline)))
      drag = { kind: 'text', start: p, sx: state.headline.x, sy: state.headline.y };
    else if (state.logo.enabled && state.logo.src) {
      const img = getImage(state.logo.src);
      if (img && inBox(p, logoBox(state.logo, W, H, img))) drag = { kind: 'logo', start: p, sx: state.logo.x, sy: state.logo.y };
    }
  }
  if (!drag && e.altKey) drag = { kind: 'anchor', start: p, sx: state.shape.focusX, sy: state.shape.focusY, jump: true };
  if (drag) { canvas.setPointerCapture(e.pointerId); pushHistory(); }
});
canvas.addEventListener('pointermove', e => {
  if (!view.m) return;
  if (!drag) { canvas.style.cursor = hoverCursor(e); return; }
  const p = toAsset(e);
  const { w: W, h: H } = state.size;
  if (drag.kind === 'scale') {
    const d = Math.hypot(p.x - drag.anchor.x, p.y - drag.anchor.y);
    if (drag.d0 > 1e-6) state.headline.size = clamp(+(drag.size * d / drag.d0).toFixed(4), 0.005, 4);
  } else {
    let nx = drag.jump ? p.x / W : drag.sx + (p.x - drag.start.x) / W;
    let ny = drag.jump ? p.y / H : drag.sy + (p.y - drag.start.y) / H;
    if (!e.shiftKey) { // snap to centre / thirds
      for (const g of [0.5, 1 / 3, 2 / 3]) { if (Math.abs(nx - g) < 0.012) nx = g; if (Math.abs(ny - g) < 0.012) ny = g; }
    }
    if (drag.kind === 'anchor') { state.shape.focusX = +nx.toFixed(4); state.shape.focusY = +ny.toFixed(4); }
    else if (drag.kind === 'text') { state.headline.x = +nx.toFixed(4); state.headline.y = +ny.toFixed(4); }
    else if (drag.kind === 'logo') { state.logo.x = +nx.toFixed(4); state.logo.y = +ny.toFixed(4); }
  }
  persist(); controls.refresh(); requestRender();
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
function hoverCursor(e) {
  if (state.headline.enabled && onGrip(e)) return 'nwse-resize';
  const p = toAsset(e);
  const a = anchorPoint(state);
  if (state.mockup.showGuides && Math.hypot(p.x - a.x, p.y - a.y) < 20 / view.s * view.dpr) return 'grab';
  if (inBox(p, textBox(state.headline))) return 'move';
  return 'default';
}

// ---------- left panel ----------
const TPL_ICONS = {
  rays: '<path d="M4 30 L17 4 M10 30 L17 4 M17 30 L17 4 M24 30 L17 4 M30 30 L17 4"/>',
  weave: '<path d="M2 12 L32 20 M2 22 L32 14 M2 17 L32 17"/>',
  streamers: '<path d="M2 8 C 12 8, 12 17, 17 17 S 22 26, 32 26 M2 26 C 12 26, 12 17, 17 17 S 22 8, 32 8"/>',
};
function buildLeft() {
  const looks = $('#looks'); looks.innerHTML = '';
  for (const l of LOOKS) {
    const b = document.createElement('button'); b.className = 'look'; b.dataset.id = l.id;
    const sw = document.createElement('span'); sw.className = 'sw';
    sw.style.background = `conic-gradient(${l.swatch.map((c, i) => `${c} ${i * 25}% ${(i + 1) * 25}%`).join(',')})`;
    b.append(sw, document.createTextNode(l.label));
    b.addEventListener('click', () => { const keepSize = l.state.size ? {} : { size: state.size }; replaceState(deepMerge(deepMerge(deepClone(DEFAULT_STATE), l.state), keepSize)); activeLook = l.id; syncUI(); });
    looks.appendChild(b);
  }
  const tpls = $('#templates'); tpls.innerHTML = '';
  for (const t of TEMPLATES) {
    const b = document.createElement('button'); b.className = 'tpl'; b.dataset.id = t.id; b.title = t.hint;
    b.innerHTML = `<svg viewBox="0 0 34 34" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round">${TPL_ICONS[t.id]}</svg>${t.label}`;
    b.addEventListener('click', () => patch({ shape: { template: t.id, ...(t.defaults || {}) } }));
    tpls.appendChild(b);
  }
  const sp = $('#size-preset'); sp.innerHTML = '';
  for (const s of SIZE_PRESETS) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.label; sp.appendChild(o); }
  sp.addEventListener('change', () => { const s = SIZE_PRESETS.find(x => x.id === sp.value); patch({ size: { preset: s.id, w: s.id === 'custom' ? state.size.w : s.w, h: s.id === 'custom' ? state.size.h : s.h } }); });
  $('#size-w').addEventListener('change', e => patch({ size: { preset: 'custom', w: clamp(+e.target.value || 16, 16, 8000) } }));
  $('#size-h').addEventListener('change', e => patch({ size: { preset: 'custom', h: clamp(+e.target.value || 16, 16, 8000) } }));
  $('#btn-swap-size').addEventListener('click', () => patch({ size: { preset: 'custom', w: state.size.h, h: state.size.w } }));
  const bgs = $('#bg-swatches');
  for (const c of BACKGROUNDS) {
    const b = document.createElement('button');
    b.className = 'sw-btn'; b.dataset.color = c.hex; b.title = c.label;
    b.style.background = c.hex;
    b.addEventListener('click', () => patch({ background: c.hex, palette: repalette(state.palette, c.hex) }));
    bgs.appendChild(b);
  }
  $('#btn-add-color').addEventListener('click', e =>
    openSwatchPicker(e.currentTarget, hex => set('palette', [...state.palette, hex])));
  $('#btn-brand-colors').addEventListener('click', () => set('palette', legalPalette(STROKE_COLOURS.map(c => c.hex), state.background)));
  $('#btn-shuffle-colors').addEventListener('click', () => set('palette', [...state.palette.slice(1), state.palette[0]]));
  const mk = $('#mockup'); mk.innerHTML = '';
  for (const m of MOCKUPS) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; mk.appendChild(o); }
  mk.addEventListener('change', () => set('mockup.id', mk.value));
  $('#motion-toggle').addEventListener('change', e => { set('motion.enabled', e.target.checked); lastT = null; });
  $('#guides-toggle').addEventListener('change', e => set('mockup.showGuides', e.target.checked));
  $('#rulers-toggle').addEventListener('change', e => set('mockup.showRulers', e.target.checked));

  $('#video-duration').addEventListener('change', e => set('motion.duration', clamp(+e.target.value || 6, 1, 60)));
}
let activeLook = null;
// The palette is drawn from the six brand colours and nothing else, so a chip opens a picker
// of those rather than the browser's colour dialogue.
function openSwatchPicker(anchor, onPick) {
  document.querySelector('.swatch-pop')?.remove();
  const pop = document.createElement('div'); pop.className = 'swatch-pop';
  for (const c of STROKE_COLOURS) {
    const b = document.createElement('button');
    b.style.background = c.hex;
    const clash = same(c.hex, state.background);
    b.disabled = clash;
    b.title = clash ? `${c.label} is the background` : c.label;
    if (!clash) b.addEventListener('click', () => { pop.remove(); onPick(c.hex); });
    pop.appendChild(b);
  }
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(r.left, innerWidth - 210)}px`;
  pop.style.top = `${r.bottom + 6}px`;
  document.body.appendChild(pop);
  setTimeout(() => document.addEventListener('pointerdown', function away(e) {
    if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', away); }
  }), 0);
}
function renderPalette() {
  const pal = $('#palette'); pal.innerHTML = '';
  state.palette.forEach((c, i) => {
    const chip = document.createElement('button'); chip.className = 'chip'; chip.style.background = c;
    chip.title = 'Change colour';
    chip.addEventListener('click', () => openSwatchPicker(chip, hex => {
      const p = [...state.palette]; p[i] = hex; set('palette', p);
    }));
    const del = document.createElement('span'); del.className = 'x'; del.textContent = '×'; del.title = 'Remove';
    del.addEventListener('click', ev => { ev.stopPropagation(); if (state.palette.length > 1) set('palette', state.palette.filter((_, j) => j !== i)); });
    chip.append(del); pal.appendChild(chip);
  });
}
// ---------- right panel schema ----------
const tpl = id => s => s.shape.template === id;
const anyOf = (...ids) => s => ids.includes(s.shape.template);

// ---------- type controls ----------
// Icons follow Figma's: a glyph that names the property rather than a generic arrow.
const ICO = {
  size:  '<svg viewBox="0 0 16 16"><path d="M1.4 12.8 5.2 3.4 9 12.8M2.7 10.1h5"/><path d="M12.9 3.8v8.4M11.5 5.2l1.4-1.4 1.4 1.4M11.5 10.8l1.4 1.4 1.4-1.4"/></svg>',
  lineh: '<svg viewBox="0 0 16 16"><path d="M3.4 11.6 8 3.2l4.6 8.4M5.2 9.1h5.6"/><path d="M2.4 14h11.2"/></svg>',
  track: '<svg viewBox="0 0 16 16"><path d="M4.6 11.4 8 4.4l3.4 7M5.9 9.4h4.2"/><path d="M1.9 2.8v10.4M14.1 2.8v10.4"/></svg>',
  rot:   '<svg viewBox="0 0 16 16"><path d="M3.4 3v10h10"/><path d="M3.4 8.4A4.6 4.6 0 0 1 8 13"/></svg>',
};
const alignIcon = (a, b, c) => `<svg viewBox="0 0 16 16"><path d="M${a} 4.5h8M${b} 8h5M${c} 11.5h9"/></svg>`;
const ALIGN_ICONS = { left: alignIcon(3, 3, 3), center: alignIcon(4, 5.5, 3.5), right: alignIcon(5, 8, 4) };
// Vertical align, Figma's idiom: the rule the text sits against, with arrows into it.
const VALIGN_ICONS = {
  top: '<svg viewBox="0 0 16 16"><path d="M3 3h10"/><path d="M8 13.2V5.6M5.6 8 8 5.6 10.4 8"/></svg>',
  middle: '<svg viewBox="0 0 16 16"><path d="M3 8h10"/><path d="M8 2.4v3.4M6.5 4.3 8 5.8l1.5-1.5M8 13.6v-3.4M6.5 11.7 8 10.2l1.5 1.5"/></svg>',
  bottom: '<svg viewBox="0 0 16 16"><path d="M3 13h10"/><path d="M8 2.8v7.6M5.6 8 8 10.4 10.4 8"/></svg>',
};

// Named instances of the variable font, grouped by width — the "Style" dropdown.
const WIDTH_NAMES = { 50: 'Compressed', 75: 'Condensed', 100: 'Normal', 125: 'Wide', 150: 'Ultra', 200: 'Extended' };
const styleKey = h => `${h.wdth},${h.wght},${h.slnt}`;
function styleOptions() {
  const byWidth = new Map();
  for (const inst of fontInstances(FONT)) {
    const w = inst.coords.wdth ?? 100;
    const group = WIDTH_NAMES[w] || `Width ${w}`;
    // "Condensed Black Italic" inside the Condensed group is just "Black Italic".
    const label = inst.label.startsWith(group + ' ') ? inst.label.slice(group.length + 1) : inst.label;
    if (!byWidth.has(w)) byWidth.set(w, []);
    byWidth.get(w).push({ label, value: `${w},${inst.coords.wght ?? 400},${inst.coords.slnt ?? 0}` });
  }
  return [...byWidth.keys()].sort((a, b) => a - b)
    .map(w => ({ group: WIDTH_NAMES[w] || `Width ${w}`, options: byWidth.get(w) }));
}
const axis = (tag, fallback) => axisRange(FONT, tag) || fallback;
// The chevron beside the size field: sizes that mean something relative to the canvas.
const sizePresets = s => [10, 20, 30, 40, 50, 62, 75, 100].map(pc => ({ label: `${pc}% of height`, value: Math.round(s.size.h * pc / 100) }));

const TYPE_GROUP = { controls: [
  { path: 'headline.enabled', label: 'Show', type: 'checkbox' },
  { path: 'headline.text', type: 'textarea', rows: 2, placeholder: 'Headline (new lines allowed)' },
  { type: 'fields', cols: '1fr', items: [
    { type: 'select', compact: true, path: 'headline.font', options: () => fontNames(), title: 'Family' },
  ] },
  { type: 'fields', cols: '1.25fr 1fr 30px', items: [
    { type: 'select', compact: true, options: styleOptions, allowCustom: true, title: 'Style',
      get: s => styleKey(s.headline),
      onSet: v => { const [wdth, wght, slnt] = v.split(',').map(Number); patch({ headline: { wdth, wght, slnt } }); } },
    // Size, line height and tracking read in the units a designer thinks in, not fractions.
    { type: 'field', icon: ICO.size, title: 'Size', min: 4, max: 6000, step: 1, scrub: 3, unit: ' px',
      get: s => s.headline.size * s.size.h, onSet: v => set('headline.size', v / state.size.h) },
    { type: 'presets', presets: sizePresets, onSet: v => set('headline.size', v / state.size.h) },
  ] },
  { type: 'fields', items: [
    { label: 'Line height', type: 'field', icon: ICO.lineh, title: 'Line height', min: 40, max: 300, step: 1, unit: '%',
      get: s => s.headline.lineHeight * 100, onSet: v => set('headline.lineHeight', v / 100) },
    { label: 'Letter spacing', type: 'field', icon: ICO.track, title: 'Letter spacing', min: -20, max: 60, step: 0.1, decimals: 1, scrub: 0.2, unit: '%',
      get: s => s.headline.letterSpacing * 100, onSet: v => set('headline.letterSpacing', v / 100) },
  ] },
  { type: 'sublabel', text: 'Alignment' },
  { type: 'fields', items: [
    { type: 'iconseg', path: 'headline.align', options: [
      { value: 'left', icon: ALIGN_ICONS.left, title: 'Align left' },
      { value: 'center', icon: ALIGN_ICONS.center, title: 'Align centre' },
      { value: 'right', icon: ALIGN_ICONS.right, title: 'Align right' } ] },
    { type: 'iconseg', path: 'headline.valign', options: [
      { value: 'top', icon: VALIGN_ICONS.top, title: 'Align top' },
      { value: 'middle', icon: VALIGN_ICONS.middle, title: 'Align middle' },
      { value: 'bottom', icon: VALIGN_ICONS.bottom, title: 'Align bottom' } ] },
  ] },
  { type: 'sublabel', text: 'Position' },
  { type: 'fields', items: [
    { type: 'field', text: 'X', title: 'X (px)', min: -20000, max: 20000, step: 1, scrub: 3, decimals: 0,
      get: s => s.headline.x * s.size.w, onSet: v => set('headline.x', v / state.size.w) },
    { type: 'field', text: 'Y', title: 'Y (px)', min: -20000, max: 20000, step: 1, scrub: 3, decimals: 0,
      get: s => s.headline.y * s.size.h, onSet: v => set('headline.y', v / state.size.h) },
  ] },
  { type: 'fields', cols: '1fr 1fr', items: [
    { label: 'Rotation', type: 'field', icon: ICO.rot, path: 'headline.rotate', title: 'Rotation', min: -90, max: 90, step: 1, scrub: 0.5, unit: '°' },
    { label: 'Colour', type: 'color', path: 'headline.color' },
  ] },
  { label: 'Beams behind', type: 'range', min: 0, max: 40, step: 1, decimals: 0,
    get: s => textSplit(s.headline, Math.round(s.shape.count)),
    onSet: v => set('headline.depth', clamp(v / Math.max(1, Math.round(state.shape.count)), 0, 1)) },
  { label: 'Place', type: 'buttons', wide: true, buttons: [
    { label: 'Centre', onClick: () => patch({ headline: { x: 0.5, y: 0.5, align: 'center', valign: 'middle' } }) },
    { label: 'Top-left', onClick: () => patch({ headline: { x: 0.05, y: 0.06, align: 'left', valign: 'top' } }) },
    { label: 'Bottom-left', onClick: () => patch({ headline: { x: 0.05, y: 0.94, align: 'left', valign: 'bottom' } }) },
    { label: 'Bottom-right', onClick: () => patch({ headline: { x: 0.95, y: 0.94, align: 'right', valign: 'bottom' } }) },
  ] },
] };

// The raw axes, for anything between two named instances.
const AXES_GROUP = { controls: [
  { path: 'headline.wght', label: 'Weight', type: 'range', step: 1, decimals: 0, min: axis('wght', { min: 100, max: 900 }).min, max: axis('wght', { min: 100, max: 900 }).max, when: s => hasAxis(s.headline.font, 'wght') },
  { path: 'headline.wdth', label: 'Width', type: 'range', step: 1, decimals: 0, min: axis('wdth', { min: 50, max: 200 }).min, max: axis('wdth', { min: 50, max: 200 }).max, when: s => hasAxis(s.headline.font, 'wdth') },
  { path: 'headline.slnt', label: 'Slant', type: 'range', step: 0.5, decimals: 1, min: axis('slnt', { min: -20, max: 0 }).min, max: axis('slnt', { min: -20, max: 0 }).max, when: s => hasAxis(s.headline.font, 'slnt') },
] };

const SCHEMA = [
  { title: 'Beams', tab: 'design', controls: [
    { path: 'shape.count', label: 'Count', type: 'range', min: 1, max: 40, step: 1 },
    { path: 'shape.baseWidth', label: 'Stroke width', type: 'range', min: 0.002, max: 0.6, step: 0.002, decimals: 3 },
    { path: 'shape.widthVariation', label: 'Width vary', type: 'range', min: 0, max: 1, step: 0.01 },
    { path: 'shape.outerWidth', label: 'Outer edge', type: 'range', min: 0, max: 1.5, step: 0.005, decimals: 3, when: tpl('rays') },
    { path: 'shape.edgeCurve', label: 'Edge curve', type: 'range', min: 0.3, max: 4, step: 0.05, when: tpl('rays') },
    { path: 'shape.warp', label: 'Warp', type: 'range', min: -1, max: 1, step: 0.01, when: tpl('rays') },
    { path: 'shape.twoSided', label: 'Mirror', type: 'checkbox', when: tpl('rays') },
    { path: 'shape.span', label: 'Span', type: 'range', min: 0, max: 360, step: 1, when: anyOf('rays', 'weave') },
    { path: 'shape.spread', label: 'Spread', type: 'range', min: 0, max: 2.5, step: 0.01, when: anyOf('weave', 'streamers') },
    { path: 'shape.pinch', label: 'Pinch', type: 'range', min: 0, max: 0.95, step: 0.01, when: tpl('streamers') },
    { path: 'shape.tension', label: 'Curve', type: 'range', min: 0, max: 1, step: 0.01, when: tpl('streamers') },
    { path: 'shape.focusX', label: 'Anchor X', type: 'range', min: -0.5, max: 1.5, step: 0.005, decimals: 3 },
    { path: 'shape.focusY', label: 'Anchor Y', type: 'range', min: -0.5, max: 1.5, step: 0.005, decimals: 3 },
    { path: 'shape.pack', label: 'Pack', type: 'range', min: 0, max: 1, step: 0.01 },
    { path: 'shape.rotate', label: 'Rotate all', type: 'range', min: -180, max: 180, step: 1 },
    { path: 'shape.scale', label: 'Scale', type: 'range', min: 0.2, max: 3, step: 0.01 },
    { path: 'shape.offsetX', label: 'Offset X', type: 'range', min: -1, max: 1, step: 0.005, decimals: 3 },
    { path: 'shape.offsetY', label: 'Offset Y', type: 'range', min: -1, max: 1, step: 0.005, decimals: 3 },
    { type: 'sublabel', text: 'Stroke & colour' },
    { path: 'fill.mode', label: 'Fill', type: 'seg', options: [{ value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }, { value: 'stripes', label: 'Stripes' }] },
    { path: 'fill.colorStep', label: 'Colour step', type: 'range', min: 0, max: 4, step: 1 },
    { path: 'fill.runSpread', label: 'Colours / beam', type: 'range', min: 1, max: 4, step: 1, when: s => s.fill.mode !== 'solid' },
    { path: 'fill.blendSpace', label: 'Mix', type: 'seg', when: s => s.fill.mode !== 'solid', options: [
      { value: 'oklch', label: 'Arc', title: 'Travel round the hue wheel — mixes stay saturated' },
      { value: 'oklab', label: 'Direct', title: 'Shortest path — can pass through grey' },
      { value: 'hard', label: 'Hard', title: 'No mixing at all: crisp colour bands' } ] },
    { path: 'fill.phase', label: 'Gradient shift', type: 'range', min: 0, max: 1, step: 0.005, decimals: 3, when: s => s.fill.mode !== 'solid' },
    { path: 'fill.stripes', label: 'Stripes', type: 'range', min: 2, max: 8, step: 1, when: s => s.fill.mode === 'stripes' },
    { path: 'fill.seam', label: 'Seam width', type: 'range', min: 0, max: 0.6, step: 0.01, when: s => s.fill.mode === 'stripes' },
    { path: 'fill.centreSeam', label: 'Centre seam', type: 'range', min: 0, max: 0.9, step: 0.01 },
    { path: 'fill.core', label: 'Core heat', type: 'range', min: 0, max: 1, step: 0.01 },
    { path: 'fill.coreFocus', label: 'Core focus', type: 'range', min: 0.6, max: 8, step: 0.1, decimals: 1, when: s => s.fill.core > 0 },
  ] },
  { tab: 'motion', controls: [
    { path: 'motion.enabled', label: 'Animate', type: 'checkbox' },
  ] },
  { title: 'Beams', tab: 'motion', controls: [
    { path: 'motion.beams.speed', label: 'Colour run', type: 'range', min: -2, max: 2, step: 0.01 },
    { path: 'motion.beams.sway', label: 'Sway', type: 'range', min: 0, max: 45, step: 0.5, decimals: 1, unit: '°' },
    { path: 'motion.beams.swaySpeed', label: 'Sway speed', type: 'range', min: 0.02, max: 2, step: 0.01 },
    { path: 'motion.beams.drift', label: 'Anchor drift', type: 'range', min: 0, max: 1, step: 0.01 },
  ] },
  { title: 'Export', tab: 'motion', controls: [
    { path: 'motion.duration', label: 'Seconds', type: 'range', min: 1, max: 60, step: 0.5, decimals: 1 },
    { path: 'motion.fps', label: 'Frames / s', type: 'select', options: ['24', '30', '60'], number: true },
    { label: 'Loop', type: 'buttons', wide: true, buttons: [
      { label: 'Fit duration to a seamless colour loop', onClick: () => {
        const sp = Math.abs(state.motion.beams.speed) || 0.25;
        const one = 1 / sp;
        const n = Math.max(1, Math.round(state.motion.duration / one));
        set('motion.duration', +(n * one).toFixed(2));
        toast(`Duration set to ${(n * one).toFixed(2)} s (${n} colour loop${n > 1 ? 's' : ''})`);
      } },
    ] },
  ] },
  { title: 'Type', tab: 'type', controls: [
    ...TYPE_GROUP.controls,
    { type: 'sublabel', text: 'Variable axes', when: () => !!fontInstances(FONT).length },
    ...AXES_GROUP.controls,
  ] },
  { title: 'Logo', tab: 'logo', controls: [
    { path: 'logo.enabled', label: 'Show', type: 'checkbox' },
    { label: 'Image', type: 'file', label2: 'Choose PNG / SVG…', accept: 'image/*', onFile: (file) => { const r = new FileReader(); r.onload = () => patch({ logo: { src: r.result, enabled: true } }); r.readAsDataURL(file); } },
    { path: 'logo.width', label: 'Width', type: 'range', min: 0.02, max: 1, step: 0.005, decimals: 3 },
    { path: 'logo.opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01 },
    { path: 'logo.align', label: 'Align', type: 'seg', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }] },
    { path: 'logo.valign', label: 'V-align', type: 'seg', options: [{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }] },
    { path: 'logo.x', label: 'X', type: 'range', min: -0.2, max: 1.2, step: 0.005, decimals: 3 },
    { path: 'logo.y', label: 'Y', type: 'range', min: -0.2, max: 1.2, step: 0.005, decimals: 3 },
  ] },
];
let tab = 'design';
const controls = buildControls($('#controls'), SCHEMA, { getState: () => state, set: (p, v) => set(p, v), tab: () => tab });
document.querySelectorAll('.panel-tabs button').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  document.querySelectorAll('.panel-tabs button').forEach(x => x.classList.toggle('active', x === b));
  controls.refresh();
}));

// ---------- sync ----------
function syncUI() {
  document.querySelectorAll('.tpl').forEach(b => b.classList.toggle('active', b.dataset.id === state.shape.template));
  document.querySelectorAll('.look').forEach(b => b.classList.toggle('active', b.dataset.id === activeLook));
  $('#size-preset').value = state.size.preset;
  $('#size-w').value = state.size.w; $('#size-h').value = state.size.h;
  document.querySelectorAll('.sw-btn').forEach(b => b.classList.toggle('active', b.dataset.color.toLowerCase() === state.background.toLowerCase()));
  $('#mockup').value = state.mockup.id;
  $('#motion-toggle').checked = state.motion.enabled;
  $('#guides-toggle').checked = state.mockup.showGuides;
  $('#rulers-toggle').checked = state.mockup.showRulers;
  $('#video-duration').value = state.motion.duration;
  renderPalette();
  controls.refresh();
}

// ---------- top bar ----------
let toastTimer;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms); }
$('#btn-undo').addEventListener('click', undo);
$('#btn-random').addEventListener('click', () => set('shape.seed', Math.floor(Math.random() * 999) + 1));
$('#btn-reset').addEventListener('click', () => { activeLook = null; replaceState(deepClone(DEFAULT_STATE)); });
// One Export button. The attached chevron picks the file type and relabels the button.
const EXPORTS = {
  png: { label: 'Export PNG', run: async () => {
    const scale = parseFloat($('#png-scale').value);
    toast('Rendering PNG…'); await new Promise(r => setTimeout(r, 30));
    await exportPNG(state, time, scale); toast('PNG saved');
  } },
  svg: { label: 'Export SVG', run: async () => {
    if (state.mockup.id !== 'none') toast('SVG exports the asset itself (mockups are PNG/video only)');
    exportSVG(state, time);
  } },
  video: { label: 'Export video', run: async () => {
    const prog = $('#progress'), bar = prog.querySelector('i');
    prog.hidden = false; bar.style.width = '0%';
    try {
      const { ext } = await exportVideo(state, { onProgress: p => (bar.style.width = `${Math.round(p * 100)}%`) });
      toast(ext === 'mp4' ? 'MP4 saved' : 'Saved as WebM (this browser cannot encode MP4; Chrome 126+ or Safari can)', 5000);
    } finally { prog.hidden = true; }
  } },
  preset: { label: 'Export preset', run: async () => { exportJSON(state); toast('Preset JSON saved'); } },
};
const exportType = () => $('#export-type').value;
$('#export-type').addEventListener('change', () => { $('#btn-export').textContent = EXPORTS[exportType()].label; });
$('#btn-export').addEventListener('click', async () => {
  const kind = exportType();
  try { await EXPORTS[kind].run(); } catch (e) { toast(`${kind.toUpperCase()} failed: ${e.message}`, 5000); }
});
document.addEventListener('keydown', e => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
  if (typing) return;
  if (e.key === ' ') { e.preventDefault(); set('motion.enabled', !state.motion.enabled); lastT = null; }
  if (e.key === 'r') set('shape.seed', Math.floor(Math.random() * 999) + 1);
  if (e.key === 'g') set('mockup.showGuides', !state.mockup.showGuides);
});

// ---------- boot ----------
buildLeft();
{
  const m = videoMime();
  $('#video-format').textContent = m ? (m.startsWith('video/mp4') ? '→ MP4' : '→ WebM (no MP4 in this browser)') : 'video unsupported';
}
onFontsChanged(() => { controls.refresh(); requestRender(); });
(async () => {
  await loadProjectFonts();
  document.fonts.ready.then(requestRender);
  // The mockup chrome is drawn in Material Symbols; redraw once it is available.
  try { await document.fonts.load('300 24px "Material Symbols Rounded"', 'favorite'); requestRender(); } catch (_) {}
})();
syncUI(); resize();
// Debug handle: state plus a synchronous redraw, so the stage can be inspected without
// waiting on requestAnimationFrame (which a hidden tab never fires).
window.studio = { get state() { return state; }, set, patch, replaceState, get time() { return time; }, get view() { return view; }, render: draw };
