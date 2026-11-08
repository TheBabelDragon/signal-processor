/**
 * Martin M1 encoder — full frame to Float32 mono samples.
 */

import { MARTIN_M1, FREQ, valueToFreq } from '../modes/mode-definitions.js';
import { buildVisHeader } from './vis.js';
import { synthesizeSegments, concatFloat32 } from '../audio/waveform.js';
import { normalizeImage } from './image-normalizer.js';

/**
 * @param {{ data: Uint8ClampedArray|Uint8Array, width: number, height: number }} image
 * @param {{ sampleRate?: number, onProgress?: Function, signal?: AbortSignal }} [opts]
 */
export function encodeMartinM1(image, opts = {}) {
  const sampleRate = opts.sampleRate === 44100 ? 44100 : 48000;
  const mode = MARTIN_M1;
  const img = normalizeImage(image, mode.width, mode.height);
  const parts = [];
  let phase = 0;

  const check = () => {
    if (opts.signal?.aborted) {
      const e = new Error('cancelled');
      e.name = 'AbortError';
      throw e;
    }
  };

  // VIS header
  check();
  const vis = buildVisHeader(mode.visCode);
  let r = synthesizeSegments(vis, sampleRate, { phase });
  parts.push(r.samples);
  phase = r.phase;

  const t = mode.timing;
  const pxTimeMs = t.scanMs / mode.width;

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

    for (const ch of mode.channelOrder) {
      const segs = [];
      for (let x = 0; x < mode.width; x++) {
        const i = (y * mode.width + x) * 4;
        let v = 0;
        if (ch === 'R') v = img.data[i] / 255;
        else if (ch === 'G') v = img.data[i + 1] / 255;
        else v = img.data[i + 2] / 255;
        segs.push({ freq: valueToFreq(v), ms: pxTimeMs });
      }
      r = synthesizeSegments(segs, sampleRate, { phase });
      parts.push(r.samples);
      phase = r.phase;
      // separator
      r = synthesizeSegments([{ freq: FREQ.BLACK, ms: t.sepPulseMs }], sampleRate, { phase });
      parts.push(r.samples);
      phase = r.phase;
    }
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
