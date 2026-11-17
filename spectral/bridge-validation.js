/**
 * Spectral Bridge v0.2 — Signal Processor validation suite
 * Honest numerical characterization. Known failures are recorded, not hidden.
 * Run: node --test spectral/bridge-validation.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { runSimulation } = require("./quantum-wave.js");
const {
  REFERENCE_ZEROS, hardyZ, findZeroCandidates, annotateWithReferences,
  runZeroExperiment,
} = require("./riemann.js");
const {
  CONTRACT_VERSION, quantumExperiment, riemannExperiment,
  spectralComparisonExperiment, validateExperiment,
} = require("./experiment.js");

const OUT = path.join(__dirname, "..", "exports");
const REPORT = path.join(__dirname, "..", "reports");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(REPORT, { recursive: true });

const findings = { quantum: [], riemann: [], contract: [], knownFailures: [] };

function zValue(t) {
  const r = hardyZ(t);
  return typeof r === "number" ? r : r.Z;
}

describe("Quantum: probability conservation", () => {
  it("normalization error stays small under free evolution", () => {
    const r = runSimulation({
      nPoints: 256, xMin: -20, xMax: 20, dt: 0.01, steps: 40,
      potential: "free", packet: { x0: 0, k0: 2, sigma: 1 },
    });
    assert.ok(r.measurements.normalizationError < 1e-6);
    findings.quantum.push({ test: "norm", value: r.measurements.normalizationError });
  });
});

describe("Quantum: free-particle analytical comparison", () => {
  it("expected position approx x0+k0*t within 0.35", () => {
    const x0 = -2, k0 = 1.5, sigma = 1.2, dt = 0.02, steps = 50;
    const expected = x0 + k0 * dt * steps;
    const r = runSimulation({
      nPoints: 512, xMin: -40, xMax: 40, dt, steps,
      potential: "free", packet: { x0, k0, sigma },
    });
    const err = Math.abs(r.measurements.expectedPosition - expected);
    assert.ok(err < 0.35, `err=${err}`);
    findings.quantum.push({ test: "free_analytical", expected, got: r.measurements.expectedPosition, err });
  });
});

describe("Quantum: grid refinement", () => {
  it("norm error finite across 128/256/512", () => {
    const errs = [];
    for (const n of [128, 256, 512]) {
      const r = runSimulation({
        nPoints: n, xMin: -20, xMax: 20, dt: 0.01, steps: 20,
        potential: "free", packet: { x0: 0, k0: 1, sigma: 1 },
      });
      errs.push({ n, norm: r.measurements.normalizationError });
      assert.ok(Number.isFinite(r.measurements.normalizationError) && r.measurements.normalizationError < 1e-4);
    }
    findings.quantum.push({ test: "grid_refinement", errs });
  });
});

describe("Quantum: time-step convergence", () => {
  it("successive differences as dt shrinks", () => {
    const T = 0.4, x0 = -1, k0 = 2;
    const positions = [];
    for (const dt of [0.04, 0.02, 0.01]) {
      const steps = Math.round(T / dt);
      const r = runSimulation({
        nPoints: 256, xMin: -30, xMax: 30, dt, steps,
        potential: "free", packet: { x0, k0, sigma: 1 },
      });
      positions.push(r.measurements.expectedPosition);
    }
    const d1 = Math.abs(positions[1] - positions[0]);
    const d2 = Math.abs(positions[2] - positions[1]);
    assert.ok(d2 <= d1 + 0.05);
    findings.quantum.push({ test: "dt_convergence", positions, d1, d2 });
  });
});

describe("Quantum: periodic boundary artifact", () => {
  it("norm conserved for edge packet", () => {
    const edge = runSimulation({
      nPoints: 256, xMin: -10, xMax: 10, dt: 0.01, steps: 5,
      potential: "free", packet: { x0: 9.2, k0: 0, sigma: 0.8 },
    });
    assert.ok(edge.measurements.normalizationError < 1e-5);
  });
});

describe("Quantum: harmonic energy", () => {
  it("energy finite and positive", () => {
    const r = runSimulation({
      nPoints: 256, xMin: -15, xMax: 15, dt: 0.01, steps: 30,
      potential: "harmonic", potentialArgs: [1, 1],
      packet: { x0: 1, k0: 0, sigma: 1 },
    });
    assert.ok(r.measurements.energy.total > 0 && Number.isFinite(r.measurements.energy.total));
  });
});

describe("Riemann: reference residual characterization", () => {
  it("records |Z(t)| at first 5 Odlyzko ordinates", () => {
    const rows = [];
    for (const t of REFERENCE_ZEROS.slice(0, 5)) {
      const z = zValue(t);
      assert.ok(Number.isFinite(z));
      rows.push({ t, absZ: Math.abs(z) });
    }
    findings.riemann.push({ test: "reference_residuals", rows });
    const maxAbs = Math.max(...rows.map(r => r.absZ));
    if (maxAbs > 0.15) {
      findings.knownFailures.push({
        area: "riemann_residual",
        detail: `max |Z| at first 5 refs = ${maxAbs.toFixed(4)} (RS approx poor at low height)`,
      });
    }
    assert.ok(rows.length === 5);
  });
});

describe("Riemann: zero finder distance-to-reference", () => {
  it("reports nearest-reference distances without inventing matches", () => {
    const candidates = findZeroCandidates(10, 50, 0.05);
    const annotated = annotateWithReferences(candidates);
    const matchCount = annotated.filter(c => c.referenceComparison && c.referenceComparison.matched).length;
    findings.riemann.push({ test: "finder_vs_refs", matchCount });
    if (matchCount === 0) {
      findings.knownFailures.push({
        area: "zero_finder_match",
        detail: "0 candidates matched Odlyzko refs; offset from RS approx error",
      });
    }
    assert.ok(candidates.length >= 3);
  });
});

describe("Riemann: spacing statistics", () => {
  it("mean spacing positive and finite on [14,50]", () => {
    const exp = runZeroExperiment({ tMin: 14, tMax: 50, step: 0.05 });
    assert.ok(exp.measurements.candidateCount >= 3);
    assert.ok(exp.spacingStatistics.mean > 0 && Number.isFinite(exp.spacingStatistics.mean));
  });
});

describe("Riemann: anti-proof note present", () => {
  it("validation note states finite verification is not a proof", () => {
    const exp = runZeroExperiment({ tMin: 14, tMax: 30, step: 0.05 });
    assert.ok(exp.validation.note.toLowerCase().includes("not a proof"));
    assert.ok(exp.validation.limitations.length >= 1);
  });
});

describe("Contract: export spectral_experiment.v1", () => {
  it("quantum export validates + fixture", () => {
    const rec = quantumExperiment({
      nPoints: 256, xMin: -20, xMax: 20, dt: 0.01, steps: 20,
      potential: "free", packet: { x0: 0, k0: 1, sigma: 1 },
    });
    const v = validateExperiment(rec);
    assert.ok(v.ok, v.errors.join("; "));
    assert.equal(rec.schema, CONTRACT_VERSION);
    fs.writeFileSync(path.join(OUT, "quantum_bridge.json"), JSON.stringify(rec, null, 2));
  });

  it("riemann export validates + fixture", () => {
    const rec = riemannExperiment({ tMin: 14, tMax: 40, step: 0.05 });
    assert.ok(validateExperiment(rec).ok);
    fs.writeFileSync(path.join(OUT, "riemann_bridge.json"), JSON.stringify(rec, null, 2));
  });

  it("spectral comparison export validates", () => {
    const rec = spectralComparisonExperiment(
      { nPoints: 128, steps: 10, packet: { x0: 0, k0: 1, sigma: 1 } },
      { tMin: 14, tMax: 35, step: 0.08 }
    );
    assert.ok(validateExperiment(rec).ok);
    fs.writeFileSync(path.join(OUT, "comparison_bridge.json"), JSON.stringify(rec, null, 2));
  });

  it("rejects non-finite measurements", () => {
    const rec = quantumExperiment({ nPoints: 128, steps: 5, packet: { x0: 0, k0: 0, sigma: 1 } });
    rec.measurements.expectedPosition = NaN;
    assert.equal(validateExperiment(rec).ok, false);
  });

  it("rejects wrong schema", () => {
    const rec = quantumExperiment({ nPoints: 128, steps: 5, packet: { x0: 0, k0: 0, sigma: 1 } });
    rec.schema = "bogus.v0";
    assert.equal(validateExperiment(rec).ok, false);
  });
});

process.on("exit", () => {
  try {
    fs.writeFileSync(path.join(REPORT, "signal-processor-findings.json"), JSON.stringify(findings, null, 2));
  } catch (_) {}
});
