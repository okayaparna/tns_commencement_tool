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
  placement = { matrix: ctx.getTransform(), dx, dy, dw, dh };
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
  const b = pw * 0.035;
  cover(ctx, img, px + b, py + b, pw - 2 * b, ph - 2 * b, r - b);
  // status bar + island + home indicator
  ctx.fillStyle = '#111'; rrect(ctx, W / 2 - pw * 0.17, py + b * 1.6, pw * 0.34, pw * 0.075, pw * 0.04); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; rrect(ctx, W / 2 - pw * 0.18, py + ph - b * 2.2, pw * 0.36, pw * 0.014, pw * 0.01); ctx.fill();
  // story progress bar
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; rrect(ctx, px + b * 2, py + b * 3.6, pw - b * 4, pw * 0.008, 4); ctx.fill();
  ctx.fillStyle = '#fff'; rrect(ctx, px + b * 2, py + b * 3.6, (pw - b * 4) * 0.4, pw * 0.008, 4); ctx.fill();
};

R.social = (ctx, W, H, img, state) => {
  ctx.fillStyle = '#f3f3f4'; ctx.fillRect(0, 0, W, H);
  const cw = W * 0.86, cx = W * 0.07, cy = H * 0.06, head = cw * 0.13, ch = head + cw + cw * 0.22;
  shadow(ctx, cx, cy, cw, ch, W * 0.02, W * 0.03, 0.15, 0.4);
  ctx.fillStyle = '#fff'; rrect(ctx, cx, cy, cw, ch, W * 0.02); ctx.fill();
  ctx.fillStyle = '#E52A1F'; ctx.beginPath(); ctx.arc(cx + head * 0.5, cy + head * 0.5, head * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 ${head * 0.22}px "Helvetica Neue", Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('TNS', cx + head * 0.5, cy + head * 0.5);
  ctx.fillStyle = '#111'; ctx.font = `600 ${head * 0.2}px "Helvetica Neue", Helvetica, Arial, sans-serif`; ctx.textAlign = 'left'; ctx.fillText('thenewschool', cx + head * 0.95, cy + head * 0.42);
  ctx.fillStyle = '#888'; ctx.font = `400 ${head * 0.16}px "Helvetica Neue", Helvetica, Arial, sans-serif`; ctx.fillText('Barclays Center', cx + head * 0.95, cy + head * 0.66);
  cover(ctx, img, cx, cy + head, cw, cw, 0);
  const fy = cy + head + cw + cw * 0.06;
  ctx.strokeStyle = '#222'; ctx.lineWidth = cw * 0.008; ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx + cw * (0.06 + i * 0.09), fy, cw * 0.028, 0, Math.PI * 2); ctx.stroke(); }
  placeholderLines(ctx, cx + cw * 0.03, fy + cw * 0.06, cw * 0.9, 2, cw * 0.05, '#dcdcdc');
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

export function drawMockup(ctx, id, W, H, img, state) {
  placement = null;
  const fn = R[id];
  if (!fn) { placement = { matrix: ctx.getTransform(), dx: 0, dy: 0, dw: W, dh: H }; ctx.drawImage(img, 0, 0, W, H); return placement; }
  ctx.save(); fn(ctx, W, H, img, state); ctx.restore();
  return placement;
}
export const MOCKUP_EXPORT_LONG_SIDE = 2400;
