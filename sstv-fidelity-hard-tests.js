/**
 * Harder fidelity cases — colors, edges, fine features, both rates.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeImageToWav,
  decodeAudio,
  solidImage,
  normalizeImage,
  gradientImage,
} from './sstv/index.js';
import { computeFidelityMetrics } from './sstv/dsp/metrics.js';

function solid(r, g, b, w, h) {
  return normalizeImage(solidImage(w, h, r, g, b), w, h);
}

function verticalStripes(w, h, stripeW, colors) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colors[Math.floor(x / stripeW) % colors.length];
      const i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

function roundTrip(img, modeId, sr) {
  const encoded = encodeImageToWav(img, modeId, { sampleRate: sr });
  const decoded = decodeAudio(encoded.wav, { modeHint: modeId });
  const metrics = computeFidelityMetrics(img, decoded.image, { requireExactDimensions: true });
  return { decoded, metrics };
}

describe('Martin M1 primary colors @ 48k', () => {
  const colors = [
    ['red', 220, 30, 30],
    ['green', 30, 200, 40],
    ['blue', 30, 40, 220],
    ['yellow', 220, 220, 30],
    ['cyan', 30, 220, 220],
    ['magenta', 220, 30, 220],
  ];
  for (const [name, r, g, b] of colors) {
    it(`solid ${name}`, () => {
      const src = solid(r, g, b, 320, 256);
      const { decoded, metrics } = roundTrip(src, 'martin_m1', 48000);
      console.log(`  martin ${name} MAE`, metrics.mae.toFixed(2), 'shift', metrics.horizontalShift);
      assert.ok(decoded.linesDecoded >= 240);
      assert.ok(metrics.dimensionMatch);
      assert.ok(metrics.mae < 25, `MAE ${metrics.mae}`);
    });
  }
});

describe('Martin M1 edges and fine features', () => {
  it('narrow vertical stripes 4px @ 48k', () => {
    const src = verticalStripes(320, 256, 4, [
      [220, 30, 30], [30, 200, 40], [30, 40, 220], [220, 220, 220],
    ]);
    const { decoded, metrics } = roundTrip(src, 'martin_m1', 48000);
    console.log('  stripes4 MAE', metrics.mae.toFixed(2), 'localSsim', metrics.localSsim.toFixed(3));
    assert.ok(decoded.linesDecoded >= 240);
    assert.ok(metrics.mae < 70);
  });

  it('2px stripes @ 48k (hard)', () => {
    const src = verticalStripes(320, 256, 2, [[255, 255, 255], [0, 0, 0]]);
    const { metrics } = roundTrip(src, 'martin_m1', 48000);
    console.log('  stripes2 MAE', metrics.mae.toFixed(2));
    assert.ok(metrics.mae < 110);
  });
});

describe('Robot 36 chroma-sensitive patterns', () => {
  it('solid primaries recover better with chroma-preserving filter', () => {
    const src = solid(200, 40, 40, 320, 240);
    const { decoded, metrics } = roundTrip(src, 'robot36', 48000);
    console.log('  robot red MAE', metrics.mae.toFixed(2), 'post?', decoded.diagnostics?.postFilterHz);
    assert.ok(decoded.linesDecoded >= 220);
    assert.ok(metrics.mae < 55);
  });

  it('vertical chroma boundary 8px', () => {
    const src = verticalStripes(320, 240, 8, [[220, 40, 40], [40, 40, 220]]);
    const { metrics } = roundTrip(src, 'robot36', 48000);
    console.log('  robot chroma stripes MAE', metrics.mae.toFixed(2));
    assert.ok(metrics.mae < 90);
  });

  it('gradient MAE tightened vs old threshold', () => {
    const src = normalizeImage(gradientImage(320, 240, 'x'), 320, 240);
    const { metrics } = roundTrip(src, 'robot36', 48000);
    console.log('  robot gradient MAE', metrics.mae.toFixed(2));
    assert.ok(metrics.mae < 70);
  });
});

describe('both sample rates', () => {
  for (const sr of [44100, 48000]) {
    it(`Martin solid green @ ${sr}`, () => {
      const src = solid(40, 180, 60, 320, 256);
      const { metrics } = roundTrip(src, 'martin_m1', sr);
      assert.ok(metrics.mae < 20);
    });
  }
});
