/**
 * Shared absolute sample-boundary timing for SSTV encoder and decoder.
 *
 * Principle:
 *   start(x) = round(x * scanSamples / width)
 *   end(x)   = round((x + 1) * scanSamples / width)
 *
 * Guarantees sum of pixel intervals === exact scan sample count
 * and identical encoder/decoder contracts.
 */

export function msToSamples(ms, sampleRate) {
  return Math.max(0, Math.round((Number(ms) / 1000) * sampleRate));
}

export function pixelBoundaries(width, scanSamples) {
  const w = Math.max(1, width | 0);
  const n = Math.max(0, scanSamples | 0);
  const starts = new Int32Array(w);
  const ends = new Int32Array(w);
  const lengths = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    starts[x] = Math.round((x * n) / w);
    ends[x] = Math.round(((x + 1) * n) / w);
    lengths[x] = ends[x] - starts[x];
  }
  return { starts, ends, lengths };
}

export function assertPixelSum(width, scanSamples) {
  const { lengths } = pixelBoundaries(width, scanSamples);
  let sum = 0;
  for (let i = 0; i < lengths.length; i++) sum += lengths[i];
  if (sum !== scanSamples) {
    throw new Error(
      `pixel length sum ${sum} !== scanSamples ${scanSamples} (width=${width})`
    );
  }
  return true;
}

export function buildLinePlan(timing, width, sampleRate, family = 'martin') {
  const syncSamples = msToSamples(timing.syncPulseMs, sampleRate);
  const porchSamples = msToSamples(timing.syncPorchMs, sampleRate);

  if (family === 'robot') {
    const yScanSamples = msToSamples(timing.yScanMs, sampleRate);
    const sepSamples = msToSamples(timing.sepPulseMs, sampleRate);
    const cPorchSamples = msToSamples(timing.chromaPorchMs, sampleRate);
    const cScanSamples = msToSamples(timing.chromaScanMs, sampleRate);
    const yBounds = pixelBoundaries(width, yScanSamples);
    const cBounds = pixelBoundaries(width, cScanSamples);
    assertPixelSum(width, yScanSamples);
    assertPixelSum(width, cScanSamples);
    return {
      family: 'robot',
      sampleRate,
      width,
      syncSamples,
      porchSamples,
      yScanSamples,
      sepSamples,
      cPorchSamples,
      cScanSamples,
      yBounds,
      cBounds,
      lineSamples:
        syncSamples +
        porchSamples +
        yScanSamples +
        sepSamples +
        cPorchSamples +
        cScanSamples,
    };
  }

  const scanSamples = msToSamples(timing.scanMs, sampleRate);
  const sepSamples = msToSamples(timing.sepPulseMs, sampleRate);
  const bounds = pixelBoundaries(width, scanSamples);
  assertPixelSum(width, scanSamples);
  return {
    family: 'martin',
    sampleRate,
    width,
    syncSamples,
    porchSamples,
    scanSamples,
    sepSamples,
    bounds,
    channelSamples: scanSamples + sepSamples,
    lineSamples:
      syncSamples + porchSamples + 3 * (scanSamples + sepSamples),
  };
}

export function synthesizeScanFromBounds(values, bounds, sampleRate, phase, valueToFreq) {
  const n = bounds.ends[bounds.ends.length - 1] || 0;
  const out = new Float32Array(n);
  let ph = phase;
  const twoPi = Math.PI * 2;
  for (let x = 0; x < values.length; x++) {
    const start = bounds.starts[x];
    const end = bounds.ends[x];
    const freq = valueToFreq(values[x]);
    const w = (twoPi * freq) / sampleRate;
    for (let i = start; i < end; i++) {
      out[i] = Math.sin(ph);
      ph += w;
      if (ph > twoPi) ph -= twoPi;
      else if (ph < -twoPi) ph += twoPi;
    }
  }
  return { samples: out, phase: ph };
}

export function synthesizeToneSamples(freq, nSamples, sampleRate, phase) {
  const out = new Float32Array(nSamples);
  let ph = phase;
  const w = (2 * Math.PI * freq) / sampleRate;
  const twoPi = Math.PI * 2;
  for (let i = 0; i < nSamples; i++) {
    out[i] = Math.sin(ph);
    ph += w;
    if (ph > twoPi) ph -= twoPi;
  }
  return { samples: out, phase: ph };
}
