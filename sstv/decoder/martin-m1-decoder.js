/**
 * Martin M1 decoder tuned for clean / lightly degraded synthetic WAVs.
 * Not a full multipath contest decoder — honest diagnostics included.
 */

import { MARTIN_M1, FREQ } from '../modes/mode-definitions.js';
import { estimateFreq, freqToValue, SSTV_CANDIDATES } from './tone-estimator.js';
import { detectVis } from './vis-decoder.js';

/**
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {{ modeHint?: string, sampleOffset?: number }} [opts]
 */
export function decodeMartinM1(samples, sampleRate, opts = {}) {
  const mode = MARTIN_M1;
  const sr = sampleRate;
  const t = mode.timing;

  let offset = opts.sampleOffset || 0;
  let visInfo = null;
  if (offset === 0) {
    visInfo = detectVis(samples, sr);
    if (visInfo.modeId === 'martin_m1' || !opts.modeHint) {
      offset = visInfo.sampleOffset;
    }
  }

  const width = mode.width;
  const height = mode.height;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let linesDecoded = 0;
  let syncHits = 0;

  const syncLen = Math.round((t.syncPulseMs / 1000) * sr);
  const porchLen = Math.round((t.syncPorchMs / 1000) * sr);
  const scanLen = Math.round((t.scanMs / 1000) * sr);
  const sepLen = Math.round((t.sepPulseMs / 1000) * sr);
  const pxLen = Math.max(1, Math.floor(scanLen / width));

  let pos = offset;
  // Align to first strong 1200 Hz region
  pos = findNextSync(samples, pos, sr, syncLen) ?? pos;

  for (let y = 0; y < height; y++) {
    if (pos + syncLen + porchLen + 3 * (scanLen + sepLen) > samples.length) {
      break;
    }

    // Expect sync
    const syncEst = estimateFreq(samples, pos, syncLen, sr, [1200, 1500, 1900]);
    if (Math.abs(syncEst.freq - 1200) < 100) syncHits++;
    pos += syncLen + porchLen;

    const channels = { G: null, B: null, R: null };
    for (const ch of mode.channelOrder) {
      const line = new Float32Array(width);
      for (let x = 0; x < width; x++) {
        const start = pos + x * pxLen;
        const { freq } = estimateFreq(samples, start, pxLen, sr, SSTV_CANDIDATES);
        line[x] = freqToValue(freq);
      }
      channels[ch] = line;
      pos += scanLen + sepLen;
    }

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = Math.round((channels.R[x] || 0) * 255);
      rgba[i + 1] = Math.round((channels.G[x] || 0) * 255);
      rgba[i + 2] = Math.round((channels.B[x] || 0) * 255);
      rgba[i + 3] = 255;
    }
    linesDecoded++;

    // Re-sync hunt for next line (handles small drift)
    const next = findNextSync(samples, pos - Math.floor(syncLen / 2), sr, syncLen);
    if (next != null && next > pos - syncLen) pos = next;
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
      decoder: 'martin_m1_v1',
      note: incomplete
        ? 'Partial frame — not all scanlines recovered'
        : 'Full frame recovered (clean-path decoder)',
    },
  };
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
