/**
 * Continuous FM demodulator for SSTV.
 *
 * Analytic signal (Hilbert FIR) → phase-difference instantaneous frequency
 * → amplitude-gated one-pole post-filter. delaySamples accounts for Hilbert
 * group delay plus approximate post-filter lag so pixel sampling lines up
 * with the transmission timeline.
 */

const TWO_PI = Math.PI * 2;
const BLACK_HZ = 1500;
const SPAN_HZ = 800;

function lpfCoeff(cutoffHz, sampleRate) {
  const x = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  return 1 - x;
}

/** Approximate one-pole lag in samples (63% step response). */
function onePoleLagSamples(cutoffHz, sampleRate) {
  const a = lpfCoeff(cutoffHz, sampleRate);
  if (a <= 1e-6) return 0;
  return Math.max(0, Math.round((1 - a) / a));
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
  return { h, delay: mid };
}

const HILBERT = makeHilbertKernel(31);

function firFilter(input, kernel) {
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
  const postHz = opts.postFilterHz ?? 700;
  const minAmp = opts.minAmp ?? 0.02;

  const aPre = lpfCoeff(preHz, sampleRate);
  const filtered = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += aPre * (samples[i] - y);
    filtered[i] = y;
  }

  const q = firFilter(filtered, HILBERT.h);
  const delay = HILBERT.delay;
  const iSig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i - delay;
    iSig[i] = j >= 0 ? filtered[j] : 0;
  }

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
    freq[i] = dphi * srOverTwoPi;
    prevI = ii;
    prevQ = qq;
  }

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

  // Align pixel sampling with transmission time: Hilbert + post-filter lag
  const postLag = onePoleLagSamples(postHz, sampleRate);
  // Cap post lag — full 63% lag over-corrects short pixels; use ~half
  const delaySamples = delay + Math.min(postLag, Math.round(postLag * 0.45));

  return { freq, amp, delaySamples };
}

export function freqToValueTrack(freq) {
  const out = new Float32Array(freq.length);
  for (let i = 0; i < freq.length; i++) {
    const v = (freq[i] - BLACK_HZ) / SPAN_HZ;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

export function samplePixels(values, baseOffset, bounds, method = 'center60') {
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
      let sum = 0,
        cnt = 0;
      const lo = Math.max(0, a),
        hi = Math.min(n, b);
      for (let i = lo; i < hi; i++) {
        sum += values[i];
        cnt++;
      }
      out[x] = cnt ? sum / cnt : 0;
    } else {
      // center 50% — slightly less edge bleed into separator than 60%
      const margin = Math.max(0, Math.floor(len * 0.25));
      let sum = 0,
        cnt = 0;
      const lo = Math.max(0, a + margin);
      const hi = Math.min(n, b - margin);
      for (let i = lo; i < hi; i++) {
        sum += values[i];
        cnt++;
      }
      if (!cnt) {
        const c = (a + b) >> 1;
        out[x] = c >= 0 && c < n ? values[c] : 0;
      } else out[x] = sum / cnt;
    }
  }
  return out;
}

export function demodulateToValues(samples, sampleRate, opts = {}) {
  const { freq, amp, delaySamples } = demodulateFM(samples, sampleRate, opts);
  return { values: freqToValueTrack(freq), amp, delaySamples, freq };
}
