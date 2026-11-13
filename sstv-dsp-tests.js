/**
 * DSP unit tests — I/Q alignment, tone recovery, mode-aware filtering, delay measurement.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  demodulateFM,
  measureDemodDelay,
  recommendedPostFilterHz,
  onePoleLagSamples,
} from './sstv/dsp/fm-demod.js';

const TWO_PI = Math.PI * 2;

function synthTone(freqHz, sampleRate, durationSec, amp = 0.5) {
  const n = Math.round(durationSec * sampleRate);
  const samples = new Float32Array(n);
  let phase = 0;
  const d = (TWO_PI * freqHz) / sampleRate;
  for (let i = 0; i < n; i++) {
    samples[i] = amp * Math.sin(phase);
    phase += d;
    if (phase > TWO_PI) phase -= TWO_PI;
  }
  return samples;
}

function synthStep(f0, f1, sampleRate, preSec, postSec) {
  const nPre = Math.round(preSec * sampleRate);
  const nPost = Math.round(postSec * sampleRate);
  const samples = new Float32Array(nPre + nPost);
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const f = i < nPre ? f0 : f1;
    phase += (TWO_PI * f) / sampleRate;
    if (phase > TWO_PI) phase -= TWO_PI;
    samples[i] = 0.5 * Math.sin(phase);
  }
  return { samples, stepIndex: nPre };
}

describe('I/Q alignment and tone recovery', () => {
  for (const sr of [44100, 48000]) {
    for (const f of [1500, 1700, 1900, 2100, 2300]) {
      it(`recovers ${f} Hz @ ${sr}`, () => {
        const samples = synthTone(f, sr, 0.05);
        const { freq, iqAligned } = demodulateFM(samples, sr, {
          postFilterHz: 1500,
          measureDelay: false,
        });
        assert.equal(iqAligned, true);
        let sum = 0, cnt = 0;
        for (let i = Math.floor(freq.length * 0.3); i < Math.floor(freq.length * 0.9); i++) {
          sum += freq[i];
          cnt++;
        }
        const mean = sum / cnt;
        assert.ok(Math.abs(mean - f) < 40, `mean ${mean.toFixed(1)} vs ${f}`);
      });
    }
  }
});

describe('frequency step transition', () => {
  it('crosses midpoint near the true step (aligned I/Q)', () => {
    const sr = 48000;
    const { samples, stepIndex } = synthStep(1500, 2300, sr, 0.03, 0.03);
    const { freq } = demodulateFM(samples, sr, { postFilterHz: 2000, measureDelay: false });
    let cross = -1;
    for (let i = stepIndex; i < freq.length; i++) {
      if (freq[i] >= 1900) {
        cross = i;
        break;
      }
    }
    assert.ok(cross >= 0, 'must cross 1900 Hz');
    const lag = cross - stepIndex;
    assert.ok(lag < 80, `lag ${lag} samples too large`);
  });
});

describe('mode-aware post-filter', () => {
  it('Robot chroma pixel yields higher cutoff than Martin', () => {
    const sr = 48000;
    const martinPx = (146.432e-3 * sr) / 320;
    const robotChromaPx = (44e-3 * sr) / 320;
    const mHz = recommendedPostFilterHz(martinPx, sr);
    const rHz = recommendedPostFilterHz(robotChromaPx, sr);
    assert.ok(rHz > mHz, `robot ${rHz} should exceed martin ${mHz}`);
    const tau = onePoleLagSamples(rHz, sr);
    assert.ok(tau < robotChromaPx * 0.8, `tau ${tau} vs pixel ${robotChromaPx}`);
  });
});

describe('measured demod delay', () => {
  it('returns finite non-negative lag @ 48k', () => {
    const d = measureDemodDelay(48000, 1500, 0.02);
    assert.ok(d != null);
    assert.ok(d >= 0 && d < 120, `delay ${d}`);
  });
});
