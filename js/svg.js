// SVG exporter: same scene model as the canvas renderer, serialised as vector paths.
import { buildBeams, ribbonPolygon, stripeRanges } from './geometry.js';
import { layoutText, getImage, logoBox, FALLBACK_STACK, layerVars, cssWeight } from './paint.js';
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
  const defs = [], body = [];
  beams.forEach((b, bi) => {
    const a = b.pts[0], z = b.pts[b.pts.length - 1];
    b.stripes.forEach((st, j) => {
      const id = `g${bi}_${j}`;
      defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(z.x)}" y2="${num(z.y)}">` +
        st.stops.map(s => `<stop offset="${num(s.pos * 100)}%" stop-color="${s.color}"/>`).join('') + '</linearGradient>');
      const stroke = f.edge > 0 ? ` stroke="${f.edgeColor}" stroke-width="${num(f.edge * m / 1000)}" stroke-linejoin="round"` : '';
      body.push(`<path d="${pathOf(ribbonPolygon(b.pts, b.widths, ranges[j][0], ranges[j][1]))}" fill="url(#${id})"${stroke}/>`);
    });
  });
  const blend = f.blend !== 'normal' ? ` style="mix-blend-mode:${f.blend}"` : '';
  const fonts = [state.headline.font];
  const css = fontFaceCSS(fonts);
  let logo = '';
  if (state.logo.enabled && state.logo.src) {
    const img = getImage(state.logo.src);
    if (img) { const bx = logoBox(state.logo, W, H, img); logo = `<image href="${state.logo.src}" x="${num(bx.x)}" y="${num(bx.y)}" width="${num(bx.w)}" height="${num(bx.h)}" opacity="${state.logo.opacity}"/>`; }
  }
  const behind = state.headline.behind ? textSVG(state.headline, W, H) : '';
  const front = state.headline.behind ? '' : textSVG(state.headline, W, H);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${css ? `<style>${css}</style>` : ''}<clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath>${defs.join('')}</defs>
<rect width="${W}" height="${H}" fill="${state.background}"/>
<g clip-path="url(#frame)">${behind}<g opacity="${f.opacity}"${blend}>${body.join('')}</g>${front}${logo}</g>
</svg>`;
}
