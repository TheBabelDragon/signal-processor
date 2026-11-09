/**
 * Robot 36 decoder — clean / lightly degraded synthetic path.
 * Alternating chroma: even lines R-Y (sep 1500), odd lines B-Y (sep 2300).
 */

import { ROBOT_36, FREQ } from '../modes/mode-definitions.js';
import { estimateFreq, freqToValue, SSTV_CANDIDATES } from './tone-estimator.js';
import { detectVis } from './vis-decoder.js';

/**
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {{ sampleOffset?: number }} [opts]
 */
export function decodeRobot36(samples, sampleRate, opts = {}) {
  const mode = ROBOT_36;
  const sr = sampleRate;
  const t = mode.timing;

  let offset = opts.sampleOffset || 0;
  let visInfo = null;
  if (offset === 0) {
    visInfo = detectVis(samples, sr);
    if (visInfo.modeId === 'robot36' || visInfo.visCode === 8) {
      offset = visInfo.sampleOffset;
    }
  }

  const width = mode.width;
  const height = mode.height;
  const Y = new Float32Array(width * height);
  const RY = new Float32Array(width * height);
  const BY = new Float32Array(width * height);
  RY.fill(0.5);
  BY.fill(0.5);

  const syncLen = Math.round((t.syncPulseMs / 1000) * sr);
  const porchLen = Math.round((t.syncPorchMs / 1000) * sr);
  const yScanLen = Math.round((t.yScanMs / 1000) * sr);
  const sepLen = Math.round((t.sepPulseMs / 1000) * sr);
  const cPorchLen = Math.round((t.chromaPorchMs / 1000) * sr);
  const cScanLen = Math.round((t.chromaScanMs / 1000) * sr);
  const yPx = Math.max(1, Math.floor(yScanLen / width));
  const cPx = Math.max(1, Math.floor(cScanLen / width));

  let pos = findNextSync(samples, offset, sr, syncLen) ?? offset;
  let linesDecoded = 0;
  let syncHits = 0;

  for (let y = 0; y < height; y++) {
    const need = syncLen + porchLen + yScanLen + sepLen + cPorchLen + cScanLen;
    if (pos + need > samples.length) break;

    const syncEst = estimateFreq(samples, pos, syncLen, sr, [1200, 1500, 1900]);
    if (Math.abs(syncEst.freq - 1200) < 100) syncHits++;
    pos += syncLen + porchLen;

    // Y
    for (let x = 0; x < width; x++) {
      const { freq } = estimateFreq(samples, pos + x * yPx, yPx, sr, SSTV_CANDIDATES);
      Y[y * width + x] = freqToValue(freq);
    }
    pos += yScanLen;

    // Separator frequency selects chroma channel
    const sepEst = estimateFreq(samples, pos, sepLen, sr, [1500, 1900, 2300]);
    pos += sepLen + cPorchLen;

    const isRy = Math.abs(sepEst.freq - 1500) <= Math.abs(sepEst.freq - 2300);
    const plane = isRy ? RY : BY;
    for (let x = 0; x < width; x++) {
      const { freq } = estimateFreq(samples, pos + x * cPx, cPx, sr, SSTV_CANDIDATES);
      plane[y * width + x] = freqToValue(freq);
    }
    pos += cScanLen;
    linesDecoded++;

    const next = findNextSync(samples, pos - Math.floor(syncLen / 2), sr, syncLen);
    if (next != null && next > pos - syncLen) pos = next;
  }

  // Fill missing chroma from pair lines
  for (let y = 0; y < height; y++) {
    const pair = y % 2 === 0 ? Math.min(height - 1, y + 1) : Math.max(0, y - 1);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = pair * width + x;
      if (y % 2 === 0) {
        // even stored R-Y; copy B-Y from odd if odd was decoded
        if (linesDecoded > pair) BY[i] = BY[p];
      } else {
        if (linesDecoded > pair) RY[i] = RY[p];
      }
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const y = Y[i];
    const ry = (RY[i] - 0.5) * 2;
    const by = (BY[i] - 0.5) * 2;
    let r = y + ry;
    let b = y + by;
    let g = y - 0.509 * ry - 0.194 * by; // approximate inverse of 0.299/0.587/0.114 weights
    r = clamp01(r);
    g = clamp01(g);
    b = clamp01(b);
    const o = i * 4;
    rgba[o] = Math.round(r * 255);
    rgba[o + 1] = Math.round(g * 255);
    rgba[o + 2] = Math.round(b * 255);
    rgba[o + 3] = 255;
  }

  const incomplete = linesDecoded < height;
  return {
    image: { data: rgba, width, height },
    mode: mode.id,
    visCode: visInfo?.visCode ?? mode.visCode,
    linesDecoded,
    expectedLines: height,
    syncHits,
    syncScore: height ? syncHits / height : 0,
    incomplete,
    sampleRate: sr,
    diagnostics: {
      visConfidence: visInfo?.confidence ?? null,
      decoder: 'robot36_v1',
      note: incomplete
        ? 'Partial frame — not all scanlines recovered'
        : 'Full frame recovered (clean-path Robot 36 decoder)',
    },
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function findNextSync(samples, from, sr, syncLen) {
  const end = Math.min(samples.length - syncLen, from + Math.round(0.02 * sr));
  let best = null;
  let bestScore = 0;
  for (let i = Math.max(0, from); i < end; i += Math.max(1, Math.floor(syncLen / 8))) {
    const { freq, strength } = estimateFreq(samples, i, syncLen, sr, [1200, 1500]);
    if (Math.abs(freq - 1200) < 80 && strength > bestScore) {
      bestScore = strength;
      best = i;
    }
  }
  return best;
}
