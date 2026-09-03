import { DEFAULT_STATE, SIZE_PRESETS, TEMPLATES, MOCKUPS, LOOKS, BLENDS, BRAND, FONT } from './state.js';
import { deepClone, deepMerge, clamp } from './util.js';
import { renderAsset, layoutText, fontString, renderAssetToCanvas, getImage, logoBox } from './paint.js';
import { anchorPoint } from './geometry.js';
import { drawMockup } from './mockups.js';
import { exportPNG, exportSVG, exportVideo, exportJSON, videoMime } from './export.js';
import { buildControls, getPath, setPath } from './ui.js';
import { loadProjectFonts, onFontsChanged, fontInstances, hasAxis, axisRange } from './fonts.js';

const $ = s => document.querySelector(s);
const STORAGE = 'tns-studio-state-v1';

// ---------- state ----------
let state = loadState();
let history = [], lastPush = 0;
function loadState() {
  try { const s = JSON.parse(localStorage.getItem(STORAGE)); if (s && s.version === DEFAULT_STATE.version) return deepMerge(DEFAULT_STATE, s); } catch (_) {}
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
function replaceState(s) { pushHistory(); state = deepMerge(DEFAULT_STATE, s); changed(); }
function undo() { const s = history.pop(); if (s) { state = JSON.parse(s); changed(); } }
function changed() { persist(); syncUI(); requestRender(); }

// ---------- stage ----------
const canvas = $('#canvas'), stage = $('#stage'), stageInfo = $('#stage-info');
const ctx = canvas.getContext('2d');
let view = { k: 1, ox: 0, oy: 0, dpr: 1 };  // asset px -> canvas px
let time = 0, lastT = null, raf = null, needsRender = true;

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
  if (needsRender || state.motion.enabled) { draw(); needsRender = false; }
  if (state.motion.enabled) raf = requestAnimationFrame(frame);
}

function draw() {
  const cw = canvas.width, ch = canvas.height, dpr = view.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const mk = MOCKUPS.find(m => m.id === state.mockup.id);
  const pad = 28 * dpr;
  if (mk && mk.ratio) {
    let w = cw - pad * 2, h = w / mk.ratio;
    if (h > ch - pad * 2) { h = ch - pad * 2; w = h * mk.ratio; }
    const x = (cw - w) / 2, y = (ch - h) / 2;
    const asset = renderAssetToCanvas(state, time, Math.min(2000, Math.max(w, h) * 1.2), { onImageLoad: requestRender });
    const off = document.createElement('canvas'); off.width = Math.round(w); off.height = Math.round(h);
    drawMockup(off.getContext('2d'), mk.id, off.width, off.height, asset, state);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 30 * dpr; ctx.shadowOffsetY = 10 * dpr; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); ctx.restore();
    ctx.drawImage(off, x, y);
    view.k = 0; // no direct interaction in mockup view
    stageInfo.textContent = `${mk.label} · asset ${state.size.w} × ${state.size.h}`;
    return;
  }
  const { w: W, h: H } = state.size;
  const k = Math.min((cw - pad * 2) / W, (ch - pad * 2) / H);
  const ox = (cw - W * k) / 2, oy = (ch - H * k) / 2;
  view.k = k; view.ox = ox; view.oy = oy;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 30 * dpr; ctx.shadowOffsetY = 10 * dpr; ctx.fillStyle = '#000'; ctx.fillRect(ox, oy, W * k, H * k); ctx.restore();
  ctx.setTransform(k, 0, 0, k, ox, oy);
  renderAsset(ctx, state, time, { onImageLoad: requestRender });
  if (state.mockup.showGuides) drawGuides(k);
  stageInfo.textContent = `${state.size.w} × ${state.size.h} px · ${Math.round(k / dpr * 100)}%`;
}

