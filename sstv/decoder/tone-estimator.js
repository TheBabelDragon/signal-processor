/**
 * Lightweight frequency estimation for SSTV tone range (~1100–2300 Hz).
 * Goertzel magnitude peak over a short candidate set + refined interpolation.
 */

/**
 * @param {Float32Array|number[]} samples
 * @param {number} start
 * @param {number} length
 * @param {number} sampleRate
 * @param {number[]} candidatesHz
 * @returns {{ freq: number, strength: number }}
 */
export function estimateFreq(samples, start, length, sampleRate, candidatesHz) {
  const n = Math.max(1, Math.min(length, samples.length - start));
  if (n < 8) return { freq: 1500, strength: 0 };

  let bestF = candidatesHz[0] || 1500;
  let bestM = -1;
  for (const f of candidatesHz) {
    const m = goertzelMag(samples, start, n, sampleRate, f);
    if (m > bestM) {
      bestM = m;
      bestF = f;
    }
  }
  // Local refine ±40 Hz
  let refined = bestF;
  let refinedM = bestM;
  for (let df = -40; df <= 40; df += 10) {
    const f = bestF + df;
    if (f < 1000 || f > 2400) continue;
    const m = goertzelMag(samples, start, n, sampleRate, f);
    if (m > refinedM) {
      refinedM = m;
      refined = f;
    }
  }
  return { freq: refined, strength: refinedM };
}

function goertzelMag(samples, start, n, sr, freq) {
  const w = (2 * Math.PI * freq) / sr;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    s0 = samples[start + i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return power > 0 ? Math.sqrt(power) / n : 0;
}

/** Map frequency to 0..1 luma/chroma value (black 1500 … white 2300). */
export function freqToValue(freq) {
  const v = (Number(freq) - 1500) / 800;
  return Math.max(0, Math.min(1, v));
}

export const SSTV_CANDIDATES = (() => {
  const a = [];
  for (let f = 1100; f <= 2300; f += 25) a.push(f);
  return a;
})();
