/**
 * Riemann Spectral Engine
 *
 * Complex zeta evaluation, Hardy Z-function on the critical line,
 * bounded numerical zero detection, spacing statistics, spectral analysis.
 *
 * CRITICAL: Finite numerical verification is NOT a proof of RH.
 * Never silently classify an unverified root as a confirmed nontrivial zero.
 *
 * Every result records method, precision, residual, convergence, limits.
 */
"use strict";

const { Complex } = require("./complex.js");
const { fft, ifft } = require("./fft.js");

const ENGINE_VERSION = "riemann-spectral.v1";

/**
 * Reference zeros of ζ(1/2 + it) for validation (first 20 ordinates).
 * Sourced from Odlyzko / well-known tables. Used only for residual checks.
 */
const REFERENCE_ZEROS = [
  14.134725141734693,
  21.022039638771556,
  25.01085758014569,
  30.424876125859513,
  32.93506158773919,
  37.586178158825675,
  40.918719012147495,
  43.327073280915,
  48.00515088116716,
  49.7738324776723,
  52.97032147771446,
  56.44624769706339,
  59.34704400260235,
  60.83177852436781,
  65.1125440480816,
  67.07981052949417,
  69.54640171117398,
  72.0671576744819,
  75.70469069908393,
  77.1448400688748,
];

/**
 * Riemann-Siegel theta function (approximate).
 */
function theta(t) {
  if (t < 1) return 0;
  const logTerm = Math.log(t / (2 * Math.PI));
  return (t / 2) * logTerm - t / 2 - Math.PI / 8 + 1 / (48 * t);
}

/**
 * Simple series for zeta on critical line (slow, for moderate t).
 */
function zetaDirichlet(s, maxN = 2000) {
  let re = 0, im = 0;
  const sigma = s.re, t = s.im;
  for (let n = 1; n <= maxN; n++) {
    const ln = Math.log(n);
    const mag = Math.pow(n, -sigma);
    const ang = -t * ln;
    re += mag * Math.cos(ang);
    im += mag * Math.sin(ang);
  }
  return new Complex(re, im);
}

const { hardyZImproved, riemannSiegelZ, thetaRS } = require("./riemann-siegel.js");

function hardyZ(t, opts = {}) {
  return hardyZImproved(t, opts);
}

/**
 * Simple sign-change zero finder on an interval.
 * Returns candidates with residual |Z(t)|.
 * Does NOT claim they are proven zeros.
 */
function findZeroCandidates(tMin, tMax, opts = {}) {
  const step = opts.step || 0.01;
  const maxN = opts.maxN || 2000;
  const candidates = [];
  let prev = hardyZ(tMin, { maxN });
  let t = tMin + step;
  while (t <= tMax) {
    const cur = hardyZ(t, { maxN });
    if (prev.Z * cur.Z < 0 || Math.abs(cur.Z) < 1e-4) {
      // refine by bisection
      let a = t - step, b = t;
      let Za = prev.Z, Zb = cur.Z;
      for (let i = 0; i < 40; i++) {
        const m = (a + b) / 2;
        const Zm = hardyZ(m, { maxN }).Z;
        if (Za * Zm <= 0) {
          b = m; Zb = Zm;
        } else {
          a = m; Za = Zm;
        }
      }
      const tStar = (a + b) / 2;
      const final = hardyZ(tStar, { maxN });
      candidates.push({
        t: tStar,
        residual: Math.abs(final.Z),
        imagResidual: Math.abs(final.imagResidual || 0),
        method: "sign-change-bisection",
        precision: step / Math.pow(2, 40),
        convergence: Math.abs(final.Z) < 1e-6 ? "converged" : "weak",
        maxN,
        heightInterval: [tMin, tMax],
        referenceComparison: null,
      });
      t += step * 2;
      prev = hardyZ(t, { maxN });
      t += step;
      continue;
    }
    prev = cur;
    t += step;
  }
  return candidates;
}

/**
 * Compare candidates against reference zeros.
 */
function annotateWithReferences(candidates, refs = REFERENCE_ZEROS, tol = 0.05) {
  return candidates.map(c => {
    let best = null, bestDist = Infinity;
    for (const r of refs) {
      const d = Math.abs(c.t - r);
      if (d < bestDist) {
        bestDist = d;
        best = r;
      }
    }
    return {
      ...c,
      referenceComparison: best !== null && bestDist < tol
        ? { reference: best, distance: bestDist, matched: true }
        : { nearestReference: best, distance: bestDist, matched: false },
    };
  });
}

