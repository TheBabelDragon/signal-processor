/**
 * Robot 36 encoder — Y / R-Y / B-Y with alternating chroma lines.
 */

import { ROBOT_36, FREQ, valueToFreq } from '../modes/mode-definitions.js';
import { buildVisHeader } from './vis.js';
import { synthesizeSegments, concatFloat32 } from '../audio/waveform.js';
import { normalizeImage } from './image-normalizer.js';

/** BT.601-style components in 0..1 */
function rgbToRobot(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  // R-Y, B-Y centered at 0.5 for FM mapping (0 = black/green, 1 = full deviation)
  const ry = (r - y) * 0.5 + 0.5;
  const by = (b - y) * 0.5 + 0.5;
  return {
    y: clamp01(y),
    ry: clamp01(ry),
    by: clamp01(by),
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * @param {{ data: Uint8ClampedArray|Uint8Array, width: number, height: number }} image
 * @param {{ sampleRate?: number, onProgress?: Function, signal?: AbortSignal }} [opts]
 */
export function encodeRobot36(image, opts = {}) {
  const sampleRate = opts.sampleRate === 44100 ? 44100 : 48000;
  const mode = ROBOT_36;
  const img = normalizeImage(image, mode.width, mode.height);
  const parts = [];
  let phase = 0;
  const t = mode.timing;

  const check = () => {
    if (opts.signal?.aborted) {
      const e = new Error('cancelled');
      e.name = 'AbortError';
      throw e;
    }
  };

  // Precompute Y / R-Y / B-Y planes
  const Y = new Float32Array(mode.width * mode.height);
  const RY = new Float32Array(mode.width * mode.height);
  const BY = new Float32Array(mode.width * mode.height);
  for (let i = 0; i < mode.width * mode.height; i++) {
    const o = i * 4;
    const c = rgbToRobot(img.data[o] / 255, img.data[o + 1] / 255, img.data[o + 2] / 255);
    Y[i] = c.y;
    RY[i] = c.ry;
    BY[i] = c.by;
  }

  // VIS
  check();
  let r = synthesizeSegments(buildVisHeader(mode.visCode), sampleRate, { phase });
  parts.push(r.samples);
  phase = r.phase;

  const yPxMs = t.yScanMs / mode.width;
  const cPxMs = t.chromaScanMs / mode.width;

  for (let y = 0; y < mode.height; y++) {
    check();
    if (opts.onProgress) opts.onProgress((y + 1) / mode.height);

    // sync + porch
    r = synthesizeSegments(
      [
        { freq: FREQ.SYNC, ms: t.syncPulseMs },
        { freq: FREQ.BLACK, ms: t.syncPorchMs },
      ],
      sampleRate,
      { phase }
    );
    parts.push(r.samples);
    phase = r.phase;

    // Y scan
    const ySegs = [];
    for (let x = 0; x < mode.width; x++) {
      ySegs.push({ freq: valueToFreq(Y[y * mode.width + x]), ms: yPxMs });
    }
    r = synthesizeSegments(ySegs, sampleRate, { phase });
    parts.push(r.samples);
    phase = r.phase;

    // Separator: even → 1500 (R-Y), odd → 2300 (B-Y)
    const even = y % 2 === 0;
    r = synthesizeSegments(
      [
        { freq: even ? FREQ.ROBOT_SEP_EVEN : FREQ.ROBOT_SEP_ODD, ms: t.sepPulseMs },
        { freq: FREQ.ROBOT_PORCH, ms: t.chromaPorchMs },
      ],
      sampleRate,
      { phase }
    );
    parts.push(r.samples);
    phase = r.phase;

    // Chroma: average this line with neighbor when available
    const y2 = even ? Math.min(mode.height - 1, y + 1) : Math.max(0, y - 1);
    const plane = even ? RY : BY;
    const cSegs = [];
    for (let x = 0; x < mode.width; x++) {
      const a = plane[y * mode.width + x];
      const b = plane[y2 * mode.width + x];
      cSegs.push({ freq: valueToFreq((a + b) * 0.5), ms: cPxMs });
    }
    r = synthesizeSegments(cSegs, sampleRate, { phase });
    parts.push(r.samples);
    phase = r.phase;
  }

  const samples = concatFloat32(parts);
  return {
    samples,
    sampleRate,
    mode: mode.id,
    visCode: mode.visCode,
    width: mode.width,
    height: mode.height,
    durationMs: (samples.length / sampleRate) * 1000,
    lineCount: mode.height,
  };
}
