// SVG exporter: same scene model as the canvas renderer, serialised as vector paths.
import { buildBeams, ribbonPolygon, stripeRanges, ribbonQuads, coreStops } from './geometry.js';
import { layoutText, getImage, logoBox, textSplit, FALLBACK_STACK, layerVars, cssWeight } from './paint.js';
import { fontFaceCSS, variationCSS } from './fonts.js';
import { esc } from './util.js';

const num = v => Number(v.toFixed(2));
const pathOf = poly => 'M' + poly.map(p => `${num(p.x)} ${num(p.y)}`).join('L') + 'Z';

function textSVG(layer, W, H) {
  if (!layer.enabled || !String(layer.text || '').trim()) return '';
  const L = layoutText(layer, W, H);
  const anchor = { left: 'start', center: 'middle', right: 'end' }[layer.align];
  const tf = layer.rotate ? ` transform="rotate(${layer.rotate} ${num(L.anchorX)} ${num(L.anchorY)})"` : '';
  const spans = L.lines.map((line, i) => `<tspan x="${num(L.x)}" y="${num(L.baselines[i])}">${esc(line) || ' '}</tspan>`).join('');
  // Variable axes travel as a CSS style; the base face is embedded via @font-face.
  const vars = variationCSS(layer.font, layerVars(layer));
  const style = vars ? ` style="font-variation-settings:${esc(vars)}"` : '';
  return `<text font-family="&quot;${esc(layer.font)}&quot;, ${esc(FALLBACK_STACK)}" font-weight="${cssWeight(layer)}" font-size="${num(L.px)}" letter-spacing="${num(L.ls)}" text-anchor="${anchor}" fill="${layer.color}"${style}${tf}>${spans}</text>`;
}

export function buildSVG(state, time = 0) {
  const { w: W, h: H } = state.size;
  const f = state.fill;
  const m = Math.min(W, H);
  const beams = buildBeams(state, time);
  const ranges = stripeRanges(beams.length ? beams[0].stripes.length : 1, f.seam);
  const cut = textSplit(state.headline, beams.length);
  const defs = [], body = [], bodyFront = [];
  beams.forEach((b, bi) => {
    const into = bi < cut ? body : bodyFront;
    const a = b.pts[0], z = b.pts[b.pts.length - 1];
    b.stripes.forEach((st, j) => {
      const id = `g${bi}_${j}`;
      defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(z.x)}" y2="${num(z.y)}">` +
        st.stops.map(s => `<stop offset="${num(s.pos * 100)}%" stop-color="${s.color}"/>`).join('') + '</linearGradient>');
      const stroke = f.edge > 0 ? ` stroke="${f.edgeColor}" stroke-width="${num(f.edge * m / 1000)}" stroke-linejoin="round"` : '';
      into.push(`<path d="${pathOf(ribbonPolygon(b.pts, b.widths, ranges[j][0], ranges[j][1]))}" fill="url(#${id})"${stroke}/>`);
    });
  });
  // The lit centreline: one gradient per length-wise quad, running edge to edge.
  const cores = [], coresFront = [];
  if (f.core > 0) {
    const stops = coreStops(f.core, f.coreFocus)
      .map(s => `<stop offset="${num(s.pos * 100)}%" stop-color="#FFFFFF" stop-opacity="${s.alpha}"/>`).join('');
    beams.forEach((b, bi) => ribbonQuads(b.pts, b.widths).forEach((q, qi) => {
      const id = `c${bi}_${qi}`;
      defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(q.a.x)}" y1="${num(q.a.y)}" x2="${num(q.z.x)}" y2="${num(q.z.y)}">${stops}</linearGradient>`);
      (bi < cut ? cores : coresFront).push(`<path d="${pathOf(q.poly)}" fill="url(#${id})"/>`);
    }));
  }
  const blend = f.blend !== 'normal' ? ` style="mix-blend-mode:${f.blend}"` : '';
  const fonts = [state.headline.font];
  const css = fontFaceCSS(fonts);
  let logo = '';
  if (state.logo.enabled && state.logo.src) {
    const img = getImage(state.logo.src);
    if (img) { const bx = logoBox(state.logo, W, H, img); logo = `<image href="${state.logo.src}" x="${num(bx.x)}" y="${num(bx.y)}" width="${num(bx.w)}" height="${num(bx.h)}" opacity="${state.logo.opacity}"/>`; }
  }
  const text = textSVG(state.headline, W, H);
  const layer = (paths, core) =>
    (paths.length ? `<g opacity="${f.opacity}"${blend}>${paths.join('')}</g>` : '') +
    (core.length ? `<g opacity="${f.opacity}">${core.join('')}</g>` : '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${css ? `<style>${css}</style>` : ''}<clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath>${defs.join('')}</defs>
<rect width="${W}" height="${H}" fill="${state.background}"/>
<g clip-path="url(#frame)">${layer(body, cores)}${text}${layer(bodyFront, coresFront)}${logo}</g>
</svg>`;
}