function drawGuides(k) {
  const { w: W, h: H } = state.size;
  ctx.save();
  ctx.setTransform(view.k, 0, 0, view.k, view.ox, view.oy);
  ctx.lineWidth = 1 / k * view.dpr;
  // centre lines
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([6 / k * view.dpr, 6 / k * view.dpr]);
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  ctx.setLineDash([]);
  // anchor handle
  const a = anchorPoint(state);
  const r = 9 / k * view.dpr;
  ctx.beginPath(); ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 2 / k * view.dpr; ctx.stroke();
  ctx.beginPath(); ctx.arc(a.x, a.y, r * 0.35, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
  // text boxes
  const tb = textBox(state.headline);
  if (tb) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1 / k * view.dpr; ctx.strokeRect(tb.x, tb.y, tb.w, tb.h); }
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

// ---------- pointer interaction: drag anchor / text / logo ----------
let drag = null;
function toAsset(e) {
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) * view.dpr, py = (e.clientY - r.top) * view.dpr;
  return { x: (px - view.ox) / view.k, y: (py - view.oy) / view.k };
}
canvas.addEventListener('pointerdown', e => {
  if (!view.k) return;
  const p = toAsset(e);
  const { w: W, h: H } = state.size;
  const hitR = 14 / view.k * view.dpr;
  const a = anchorPoint(state);
  if (Math.hypot(p.x - a.x, p.y - a.y) < hitR * 1.4) drag = { kind: 'anchor', start: p, sx: state.shape.focusX, sy: state.shape.focusY };
  else {
    const b = textBox(state.headline);
    if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) drag = { kind: 'text', key: 'headline', start: p, sx: state.headline.x, sy: state.headline.y };
    if (!drag && state.logo.enabled && state.logo.src) {
      const img = getImage(state.logo.src);
      if (img) { const b = logoBox(state.logo, W, H, img); if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) drag = { kind: 'logo', start: p, sx: state.logo.x, sy: state.logo.y }; }
    }
  }
  if (!drag && e.altKey) drag = { kind: 'anchor', start: p, sx: state.shape.focusX, sy: state.shape.focusY, jump: true };
  if (drag) { canvas.setPointerCapture(e.pointerId); pushHistory(); }
});
canvas.addEventListener('pointermove', e => {
  if (!drag) { if (view.k) canvas.style.cursor = hoverCursor(toAsset(e)); return; }
  const p = toAsset(e);
  const { w: W, h: H } = state.size;
  let nx = drag.jump ? p.x / W : drag.sx + (p.x - drag.start.x) / W;
  let ny = drag.jump ? p.y / H : drag.sy + (p.y - drag.start.y) / H;
  if (!e.shiftKey) { // snap to centre / thirds
    for (const g of [0.5, 1 / 3, 2 / 3]) { if (Math.abs(nx - g) < 0.012) nx = g; if (Math.abs(ny - g) < 0.012) ny = g; }
  }
  if (drag.kind === 'anchor') { state.shape.focusX = +nx.toFixed(4); state.shape.focusY = +ny.toFixed(4); }
  else if (drag.kind === 'text') { state[drag.key].x = +nx.toFixed(4); state[drag.key].y = +ny.toFixed(4); }
  else if (drag.kind === 'logo') { state.logo.x = +nx.toFixed(4); state.logo.y = +ny.toFixed(4); }
  persist(); controls.refresh(); requestRender();
});
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
function hoverCursor(p) {
  const a = anchorPoint(state);
  if (Math.hypot(p.x - a.x, p.y - a.y) < 20 / view.k * view.dpr) return 'grab';
  const b = textBox(state.headline);
  if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return 'move';
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
    b.addEventListener('click', () => set('shape.template', t.id));
    tpls.appendChild(b);
  }
  const sp = $('#size-preset'); sp.innerHTML = '';
  for (const s of SIZE_PRESETS) { const o = document.createElement('option'); o.value = s.id; o.textContent = s.label; sp.appendChild(o); }
  sp.addEventListener('change', () => { const s = SIZE_PRESETS.find(x => x.id === sp.value); patch({ size: { preset: s.id, w: s.id === 'custom' ? state.size.w : s.w, h: s.id === 'custom' ? state.size.h : s.h } }); });
  $('#size-w').addEventListener('change', e => patch({ size: { preset: 'custom', w: clamp(+e.target.value || 16, 16, 8000) } }));
  $('#size-h').addEventListener('change', e => patch({ size: { preset: 'custom', h: clamp(+e.target.value || 16, 16, 8000) } }));
  $('#btn-swap-size').addEventListener('click', () => patch({ size: { preset: 'custom', w: state.size.h, h: state.size.w } }));
  $('#bg-color').addEventListener('input', e => set('background', e.target.value));
  $('#btn-add-color').addEventListener('click', () => set('palette', [...state.palette, BRAND.white]));
  $('#btn-brand-colors').addEventListener('click', () => set('palette', [BRAND.pink, BRAND.green, BRAND.red, BRAND.blue]));
  $('#btn-shuffle-colors').addEventListener('click', () => set('palette', [...state.palette.slice(1), state.palette[0]]));
  const mk = $('#mockup'); mk.innerHTML = '';
  for (const m of MOCKUPS) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; mk.appendChild(o); }
  mk.addEventListener('change', () => set('mockup.id', mk.value));
  $('#motion-toggle').addEventListener('change', e => { set('motion.enabled', e.target.checked); lastT = null; });
  $('#guides-toggle').addEventListener('change', e => set('mockup.showGuides', e.target.checked));
  $('#video-duration').addEventListener('change', e => set('motion.duration', clamp(+e.target.value || 6, 1, 60)));
}
let activeLook = null;
function renderPalette() {
  const pal = $('#palette'); pal.innerHTML = '';
  state.palette.forEach((c, i) => {
    const chip = document.createElement('div'); chip.className = 'chip'; chip.style.background = c;
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = c;
    inp.addEventListener('input', () => { const p = [...state.palette]; p[i] = inp.value; chip.style.background = inp.value; set('palette', p); });
    const del = document.createElement('button'); del.textContent = '×'; del.title = 'Remove';
    del.addEventListener('click', ev => { ev.stopPropagation(); if (state.palette.length > 1) set('palette', state.palette.filter((_, j) => j !== i)); });
    chip.append(inp, del); pal.appendChild(chip);
  });
}
// ---------- right panel schema ----------
const tpl = id => s => s.shape.template === id;
const anyOf = (...ids) => s => ids.includes(s.shape.template);

