/**
 * Scanline synchronization and timing recovery for SSTV.
 */

import { estimateFreq } from '../decoder/tone-estimator.js';

const MIN_SYNC_SCORE = 0.05;
const REJECT_SCORE = 0.03;

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
  return best.score > MIN_SYNC_SCORE ? best : null;
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
    this.lastAccepted = null;
    this.periodEma = nominalLineSamples;
    this.driftPpm = 0;
    this.accepted = 0;
    this.rejected = 0;
  }

  update(detectedIndex, expectedIndex, score) {
    if (score < REJECT_SCORE) {
      this.rejected++;
      this.confidence = Math.max(0, this.confidence * 0.85);
      return {
        accepted: false,
        confidence: this.confidence,
        lineSamples: this.lineSamples,
        phaseError: 0,
        driftPpm: this.driftPpm,
      };
    }

    const err = detectedIndex - expectedIndex;
    this.phaseErrorEma = this.phaseErrorEma * 0.7 + err * 0.3;

    if (this.lastAccepted != null) {
      const period = detectedIndex - this.lastAccepted;
      if (period > this.nominal * 0.85 && period < this.nominal * 1.15) {
        this.periodEma = this.periodEma * 0.85 + period * 0.15;
        this.lineSamples = this.periodEma;
        this.driftPpm = ((this.periodEma - this.nominal) / this.nominal) * 1e6;
      }
    }

    this.lineSamples = this.periodEma + this.phaseErrorEma * 0.15;
    this.confidence = Math.min(1, this.confidence * 0.9 + score * 0.25);
    this.lastAccepted = detectedIndex;
    this.accepted++;
    this.history.push({ detectedIndex, expectedIndex, score, err });
    if (this.history.length > 32) this.history.shift();

    return {
      accepted: true,
      confidence: this.confidence,
      lineSamples: this.lineSamples,
      phaseError: err,
      driftPpm: this.driftPpm,
    };
  }

  nextExpected(currentSyncIndex) {
    return currentSyncIndex + this.lineSamples;
  }

  alignmentReport() {
    const ppm = this.driftPpm;
    const aligned = this.accepted >= 8 && Math.abs(ppm) < 500 && this.confidence > 0.2;
    return {
      geometricallyAligned: aligned,
      acceptedSyncs: this.accepted,
      rejectedSyncs: this.rejected,
      estimatedLineSamples: this.lineSamples,
      nominalLineSamples: this.nominal,
      driftPpm: ppm,
      confidence: this.confidence,
    };
  }
}
