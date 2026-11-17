/**
 * Tests for Quantum Wave + Riemann Spectral engines.
 * Run: node --test spectral/spectral-tests.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { Complex, normalizeWavefunction, complexArray } = require("./complex.js");
const { fft, ifft, fftRoundTripError, isPowerOf2 } = require("./fft.js");
const {
  makeGrid, gaussianPacket, Potentials, runSimulation,
} = require("./quantum-wave.js");
const {
  hardyZ, findZeroCandidates, annotateWithReferences,
  spacingStatistics, runZeroExperiment, REFERENCE_ZEROS, theta,
} = require("./riemann.js");
const {
  quantumExperiment, riemannExperiment, spectralComparisonExperiment,
  validateExperiment, CONTRACT_VERSION,
} = require("./experiment.js");

describe("Complex arithmetic", () => {
  it("adds and multiplies", () => {
    const a = new Complex(1, 2);
    const b = new Complex(3, -1);
    const s = a.add(b);
    assert.equal(s.re, 4);
    assert.equal(s.im, 1);
    const p = a.mul(b);
    assert.equal(p.re, 5);
    assert.equal(p.im, 5);
  });
  it("abs and conj", () => {
    const z = new Complex(3, 4);
    assert.equal(z.abs(), 5);
    assert.equal(z.conj().im, -4);
  });
});

describe("FFT", () => {
  it("power of 2 check", () => {
    assert.equal(isPowerOf2(512), true);
    assert.equal(isPowerOf2(513), false);
  });
  it("round-trip error is small", () => {
    const n = 64;
    const arr = complexArray(n, i => new Complex(Math.sin(i * 0.3), Math.cos(i * 0.2)));
    const err = fftRoundTripError(arr);
    assert.ok(err < 1e-12, `round-trip error ${err}`);
  });
});

describe("Quantum wave packets", () => {
  it("Gaussian normalizes", () => {
    const grid = makeGrid({ nPoints: 256, xMin: -20, xMax: 20 });
    const { psi, normalizationError } = gaussianPacket(grid, { x0: 0, k0: 0, sigma: 1 });
    assert.ok(normalizationError < 1e-6, `norm error ${normalizationError}`);
  });

  it("free particle propagates without blow-up", () => {
    const result = runSimulation({
      packet: { x0: -5, k0: 2, sigma: 1 },
      potential: "free",
      dt: 0.02,
      steps: 50,
      grid: { nPoints: 256, xMin: -30, xMax: 30 },
    });
    assert.ok(result.measurements.normalizationError < 0.05);
    assert.ok(Number.isFinite(result.measurements.expectedPosition));
    assert.ok(result.measurements.expectedPosition > -5);
  });

  it("harmonic oscillator stays bounded", () => {
    const result = runSimulation({
      packet: { x0: 1, k0: 0, sigma: 0.5 },
      potential: "harmonic",
      potentialArgs: [1],
      dt: 0.01,
      steps: 100,
      grid: { nPoints: 256, xMin: -10, xMax: 10 },
    });
    assert.ok(Math.abs(result.measurements.expectedPosition) < 3);
    assert.ok(result.measurements.energy.total > 0);
  });

  it("invalid grid rejected by power-of-2", () => {
    const g = makeGrid({ nPoints: 100 });
    assert.ok(isPowerOf2(g.n));
  });
});

describe("Riemann spectral", () => {
  it("theta is real and finite for t>1", () => {
    const th = theta(20);
    assert.ok(Number.isFinite(th));
  });

  it("Hardy Z evaluator returns finite values near known zeros", () => {
    for (const t of REFERENCE_ZEROS.slice(0, 5)) {
      const z = hardyZ(t);
      assert.ok(Number.isFinite(z.Z), `Z(${t}) not finite`);
    }
  });

  it("finds some sign-change candidates in a known interval", () => {
    const cands = findZeroCandidates(13, 35, { step: 0.05, maxN: 3000 });
    assert.ok(cands.length >= 1, "expected at least one candidate");
    const ann = annotateWithReferences(cands, REFERENCE_ZEROS, 0.5);
    assert.ok(ann.length === cands.length);
  });

  it("spacing statistics produce finite values", () => {
    const exp = runZeroExperiment({ tMin: 10, tMax: 50, step: 0.04, maxN: 2500 });
    assert.ok(exp.candidates.length >= 1);
    assert.ok(Number.isFinite(exp.measurements.meanSpacing) || exp.measurements.meanSpacing === null);
    assert.equal(exp.validation.note.includes("NOT a proof"), true);
  });

  it("reference zeros list is ordered and positive", () => {
    for (let i = 1; i < REFERENCE_ZEROS.length; i++) {
      assert.ok(REFERENCE_ZEROS[i] > REFERENCE_ZEROS[i - 1]);
    }
  });
});

describe("Experiment contract", () => {
  it("quantum experiment validates", () => {
    const rec = quantumExperiment({
      packet: { x0: 0, k0: 1, sigma: 1 },
      potential: "free",
      dt: 0.05,
      steps: 20,
      grid: { nPoints: 128 },
    });
    assert.equal(rec.schema, CONTRACT_VERSION);
    const v = validateExperiment(rec);
    assert.equal(v.ok, true, v.errors.join("; "));
  });

  it("riemann experiment validates", () => {
    const rec = riemannExperiment({ tMin: 14, tMax: 40, step: 0.05, maxN: 2000 });
    const v = validateExperiment(rec);
    assert.equal(v.ok, true, v.errors.join("; "));
    assert.ok(rec.validation.limitations.length > 0);
  });

  it("spectral comparison runs", () => {
    const rec = spectralComparisonExperiment(
      { packet: { x0: 0, k0: 0, sigma: 1 }, potential: "harmonic", potentialArgs: [1], dt: 0.05, steps: 30, grid: { nPoints: 128 } },
      { tMin: 14, tMax: 40, step: 0.05, maxN: 2000 }
    );
    assert.equal(rec.experiment_type, "spectral_comparison");
    const v = validateExperiment(rec);
    assert.equal(v.ok, true);
  });

  it("rejects malformed record", () => {
    const v = validateExperiment({ schema: "wrong" });
    assert.equal(v.ok, false);
  });
});
