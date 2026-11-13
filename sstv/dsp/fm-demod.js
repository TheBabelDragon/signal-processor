/**
 * Continuous FM demodulator for SSTV.
 *
 * Analytic signal: centered (zero-phase) Hilbert FIR for Q, real I taken at the
 * same sample index — I/Q are time-aligned. Phase-difference instantaneous
 * frequency, optional amplitude-gated one-pole post-filter.
 *
 * delaySamples is measured from a synthetic frequency step when possible;
 * falls back to a documented Hilbert=0 (aligned) + post-filter lag estimate.
 */

const TWO_PI = Math.PI * 2;
const BLACK_HZ = 1500;
const SPAN_HZ = 800;

function lpfCoeff(cutoffHz, sampleRate) {
  const x = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  return 1 - x;
}

/** Approximate one-pole lag in samples (63% step response). */
export function onePoleLagSamples(cutoffHz, sampleRate) {
  const a = lpfCoeff(cutoffHz, sampleRate);
  if (a <= 1e-6) return 0;
  return Math.max(0, Math.round((1 - a) / a));
}

/**
 * Suggested post-filter Hz from shortest pixel interval.
 * τ ≈ 1/(2π f) must be << pixel duration so chroma/pixel edges survive.
 */
export function recommendedPostFilterHz(shortestPixelSamples, sampleRate) {
  if (!shortestPixelSamples || shortestPixelSamples <= 0) return 1200;
  const targetTau = Math.max(1, shortestPixelSamples * 0.25);
  const hz = sampleRate / (TWO_PI * targetTau);
  return Math.max(800, Math.min(4000, Math.round(hz)));
}

function makeHilbertKernel(length = 31) {
  const n = length | 1;
  const h = new Float64Array(n);
  const mid = (n - 1) >> 1;
  for (let i = 0; i < n; i++) {
    const k = i - mid;
    if (k === 0 || k % 2 === 0) h[i] = 0;
    else h[i] = 2 / (Math.PI * k);
  }
  for (let i = 0; i < n; i++) {
    h[i] *= 0.54 - 0.46 * Math.cos((TWO_PI * i) / (n - 1));
  }
  return { h, mid };
}

const HILBERT = makeHilbertKernel(31);

function firFilterCentered(input, kernel) {
  const n = input.length;
  const m = kernel.length;
  const mid = (m - 1) >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < m; k++) {
      const j = i + k - mid;
      if (j >= 0 && j < n) s += input[j] * kernel[k];
    }
    out[i] = s;
  }
  return out;
}

export function demodulateFM(samples, sampleRate, opts = {}) {
  const n = samples.length;
  const preHz = opts.preFilterHz ?? 2800;
  const postHz = opts.postFilterHz ?? 1200;
  const minAmp = opts.minAmp ?? 0.02;

  const aPre = lpfCoeff(preHz, sampleRate);
  const filtered = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += aPre * (samples[i] - y);
    filtered[i] = y;
  }

  const q = firFilterCentered(filtered, HILBERT.h);
  const iSig = filtered;

  const freq = new Float32Array(n);
  const amp = new Float32Array(n);
  let prevI = iSig[0];
  let prevQ = q[0];
  const srOverTwoPi = sampleRate / TWO_PI;

  for (let i = 0; i < n; i++) {
    const ii = iSig[i];
    const qq = q[i];
    amp[i] = Math.hypot(ii, qq);
    const cross = prevI * qq - prevQ * ii;
    const dot = prevI * ii + prevQ * qq;
    const dphi = Math.atan2(cross, dot);
    freq[i] = -dphi * srOverTwoPi;
    prevI = ii;
    prevQ = qq;
  }

  if (postHz > 0) {
    const aPost = lpfCoeff(postHz, sampleRate);
    let fy = freq[0] || 1500;
    for (let i = 0; i < n; i++) {
      const f = freq[i];
      if (amp[i] < minAmp || !Number.isFinite(f)) {
        freq[i] = fy;
      } else {
        fy += aPost * (f - fy);
        freq[i] = fy;
      }
    }
  }

  let delaySamples = 0;
  if (postHz > 0) {
    const postLag = onePoleLagSamples(postHz, sampleRate);
    delaySamples = Math.round(postLag * 0.5);
  }

  if (opts.measureDelay) {
    const measured = measureDemodDelay(sampleRate, postHz, minAmp);
    if (measured != null) delaySamples = measured;
  }

  return {
    freq,
    amp,
    delaySamples,
    postFilterHz: postHz,
    iqAligned: true,
  };
}

export function measureDemodDelay(sampleRate, postFilterHz = 1200, minAmp = 0.02) {
  const sr = sampleRate;
  const nPre = Math.round(0.02 * sr);
  const nPost = Math.round(0.02 * sr);
  const n = nPre + nPost;
  const samples = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = i < nPre ? 1500 : 2300;
    phase += (TWO_PI * f) / sr;
    if (phase > TWO_PI) phase -= TWO_PI;
    samples[i] = Math.sin(phase);
  }
  const { freq } = demodulateFM(samples, sr, {
    postFilterHz,
    minAmp,
    measureDelay: false,
  });
  const target = 1900;
  let cross = -1;
  for (let i = nPre; i < n; i++) {
    if (freq[i] >= target) {
      cross = i;
      break;
    }
  }
  if (cross < 0) return null;
  return cross - nPre;
}

export function freqToValueTrack(freq) {
  const out = new Float32Array(freq.length);
  for (let i = 0; i < freq.length; i++) {
    const v = (freq[i] - BLACK_HZ) / SPAN_HZ;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

export function samplePixels(values, baseOffset, bounds, method = 'center50') {
  const w = bounds.starts.length;
  const out = new Float32Array(w);
  const n = values.length;
  for (let x = 0; x < w; x++) {
    const a = baseOffset + bounds.starts[x];
    const b = baseOffset + bounds.ends[x];
    const len = b - a;
    if (method === 'center') {
      const c = (a + b) >> 1;
      out[x] = c >= 0 && c < n ? values[c] : 0;
    } else if (method === 'mean') {
      let sum = 0, cnt = 0;
      const lo = Math.max(0, a), hi = Math.min(n, b);
      for (let i = lo; i < hi; i++) { sum += values[i]; cnt++; }
      out[x] = cnt ? sum / cnt : 0;
    } else {
      const margin = Math.max(0, Math.floor(len * 0.25));
      let sum = 0, cnt = 0;
      const lo = Math.max(0, a + margin);
      const hi = Math.min(n, b - margin);
      for (let i = lo; i < hi; i++) { sum += values[i]; cnt++; }
      if (!cnt) {
        const c = (a + b) >> 1;
        out[x] = c >= 0 && c < n ? values[c] : 0;
      } else out[x] = sum / cnt;
    }
  }
  return out;
}

export function demodulateToValues(samples, sampleRate, opts = {}) {
  const { freq, amp, delaySamples, postFilterHz, iqAligned } = demodulateFM(
    samples,
    sampleRate,
    opts
  );
  return {
    values: freqToValueTrack(freq),
    amp,
    delaySamples,
    freq,
    postFilterHz,
    iqAligned,
  };
}
