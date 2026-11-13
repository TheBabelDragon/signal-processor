/**
 * Capture / buffer signal diagnostics for SSTV acoustic path.
 */

export function analyzeSignal(samples, opts = {}) {
  const n = samples.length;
  if (!n) {
    return {
      n: 0, rms: 0, peak: 0, peakDb: -Infinity, rmsDb: -Infinity,
      clippingFraction: 0, clippingPercent: 0, noiseFloorRms: 0,
      silence: true, lowLevel: true, clipped: false,
    };
  }
  let sumSq = 0, peak = 0, clipped = 0;
  const clipThresh = 0.99;
  for (let i = 0; i < n; i++) {
    const v = samples[i];
    const a = Math.abs(v);
    sumSq += v * v;
    if (a > peak) peak = a;
    if (a >= clipThresh) clipped++;
  }
  const rms = Math.sqrt(sumSq / n);
  const noiseN = Math.min(n, opts.noiseFloorSamples ?? Math.min(n, Math.round(n * 0.05) || 1));
  let noiseSq = 0;
  for (let i = 0; i < noiseN; i++) noiseSq += samples[i] * samples[i];
  const noiseFloorRms = Math.sqrt(noiseSq / noiseN);
  const clippingFraction = clipped / n;
  return {
    n, rms, peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
    clippingFraction,
    clippingPercent: clippingFraction * 100,
    noiseFloorRms,
    silence: rms < 1e-4,
    lowLevel: rms < 0.005,
    clipped: clippingFraction > 0.001,
  };
}

export function classifyCapture(stats, opts = {}) {
  if (!stats.n) return { ok: false, reason: 'empty_capture', message: 'No samples captured' };
  if (opts.minDurationSamples && stats.n < opts.minDurationSamples) {
    return { ok: false, reason: 'incomplete_capture', message: `Capture too short (${stats.n} < ${opts.minDurationSamples} samples)` };
  }
  if (stats.silence) return { ok: false, reason: 'silence', message: 'Capture is effectively silent' };
  if (stats.lowLevel) return { ok: true, warning: 'low_level', message: 'Input level very low — decoding may fail' };
  if (stats.clipped) return { ok: true, warning: 'clipping', message: `Clipping detected (${stats.clippingPercent.toFixed(2)}% samples)` };
  return { ok: true, message: 'Capture level OK' };
}
