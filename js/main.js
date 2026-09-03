import { DEFAULT_STATE, SIZE_PRESETS, TEMPLATES, MOCKUPS, LOOKS, BLENDS, BRAND } from './state.js';
import { deepClone, deepMerge, clamp } from './util.js';
import { renderAsset, layoutText, fontString, renderAssetToCanvas, getImage, logoBox } from './paint.js';
import { anchorPoint } from './geometry.js';
import { drawMockup } from './mockups.js';
import { exportPNG, exportSVG, exportVideo, exportJSON, videoMime } from './export.js';
import { buildControls, getPath, setPath } from './ui.js';
import { fontNames, registerFontFile, loadProjectFonts, restoreFonts, onFontsChanged, customFont, removeFont, hasAxis, axisRange } from './fonts.js';

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
  for (const layer of [state.headline, state.caption]) {
    const b = textBox(layer); if (!b) continue;
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1 / k * view.dpr; ctx.strokeRect(b.x, b.y, b.w, b.h);
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
    for (const key of ['caption', 'headline']) {
      const b = textBox(state[key]);
      if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { drag = { kind: 'text', key, start: p, sx: state[key].x, sy: state[key].y }; break; }
    }
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
  for (const key of ['caption', 'headline']) { const b = textBox(state[key]); if (b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return 'move'; }
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
  $('#file-font').addEventListener('change', async e => {
    for (const f of e.target.files) { try { const name = await registerFontFile(f); toast(`Font added: ${name}`); set('headline.font', name); } catch (err) { toast('Could not load font: ' + err.message); } }
    e.target.value = '';
  });
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
function renderFontList() {
  const list = $('#font-list'); list.innerHTML = '';
  for (const n of fontNames()) {
    if (!customFont(n)) continue;
    const row = document.createElement('div'); row.className = 'f';
    row.innerHTML = `<span style="font-family:'${n}'">${n}</span>`;
    const b = document.createElement('button'); b.className = 'small'; b.textContent = 'remove';
    b.addEventListener('click', () => { removeFont(n); renderFontList(); controls.refresh(); });
    row.appendChild(b); list.appendChild(row);
  }
}

// ---------- right panel schema ----------
const tpl = id => s => s.shape.template === id;
const anyOf = (...ids) => s => ids.includes(s.shape.template);
const textGroup = (key, title, collapsed) => ({
  title, collapsed, controls: [
    { path: `${key}.enabled`, label: 'Show', type: 'checkbox' },
    { path: `${key}.text`, label: '', type: 'textarea', rows: key === 'headline' ? 2 : 3, placeholder: 'Text (new lines allowed)' },
    { path: `${key}.font`, label: 'Font', type: 'select', options: () => fontNames() },
    { path: `${key}.weight`, label: 'Weight', type: 'range', min: 100, max: 900, step: 10, decimals: 0 },
    { path: `${key}.wdth`, label: 'Width', type: 'range', min: 50, max: 200, step: 1, decimals: 0, when: s => hasAxis(s[key].font, 'wdth') },
    { path: `${key}.slnt`, label: 'Slant', type: 'range', min: -20, max: 0, step: 0.5, decimals: 1, when: s => hasAxis(s[key].font, 'slnt') },
    { label: 'Width preset', type: 'buttons', wide: true, when: s => hasAxis(s[key].font, 'wdth'), buttons: [
      { label: 'Comp', onClick: () => set(`${key}.wdth`, 50) },
      { label: 'Cond', onClick: () => set(`${key}.wdth`, 75) },
      { label: 'Norm', onClick: () => set(`${key}.wdth`, 100) },
      { label: 'Wide', onClick: () => set(`${key}.wdth`, 125) },
      { label: 'Ultra', onClick: () => set(`${key}.wdth`, 150) },
      { label: 'Ext', onClick: () => set(`${key}.wdth`, 200) },
    ] },
    { path: `${key}.size`, label: 'Size', type: 'range', min: 0.01, max: key === 'headline' ? 1.4 : 0.2, step: 0.005, decimals: 3 },
    { path: `${key}.letterSpacing`, label: 'Tracking', type: 'range', min: -0.15, max: 0.4, step: 0.005, decimals: 3 },
    { path: `${key}.lineHeight`, label: 'Line height', type: 'range', min: 0.6, max: 2, step: 0.01 },
    { path: `${key}.color`, label: 'Colour', type: 'color' },
    { path: `${key}.align`, label: 'Align', type: 'seg', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }] },
    { path: `${key}.valign`, label: 'V-align', type: 'seg', options: [{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }] },
    { path: `${key}.x`, label: 'X', type: 'range', min: -0.2, max: 1.2, step: 0.005, decimals: 3 },
    { path: `${key}.y`, label: 'Y', type: 'range', min: -0.2, max: 1.2, step: 0.005, decimals: 3 },
    { path: `${key}.rotate`, label: 'Rotate', type: 'range', min: -90, max: 90, step: 1 },
    { path: `${key}.behind`, label: 'Behind beams', type: 'checkbox' },
    { label: 'Quick place', type: 'buttons', wide: true, buttons: [
      { label: 'Centre', onClick: () => patch({ [key]: { x: 0.5, y: 0.5, align: 'center', valign: 'middle' } }) },
      { label: 'Top-left', onClick: () => patch({ [key]: { x: 0.05, y: 0.06, align: 'left', valign: 'top' } }) },
      { label: 'Bottom-left', onClick: () => patch({ [key]: { x: 0.05, y: 0.94, align: 'left', valign: 'bottom' } }) },
      { label: 'Bottom-right', onClick: () => patch({ [key]: { x: 0.95, y: 0.94, align: 'right', valign: 'bottom' } }) },
    ] },
  ],
});
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
    { path: 'fill.blendSpace', label: 'Transition', type: 'seg', options: [{ value: 'oklab', label: 'Smooth' }, { value: 'srgb', label: 'sRGB' }, { value: 'hard', label: 'Hard' }], when: s => s.fill.mode !== 'solid' },
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
  textGroup('headline', 'Headline'),
  textGroup('caption', 'Caption', true),
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
onFontsChanged(() => { renderFontList(); controls.refresh(); requestRender(); });
(async () => { await restoreFonts(); await loadProjectFonts(); document.fonts.ready.then(requestRender); })();
syncUI(); resize();
window.studio = { get state() { return state; }, set, patch, replaceState, get time() { return time; } };
