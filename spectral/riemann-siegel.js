/**
 * Improved Riemann-Siegel style evaluation for Hardy Z.
 * Includes a basic remainder approximation.
 * For t large enough the main sum dominates.
 * Deterministic. Not a rigorous library — lab quality.
 */
"use strict";

function thetaRS(t) {
  const a = t / 2;
  const l = Math.log(t / (2 * Math.PI));
  return a * l - a - Math.PI / 8 + 1 / (48 * t) + 7 / (5760 * Math.pow(t, 3));
}

function remainderApprox(t, N) {
  // crude R(t) ≈ (-1)^{N-1} * (t/(2π))^{-1/4} * cos(...)
  const p = Math.sqrt(t / (2 * Math.PI));
  const frac = p - N;
  const amp = Math.pow(t / (2 * Math.PI), -0.25);
  return amp * Math.cos(thetaRS(t) - t * Math.log(p) + Math.PI / 4) * (0.5 - frac);
}

function riemannSiegelZ(t) {
  if (t < 5) return { Z: NaN, method: "out-of-range", N: 0 };
  const p = Math.sqrt(t / (2 * Math.PI));
  const N = Math.max(1, Math.floor(p));
  const th = thetaRS(t);
  let sum = 0;
  for (let n = 1; n <= N; n++) {
    sum += Math.cos(th - t * Math.log(n)) / Math.sqrt(n);
  }
  const R = remainderApprox(t, N);
  const Z = 2 * sum + R;
  return {
    Z,
    t,
    method: "riemann-siegel-approx",
    N,
    theta: th,
    imagResidual: 0,
    remainder: R,
  };
}

function hardyZImproved(t, opts = {}) {
  // Always prefer RS-style for t >= 10
  if (t >= 10) return riemannSiegelZ(t);
  // very small t: longer Dirichlet (still limited)
  const maxN = opts.maxN || 100000;
  let re = 0, im = 0;
  for (let n = 1; n <= maxN; n++) {
    const mag = 1 / Math.sqrt(n);
    const ang = -t * Math.log(n);
    re += mag * Math.cos(ang);
    im += mag * Math.sin(ang);
  }
  const th = thetaRS(t);
  const c = Math.cos(th), s = Math.sin(th);
  return {
    Z: c * re - s * im,
    imagResidual: s * re + c * im,
    t,
    method: "dirichlet-long",
    maxN,
    theta: th,
  };
}

module.exports = { riemannSiegelZ, hardyZImproved, thetaRS };
