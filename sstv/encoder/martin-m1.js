/**
 * Martin M1 encoder — absolute sample boundaries, continuous phase.
 */

import { MARTIN_M1, FREQ, valueToFreq } from '../modes/mode-definitions.js';
import { buildVisHeader } from './vis.js';
import { concatFloat32, synthesizeSegments } from '../audio/waveform.js';
import { normalizeImage } from './image-normalizer.js';
import {
  buildLinePlan,
  synthesizeScanFromBounds,
  synthesizeToneSamples,
} from '../dsp/sample-timing.js';

export function encodeMartinM1(image, opts = {}) {
  const sampleRate = opts.sampleRate === 44100 ? 44100 : 48000;
  const mode = MARTIN_M1;
  const img = normalizeImage(image, mode.width, mode.height, {
    fit: opts.fit || 'stretch',
  });
  const plan = buildLinePlan(mode.timing, mode.width, sampleRate, 'martin');
  const parts = [];
  let phase = 0;

  const check = () => {
    if (opts.signal?.aborted) {
      const e = new Error('cancelled');
      e.name = 'AbortError';
      throw e;
    }
  };

  check();
  let r = synthesizeSegments(buildVisHeader(mode.visCode), sampleRate, { phase });
  parts.push(r.samples);
  phase = r.phase;

  for (let y = 0; y < mode.height; y++) {
    check();
    if (opts.onProgress) opts.onProgress((y + 1) / mode.height);

    r = synthesizeToneSamples(FREQ.SYNC, plan.syncSamples, sampleRate, phase);
    parts.push(r.samples);
    phase = r.phase;
    r = synthesizeToneSamples(FREQ.BLACK, plan.porchSamples, sampleRate, phase);
    parts.push(r.samples);
    phase = r.phase;

    for (const ch of mode.channelOrder) {
      const values = new Float32Array(mode.width);
      for (let x = 0; x < mode.width; x++) {
        const i = (y * mode.width + x) * 4;
        if (ch === 'R') values[x] = img.data[i] / 255;
        else if (ch === 'G') values[x] = img.data[i + 1] / 255;
        else values[x] = img.data[i + 2] / 255;
      }
      r = synthesizeScanFromBounds(values, plan.bounds, sampleRate, phase, valueToFreq);
      parts.push(r.samples);
      phase = r.phase;
      r = synthesizeToneSamples(FREQ.BLACK, plan.sepSamples, sampleRate, phase);
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
    plan,
  };
}
