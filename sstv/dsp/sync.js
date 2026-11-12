/**
 * Scanline synchronization and timing recovery for SSTV.
 */

import { estimateFreq } from '../decoder/tone-estimator.js';

export function scoreSync(samples, index, syncLen, sampleRate) {
  if (index < 0 || index + syncLen > samples.length) {
    return { index, score: 0, freq: 0 };
  }
  const { freq, strength } = estimateFreq(samples, index, syncLen, sampleRate, [1200, 1500, 1900]);
  const freqScore = Math.max(0, 1 - Math.abs(freq - 1200) / 150);
  let energy = 0;
  for (let i = 0; i < syncLen; i++) energy += samples[index + i] * samples[index + i];
  energy = Math.sqrt(energy / syncLen);
  const score = freqScore * strength * (0.5 + 0.5 * Math.min(1, energy * 3));
  return { index, score, freq };
}

export function findSyncNear(samples, expectedPos, syncLen, sampleRate, searchRadiusSamples) {
  const radius = searchRadiusSamples ?? Math.round(0.015 * sampleRate);
  const start = Math.max(0, Math.floor(expectedPos - radius));
  const end = Math.min(samples.length - syncLen, Math.ceil(expectedPos + radius));
  let best = { index: Math.round(expectedPos), score: 0, freq: 0 };
  const step = Math.max(1, Math.floor(syncLen / 16));
  for (let i = start; i <= end; i += step) {
    const s = scoreSync(samples, i, syncLen, sampleRate);
    if (s.score > best.score) best = s;
  }
  const fineStart = Math.max(start, best.index - step);
  const fineEnd = Math.min(end, best.index + step);
  for (let i = fineStart; i <= fineEnd; i++) {
    const s = scoreSync(samples, i, syncLen, sampleRate);
    if (s.score > best.score) best = s;
  }
  return best;
}

export function acquireFirstSync(samples, from, syncLen, sampleRate, maxSearchMs = 800) {
  const maxSamples = Math.round((maxSearchMs / 1000) * sampleRate);
  const end = Math.min(samples.length - syncLen, from + maxSamples);
  let best = { index: from, score: 0, freq: 0 };
  const step = Math.max(1, Math.floor(syncLen / 8));
  for (let i = Math.max(0, from); i < end; i += step) {
    const s = scoreSync(samples, i, syncLen, sampleRate);
    if (s.score > best.score) best = s;
  }
  return best.score > 0.05 ? best : null;
}

export class LineTimingTracker {
  constructor(nominalLineSamples, syncLen, sampleRate) {
    this.nominal = nominalLineSamples;
    this.syncLen = syncLen;
    this.sampleRate = sampleRate;
    this.lineSamples = nominalLineSamples;
    this.phaseErrorEma = 0;
    this.confidence = 0;
    this.history = [];
  }

  update(detectedIndex, expectedIndex, score) {
    const err = detectedIndex - expectedIndex;
    this.phaseErrorEma = 0.7 * this.phaseErrorEma + 0.3 * err;
    if (score > 0.1) {
      this.lineSamples = 0.95 * this.lineSamples + 0.05 * (this.lineSamples + err);
      const maxDev = this.nominal * 0.02;
      if (this.lineSamples > this.nominal + maxDev) this.lineSamples = this.nominal + maxDev;
      if (this.lineSamples < this.nominal - maxDev) this.lineSamples = this.nominal - maxDev;
    }
    this.confidence = 0.8 * this.confidence + 0.2 * Math.min(1, score * 2);
    this.history.push({ detectedIndex, expectedIndex, err, score });
    if (this.history.length > 32) this.history.shift();
    return {
      correctedIndex: detectedIndex,
      lineSamples: this.lineSamples,
      phaseError: this.phaseErrorEma,
      confidence: this.confidence,
    };
  }

  nextExpected(from) {
    return from + this.lineSamples;
  }
}