/**
 * Consecutive spacings and normalized statistics.
 */
function spacingStatistics(zeros) {
  if (zeros.length < 2) return { spacings: [], mean: null, normalized: [] };
  const sorted = zeros.map(z => z.t || z).sort((a, b) => a - b);
  const spacings = [];
  for (let i = 1; i < sorted.length; i++) {
    spacings.push(sorted[i] - sorted[i - 1]);
  }
  const mean = spacings.reduce((a, b) => a + b, 0) / spacings.length;
  const normalized = spacings.map((s, i) => {
    const t = sorted[i];
    const localMean = (2 * Math.PI) / Math.log(Math.max(t, 2) / (2 * Math.PI));
    return s / localMean;
  });
  return {
    spacings,
    mean,
    normalized,
    count: spacings.length,
  };
}

/**
 * Fourier / spectral density of a zero-derived sequence.
 */
function spectralDensityOfSequence(seq, opts = {}) {
  let n = seq.length;
  let N = 1;
  while (N < n * 2) N <<= 1;
  const arr = new Array(N);
  for (let i = 0; i < N; i++) {
    arr[i] = i < n ? new Complex(seq[i], 0) : Complex.zero();
  }
  fft(arr, true);
  const dens = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) dens[i] = arr[i].abs2() / N;
  return {
    density: Array.from(dens),
    nOriginal: n,
    nPadded: N,
  };
}

/**
 * Autocorrelation of a real sequence (via FFT).
 */
function autocorrelation(seq) {
  const n = seq.length;
  let N = 1;
  while (N < 2 * n) N <<= 1;
  const arr = new Array(N);
  for (let i = 0; i < N; i++) arr[i] = i < n ? new Complex(seq[i], 0) : Complex.zero();
  fft(arr, true);
  for (let i = 0; i < N; i++) {
    const a = arr[i];
    arr[i] = new Complex(a.re * a.re + a.im * a.im, 0);
  }
  ifft(arr);
  const ac = new Float64Array(n);
  const scale = arr[0].re !== 0 ? 1 / arr[0].re : 1;
  for (let i = 0; i < n; i++) ac[i] = arr[i].re * scale;
  return Array.from(ac);
}

/**
 * Full bounded zero experiment.
 */
function runZeroExperiment(config = {}) {
  const tMin = config.tMin ?? 10;
  const tMax = config.tMax ?? 50;
  const step = config.step ?? 0.02;
  const maxN = config.maxN ?? 3000;

  const raw = findZeroCandidates(tMin, tMax, { step, maxN });
  const annotated = annotateWithReferences(raw);
  const stats = spacingStatistics(annotated);
  const dens = spectralDensityOfSequence(stats.normalized.length ? stats.normalized : stats.spacings);
  const ac = autocorrelation(stats.spacings.length ? stats.spacings : [0]);

  const refsInRange = REFERENCE_ZEROS.filter(r => r >= tMin && r <= tMax);
  let matched = 0;
  for (const r of refsInRange) {
    if (annotated.some(c => c.referenceComparison && c.referenceComparison.matched && Math.abs(c.t - r) < 0.05)) {
      matched++;
    }
  }

  return {
    engine: ENGINE_VERSION,
    config: {
      tMin, tMax, step, maxN,
      units: "ordinate-t",
      criticalLine: "s = 1/2 + it",
    },
    candidates: annotated,
    spacingStatistics: stats,
    spectralDensity: dens,
    autocorrelation: ac,
    validation: {
      referenceZerosInInterval: refsInRange.length,
      matchedCandidates: matched,
      note: "Finite numerical verification is NOT a proof of the Riemann Hypothesis. Candidates are numerical only.",
      method: "Riemann-Siegel approx + sign-change bisection",
      limitations: [
        "Riemann-Siegel remainder is approximate; accuracy degrades for small t",
        "No rigorous error bounds claimed",
        "Never treat residual < ε as formal proof of a zero",
      ],
    },
    measurements: {
      candidateCount: annotated.length,
      meanSpacing: stats.mean,
      heightInterval: [tMin, tMax],
    },
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  ENGINE_VERSION,
  REFERENCE_ZEROS,
  theta,
  zetaDirichlet,
  hardyZ,
  findZeroCandidates,
  annotateWithReferences,
  spacingStatistics,
  spectralDensityOfSequence,
  autocorrelation,
  runZeroExperiment,
  Complex,
};
