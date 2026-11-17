/**
 * Quantum / Riemann Experiment Engine + spectral_experiment.v1 export.
 *
 * Treats proposed relationships as falsifiable hypotheses.
 * Does not assume equivalence between quantum eigenvalues and Riemann zeros.
 */
"use strict";

const { runSimulation } = require("./quantum-wave.js");
const { runZeroExperiment, REFERENCE_ZEROS } = require("./riemann.js");
const crypto = require("crypto");

const CONTRACT_VERSION = "spectral_experiment.v1";
const ENGINE_VERSION = "spectral-experiment.v1";

function makeId(prefix = "exp") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Build a versioned experiment record.
 */
function buildExperimentRecord({
  experimentType,
  parameters,
  units,
  randomSeed,
  numericalMethod,
  outputSummary,
  measurements,
  validation,
  limitations,
  datasets = {},
  inputIdentity = null,
}) {
  return {
    schema: CONTRACT_VERSION,
    experiment_id: makeId(experimentType),
    experiment_type: experimentType,
    engine_version: ENGINE_VERSION,
    parameters,
    units: units || "dimensionless",
    random_seed: randomSeed ?? 0,
    input_identity: inputIdentity,
    numerical_method: numericalMethod,
    output_summary: outputSummary,
    measurements,
    validation,
    limitations: limitations || [],
    datasets,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run a quantum wave experiment and wrap as spectral_experiment.v1
 */
function quantumExperiment(config = {}) {
  const result = runSimulation(config);
  return buildExperimentRecord({
    experimentType: "quantum_wave_packet",
    parameters: result.config,
    units: result.config.units,
    randomSeed: result.config.seed,
    numericalMethod: "split-step-fourier",
    outputSummary: {
      steps: result.config.steps,
      expectedPosition: result.measurements.expectedPosition,
      expectedMomentum: result.measurements.expectedMomentum,
      energy: result.measurements.energy.total,
      normalizationError: result.measurements.normalizationError,
    },
    measurements: result.measurements,
    validation: {
      normalizationError: result.measurements.normalizationError,
      note: "Analytical free-particle / harmonic cases should be compared externally.",
    },
    limitations: [
      "Finite grid and time step",
      "Absorbing boundaries not implemented (periodic FFT)",
      "Potential discontinuities may cause Gibbs effects",
    ],
    datasets: {
      probabilityDensity: result.probabilityDensity,
      phase: result.phase,
      momentumSpectrum: result.momentumSpectrum,
      potential: result.potential,
      x: result.grid.x,
    },
  });
}

/**
 * Run a Riemann zero experiment and wrap.
 */
function riemannExperiment(config = {}) {
  const result = runZeroExperiment(config);
  return buildExperimentRecord({
    experimentType: "riemann_zeros",
    parameters: result.config,
    units: "ordinate-t",
    randomSeed: 0,
    numericalMethod: result.validation.method,
    outputSummary: {
      candidateCount: result.measurements.candidateCount,
      matchedReferences: result.validation.matchedCandidates,
      meanSpacing: result.measurements.meanSpacing,
    },
    measurements: result.measurements,
    validation: result.validation,
    limitations: result.validation.limitations,
    datasets: {
      candidates: result.candidates.map(c => ({
        t: c.t,
        residual: c.residual,
        matched: c.referenceComparison?.matched || false,
      })),
      spacings: result.spacingStatistics.spacings,
      normalizedSpacings: result.spacingStatistics.normalized,
      spectralDensity: result.spectralDensity.density,
    },
  });
}

/**
 * Spectral coupling / comparison experiment.
 * Explicitly falsifiable; does not claim identity.
 */
function spectralComparisonExperiment(quantumConfig = {}, riemannConfig = {}, opts = {}) {
  const q = runSimulation(quantumConfig);
  const r = runZeroExperiment(riemannConfig);

  const spacings = r.spacingStatistics.normalized || r.spacingStatistics.spacings || [];
  const meanNormSpacing = spacings.length
    ? spacings.reduce((a, b) => a + b, 0) / spacings.length
    : null;

  const hypothesis = {
    statement: opts.hypothesis || "Normalized zero spacings are statistically consistent with a chosen random-matrix ensemble (testable, not assumed).",
    status: "open",
    falsifiable: true,
  };

  return buildExperimentRecord({
    experimentType: "spectral_comparison",
    parameters: {
      quantum: q.config,
      riemann: r.config,
      hypothesis,
    },
    units: "mixed",
    randomSeed: quantumConfig.seed ?? 0,
    numericalMethod: "split-step-fourier + dirichlet-zeta + spacing-stats",
    outputSummary: {
      quantumEnergy: q.measurements.energy.total,
      zeroCandidates: r.measurements.candidateCount,
      meanNormalizedSpacing: meanNormSpacing,
      matchedReferences: r.validation.matchedCandidates,
    },
    measurements: {
      quantum: q.measurements,
      riemann: r.measurements,
      meanNormalizedSpacing: meanNormSpacing,
    },
    validation: {
      ...r.validation,
      note: "No equivalence between quantum eigenvalues and Riemann zeros is assumed. This is a comparative numerical experiment only.",
    },
    limitations: [
      ...(r.validation.limitations || []),
      "Single quantum energy vs spacing distribution is a weak comparison",
      "Proper spectral form factor / pair correlation requires many eigenvalues",
    ],
    datasets: {
      quantumDensity: q.probabilityDensity,
      zeroCandidates: r.candidates.map(c => c.t),
      normalizedSpacings: spacings,
    },
  });
}

/**
 * Validate a spectral_experiment.v1 record (basic structural).
 */
function validateExperiment(rec) {
  const errors = [];
  if (!rec || typeof rec !== "object") errors.push("not an object");
  if (rec.schema !== CONTRACT_VERSION) errors.push(`schema must be ${CONTRACT_VERSION}`);
  if (!rec.experiment_id) errors.push("missing experiment_id");
  if (!rec.experiment_type) errors.push("missing experiment_type");
  if (!rec.engine_version) errors.push("missing engine_version");
  if (!rec.numerical_method) errors.push("missing numerical_method");
  if (!rec.timestamp) errors.push("missing timestamp");
  function checkFinite(obj, path = "") {
    if (obj === null || obj === undefined) return;
    if (typeof obj === "number" && !Number.isFinite(obj)) errors.push(`non-finite at ${path}`);
    if (Array.isArray(obj)) obj.forEach((v, i) => checkFinite(v, `${path}[${i}]`));
    else if (typeof obj === "object") {
      for (const k of Object.keys(obj)) checkFinite(obj[k], `${path}.${k}`);
    }
  }
  checkFinite(rec.measurements, "measurements");
  return { ok: errors.length === 0, errors };
}

module.exports = {
  CONTRACT_VERSION,
  ENGINE_VERSION,
  buildExperimentRecord,
  quantumExperiment,
  riemannExperiment,
  spectralComparisonExperiment,
  validateExperiment,
  REFERENCE_ZEROS,
};