// ---------- type controls ----------
// 16px line icons so the numeric fields read as pictures, the way Figma's do.
const ICO = {
  size:  '<svg viewBox="0 0 16 16"><path d="M1.5 13 5.5 3 9.5 13M2.9 10.2h5.2"/><path d="M12.8 3.6v8.8M11.3 5.1l1.5-1.5 1.5 1.5M11.3 10.9l1.5 1.5 1.5-1.5"/></svg>',
  lineh: '<svg viewBox="0 0 16 16"><path d="M2 2.8h12M2 13.2h12"/><path d="M8 5.2v5.6M6.6 6.6 8 5.2l1.4 1.4M6.6 9.4 8 10.8l1.4-1.4"/></svg>',
  track: '<svg viewBox="0 0 16 16"><path d="M2.6 2.8v10.4M13.4 2.8v10.4"/><path d="M5.4 8h5.2M6.8 6.6 5.4 8l1.4 1.4M9.2 6.6 10.6 8 9.2 9.4"/></svg>',
  rot:   '<svg viewBox="0 0 16 16"><path d="M13.2 8a5.2 5.2 0 1 1-1.7-3.85"/><path d="M13.4 3v2.4H11"/></svg>',
  x:     '<svg viewBox="0 0 16 16"><path d="M2 8h11.4M11.2 5.8 13.4 8l-2.2 2.2"/></svg>',
  y:     '<svg viewBox="0 0 16 16"><path d="M8 2v11.4M5.8 11.2 8 13.4l2.2-2.2"/></svg>',
};
const alignIcon = (a, b, c) => `<svg viewBox="0 0 16 16"><path d="M${a} 4h8M${b} 8h5M${c} 12h9"/></svg>`;
const ALIGN_ICONS = { left: alignIcon(3, 3, 3), center: alignIcon(4, 5.5, 3.5), right: alignIcon(5, 8, 4) };
const vAlignIcon = y => `<svg viewBox="0 0 16 16"><path d="M2.5 ${y}h11"/><rect x="4.5" y="${y === 3 ? 5 : y === 8 ? 5.5 : 4.5}" width="7" height="6" rx="1" fill="currentColor" stroke="none" opacity=".55"/></svg>`;
const VALIGN_ICONS = { top: vAlignIcon(3), middle: vAlignIcon(8), bottom: vAlignIcon(13) };

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

