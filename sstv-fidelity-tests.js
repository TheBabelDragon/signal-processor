/**
 * SSTV v2 fidelity tests — quantitative clean-path round-trip.
 * Run: node --test sstv-fidelity-tests.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeImageToWav,
  decodeAudio,
  solidImage,
  colorBarsImage,
  gradientImage,
  checkerboardImage,
  channelImage,
  normalizeImage,
  pixelBoundaries,
  assertPixelSum,
  msToSamples,
  MARTIN_M1,
  ROBOT_36,
  rgbToRobot,
  robotToRgb,
} from './sstv/index.js';
import { computeFidelityMetrics } from './sstv/dsp/metrics.js';

describe('sample timing contract', () => {
  for (const sr of [44100, 48000]) {
    it(`pixel sum equals scan samples @ ${sr}`, () => {
      const n = msToSamples(MARTIN_M1.timing.scanMs, sr);
      assertPixelSum(320, n);
      const b = pixelBoundaries(320, n);
      let s = 0;
      for (const l of b.lengths) s += l;
      assert.equal(s, n);
    });
  }
});

describe('Robot color matrix round-trip', () => {
  it('rgb -> robot -> rgb preserves primaries', () => {
    const samples = [
      [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [0, 0, 0], [0.5, 0.2, 0.8],
    ];
    for (const [r, g, b] of samples) {
      const c = rgbToRobot(r, g, b);
      const back = robotToRgb(c.y, c.ry, c.by);
      assert.ok(Math.abs(back.r - r) < 1e-9);
      assert.ok(Math.abs(back.g - g) < 1e-9);
      assert.ok(Math.abs(back.b - b) < 1e-9);
    }
  });
});

function roundTrip(modeId, src, sampleRate) {
  const mode = modeId === 'martin_m1' ? MARTIN_M1 : ROBOT_36;
  const normalized = normalizeImage(src, mode.width, mode.height, { fit: 'stretch' });
  const encoded = encodeImageToWav(normalized, modeId, { sampleRate });
  const decoded = decodeAudio(encoded.wav, { modeHint: modeId });
  const metrics = computeFidelityMetrics(normalized, decoded.image);
  return { encoded, decoded, metrics, normalized };
}

describe('Martin M1 clean-path fidelity @ 48k', () => {
  const sr = 48000;

  it('solid green', () => {
    const { metrics, decoded } = roundTrip('martin_m1', solidImage(320, 256, 40, 180, 60), sr);
    console.log('  solid green MAE', metrics.mae.toFixed(2), 'PSNR', metrics.psnr.toFixed(1));
    assert.ok(decoded.linesDecoded >= 250);
    assert.ok(metrics.mae < 20);
    assert.ok(metrics.psnr > 18);
  });

  it('pure red channel', () => {
    const { metrics } = roundTrip('martin_m1', channelImage(320, 256, 'r', 200), sr);
    console.log('  pure R MAE', metrics.mae.toFixed(2), 'maeR', metrics.maeR.toFixed(2));
    assert.ok(metrics.mae < 40);
  });

  it('pure green channel', () => {
    const { metrics } = roundTrip('martin_m1', channelImage(320, 256, 'g', 200), sr);
    console.log('  pure G MAE', metrics.mae.toFixed(2));
    assert.ok(metrics.mae < 40);
  });

  it('pure blue channel', () => {
    const { metrics } = roundTrip('martin_m1', channelImage(320, 256, 'b', 200), sr);
    console.log('  pure B MAE', metrics.mae.toFixed(2));
    assert.ok(metrics.mae < 40);
  });

  it('horizontal gradient', () => {
    const { metrics } = roundTrip('martin_m1', gradientImage(320, 256, 'x'), sr);
    console.log('  gradient MAE', metrics.mae.toFixed(2), 'PSNR', metrics.psnr.toFixed(1), 'SSIM', metrics.ssim.toFixed(3));
    assert.ok(metrics.mae < 25);
    assert.ok(metrics.ssim > 0.85);
  });

  it('color bars', () => {
    const { metrics } = roundTrip('martin_m1', colorBarsImage(320, 256), sr);
    console.log('  color bars MAE', metrics.mae.toFixed(2), 'PSNR', metrics.psnr.toFixed(1));
    assert.ok(metrics.mae < 55);
  });

  it('checkerboard 8px', () => {
    const { metrics } = roundTrip('martin_m1', checkerboardImage(320, 256, 8), sr);
    console.log('  checker MAE', metrics.mae.toFixed(2), 'PSNR', metrics.psnr.toFixed(1));
    assert.ok(metrics.mae < 70);
  });
});

describe('Martin M1 clean-path fidelity @ 44.1k', () => {
  it('solid recovers', () => {
    const a = roundTrip('martin_m1', solidImage(320, 256, 40, 180, 60), 44100);
    console.log('  44.1k solid MAE', a.metrics.mae.toFixed(2), 'lines', a.decoded.linesDecoded);
    assert.ok(a.decoded.linesDecoded >= 240);
    assert.ok(a.metrics.mae < 35);
  });
});

describe('Robot 36 clean-path fidelity @ 48k', () => {
  const sr = 48000;

  it('solid green', () => {
    const { metrics, decoded } = roundTrip('robot36', solidImage(320, 240, 40, 180, 60), sr);
    console.log('  R36 solid MAE', metrics.mae.toFixed(2), 'PSNR', metrics.psnr.toFixed(1), 'lines', decoded.linesDecoded);
    assert.ok(decoded.linesDecoded >= 220);
    assert.ok(metrics.mae < 50);
  });

  it('horizontal gradient', () => {
    const { metrics } = roundTrip('robot36', gradientImage(320, 240, 'x'), sr);
    console.log('  R36 gradient MAE', metrics.mae.toFixed(2), 'SSIM', metrics.ssim.toFixed(3));
    assert.ok(metrics.mae < 80);
  });

  it('color bars', () => {
    const { metrics } = roundTrip('robot36', colorBarsImage(320, 240), sr);
    console.log('  R36 bars MAE', metrics.mae.toFixed(2));
    assert.ok(metrics.mae < 70);
  });
});
