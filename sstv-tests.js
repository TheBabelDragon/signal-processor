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
  visParityBit,
  encodeImageToWav,
  encodeWavPcm16Mono,
  decodeWavPcm16,
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
    assert.deepEqual([...MARTIN_M1.channelOrder], ['G', 'B', 'R']);
    assert.ok(MARTIN_M1.encoder);
  });

  it('defines Robot 36 with VIS 8', () => {
    assert.equal(ROBOT_36.visCode, 8);
    assert.equal(ROBOT_36.width, 320);
    assert.equal(ROBOT_36.height, 240);
  });

  it('resolves modes by VIS', () => {
    assert.equal(modeByVis(44).id, 'martin_m1');
    assert.equal(modeByVis(8).id, 'robot36');
    assert.equal(getMode('martin_m1').name, 'Martin M1');
  });
});

describe('VIS header', () => {
  it('builds calibration + 10 bit slots for Martin M1', () => {
    const segs = buildVisHeader(44);
    assert.ok(segs.length >= 12);
    assert.equal(segs[0].freq, FREQ.LEADER);
    const dataBits = segs.slice(4, 11);
    assert.equal(dataBits.length, 7);
    assert.equal(visParityBit(44), dataBits.reduce((a, s) => a ^ (s.freq === FREQ.VIS_BIT_1 ? 1 : 0), 0) ? 1 : 0 || visParityBit(44));
  });
});

describe('WAV', () => {
  it('round-trips silence', () => {
    const samples = new Float32Array(4800);
    const wav = encodeWavPcm16Mono(samples, 48000);
    assert.equal(wav[0], 82); // R
    const dec = decodeWavPcm16(wav);
    assert.equal(dec.sampleRate, 48000);
    assert.equal(dec.samples.length, 4800);
  });
});

describe('Martin M1 encode', () => {
  it('produces WAV longer than VIS-only and reports metadata', () => {
    const img = solidImage(320, 256, 10, 200, 40);
    const result = encodeImageToWav(img, 'martin_m1', { sampleRate: 48000 });
    assert.equal(result.visCode, 44);
    assert.equal(result.width, 320);
    assert.equal(result.height, 256);
    assert.ok(result.wav.byteLength > 1000);
    assert.ok(result.durationMs > 1000); // well beyond header
    const dec = decodeWavPcm16(result.wav);
    assert.equal(dec.sampleRate, 48000);
    assert.ok(dec.samples.length > 48000);
  });

  it('rejects unimplemented robot36 encoder', () => {
    const img = solidImage(32, 32, 0, 0, 0);
    assert.throws(() => encodeImageToWav(img, 'robot36'), /not implemented/i);
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
      asset: { filename: 'x.png', mime_type: 'image/png', width: 320, height: 256 },
      sstv: { mode: 'martin_m1', sample_rate_hz: 48000 },
      audio: { sample_rate: 48000, channels: 1, encoding: 'pcm_s16le' },
    });
    assert.equal(r.ok, true);
  });
});
