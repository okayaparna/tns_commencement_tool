// Mockup scenes drawn on the stage canvas around a rendered asset canvas.
import { withAlpha } from './util.js';
import { resolveFamily } from './fonts.js';
import { FONT } from './state.js';

function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// Where the asset landed in the scene, so the stage can map pointer positions back into
// asset space and let you drag the type around inside a mockup.
let placement = null;
export const lastPlacement = () => placement;

// Draw `img` covering the box, clipped to a rounded rect.
function cover(ctx, img, x, y, w, h, r = 0) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.save(); rrect(ctx, x, y, w, h, r); ctx.clip();
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  // Record the full transform in force, so a rotated mockup inverts correctly too.
  if (!placement) placement = { matrix: ctx.getTransform(), dx, dy, dw, dh };
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}
function shadow(ctx, x, y, w, h, r, blur, alpha = 0.35, dy = 0.4) {
  ctx.save(); ctx.shadowColor = `rgba(0,0,0,${alpha})`; ctx.shadowBlur = blur; ctx.shadowOffsetY = blur * dy;
  ctx.fillStyle = '#000'; rrect(ctx, x, y, w, h, r); ctx.fill(); ctx.restore();
}
function fitBox(ratio, maxW, maxH) {
  let w = maxW, h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  return { w, h };
}
function placeholderLines(ctx, x, y, w, count, lh, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const lw = w * (i === count - 1 ? 0.55 : 0.92 - (i % 3) * 0.08);
    rrect(ctx, x, y + i * lh, lw, lh * 0.42, lh * 0.2);
    ctx.fill();
  }
}
function arcText(ctx, text, cx, cy, rx, ry, startDeg, endDeg) {
  const chars = [...text];
  const n = chars.length;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = (startDeg + (endDeg - startDeg) * t) * Math.PI / 180;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2); ctx.fillText(chars[i], 0, 0); ctx.restore();
  }
}

const UI = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const RED = '#E52A1F';
// The printed pieces are set in the brand face, so ask for the axis combination we want and
// fall back to the base family while that variant loads.
const neue = (px, wght = 500, wdth = 100) =>
  `400 ${px}px "${resolveFamily(FONT, { wght, wdth, slnt: 0 })}", ${UI}`;
// Set a line at `px`, or smaller if that is what it takes to sit inside `maxW`.
function fitLine(ctx, text, maxW, px, wght) {
  ctx.font = neue(px, wght, 100);
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = neue(px * (maxW / w), wght, 100);
}
const MS = '"Material Symbols Rounded"';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = t => 1 - (1 - t) ** 3;

// Material Symbols is a ligature font: the icon's name shapes into a single glyph, which
// canvas does apply. If it has not loaded we fall back to the hand-drawn outlines below.
const hasSymbols = () => { try { return document.fonts.check(`300 24px ${MS}`); } catch (_) { return false; } };
function icon(ctx, name, x, y, size, color, fallback) {
  if (!hasSymbols()) { if (fallback) { ctx.strokeStyle = color; fallback(ctx, x, y, size * 0.4); } return; }
  ctx.save();
  ctx.font = `300 ${size}px ${MS}`;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, x, y);
  ctx.restore();
}

const RATIOS = [[1, 1], [4, 5], [5, 4], [3, 2], [2, 3], [16, 9], [9, 16], [16, 10], [3, 4], [4, 3]];
function ratioLabel(ar) {
  for (const [a, b] of RATIOS) if (Math.abs(ar - a / b) < 0.02) return `${a}:${b}`;
  return `${ar.toFixed(2)}:1`;
}

