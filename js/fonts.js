// Font registry. The studio ships one family — Neue Display Next Variable, listed in
// fonts/fonts.json — and keeps it as a data URL so SVG exports can embed the face.

const custom = new Map(); // name -> { dataUrl, format, axes, instances }
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
// Named instances ("Condensed Black Italic" …) are the axis presets the type designer
// shipped. They are what a font picker should list; the raw axes are the fine control.
function parseInstances(buf) {
  try {
    const dv = new DataView(buf);
    const numTables = dv.getUint16(4);
    let fvar = 0, name = 0;
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
      if (tag === 'fvar') fvar = dv.getUint32(o + 8);
      if (tag === 'name') name = dv.getUint32(o + 8);
    }
    if (!fvar || !name) return null;
    const axesOff = dv.getUint16(fvar + 4), axisCount = dv.getUint16(fvar + 8), axisSize = dv.getUint16(fvar + 10);
    const instCount = dv.getUint16(fvar + 12), instSize = dv.getUint16(fvar + 14);
    const tags = [];
    for (let i = 0; i < axisCount; i++) {
      const a = fvar + axesOff + i * axisSize;
      tags.push(String.fromCharCode(dv.getUint8(a), dv.getUint8(a + 1), dv.getUint8(a + 2), dv.getUint8(a + 3)));
    }
    const strOff = dv.getUint16(name + 4), recCount = dv.getUint16(name + 2);
    const nameOf = id => {
      for (let i = 0; i < recCount; i++) {
        const r = name + 6 + i * 12;
        if (dv.getUint16(r + 6) !== id) continue;
        const platform = dv.getUint16(r), len = dv.getUint16(r + 8), off = name + strOff + dv.getUint16(r + 10);
        let out = '';
        if (platform === 3) for (let k = 0; k < len; k += 2) out += String.fromCharCode(dv.getUint16(off + k));
        else for (let k = 0; k < len; k++) out += String.fromCharCode(dv.getUint8(off + k));
        return out;
      }
      return null;
    };
    const out = [];
    for (let i = 0; i < instCount; i++) {
      const o = fvar + axesOff + axisCount * axisSize + i * instSize;
      const label = nameOf(dv.getUint16(o));
      if (!label) continue;
      const coords = {};
      for (let k = 0; k < axisCount; k++) coords[tags[k]] = dv.getInt32(o + 4 + k * 4) / 65536;
      out.push({ label, coords });
    }
    return out.length ? out : null;
  } catch (_) { return null; }
}

function dataUrlToBuffer(dataUrl) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

export function fontAxes(name) { const f = custom.get(name); return (f && f.axes) || null; }
export function fontInstances(name) { const f = custom.get(name); return (f && f.instances) || []; }
export function hasAxis(name, tag) { const a = fontAxes(name); return !!(a && a.some(x => x.tag === tag)); }
export function axisRange(name, tag) {
  const a = fontAxes(name); const ax = a && a.find(x => x.tag === tag);
  return ax ? { min: ax.min, max: ax.max, def: ax.def } : null;
}

// Canvas cannot set font-variation-settings, so each axis combination is registered as its own
// FontFace under an alias family. Returns the alias once loaded, and the base family until then
// (so text never flashes in a fallback face).
//
// Each registration costs a full parse of the face, so the axes are snapped to a grid before
// they become an alias. Without it a slider drag asks for a different combination every pixel,
// none of them finish before the value has moved on, and the type never appears to change at
// all. The grid is 25 for the two big axes, which every one of the font's own named instances
// sits on exactly — 100, 150, 200, 300, 400, 550, 700, 800, 900 and 50, 75, 100, 125, 150, 200
// — so picking a style still lands on the real thing.
const AXIS_GRID = { wght: 25, wdth: 25, slnt: 5 };
export const snapAxis = (tag, v) => {
  const g = AXIS_GRID[tag];
  return g ? Math.round(v / g) * g : v;
};

export function resolveFamily(name, vars) {
  const f = custom.get(name);
  if (!f || !f.axes) return name;
  const pairs = f.axes
    .map(ax => [ax.tag, vars && vars[ax.tag] != null ? snapAxis(ax.tag, vars[ax.tag]) : ax.def])
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
      const face = new FontFace(alias, `url(${f.srcUrl || f.dataUrl})`, { variationSettings: settings });
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

export function fontNames() { return [...custom.keys()]; }
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
  let axes = null, instances = null, srcUrl = null;
  try {
    const buf = dataUrlToBuffer(dataUrl);
    axes = parseAxes(buf); instances = parseInstances(buf);
    // Axis variants load from a blob rather than re-decoding the base64 on every registration.
    srcUrl = URL.createObjectURL(new Blob([buf], { type: 'font/ttf' }));
  } catch (_) {}
  custom.set(name, { dataUrl, srcUrl, format: format || formatOf(dataUrl), axes, instances });
  notify();
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

// Earlier versions let you upload extra faces and cached them here. One family now, so
// clear the cache rather than leave dead megabytes in localStorage.
try { localStorage.removeItem('tns-studio-fonts'); } catch (_) {}

// CSS @font-face rules for embedding in SVG.
export function fontFaceCSS(names) {
  return names.map(n => {
    const f = custom.get(n); if (!f) return '';
    return `@font-face{font-family:"${n}";src:url(${f.dataUrl}) format("${f.format}");}`;
  }).join('\n');
}
