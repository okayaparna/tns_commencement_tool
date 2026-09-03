// Font registry: built-in system fonts plus fonts the user drops in (kept as data URLs
// so they can be embedded in SVG exports and restored from localStorage).

const SYSTEM = ['Helvetica Neue', 'Helvetica', 'Arial', 'Inter', 'Georgia', 'Times New Roman', 'Courier New'];
const custom = new Map(); // name -> { dataUrl, format, axes }
const listeners = new Set();
const variants = new Map(); // alias family -> 'ready' | 'pending'

// --- variable-font axes -------------------------------------------------
// Minimal 'fvar' table reader: enough to know which axes a font exposes and their ranges.
function parseAxes(buf) {
  try {
    const dv = new DataView(buf);
    const numTables = dv.getUint16(4);
    let fvar = 0;
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
      if (tag === 'fvar') { fvar = dv.getUint32(o + 8); break; }
    }
    if (!fvar) return null;
    const axesOff = dv.getUint16(fvar + 4), count = dv.getUint16(fvar + 8), size = dv.getUint16(fvar + 10);
    const axes = [];
    for (let i = 0; i < count; i++) {
      const a = fvar + axesOff + i * size;
      axes.push({
        tag: String.fromCharCode(dv.getUint8(a), dv.getUint8(a + 1), dv.getUint8(a + 2), dv.getUint8(a + 3)),
        min: dv.getInt32(a + 4) / 65536, def: dv.getInt32(a + 8) / 65536, max: dv.getInt32(a + 12) / 65536,
      });
    }
    return axes.length ? axes : null;
  } catch (_) { return null; }
}
function dataUrlToBuffer(dataUrl) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

export function fontAxes(name) { const f = custom.get(name); return (f && f.axes) || null; }
export function hasAxis(name, tag) { const a = fontAxes(name); return !!(a && a.some(x => x.tag === tag)); }
export function axisRange(name, tag) {
  const a = fontAxes(name); const ax = a && a.find(x => x.tag === tag);
  return ax ? { min: ax.min, max: ax.max, def: ax.def } : null;
}

// Canvas cannot set font-variation-settings, so each axis combination is registered as its own
// FontFace under an alias family. Returns the alias once loaded, and the base family until then
// (so text never flashes in a fallback face).
export function resolveFamily(name, vars) {
  const f = custom.get(name);
  if (!f || !f.axes) return name;
  const pairs = f.axes
    .map(ax => [ax.tag, vars && vars[ax.tag] != null ? vars[ax.tag] : ax.def])
    .filter(([tag, v]) => v != null);
  if (!pairs.length) return name;
  const settings = pairs.map(([tag, v]) => `"${tag}" ${v}`).join(', ');
  const alias = `${name} ~ ${pairs.map(([t, v]) => t + v).join(' ')}`;
  const stateOf = variants.get(alias);
  if (stateOf === 'ready') return alias;
  if (stateOf === 'pending') return name;
  variants.set(alias, 'pending');
  (async () => {
    try {
      const face = new FontFace(alias, `url(${f.dataUrl})`, { variationSettings: settings });
      await face.load();
      document.fonts.add(face);
      variants.set(alias, 'ready');
    } catch (e) { variants.set(alias, 'failed'); }
    notify();
  })();
  return name;
}
// CSS font-variation-settings string for SVG export.
export function variationCSS(name, vars) {
  const f = custom.get(name);
  if (!f || !f.axes) return '';
  return f.axes.map(ax => `"${ax.tag}" ${vars && vars[ax.tag] != null ? vars[ax.tag] : ax.def}`).join(', ');
}

export function fontNames() { return [...custom.keys(), ...SYSTEM]; }
export function customFont(name) { return custom.get(name) || null; }
export function onFontsChanged(fn) { listeners.add(fn); }
const notify = () => listeners.forEach(fn => fn());

function formatOf(nameOrUrl) {
  const m = /\.(woff2|woff|ttf|otf)(\?|$)/i.exec(nameOrUrl) || /font\/(woff2|woff|ttf|otf)/i.exec(nameOrUrl);
  const ext = (m ? m[1] : 'ttf').toLowerCase();
  return { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[ext];
}
function cleanName(file) { return file.replace(/\.(woff2|woff|ttf|otf)$/i, '').replace(/[-_]+/g, ' ').trim(); }

export async function registerFontFromDataUrl(name, dataUrl, format) {
  const face = new FontFace(name, `url(${dataUrl})`);
  await face.load();
  document.fonts.add(face);
  let axes = null;
  try { axes = parseAxes(dataUrlToBuffer(dataUrl)); } catch (_) {}
  custom.set(name, { dataUrl, format: format || formatOf(dataUrl), axes });
  persist(); notify();
  return name;
}

export async function registerFontFile(file, name) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
  return registerFontFromDataUrl(name || cleanName(file.name), dataUrl, formatOf(file.name));
}

// Loads fonts listed in fonts/fonts.json: [{ "name": "Neue Haas Grotesk", "file": "NHaasGrotesk.otf" }]
export async function loadProjectFonts() {
  try {
    const res = await fetch('fonts/fonts.json', { cache: 'no-store' });
    if (!res.ok) return;
    const list = await res.json();
    for (const f of list) {
      try {
        const blob = await (await fetch('fonts/' + f.file)).blob();
        await registerFontFile(new File([blob], f.file), f.name);
      } catch (e) { console.warn('font failed', f, e); }
    }
  } catch (_) { /* no manifest: fine */ }
}

const KEY = 'tns-studio-fonts';
function persist() {
  try {
    const obj = {}; for (const [k, v] of custom) obj[k] = { dataUrl: v.dataUrl, format: v.format };
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch (e) { console.warn('font persist failed (too large?)', e); }
}
export async function restoreFonts() {
  try {
    const obj = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const [name, v] of Object.entries(obj)) {
      if (!custom.has(name)) await registerFontFromDataUrl(name, v.dataUrl, v.format);
    }
  } catch (_) {}
}
export function removeFont(name) { custom.delete(name); persist(); notify(); }

// CSS @font-face rules for embedding in SVG.
export function fontFaceCSS(names) {
  return names.map(n => {
    const f = custom.get(n); if (!f) return '';
    return `@font-face{font-family:"${n}";src:url(${f.dataUrl}) format("${f.format}");}`;
  }).join('\n');
}