// Outline glyphs for the social chrome, sized by a half-height `k`.
function heart(ctx, x, y, k) {
  ctx.beginPath();
  ctx.moveTo(x, y + k * 0.85);
  ctx.bezierCurveTo(x - k * 1.7, y - k * 0.25, x - k * 0.75, y - k * 1.25, x, y - k * 0.35);
  ctx.bezierCurveTo(x + k * 0.75, y - k * 1.25, x + k * 1.7, y - k * 0.25, x, y + k * 0.85);
  ctx.stroke();
}
function bubble(ctx, x, y, k) {
  ctx.beginPath(); ctx.arc(x, y, k, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - k * 0.55, y + k * 0.8); ctx.lineTo(x - k * 0.75, y + k * 1.4); ctx.lineTo(x - k * 0.1, y + k); ctx.stroke();
}
function plane(ctx, x, y, k) {
  ctx.beginPath();
  ctx.moveTo(x - k, y - k * 0.35); ctx.lineTo(x + k, y - k); ctx.lineTo(x + k * 0.15, y + k); ctx.lineTo(x - k * 0.1, y + k * 0.1); ctx.closePath();
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - k, y - k * 0.35); ctx.lineTo(x - k * 0.1, y + k * 0.1); ctx.lineTo(x + k, y - k); ctx.stroke();
}

// The New School mark, as path data lifted from the brand SVG (viewBox 81.28836 x 54).
// Drawn with Path2D rather than loaded as an image so it stays crisp at any size and can be
// filled in whatever colour the piece needs.
const MARK_VB = { w: 81.28836, h: 54 };
const MARK_D = 'M3.28423,48.04106V45.36647H81.28837v2.67459ZM3.28424,54V51.32542H81.28837V54ZM6.68177,2.67291v9.20585H3.71221V2.67291H0V0H10.394V2.67291ZM22.49869,7.34975H14.70346v4.529H11.73389V0h2.96957V4.529h7.79523V0h2.96957V11.87876H22.49869ZM27.30063,11.87876V0H35.7495V2.67291H30.27019V4.67734h4.44V7.20142h-4.44V9.20585H35.7495v2.67291ZM6.666,19.39118H6.221v7.6024H3.2514V15.11482H6.72627l6.9191,7.42441h.445V15.11482h2.97055V26.99358H13.7047ZM18.8923,26.99358V15.11482h8.44887v2.67291H21.86186v2.00443h4.44v2.52408h-4.44v2.00443h5.47931v2.67291ZM28.07194,15.11482h3.31172l2.56808,9.45851h.69814l2.34658-9.45851h5.58215l2.68774,9.45851h.69814l2.22693-9.45851h3.371l-3.282,11.87876h-5.2855l-2.73223-9.45851h-.83164l-2.49392,9.45851H31.65065ZM2.58193,33.85285c0-2.50974,2.00443-3.861,4.58834-3.861a9.11657,9.11657,0,0,1,4.083.92064L10.68866,33.437a7.70126,7.70126,0,0,0-3.62222-.9058c-.92063,0-1.54461.35649-1.54461.98,0,1.93027,6.08845.84647,6.08845,4.8405,0,2.12359-1.51494,3.994-4.67734,3.994a9.97722,9.97722,0,0,1-4.11368-.757l.11866-2.7174a9.28038,9.28038,0,0,0,4.084.93547c1.3063,0,1.63262-.46032,1.63262-1.00964C8.65456,37.01525,2.58193,38.05455,2.58193,33.85285ZM21.91823,41.94524a8.05473,8.05473,0,0,1-3.08922.40049,6.17263,6.17263,0,1,1,.268-12.33858,9.70781,9.70781,0,0,1,3.01407.34116l-.28183,2.70257a7.64736,7.64736,0,0,0-2.64324-.38615,3.19451,3.19451,0,0,0-3.48971,3.48921,3.28261,3.28261,0,0,0,3.56387,3.47488,6.67894,6.67894,0,0,0,2.65808-.43065ZM34.51342,37.57939H26.71818v4.529H23.74763V30.22965h2.97055v4.529h7.79524v-4.529H37.483V42.1084H34.51342ZM45.75881,29.99182c4.083,0,7.02391,2.10876,7.02391,6.11762,0,4.17253-3.17821,6.23629-7.03875,6.23629-3.8902,0-7.06743-2.09343-7.06743-6.22145C38.67654,32.23408,41.572,29.99182,45.75881,29.99182Zm-.0445,9.8595c2.33174,0,4.00886-1.18763,4.00886-3.80121,0-2.37575-1.67712-3.56338-3.994-3.56338-2.31593,0-3.994,1.158-3.994,3.65238C41.73511,38.64885,43.41321,39.85132,45.71431,39.85132ZM60.8499,29.99182c4.084,0,7.02391,2.10876,7.02391,6.11762,0,4.17253-3.17821,6.23629-7.03875,6.23629-3.8902,0-7.06743-2.09343-7.06743-6.22145C53.76763,32.23408,56.663,29.99182,60.8499,29.99182Zm-.0445,9.8595c2.33174,0,4.00985-1.18763,4.00985-3.80121,0-2.37575-1.67811-3.56338-3.995-3.56338-2.31593,0-3.994,1.158-3.994,3.65238C56.8262,38.64885,58.5043,39.85132,60.8054,39.85132ZM69.15538,30.22965H72.125v9.05752h9.19151V42.1084H69.15538Z';
let markPath = null;
// Fill the mark to a given width, top-left at (x, y). Returns the height it took.
function mark(ctx, x, y, w, colour = '#fff') {
  if (!markPath) markPath = new Path2D(MARK_D);
  const k = w / MARK_VB.w;
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = colour; ctx.fill(markPath);
  ctx.restore();
  return MARK_VB.h * k;
}

