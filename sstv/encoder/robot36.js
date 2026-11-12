/**
 * Robot 36 encoder — absolute boundaries, continuous phase, verified Y/R-Y/B-Y.
 */

import { ROBOT_36, FREQ, valueToFreq } from '../modes/mode-definitions.js';
import { buildVisHeader } from './vis.js';
import { concatFloat32, synthesizeSegments } from '../audio/waveform.js';
import { normalizeImage } from './image-normalizer.js';
import {
  buildLinePlan,
  synthesizeScanFromBounds,
  synthesizeToneSamples,
} from '../dsp/sample-timing.js';

export function rgbToRobot(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const ry = (r - y) * 0.5 + 0.5;
  const by = (b - y) * 0.5 + 0.5;
  return {
    y: clamp01(y),
    ry: clamp01(ry),
    by: clamp01(by),
  };
}

export function robotToRgb(y, ry01, by01) {
  const ry = (ry01 - 0.5) * 2;
  const by = (by01 - 0.5) * 2;
  const r = y + ry;
  const b = y + by;
  const g = (y - 0.299 * r - 0.114 * b) / 0.587;
  return {
    r: clamp01(r),
    g: clamp01(g),
    b: clamp01(b),
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export function encodeRobot36(image, opts = {}) {
  const sampleRate = opts.sampleRate === 44100 ? 44100 : 48000;
  const mode = ROBOT_36;
  const img = normalizeImage(image, mode.width, mode.height, {
    fit: opts.fit || 'stretch',
  });
  const plan = buildLinePlan(mode.timing, mode.width, sampleRate, 'robot');
  const parts = [];
  let phase = 0;

  const check = () => {
    if (opts.signal?.aborted) {
      const e = new Error('cancelled');
      e.name = 'AbortError';
      throw e;
    }
  };

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

    const yVals = Y.subarray(y * mode.width, (y + 1) * mode.width);
    r = synthesizeScanFromBounds(yVals, plan.yBounds, sampleRate, phase, valueToFreq);
    parts.push(r.samples);
    phase = r.phase;

    const even = y % 2 === 0;
    r = synthesizeToneSamples(
      even ? FREQ.ROBOT_SEP_EVEN : FREQ.ROBOT_SEP_ODD,
      plan.sepSamples,
      sampleRate,
      phase
    );
    parts.push(r.samples);
    phase = r.phase;
    r = synthesizeToneSamples(FREQ.ROBOT_PORCH, plan.cPorchSamples, sampleRate, phase);
    parts.push(r.samples);
    phase = r.phase;

    const y2 = even ? Math.min(mode.height - 1, y + 1) : Math.max(0, y - 1);
    const plane = even ? RY : BY;
    const cVals = new Float32Array(mode.width);
    for (let x = 0; x < mode.width; x++) {
      cVals[x] = (plane[y * mode.width + x] + plane[y2 * mode.width + x]) * 0.5;
    }
    r = synthesizeScanFromBounds(cVals, plan.cBounds, sampleRate, phase, valueToFreq);
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
    plan,
  };
}