const TYPE_GROUP = { title: 'Type', controls: [
  { path: 'headline.enabled', label: 'Show', type: 'checkbox' },
  { path: 'headline.text', type: 'textarea', rows: 2, placeholder: 'Headline (new lines allowed)' },
  { type: 'note', text: FONT.replace(' Variable', ''), wide: true },
  { type: 'fields', cols: '1.4fr 1fr', items: [
    { type: 'select', compact: true, options: styleOptions, allowCustom: true, title: 'Style',
      get: s => styleKey(s.headline),
      onSet: v => { const [wdth, wght, slnt] = v.split(',').map(Number); patch({ headline: { wdth, wght, slnt } }); } },
    // Size, line height and tracking read in the units a designer thinks in, not fractions.
    { type: 'field', icon: ICO.size, title: 'Size (px)', min: 4, max: 6000, step: 1, scrub: 3, unit: ' px',
      get: s => s.headline.size * s.size.h, onSet: v => set('headline.size', v / state.size.h) },
  ] },
  { type: 'fields', items: [
    { type: 'field', icon: ICO.lineh, title: 'Line height', min: 40, max: 300, step: 1, unit: '%',
      get: s => s.headline.lineHeight * 100, onSet: v => set('headline.lineHeight', v / 100) },
    { type: 'field', icon: ICO.track, title: 'Letter spacing', min: -20, max: 60, step: 0.1, decimals: 1, scrub: 0.2, unit: '%',
      get: s => s.headline.letterSpacing * 100, onSet: v => set('headline.letterSpacing', v / 100) },
  ] },
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
  { type: 'fields', items: [
    { type: 'field', icon: ICO.x, title: 'X (px)', min: -20000, max: 20000, step: 1, scrub: 3,
      get: s => s.headline.x * s.size.w, onSet: v => set('headline.x', v / state.size.w) },
    { type: 'field', icon: ICO.y, title: 'Y (px)', min: -20000, max: 20000, step: 1, scrub: 3,
      get: s => s.headline.y * s.size.h, onSet: v => set('headline.y', v / state.size.h) },
    { type: 'field', icon: ICO.rot, path: 'headline.rotate', title: 'Rotation', min: -90, max: 90, step: 1, scrub: 0.5, unit: '°' },
  ] },
  { path: 'headline.color', label: 'Colour', type: 'color' },
  { path: 'headline.behind', label: 'Behind beams', type: 'checkbox' },
  { label: 'Place', type: 'buttons', wide: true, buttons: [
    { label: 'Centre', onClick: () => patch({ headline: { x: 0.5, y: 0.5, align: 'center', valign: 'middle' } }) },
    { label: 'Top-left', onClick: () => patch({ headline: { x: 0.05, y: 0.06, align: 'left', valign: 'top' } }) },
    { label: 'Bottom-left', onClick: () => patch({ headline: { x: 0.05, y: 0.94, align: 'left', valign: 'bottom' } }) },
    { label: 'Bottom-right', onClick: () => patch({ headline: { x: 0.95, y: 0.94, align: 'right', valign: 'bottom' } }) },
  ] },
] };

// The raw axes, for anything between two named instances.
const AXES_GROUP = { title: 'Variable axes', collapsed: true, when: () => !!fontInstances(FONT).length, controls: [
  { path: 'headline.wght', label: 'Weight', type: 'range', step: 1, decimals: 0, min: axis('wght', { min: 100, max: 900 }).min, max: axis('wght', { min: 100, max: 900 }).max, when: s => hasAxis(s.headline.font, 'wght') },
  { path: 'headline.wdth', label: 'Width', type: 'range', step: 1, decimals: 0, min: axis('wdth', { min: 50, max: 200 }).min, max: axis('wdth', { min: 50, max: 200 }).max, when: s => hasAxis(s.headline.font, 'wdth') },
  { path: 'headline.slnt', label: 'Slant', type: 'range', step: 0.5, decimals: 1, min: axis('slnt', { min: -20, max: 0 }).min, max: axis('slnt', { min: -20, max: 0 }).max, when: s => hasAxis(s.headline.font, 'slnt') },
] };