// The red information band that runs across the foot of the printed pieces: the mark, the date
// and the ceremony lines.
function infoPanel(ctx, x, y, w, h, opts = {}) {
  const { date = 'MAY 16',
          lines = ['EIGHTY-NINTH ANNUAL UNIVERSITY', 'COMMENCEMENT CEREMONY'] } = opts;
  ctx.save();
  ctx.fillStyle = RED; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const cy = y + h / 2, pad = h * 0.24, gap = h * 0.30;
  const datePx = h * 0.40, linePx = h * 0.155;

  // Measure the row, then shrink it as one if the piece is too narrow to take it.
  ctx.font = neue(datePx, 600, 100); const dateW = ctx.measureText(date).width;
  ctx.font = neue(linePx, 400, 100); const textW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const markW = h * 0.95;
  const total = pad * 2 + markW + gap + dateW + gap + textW;
  const k = Math.min(1, (w - pad * 2) / (total - pad * 2));

  let cx = x + pad;
  const mw = markW * k;
  mark(ctx, cx, cy - (mw * MARK_VB.h / MARK_VB.w) / 2, mw);
  cx += mw + gap * k;
  ctx.font = neue(datePx * k, 600, 100);
  ctx.fillText(date, cx, cy);
  cx += dateW * k + gap * k;
  ctx.font = neue(linePx * k, 400, 100);
  const lh = linePx * k * 1.12;
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * lh));
  ctx.restore();
}

const R = {};

