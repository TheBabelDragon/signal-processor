/**
 * SSTV unit tests — run: node --test sstv-tests.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARTIN_M1,
  ROBOT_36,
  getMode,
  modeByVis,
  buildVisHeader,
  encodeImageToWav,
  encodeWavPcm16Mono,
  decodeWavPcm16,
  decodeAudio,
  solidImage,
  validateMediaJobManifest,
  CONTRACT_VERSION,
  FREQ,
} from './sstv/index.js';

describe('mode registry', () => {
  it('defines Martin M1 with VIS 44 and 320x256', () => {
    assert.equal(MARTIN_M1.visCode, 44);
    assert.equal(MARTIN_M1.width, 320);
    assert.equal(MARTIN_M1.height, 256);
    assert.ok(MARTIN_M1.encoder);
    assert.ok(MARTIN_M1.decoder);
  });

  it('defines Robot 36 with VIS 8', () => {
    assert.equal(ROBOT_36.visCode, 8);
    assert.equal(modeByVis(8).id, 'robot36');
    assert.equal(getMode('martin_m1').name, 'Martin M1');
  });
});

describe('VIS header', () => {
  it('builds calibration segments', () => {
    const segs = buildVisHeader(44);
    assert.ok(segs.length >= 12);
    assert.equal(segs[0].freq, FREQ.LEADER);
  });
});

describe('WAV', () => {
  it('round-trips silence', () => {
    const samples = new Float32Array(4800);
    const wav = encodeWavPcm16Mono(samples, 48000);
    const dec = decodeWavPcm16(wav);
    assert.equal(dec.sampleRate, 48000);
    assert.equal(dec.samples.length, 4800);
  });
});

describe('Martin M1 encode', () => {
  it('produces WAV with metadata', () => {
    const img = solidImage(320, 256, 10, 200, 40);
    const result = encodeImageToWav(img, 'martin_m1', { sampleRate: 48000 });
    assert.equal(result.visCode, 44);
    assert.ok(result.durationMs > 1000);
    assert.ok(decodeWavPcm16(result.wav).samples.length > 48000);
  });

  it('rejects unimplemented robot36 encoder', () => {
    assert.throws(() => encodeImageToWav(solidImage(8, 8, 0, 0, 0), 'robot36'), /not implemented/i);
  });
});

describe('Martin M1 round-trip', () => {
  it('reconstructs dimensions and approximate solid color', () => {
    // Use fewer visual degrees of freedom: mid green-dominant solid
    const src = solidImage(320, 256, 40, 180, 60);
    const encoded = encodeImageToWav(src, 'martin_m1', { sampleRate: 48000 });
    const decoded = decodeAudio(encoded.wav, { modeHint: 'martin_m1' });

    assert.equal(decoded.image.width, 320);
    assert.equal(decoded.image.height, 256);
    assert.ok(decoded.linesDecoded >= 200, `linesDecoded=${decoded.linesDecoded}`);
    assert.ok(decoded.syncScore >= 0.5, `syncScore=${decoded.syncScore}`);

    // Sample center pixel — FM path is lossy; allow wide but biased tolerance
    const cx = 160;
    const cy = 128;
    const i = (cy * 320 + cx) * 4;
    const r = decoded.image.data[i];
    const g = decoded.image.data[i + 1];
    const b = decoded.image.data[i + 2];
    // Green channel should dominate for this solid
    assert.ok(g > r && g > b, `expected green-dominant got rgb(${r},${g},${b})`);
  });
});

describe('manifest contract', () => {
  it('accepts BabelCodec-shaped v1 job', () => {
    const r = validateMediaJobManifest({
      contract_version: CONTRACT_VERSION,
      job_id: 'j1',
      created_at: new Date().toISOString(),
      source_application: 'BabelCodec',
      operation: 'image_to_sstv',
      asset: { filename: 'x.png', mime_type: 'image/png' },
      sstv: { mode: 'martin_m1', sample_rate_hz: 48000 },
      audio: { sample_rate: 48000, channels: 1, encoding: 'pcm_s16le' },
    });
    assert.equal(r.ok, true);
  });
});
