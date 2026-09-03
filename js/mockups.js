// Mockup scenes drawn on the stage canvas around a rendered asset canvas.
import { withAlpha } from './util.js';

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
  // front cover: the asset
  cover(ctx, img, px + page.w, py, page.w, page.h, 0);
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
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.7); g.addColorStop(0, '#2a2a30'); g.addColorStop(1, '#0d0d10');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
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
  const bw = W * 0.5, bh = bw * 0.75, bx = W / 2 - bw / 2, by = H * 0.56 - bh / 2, r = bw * 0.03;
  // lanyard
  ctx.strokeStyle = '#E52A1F'; ctx.lineWidth = bw * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(W * 0.3, -H * 0.05); ctx.lineTo(W / 2, by + bh * 0.05); ctx.lineTo(W * 0.7, -H * 0.05); ctx.stroke();
  ctx.fillStyle = '#333'; rrect(ctx, W / 2 - bw * 0.05, by - bw * 0.02, bw * 0.1, bw * 0.06, bw * 0.01); ctx.fill();
  shadow(ctx, bx, by, bw, bh, r, W * 0.03, 0.35, 0.5);
  ctx.fillStyle = '#fff'; rrect(ctx, bx, by, bw, bh, r); ctx.fill();
  ctx.save(); rrect(ctx, bx, by, bw, bh, r); ctx.clip(); cover(ctx, img, bx, by, bw, bh * 0.48, 0); ctx.restore();
  ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${bh * 0.11}px "Helvetica Neue", Helvetica, Arial, sans-serif`; ctx.fillText('Graduate Name', bx + bw * 0.06, by + bh * 0.68);
  ctx.fillStyle = '#E52A1F'; ctx.font = `500 ${bh * 0.055}px "Helvetica Neue", Helvetica, Arial, sans-serif`; ctx.fillText('PARSONS SCHOOL OF DESIGN · BFA 2025', bx + bw * 0.06, by + bh * 0.79);
  ctx.fillStyle = '#999'; ctx.font = `400 ${bh * 0.045}px "Helvetica Neue", Helvetica, Arial, sans-serif`; ctx.fillText('The New School · Commencement', bx + bw * 0.06, by + bh * 0.9);
};

export function drawMockup(ctx, id, W, H, img, state, enter = 1) {
  placement = null;
  const fn = R[id];
  if (!fn) { placement = { matrix: ctx.getTransform(), dx: 0, dy: 0, dw: W, dh: H }; ctx.drawImage(img, 0, 0, W, H); return placement; }
  ctx.save(); fn(ctx, W, H, img, state, enter); ctx.restore();
  return placement;
}
export const MOCKUP_EXPORT_LONG_SIDE = 2400;
