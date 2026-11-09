/**
 * Tiny horizontal RMS level meter.
 * @param {HTMLCanvasElement} canvas
 * @param {number} level 0..1-ish RMS
 */
export function drawLevelMeter(canvas, level) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0a0d12';
  ctx.fillRect(0, 0, w, h);
  const x = Math.max(0, Math.min(1, level * 4)); // scale typical speech RMS
  const gw = Math.floor(w * x);
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#3d8b6e');
  grad.addColorStop(0.7, '#7dffb3');
  grad.addColorStop(1, '#f0c674');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 2, gw, h - 4);
  ctx.strokeStyle = 'rgba(42,51,64,0.9)';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}
