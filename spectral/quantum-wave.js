/**
 * Quantum Wave Engine — 1-D time-dependent Schrödinger solver.
 * Split-Step Fourier Method (SSFM).
 *
 * Units:
 *   - dimensionless mode: ħ = 1, m = 1
 *   - physical mode: explicit ħ, m (SI or atomic)
 *
 * Deterministic initial conditions. Reproducible configurations.
 */
"use strict";

const { Complex, complexArray, copyComplexArray, normalizeWavefunction } = require("./complex.js");
const { fft, ifft, isPowerOf2 } = require("./fft.js");

const ENGINE_VERSION = "quantum-wave.v1";

/** Default dimensionless constants */
const DEFAULTS = {
  hbar: 1,
  mass: 1,
  xMin: -20,
  xMax: 20,
  nPoints: 512, // power of 2
};

function makeGrid(opts = {}) {
  const xMin = opts.xMin ?? DEFAULTS.xMin;
  const xMax = opts.xMax ?? DEFAULTS.xMax;
  let n = opts.nPoints ?? DEFAULTS.nPoints;
  if (!isPowerOf2(n)) {
    n = 1 << Math.ceil(Math.log2(n));
  }
  const dx = (xMax - xMin) / n;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = xMin + (i + 0.5) * dx;
  // momentum grid (FFT frequencies)
  const dk = (2 * Math.PI) / (n * dx);
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    k[i] = i < n / 2 ? i * dk : (i - n) * dk;
  }
  return { x, k, dx, dk, n, xMin, xMax };
}

/**
 * Gaussian wave packet:
 *   ψ(x) = (2πσ²)^(-1/4) * exp(ik0(x-x0) - (x-x0)²/(4σ²))
 */
function gaussianPacket(grid, { x0 = 0, k0 = 0, sigma = 1, amplitude = 1 } = {}) {
  const { x, dx, n } = grid;
  const normPre = Math.pow(2 * Math.PI * sigma * sigma, -0.25) * amplitude;
  const psi = complexArray(n);
  for (let i = 0; i < n; i++) {
    const dx0 = x[i] - x0;
    const gauss = Math.exp(-(dx0 * dx0) / (4 * sigma * sigma));
    const phase = k0 * dx0;
    psi[i] = new Complex(normPre * gauss * Math.cos(phase), normPre * gauss * Math.sin(phase));
  }
  const { error } = normalizeWavefunction(psi, dx);
  return { psi, normalizationError: error };
}

/**
 * Potential functions.
 * V(x) returned in energy units consistent with ħ, m.
 */
const Potentials = {
  free: () => (x) => 0,
  harmonic: (omega = 1, mass = 1) => (x) => 0.5 * mass * omega * omega * x * x,
  barrier: (V0 = 5, width = 2, center = 0) => (x) =>
    Math.abs(x - center) < width / 2 ? V0 : 0,
  doubleBarrier: (V0 = 5, width = 1, gap = 2, center = 0) => (x) => {
    const d = Math.abs(x - center);
    if (d > gap / 2 && d < gap / 2 + width) return V0;
    return 0;
  },
  well: (V0 = -5, width = 4, center = 0) => (x) =>
    Math.abs(x - center) < width / 2 ? V0 : 0,
};

/**
 * Split-Step Fourier Method one step.
 * ψ ← exp(-i V dt / 2ħ) * FFT⁻¹[ exp(-i ħ k² dt / 2m) * FFT[ exp(-i V dt / 2ħ) ψ ] ]
 */
function splitStepStep(psi, V, k, dt, hbar, mass) {
  const n = psi.length;
  // half potential kick
  const phaseV = -dt / (2 * hbar);
  for (let i = 0; i < n; i++) {
    const ang = phaseV * V[i];
    const c = Math.cos(ang), s = Math.sin(ang);
    const re = psi[i].re, im = psi[i].im;
    psi[i] = new Complex(re * c - im * s, re * s + im * c);
  }
  // kinetic in momentum space
  fft(psi, true);
  const phaseK = - (hbar * dt) / (2 * mass);
  for (let i = 0; i < n; i++) {
    const ang = phaseK * k[i] * k[i];
    const c = Math.cos(ang), s = Math.sin(ang);
    const re = psi[i].re, im = psi[i].im;
    psi[i] = new Complex(re * c - im * s, re * s + im * c);
  }
  ifft(psi);
  // half potential kick again
  for (let i = 0; i < n; i++) {
    const ang = phaseV * V[i];
    const c = Math.cos(ang), s = Math.sin(ang);
    const re = psi[i].re, im = psi[i].im;
    psi[i] = new Complex(re * c - im * s, re * s + im * c);
  }
  return psi;
}

/**
 * Observables
 */
function probabilityDensity(psi) {
  return psi.map(z => z.abs2());
}

function phase(psi) {
  return psi.map(z => z.arg());
}

function expectedPosition(psi, x, dx) {
  let sum = 0;
  for (let i = 0; i < psi.length; i++) sum += x[i] * psi[i].abs2();
  return sum * dx;
}

