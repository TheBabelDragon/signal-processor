/**
 * Draw a simple mono waveform overview into a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Float32Array|number[]} samples
 * @param {{ color?: string, bg?: string }} [opts]
 */
export function drawWaveform(canvas, samples, opts = {}) {
  if (!canvas || !samples || !samples.length) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const bg = opts.bg || '#0a0d12';
  const color = opts.color || '#7dffb3';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const mid = h / 2;
  ctx.strokeStyle = 'rgba(125,255,179,0.15)';
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  const n = samples.length;
  const step = Math.max(1, Math.floor(n / w));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    const start = x * step;
    let min = 1;
    let max = -1;
    for (let i = 0; i < step && start + i < n; i++) {
      const v = samples[start + i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y0 = mid + min * mid * 0.9;
    const y1 = mid + max * mid * 0.9;
    ctx.moveTo(x + 0.5, y0);
    ctx.lineTo(x + 0.5, y1);
  }
  ctx.stroke();
}
