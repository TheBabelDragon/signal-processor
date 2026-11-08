/**
 * Detect VIS code from calibrated header region.
 */

import { estimateFreq, SSTV_CANDIDATES } from './tone-estimator.js';
import { FREQ } from '../modes/mode-definitions.js';
import { modeByVis } from '../modes/mode-registry.js';

/**
 * Scan early audio for VIS pattern; return vis code and sample offset after header.
 * @param {Float32Array} samples
 * @param {number} sampleRate
 */
export function detectVis(samples, sampleRate) {
  const sr = sampleRate;
  // Search first ~2.5s for leader energy at 1900
  const window = Math.round(0.02 * sr);
  const searchEnd = Math.min(samples.length - window, Math.round(2.5 * sr));
  let leaderHits = 0;
  let visRegionStart = 0;

  for (let i = 0; i < searchEnd; i += Math.floor(window / 2)) {
    const { freq } = estimateFreq(samples, i, window, sr, [1200, 1500, 1900]);
    if (Math.abs(freq - 1900) < 80) {
      leaderHits++;
      if (leaderHits === 1) visRegionStart = i;
    }
  }

  // Fallback: assume header starts at 0
  const headerStart = leaderHits > 0 ? visRegionStart : 0;
  // After ~610ms calibration, VIS bits at 30ms each
  const bitMs = 30;
  const bitSamples = Math.round((bitMs / 1000) * sr);
  // Skip ~610ms from headerStart (300+10+300)
  let pos = headerStart + Math.round(0.61 * sr);
  // start bit
  pos += bitSamples;
  let code = 0;
  for (let b = 0; b < 7; b++) {
    const { freq } = estimateFreq(samples, pos, bitSamples, sr, [FREQ.VIS_BIT_0, FREQ.VIS_BIT_1, 1200]);
    const bit = Math.abs(freq - FREQ.VIS_BIT_1) < Math.abs(freq - FREQ.VIS_BIT_0) ? 1 : 0;
    code |= bit << b;
    pos += bitSamples;
  }
  // parity + stop
  pos += bitSamples * 2;

  const mode = modeByVis(code);
  return {
    visCode: code,
    modeId: mode?.id || null,
    sampleOffset: Math.min(pos, samples.length),
    confidence: mode ? 0.7 : 0.3,
  };
}
