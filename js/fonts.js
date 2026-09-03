// Font registry: built-in system fonts plus fonts the user drops in (kept as data URLs
// so they can be embedded in SVG exports and restored from localStorage).

const SYSTEM = ['Helvetica Neue', 'Helvetica', 'Arial', 'Inter', 'Georgia', 'Times New Roman', 'Courier New'];
const custom = new Map(); // name -> { dataUrl, format }
const listeners = new Set();

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
  custom.set(name, { dataUrl, format: format || formatOf(dataUrl) });
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
    const obj = {}; for (const [k, v] of custom) obj[k] = v;
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