R.arena = (ctx, W, H, img, state) => {
  ctx.fillStyle = '#07070a'; ctx.fillRect(0, 0, W, H);
  // haze + spotlights
  for (const [px, py, r, a] of [[0.12, 0.1, 0.5, 0.18], [0.9, 0.15, 0.45, 0.14], [0.5, 1.05, 0.7, 0.25], [0.2, 0.9, 0.3, 0.1]]) {
    const g = ctx.createRadialGradient(px * W, py * H, 0, px * W, py * H, r * W);
    g.addColorStop(0, `rgba(255,225,170,${a})`); g.addColorStop(1, 'rgba(255,225,170,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // truss lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = W * 0.003;
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(W * (0.02 + i * 0.12), 0); ctx.lineTo(W * (0.18 + i * 0.12), H * 0.42); ctx.stroke(); }
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0, H * (0.05 + i * 0.09)); ctx.lineTo(W, H * (0.02 + i * 0.1)); ctx.stroke(); }
  // small lights
  ctx.fillStyle = 'rgba(255,240,200,0.9)';
  for (const [px, py] of [[0.08, 0.28], [0.3, 0.12], [0.72, 0.1], [0.94, 0.34], [0.15, 0.62], [0.88, 0.6]]) {
    ctx.save(); ctx.shadowColor = 'rgba(255,230,160,0.9)'; ctx.shadowBlur = W * 0.02; ctx.beginPath(); ctx.arc(px * W, py * H, W * 0.004, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // scoreboard body
  const cx = W / 2, top = H * 0.22, bw = W * 0.5, bh = H * 0.62;
  ctx.fillStyle = '#141418'; rrect(ctx, cx - bw / 2 - W * 0.02, top - H * 0.02, bw + W * 0.04, bh + H * 0.04, W * 0.01); ctx.fill();
  // red ring band with arc text
  ctx.save();
  ctx.strokeStyle = '#E52A1F'; ctx.lineWidth = H * 0.085;
  ctx.beginPath(); ctx.ellipse(cx, top + H * 0.06, W * 0.36, H * 0.16, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `600 ${H * 0.032}px "Helvetica Neue", Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  arcText(ctx, 'CONGRATULATIONS, CLASS OF 2025!', cx, top + H * 0.06, W * 0.36, H * 0.16, 213, 327);
  ctx.restore();
  // venue name above
  // Sits just clear of the red ring's top arc.
  ctx.fillStyle = '#4C7BE0'; ctx.font = `700 ${H * 0.045}px "Helvetica Neue", Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BARCLAYS CENTER', cx, H * 0.05);
  // screen: asset
  const sw = bw * 0.9, sh = sw * 0.36, sx = cx - sw / 2, sy = top + H * 0.15;
  ctx.save(); ctx.shadowColor = 'rgba(120,160,255,0.45)'; ctx.shadowBlur = W * 0.03; ctx.fillStyle = '#000'; ctx.fillRect(sx, sy, sw, sh); ctx.restore();
  cover(ctx, img, sx, sy, sw, sh, 0);
  // LED grid overlay
  ctx.save(); ctx.globalAlpha = 0.12; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  const step = Math.max(3, sw / 220);
  ctx.beginPath(); for (let x = sx; x <= sx + sw; x += step) { ctx.moveTo(x, sy); ctx.lineTo(x, sy + sh); }
  for (let y = sy; y <= sy + sh; y += step) { ctx.moveTo(sx, y); ctx.lineTo(sx + sw, y); } ctx.stroke(); ctx.restore();
  // lower screen (crowd placeholder)
  const ly = sy + sh + H * 0.02, lh = bh - (ly - top) - H * 0.06;
  const g = ctx.createLinearGradient(0, ly, 0, ly + lh); g.addColorStop(0, '#3a1216'); g.addColorStop(1, '#120507');
  ctx.fillStyle = g; ctx.fillRect(sx, ly, sw, lh);
  ctx.fillStyle = 'rgba(229,42,31,0.55)';
  for (let i = 0; i < 40; i++) { const rx = sx + ((i * 37) % 100) / 100 * sw, ry = ly + lh * (0.3 + ((i * 53) % 100) / 140); ctx.beginPath(); ctx.arc(rx, ry, sw * 0.018, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#E52A1F'; ctx.fillRect(sx, ly + lh - H * 0.03, sw, H * 0.03);
  ctx.fillStyle = '#fff'; ctx.font = `600 ${H * 0.018}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillText('EIGHTY-NINTH ANNUAL UNIVERSITY COMMENCEMENT CEREMONY', cx, ly + lh - H * 0.015);
};

R.booklet = (ctx, W, H, img, state) => {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#e4e1da'); g.addColorStop(1, '#cfcbc2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const ratio = img.width / img.height;
  const page = fitBox(ratio, W * 0.4, H * 0.66);
  const px = W / 2 - page.w, py = H / 2 - page.h / 2;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.05); ctx.translate(-W / 2, -H / 2);
  shadow(ctx, px, py, page.w * 2, page.h, 0, W * 0.03, 0.4, 0.5);
  // back cover: solid brand background with a text block
  ctx.fillStyle = state.background; ctx.fillRect(px, py, page.w, page.h);
  placeholderLines(ctx, px + page.w * 0.1, py + page.h * 0.12, page.w * 0.5, 5, page.h * 0.035, 'rgba(255,255,255,0.7)');
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(px + page.w * 0.1, py + page.h * 0.36, page.w * 0.14, page.w * 0.14);
  ctx.fillStyle = state.background; for (let i = 0; i < 16; i++) { if ((i * 7) % 3) ctx.fillRect(px + page.w * (0.11 + (i % 4) * 0.03), py + page.h * 0.36 + page.w * (0.01 + Math.floor(i / 4) * 0.03), page.w * 0.02, page.w * 0.02); }
  // front cover: artwork above, information band across the foot, as it prints
  const band = page.h * 0.135;
  cover(ctx, img, px + page.w, py, page.w, page.h - band, 0);
  infoPanel(ctx, px + page.w, py + page.h - band, page.w, band);
  // fold
  const fg = ctx.createLinearGradient(px + page.w - W * 0.03, 0, px + page.w + W * 0.03, 0);
  fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, 'rgba(0,0,0,0.28)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fg; ctx.fillRect(px + page.w - W * 0.03, py, W * 0.06, page.h);
  ctx.restore();
};

R.poster = (ctx, W, H, img, state) => {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f1efea'); g.addColorStop(1, '#d9d6cf');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b9b5ab'; ctx.fillRect(0, H * 0.9, W, H * 0.1);
  const box = fitBox(img.width / img.height, W * 0.7, H * 0.72);
  const x = W / 2 - box.w / 2, y = H * 0.45 - box.h / 2;
  shadow(ctx, x, y, box.w, box.h, 0, W * 0.025, 0.35, 0.6);
  cover(ctx, img, x, y, box.w, box.h, 0);
  // corner pins
  ctx.fillStyle = '#222';
  for (const [cx, cy] of [[x + W * 0.012, y + W * 0.012], [x + box.w - W * 0.012, y + W * 0.012]]) { ctx.beginPath(); ctx.arc(cx, cy, W * 0.005, 0, Math.PI * 2); ctx.fill(); }
};

R.phone = (ctx, W, H, img, state) => {
  const pw = W * 0.78, ph = pw * 2.1, px = W / 2 - pw / 2, py = H / 2 - ph / 2, r = pw * 0.14;
  shadow(ctx, px, py, pw, ph, r, W * 0.06, 0.6, 0.3);
  ctx.fillStyle = '#111'; rrect(ctx, px, py, pw, ph, r); ctx.fill();
  const b = pw * 0.035;                       // bezel
  const sx = px + b, sy = py + b, sw = pw - 2 * b, sh = ph - 2 * b;
  cover(ctx, img, sx, sy, sw, sh, r - b);

  // A story is not a bare full-bleed image: chrome eats the top and bottom of the frame, so
  // the mockup shows it — this is the band your type has to stay clear of.
  ctx.save(); rrect(ctx, sx, sy, sw, sh, r - b); ctx.clip();
  const scrim = (y0, y1, a) => {
    const gg = ctx.createLinearGradient(0, y0, 0, y1);
    gg.addColorStop(0, `rgba(0,0,0,${a})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg; ctx.fillRect(sx, Math.min(y0, y1), sw, Math.abs(y1 - y0));
  };
  scrim(sy, sy + sh * 0.16, 0.45);
  scrim(sy + sh, sy + sh * 0.82, 0.5);

  // progress segments
  const pad = sw * 0.035, segs = 4, gap = sw * 0.012;
  const segW = (sw - pad * 2 - gap * (segs - 1)) / segs;
  const topY = sy + sh * 0.058;   // clear of the dynamic island, as on a real handset
  for (let i = 0; i < segs; i++) {
    const x = sx + pad + i * (segW + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; rrect(ctx, x, topY, segW, sw * 0.008, sw * 0.004); ctx.fill();
    if (i < 1) { ctx.fillStyle = '#fff'; rrect(ctx, x, topY, segW, sw * 0.008, sw * 0.004); ctx.fill(); }
    if (i === 1) { ctx.fillStyle = '#fff'; rrect(ctx, x, topY, segW * 0.45, sw * 0.008, sw * 0.004); ctx.fill(); }
  }
  // poster row: avatar, handle, time, close
  const ay = topY + sw * 0.065;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = sw * 0.007;
  ctx.beginPath(); ctx.arc(sx + pad + sw * 0.045, ay, sw * 0.045, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#E52A1F'; ctx.beginPath(); ctx.arc(sx + pad + sw * 0.045, ay, sw * 0.036, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${sw * 0.028}px ${UI}`; ctx.fillText('TNS', sx + pad + sw * 0.045, ay);
  ctx.textAlign = 'left';
  ctx.font = `600 ${sw * 0.036}px ${UI}`; ctx.fillText('thenewschool', sx + pad + sw * 0.105, ay);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `400 ${sw * 0.032}px ${UI}`;
  ctx.fillText('2h', sx + pad + sw * 0.105 + ctx.measureText('thenewschool').width * 1.35, ay);
  icon(ctx, 'close', sx + sw - pad - sw * 0.02, ay, sw * 0.075, '#fff');

  // reply bar: input pill, heart, share
  const by = sy + sh - sw * 0.115;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = sw * 0.006;
  const pillW = sw - pad * 2 - sw * 0.22;
  rrect(ctx, sx + pad, by - sw * 0.048, pillW, sw * 0.096, sw * 0.048); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `400 ${sw * 0.034}px ${UI}`; ctx.textAlign = 'left';
  ctx.fillText('Send message', sx + pad + sw * 0.05, by);
  ctx.lineWidth = sw * 0.007;
  icon(ctx, 'favorite', sx + pad + pillW + sw * 0.055, by, sw * 0.082, '#fff', heart);
  icon(ctx, 'send', sx + pad + pillW + sw * 0.155, by, sw * 0.082, '#fff', plane);
  ctx.restore();

  // hardware: island and home indicator
  ctx.fillStyle = '#111'; rrect(ctx, W / 2 - pw * 0.17, py + b * 1.6, pw * 0.34, pw * 0.075, pw * 0.04); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; rrect(ctx, W / 2 - pw * 0.18, py + ph - b * 2.2, pw * 0.36, pw * 0.014, pw * 0.01); ctx.fill();
};

// One post card: header, the asset at `ar`, and the action row underneath.
function postCard(ctx, x, y, cw, ar, img) {
  const head = cw * 0.115, ih = cw / ar, foot = cw * 0.30, ch = head + ih + foot, r = cw * 0.022;
  shadow(ctx, x, y, cw, ch, r, cw * 0.05, 0.16, 0.4);
  ctx.fillStyle = '#fff'; rrect(ctx, x, y, cw, ch, r); ctx.fill();
  ctx.fillStyle = '#E52A1F'; ctx.beginPath(); ctx.arc(x + head * 0.62, y + head * 0.5, head * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 ${head * 0.24}px ${UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('TNS', x + head * 0.62, y + head * 0.5);
  ctx.fillStyle = '#111'; ctx.font = `600 ${head * 0.22}px ${UI}`; ctx.textAlign = 'left';
  ctx.fillText('thenewschool', x + head * 1.08, y + head * 0.4);
  ctx.fillStyle = '#8e8e93'; ctx.font = `400 ${head * 0.18}px ${UI}`;
  ctx.fillText('Barclays Center', x + head * 1.08, y + head * 0.66);
  icon(ctx, 'more_vert', x + cw - head * 0.5, y + head * 0.5, head * 0.44, '#111');

  cover(ctx, img, x, y + head, cw, ih, 0);

  const fy = y + head + ih + cw * 0.075, k = cw * 0.062;
  ctx.lineWidth = cw * 0.007; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  icon(ctx, 'favorite', x + cw * 0.075, fy, k, '#111', heart);
  icon(ctx, 'chat_bubble', x + cw * 0.175, fy, k, '#111', bubble);
  icon(ctx, 'send', x + cw * 0.275, fy, k, '#111', plane);
  icon(ctx, 'bookmark', x + cw - cw * 0.075, fy, k, '#111');
  placeholderLines(ctx, x + cw * 0.075, fy + cw * 0.06, cw * 0.85, 2, cw * 0.055, '#e3e3e6');
  return ch;
}

// Two crops side by side: the 4:5 post and the asset's own ratio, so you can see what each
// one keeps. They rise and fade in when the mockup is chosen.
R.social = (ctx, W, H, img, state, enter = 1) => {
  const natural = clamp(img.width / img.height, 0.8, 1.91);
  const cards = [{ ar: 0.8, label: '4:5' }, { ar: natural, label: ratioLabel(natural) }];
  const gap = 0.08, cap = 0.075, head = 0.115, foot = 0.30;
  const tallest = Math.max(...cards.map(c => head + 1 / c.ar + foot));
  const cw = Math.min(W * 0.94 / (2 + gap), H * 0.94 / (tallest + cap));
  const totalW = cw * (2 + gap), totalH = cw * (tallest + cap);
  const x0 = (W - totalW) / 2, y0 = (H - totalH) / 2;
  cards.forEach((c, i) => {
    const p = easeOut(clamp((enter - i * 0.2) / 0.8, 0, 1));
    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(0, (1 - p) * cw * 0.07);
    const x = x0 + i * cw * (1 + gap);
    ctx.fillStyle = '#6b6b73'; ctx.font = `600 ${cw * 0.035}px ${UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(c.label, x, y0 + cw * cap * 0.6);
    postCard(ctx, x, y0 + cw * cap, cw, c.ar, img);
    ctx.restore();
  });
};

R.badge = (ctx, W, H, img, state) => {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ebe9e4'); g.addColorStop(1, '#d6d3cb');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const bw = W * 0.56, bh = bw * 0.66, bx = W / 2 - bw / 2, by = H * 0.58 - bh / 2, r = bw * 0.035;
  // lanyard
  ctx.strokeStyle = RED; ctx.lineWidth = bw * 0.055; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(W * 0.32, -H * 0.05); ctx.lineTo(W / 2, by + bh * 0.02); ctx.lineTo(W * 0.68, -H * 0.05); ctx.stroke();
  ctx.fillStyle = '#3a3a3d'; rrect(ctx, W / 2 - bw * 0.055, by - bw * 0.045, bw * 0.11, bw * 0.06, bw * 0.012); ctx.fill();
  shadow(ctx, bx, by, bw, bh, r, W * 0.03, 0.35, 0.5);

  ctx.save();
  rrect(ctx, bx, by, bw, bh, r); ctx.clip();
  const art = bh * 0.56;
  cover(ctx, img, bx, by, bw, art, 0);
  // the red panel: mark on the left, the wearer beside it
  ctx.fillStyle = RED; ctx.fillRect(bx, by + art, bw, bh - art);
  const panelY = by + art, panelH = bh - art, inset = bw * 0.055;
  const mw = bw * 0.17;
  const mh = mark(ctx, bx + inset, panelY + panelH / 2 - (mw * MARK_VB.h / MARK_VB.w) / 2, mw);
  const tx = bx + inset + mw + bw * 0.06, tw = bw - (tx - bx) - inset;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  fitLine(ctx, 'JANE DOE', tw, panelH * 0.34, 700);
  ctx.fillText('JANE DOE', tx, panelY + panelH * 0.40);
  fitLine(ctx, 'PARSONS SCHOOL OF DESIGN  ·  BFA 2025', tw, panelH * 0.17, 500);
  ctx.fillText('PARSONS SCHOOL OF DESIGN  ·  BFA 2025', tx, panelY + panelH * 0.70);
  ctx.restore();
};

export function drawMockup(ctx, id, W, H, img, state, enter = 1) {
  placement = null;
  const fn = R[id];
  if (!fn) { placement = { matrix: ctx.getTransform(), dx: 0, dy: 0, dw: W, dh: H }; ctx.drawImage(img, 0, 0, W, H); return placement; }
  ctx.save(); fn(ctx, W, H, img, state, enter); ctx.restore();
  return placement;
}
export const MOCKUP_EXPORT_LONG_SIDE = 2400;