const SCHEMA = [
  { title: 'Shape', controls: [
    { path: 'shape.count', label: 'Beams', type: 'range', min: 1, max: 40, step: 1 },
    { path: 'shape.baseWidth', label: 'Width', type: 'range', min: 0.002, max: 0.6, step: 0.002, decimals: 3 },
    { path: 'shape.widthVariation', label: 'Width vary', type: 'range', min: 0, max: 1, step: 0.01 },
    { path: 'shape.flare', label: 'Flare', type: 'range', min: 0, max: 1.5, step: 0.01, when: tpl('rays') },
    { path: 'shape.flareCurve', label: 'Flare curve', type: 'range', min: 0.3, max: 4, step: 0.05, when: tpl('rays') },
    { path: 'shape.twoSided', label: 'Through focus', type: 'checkbox', when: tpl('rays') },
    { path: 'shape.angle', label: 'Angle', type: 'range', min: -180, max: 180, step: 1 },
    { path: 'shape.span', label: 'Span', type: 'range', min: 0, max: 360, step: 1, when: anyOf('rays', 'weave') },
    { path: 'shape.spread', label: 'Spread', type: 'range', min: 0, max: 2.5, step: 0.01, when: anyOf('weave', 'streamers') },
    { path: 'shape.pinch', label: 'Pinch', type: 'range', min: 0, max: 0.95, step: 0.01, when: tpl('streamers') },
    { path: 'shape.tension', label: 'Tension', type: 'range', min: 0.05, max: 1, step: 0.01, when: tpl('streamers') },
    { path: 'shape.focusX', label: 'Anchor X', type: 'range', min: -0.5, max: 1.5, step: 0.005, decimals: 3 },
    { path: 'shape.focusY', label: 'Anchor Y', type: 'range', min: -0.5, max: 1.5, step: 0.005, decimals: 3 },
    { path: 'shape.jitter', label: 'Jitter', type: 'range', min: 0, max: 1, step: 0.01 },
    { path: 'shape.seed', label: 'Seed', type: 'range', min: 1, max: 999, step: 1 },
    { path: 'shape.rotate', label: 'Rotate all', type: 'range', min: -180, max: 180, step: 1 },
    { path: 'shape.scale', label: 'Scale', type: 'range', min: 0.2, max: 3, step: 0.01 },
    { path: 'shape.offsetX', label: 'Offset X', type: 'range', min: -1, max: 1, step: 0.005, decimals: 3 },
    { path: 'shape.offsetY', label: 'Offset Y', type: 'range', min: -1, max: 1, step: 0.005, decimals: 3 },
  ] },
  { title: 'Stroke & colour', controls: [
    { path: 'fill.mode', label: 'Fill', type: 'seg', options: [{ value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }, { value: 'stripes', label: 'Stripes' }] },
    { path: 'fill.colorStep', label: 'Colour step', type: 'range', min: 0, max: 4, step: 1 },
    { path: 'fill.runSpread', label: 'Colours / beam', type: 'range', min: 1, max: 4, step: 1, when: s => s.fill.mode !== 'solid' },
    { path: 'fill.blendSpace', label: 'Mix', type: 'seg', when: s => s.fill.mode !== 'solid', options: [
      { value: 'oklch', label: 'Arc', title: 'Travel round the hue wheel — mixes stay saturated' },
      { value: 'oklab', label: 'Direct', title: 'Shortest path — can pass through grey' },
      { value: 'hard', label: 'Hard', title: 'No mixing at all: crisp colour bands' } ] },
    { path: 'fill.vividness', label: 'Vividness', type: 'range', min: 0, max: 1, step: 0.01, when: s => s.fill.mode !== 'solid' && s.fill.blendSpace !== 'hard' },
    { path: 'fill.phase', label: 'Gradient shift', type: 'range', min: 0, max: 1, step: 0.005, decimals: 3, when: s => s.fill.mode !== 'solid' },
    { path: 'fill.stripes', label: 'Stripes', type: 'range', min: 2, max: 8, step: 1, when: s => s.fill.mode === 'stripes' },
    { path: 'fill.seam', label: 'Seam gap', type: 'range', min: 0, max: 0.6, step: 0.01, when: s => s.fill.mode === 'stripes' },
    { path: 'fill.blend', label: 'Blend', type: 'select', options: BLENDS },
    { path: 'fill.opacity', label: 'Opacity', type: 'range', min: 0.05, max: 1, step: 0.01 },
    { path: 'fill.edge', label: 'Outline', type: 'range', min: 0, max: 20, step: 0.5, decimals: 1 },
    { path: 'fill.edgeColor', label: 'Outline colour', type: 'color', when: s => s.fill.edge > 0 },
  ] },
  { title: 'Motion', controls: [
    { path: 'motion.enabled', label: 'Animate', type: 'checkbox' },
    { path: 'motion.speed', label: 'Colour run', type: 'range', min: -2, max: 2, step: 0.01 },
    { path: 'motion.sway', label: 'Sway °', type: 'range', min: 0, max: 45, step: 0.5, decimals: 1 },
    { path: 'motion.swaySpeed', label: 'Sway speed', type: 'range', min: 0.02, max: 2, step: 0.01 },
    { path: 'motion.drift', label: 'Anchor drift', type: 'range', min: 0, max: 1, step: 0.01 },
    { path: 'motion.duration', label: 'Video secs', type: 'range', min: 1, max: 60, step: 0.5, decimals: 1 },
    { path: 'motion.fps', label: 'Video fps', type: 'select', options: ['24', '30', '60'], number: true },
    { label: 'Loop', type: 'buttons', wide: true, buttons: [
      { label: 'Fit duration to a seamless loop', onClick: () => { const sp = Math.abs(state.motion.speed) || 0.25; const one = 1 / sp; const n = Math.max(1, Math.round(state.motion.duration / one)); set('motion.duration', +(n * one).toFixed(2)); toast(`Duration set to ${(n * one).toFixed(2)} s (${n} colour loop${n > 1 ? 's' : ''})`); } },
    ] },
  ] },
  TYPE_GROUP,
  AXES_GROUP,
  { title: 'Logo / image', collapsed: true, controls: [
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
const controls = buildControls($('#controls'), SCHEMA, { getState: () => state, set: (p, v) => set(p, v) });

// ---------- sync ----------
function syncUI() {
  document.querySelectorAll('.tpl').forEach(b => b.classList.toggle('active', b.dataset.id === state.shape.template));
  document.querySelectorAll('.look').forEach(b => b.classList.toggle('active', b.dataset.id === activeLook));
  $('#size-preset').value = state.size.preset;
  $('#size-w').value = state.size.w; $('#size-h').value = state.size.h;
  $('#bg-color').value = state.background;
  $('#mockup').value = state.mockup.id;
  $('#motion-toggle').checked = state.motion.enabled;
  $('#guides-toggle').checked = state.mockup.showGuides;
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
$('#btn-save-preset').addEventListener('click', () => exportJSON(state));
$('#file-preset').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => { try { replaceState(JSON.parse(r.result)); toast('Preset loaded'); } catch (_) { toast('Not a valid preset'); } }; r.readAsText(f);
  e.target.value = '';
});
$('#btn-export-png').addEventListener('click', async () => {
  const scale = parseFloat($('#png-scale').value);
  toast('Rendering PNG…'); await new Promise(r => setTimeout(r, 30));
  try { await exportPNG(state, time, scale); toast('PNG saved'); } catch (e) { toast('PNG failed: ' + e.message); }
});
$('#btn-export-svg').addEventListener('click', () => {
  if (state.mockup.id !== 'none') toast('SVG exports the asset itself (mockups are PNG/video only)');
  exportSVG(state, time); 
});
$('#btn-export-video').addEventListener('click', async () => {
  const prog = $('#progress'), bar = prog.querySelector('i');
  prog.hidden = false; bar.style.width = '0%';
  try {
    const { ext } = await exportVideo(state, { onProgress: p => (bar.style.width = `${Math.round(p * 100)}%`) });
    toast(ext === 'mp4' ? 'MP4 saved' : 'Saved as WebM (this browser cannot encode MP4; Chrome 126+ or Safari can)', 5000);
  } catch (e) { toast('Video failed: ' + e.message, 5000); }
  prog.hidden = true;
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
{ const m = videoMime(); $('#video-format').textContent = m ? (m.startsWith('video/mp4') ? '→ MP4' : '→ WebM (no MP4 in this browser)') : 'video unsupported'; }
onFontsChanged(() => { controls.refresh(); requestRender(); });
(async () => { await loadProjectFonts(); document.fonts.ready.then(requestRender); })();
syncUI(); resize();
window.studio = { get state() { return state; }, set, patch, replaceState, get time() { return time; } };
