/**
 * Continuous-phase FM tone synthesis into Float32 samples [-1, 1].
 */

/**
 * @param {{ freq: number, ms: number }[]} segments
 * @param {number} sampleRate
 * @param {{ phase?: number }} [opts]
 * @returns {{ samples: Float32Array, phase: number }}
 */
export function synthesizeSegments(segments, sampleRate, opts = {}) {
  const sr = sampleRate || 48000;
  let phase = opts.phase || 0;
  let total = 0;
  for (const s of segments) {
    total += Math.max(0, Math.round((s.ms / 1000) * sr));
  }
  const out = new Float32Array(total);
  let o = 0;
  for (const s of segments) {
    const n = Math.max(0, Math.round((s.ms / 1000) * sr));
    const w = (2 * Math.PI * s.freq) / sr;
    for (let i = 0; i < n; i++) {
      out[o++] = Math.sin(phase);
      phase += w;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
    }
  }
  return { samples: out, phase };
}

/**
 * Concatenate Float32Arrays with continuous phase already baked into samples.
 * @param {Float32Array[]} parts
 */
export function concatFloat32(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
