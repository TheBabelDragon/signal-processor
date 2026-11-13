import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSignal, classifyCapture } from './sstv/audio/signal-stats.js';
import { createAcousticLoopback } from './sstv/audio/acoustic-loopback.js';

describe('signal stats', () => {
  it('detects silence', () => {
    const s = analyzeSignal(new Float32Array(1000));
    assert.equal(s.silence, true);
    assert.equal(classifyCapture(s).ok, false);
  });
  it('reports RMS and peak on tone', () => {
    const n = 4800;
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) samples[i] = 0.25 * Math.sin((2 * Math.PI * 1500 * i) / 48000);
    const s = analyzeSignal(samples);
    assert.ok(s.rms > 0.1 && s.rms < 0.2);
    assert.equal(classifyCapture(s).ok, true);
  });
  it('detects clipping', () => {
    const samples = new Float32Array(1000);
    samples.fill(1);
    assert.equal(analyzeSignal(samples).clipped, true);
  });
});

describe('acoustic loopback API', () => {
  it('exposes run/cancel/isRunning', () => {
    const loop = createAcousticLoopback({
      capture: { start: async () => ({}), stop: () => ({ samples: new Float32Array(0), sampleRate: 48000 }), dispose() {} },
      playback: { play: async () => {}, stop() {}, dispose() {} },
    });
    assert.equal(typeof loop.run, 'function');
    assert.equal(typeof loop.cancel, 'function');
    assert.equal(loop.isRunning(), false);
  });
});
