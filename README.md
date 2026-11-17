# SIGNAL · PROCESSOR

Binaural / isochronic / modulation processor plus a session loop — and an offline **SSTV signal-gen** workstation.

Human surface: [index.html](index.html) on GitHub Pages.
Machine surface: `.babel/` discovery contract (manifest, capabilities, schemas).

## Apps on this page

- **Modulation / session** — binaural, isochronic, recipes, WAV export
- **SSTV · SIGNAL GEN** — Martin M1 / Robot 36 encode + decode, fidelity lab
- **Acoustic Probe** — independent browser acoustic subsystem
- **QUANTUM / RIEMANN LAB** — deterministic mathematical signal laboratory

## SSTV · SIGNAL GEN

Browser TX/RX for Slow-Scan Television modes:

- Encode image → WAV / Web Audio
- Decode WAV or mic capture → reconstructed PNG
- **FIDELITY** lab: normalized source vs reconstruction, difference heatmap, MAE / PSNR / SSIM

Docs: [sstv/SSTV.md](sstv/SSTV.md) · [sstv/SSTV_MODES.md](sstv/SSTV_MODES.md) · [sstv/SSTV_FIDELITY.md](sstv/SSTV_FIDELITY.md)

Tests: `node --test sstv-tests.js sstv-fidelity-tests.js sstv-stress-tests.js`

Interop vectors: `node tools/sstv-export-vectors.js [outDir]`

## Acoustic Probe

Independent browser-native acoustic probing subsystem. Does **not** share code paths with SSTV.

See ACOUSTIC_*.md for model, ops, and firmware notes.

## QUANTUM / RIEMANN LAB

Deterministic browser-compatible mathematical signal laboratory:

- **Quantum Wave Engine** — complex wavefunctions, Gaussian packets, Split-Step Fourier Method, free / harmonic / barrier potentials, observables
- **Riemann Spectral Engine** — Hardy Z evaluation, bounded numerical zero candidates, spacing statistics, spectral density
- **Spectral Experiment** — versioned `spectral_experiment.v1` JSON contract for offline exchange with Throne Room

**Important:** Finite numerical zero verification is **not** a proof of the Riemann Hypothesis. Candidates are numerical only. See experiment `validation.limitations`.

Tests:

```bash
node --test spectral/spectral-tests.js
```

Schema: `schemas/spectral_experiment.v1.schema.json`

UI panel: **QUANTUM / RIEMANN LAB** on the GitHub Pages page (independent of SSTV and Acoustic Probe).

## License

See [LICENSE](LICENSE).
