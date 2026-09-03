// PNG / SVG / video export.
import { renderAssetToCanvas } from './paint.js';
import { buildSVG } from './svg.js';
import { drawMockup, MOCKUP_EXPORT_LONG_SIDE } from './mockups.js';
import { MOCKUPS } from './state.js';
import { download } from './util.js';

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const fileBase = state => `tns-commencement-${state.shape.template}-${state.size.w}x${state.size.h}`;

// Canvas for the current view: the asset itself, or the mockup scene containing it.
export function renderStageCanvas(state, time, longSide = null) {
  const mk = MOCKUPS.find(m => m.id === state.mockup.id);
  if (!mk || !mk.ratio) return renderAssetToCanvas(state, time, longSide);
  const asset = renderAssetToCanvas(state, time, Math.min(longSide || MOCKUP_EXPORT_LONG_SIDE, 2400));
  const c = document.createElement('canvas');
  const L = longSide || MOCKUP_EXPORT_LONG_SIDE;
  c.width = mk.ratio >= 1 ? L : Math.round(L * mk.ratio);
  c.height = mk.ratio >= 1 ? Math.round(L / mk.ratio) : L;
  drawMockup(c.getContext('2d'), mk.id, c.width, c.height, asset, state);
  return c;
}

export async function exportPNG(state, time, scale = 1) {
  const s = { ...state, size: { ...state.size, w: Math.round(state.size.w * scale), h: Math.round(state.size.h * scale) } };
  const c = renderStageCanvas(s, time, null);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const suffix = state.mockup.id !== 'none' ? `-${state.mockup.id}` : '';
  download(blob, `${fileBase(s)}${suffix}-${stamp()}.png`);
}

export function exportSVG(state, time) {
  const svg = buildSVG(state, time);
  download(new Blob([svg], { type: 'image/svg+xml' }), `${fileBase(state)}-${stamp()}.svg`);
}

export function videoMime() {
  const candidates = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || null;
}

// Records `duration` seconds of animation from an offscreen canvas.
export function exportVideo(state, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const mime = videoMime();
    if (!mime) return reject(new Error('This browser cannot record video. Try Chrome or Safari.'));
    const fps = state.motion.fps || 30, duration = state.motion.duration || 6;
    const mk = MOCKUPS.find(m => m.id === state.mockup.id);
    const useMock = mk && mk.ratio;
    // Keep video frames to a sane size; even-numbered dimensions for H.264.
    const maxLong = 1920;
    const even = v => Math.max(2, Math.round(v / 2) * 2);
    let cw, ch;
    if (useMock) { cw = mk.ratio >= 1 ? maxLong : maxLong * mk.ratio; ch = mk.ratio >= 1 ? maxLong / mk.ratio : maxLong; }
    else { const k = Math.min(1, maxLong / Math.max(state.size.w, state.size.h)); cw = state.size.w * k; ch = state.size.h * k; }
    const canvas = document.createElement('canvas'); canvas.width = even(cw); canvas.height = even(ch);
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(fps);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16_000_000 });
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onerror = e => reject(e.error || new Error('Recorder error'));
    rec.onstop = () => {
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mime });
      download(blob, `${fileBase(state)}${useMock ? '-' + mk.id : ''}-${stamp()}.${ext}`);
      resolve({ ext, mime });
    };
    const total = Math.round(duration * fps);
    let frame = 0;
    const draw = () => {
      const t = frame / fps;
      const src = renderStageCanvas(state, t, Math.max(canvas.width, canvas.height));
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    };
    draw();
    rec.start(200);
    const start = performance.now();
    // Timer-driven (not requestAnimationFrame) so recording continues in a background tab.
    const tick = () => {
      frame = Math.min(total, Math.round((performance.now() - start) / 1000 * fps));
      draw();
      onProgress && onProgress(frame / total);
      if (frame >= total) { setTimeout(() => { rec.stop(); stream.getTracks().forEach(tr => tr.stop()); }, 100); return; }
      setTimeout(tick, 1000 / fps);
    };
    setTimeout(tick, 1000 / fps);
  });
}

export function exportJSON(state) {
  download(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), `${fileBase(state)}-preset.json`);
}
