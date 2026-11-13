/**
 * SSTV stress tests — noise, level, mild clock skew.
 * Run: node --test sstv-stress-tests.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeImageToWav,
  decodeAudio,
  solidImage,
  gradientImage,
  normalizeImage,
  decodeWavPcm16,
  encodeWavPcm16Mono,
  MARTIN_M1,
} from './sstv/index.js';
import { computeFidelityMetrics } from './sstv/dsp/metrics.js';

function addWhiteNoise(samples, snrDb, seed = 1) {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  const sigRms = Math.sqrt(energy / Math.max(1, samples.length)) || 1e-6;
  const noiseRms = sigRms / Math.pow(10, snrDb / 20);
  let s = seed >>> 0 || 1;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const u = (s >>> 0) / 0xffffffff;
    const n = (u + ((s >>> 8) / 0xffffffff) + ((s >>> 16) / 0xffffffff) - 1.5) * 2;
    out[i] = samples[i] + n * noiseRms;
  }
  return out;
}

function scaleAmplitude(samples, gain) {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

/** Linear resample: ratio > 1 stretches (slower clock). */
function resampleLinear(samples, ratio) {
  const nOut = Math.max(1, Math.round(samples.length * ratio));
  const out = new Float32Array(nOut);
  for (let i = 0; i < nOut; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const f = src - i0;
    out[i] = samples[i0] * (1 - f) + samples[i1] * f;
  }
  return out;
}

function martinRoundTripFromSamples(samples, sampleRate, srcNormalized) {
  const wav = encodeWavPcm16Mono(samples, sampleRate);
  const decoded = decodeAudio(wav, { modeHint: 'martin_m1' });
  const metrics = computeFidelityMetrics(srcNormalized, decoded.image);
  return { decoded, metrics };
}

describe('Martin M1 stress: noise', () => {
  const sr = 48000;
  const src = normalizeImage(solidImage(320, 256, 40, 180, 60), 320, 256);
  const clean = encodeImageToWav(src, 'martin_m1', { sampleRate: sr });
  const pcm = decodeWavPcm16(clean.wav).samples;

  it('recovers solid at ~20 dB SNR', () => {
    const noisy = addWhiteNoise(pcm, 20, 42);
    const { decoded, metrics } = martinRoundTripFromSamples(noisy, sr, src);
    console.log('  SNR20 MAE', metrics.mae.toFixed(2), 'lines', decoded.linesDecoded);
    assert.ok(decoded.linesDecoded >= 200);
    assert.ok(metrics.mae < 45);
  });

  it('still gets most lines at ~12 dB SNR', () => {
    const noisy = addWhiteNoise(pcm, 12, 7);
    const { decoded, metrics } = martinRoundTripFromSamples(noisy, sr, src);
    console.log('  SNR12 MAE', metrics.mae.toFixed(2), 'lines', decoded.linesDecoded);
    assert.ok(decoded.linesDecoded >= 150);
    assert.ok(metrics.mae < 120);
  });
});

describe('Martin M1 stress: level', () => {
  const sr = 48000;
  const src = normalizeImage(solidImage(320, 256, 40, 180, 60), 320, 256);
  const clean = encodeImageToWav(src, 'martin_m1', { sampleRate: sr });
  const pcm = decodeWavPcm16(clean.wav).samples;

  it('recovers at 0.25× amplitude', () => {
    const { decoded, metrics } = martinRoundTripFromSamples(scaleAmplitude(pcm, 0.25), sr, src);
    console.log('  0.25x MAE', metrics.mae.toFixed(2), 'lines', decoded.linesDecoded);
    assert.ok(decoded.linesDecoded >= 220);
    assert.ok(metrics.mae < 40);
  });
});

describe('Martin M1 stress: mild clock skew', () => {
  const sr = 48000;
  const src = normalizeImage(gradientImage(320, 256, 'x'), 320, 256);
  const clean = encodeImageToWav(src, 'martin_m1', { sampleRate: sr });
  const pcm = decodeWavPcm16(clean.wav).samples;

  it('tolerates +0.05% rate (stretched)', () => {
    const skewed = resampleLinear(pcm, 1.0005);
    const { decoded, metrics } = martinRoundTripFromSamples(skewed, sr, src);
    console.log('  +0.05% MAE', metrics.mae.toFixed(2), 'lines', decoded.linesDecoded, 'sync', decoded.syncScore.toFixed(2));
    assert.ok(decoded.linesDecoded >= 200);
    assert.ok(metrics.mae < 80);
  });

  it('tolerates -0.05% rate (compressed)', () => {
    const skewed = resampleLinear(pcm, 0.9995);
    const { decoded, metrics } = martinRoundTripFromSamples(skewed, sr, src);
    console.log('  -0.05% MAE', metrics.mae.toFixed(2), 'lines', decoded.linesDecoded);
    assert.ok(decoded.linesDecoded >= 200);
    assert.ok(metrics.mae < 80);
  });
});