function expectedMomentum(psi, k, dx) {
  // transform to momentum space
  const phi = copyComplexArray(psi);
  fft(phi, true);
  // normalize momentum wavefunction (FFT convention)
  const n = phi.length;
  let sum = 0, norm2 = 0;
  for (let i = 0; i < n; i++) {
    const p = phi[i].abs2();
    norm2 += p;
    sum += k[i] * p; // ħ=1 → p = k
  }
  return norm2 > 0 ? sum / norm2 : 0;
}

function energyEstimate(psi, V, k, dx, hbar, mass) {
  // <T> + <V>
  // kinetic via momentum space
  const phi = copyComplexArray(psi);
  fft(phi, true);
  let T = 0, norm2 = 0;
  for (let i = 0; i < phi.length; i++) {
    const p = phi[i].abs2();
    norm2 += p;
    T += (hbar * hbar * k[i] * k[i] / (2 * mass)) * p;
  }
  T = norm2 > 0 ? T / norm2 : 0;
  let Vexp = 0, N = 0;
  for (let i = 0; i < psi.length; i++) {
    const dens = psi[i].abs2();
    N += dens;
    Vexp += V[i] * dens;
  }
  Vexp = N > 0 ? Vexp / N : 0;
  return { kinetic: T, potential: Vexp, total: T + Vexp };
}

function momentumSpectrum(psi, dx) {
  const phi = copyComplexArray(psi);
  fft(phi, true);
  const n = phi.length;
  // scale so that ∫|φ(k)|² dk ≈ 1
  const dens = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    dens[i] = phi[i].abs2();
    s += dens[i];
  }
  if (s > 0) for (let i = 0; i < n; i++) dens[i] /= s;
  return dens;
}

/**
 * Run a simulation configuration.
 * Returns full snapshot + measurements.
 */
function runSimulation(config = {}) {
  const hbar = config.hbar ?? 1;
  const mass = config.mass ?? 1;
  const dt = config.dt ?? 0.01;
  const steps = config.steps ?? 100;
  const seed = config.seed ?? 0; // for future stochastic, currently deterministic

  const grid = makeGrid(config.grid || {});
  const { x, k, dx, n } = grid;

  // potential
  let Vfn;
  const potName = config.potential || "free";
  if (typeof config.potential === "function") {
    Vfn = config.potential;
  } else if (Potentials[potName]) {
    Vfn = Potentials[potName](...(config.potentialArgs || []));
  } else {
    Vfn = Potentials.free();
  }
  const V = new Float64Array(n);
  for (let i = 0; i < n; i++) V[i] = Vfn(x[i]);

  // initial wave packet(s)
  let psi;
  if (config.packets && Array.isArray(config.packets)) {
    psi = complexArray(n, () => Complex.zero());
    for (const p of config.packets) {
      const { psi: packet } = gaussianPacket(grid, p);
      for (let i = 0; i < n; i++) psi[i] = psi[i].add(packet[i]);
    }
    normalizeWavefunction(psi, dx);
  } else {
    const g = gaussianPacket(grid, config.packet || {});
    psi = g.psi;
  }

  const history = config.recordHistory ? [] : null;
  if (history) history.push({ t: 0, density: probabilityDensity(psi) });

  for (let s = 0; s < steps; s++) {
    splitStepStep(psi, V, k, dt, hbar, mass);
    if (history && (s + 1) % (config.historyEvery || 10) === 0) {
      history.push({ t: (s + 1) * dt, density: probabilityDensity(psi) });
    }
  }

  const dens = probabilityDensity(psi);
  const ph = phase(psi);
  const xExp = expectedPosition(psi, x, dx);
  const pExp = expectedMomentum(psi, k, dx);
  const E = energyEstimate(psi, V, k, dx, hbar, mass);
  const { error: normErr } = normalizeWavefunction(copyComplexArray(psi), dx);
  const momSpec = momentumSpectrum(psi, dx);

  return {
    engine: ENGINE_VERSION,
    config: {
      hbar, mass, dt, steps, potential: potName,
      packet: config.packet || config.packets,
      grid: { xMin: grid.xMin, xMax: grid.xMax, n, dx },
      seed,
      units: config.units || "dimensionless",
    },
    grid: { x: Array.from(x), k: Array.from(k), dx },
    wavefunction: psi.map(z => ({ re: z.re, im: z.im })),
    probabilityDensity: dens,
    phase: ph,
    momentumSpectrum: Array.from(momSpec),
    measurements: {
      expectedPosition: xExp,
      expectedMomentum: pExp,
      energy: E,
      normalizationError: normErr,
    },
    potential: Array.from(V),
    history: history,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  ENGINE_VERSION,
  makeGrid,
  gaussianPacket,
  Potentials,
  splitStepStep,
  probabilityDensity,
  phase,
  expectedPosition,
  expectedMomentum,
  energyEstimate,
  momentumSpectrum,
  runSimulation,
  Complex,
};
