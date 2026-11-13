# SIGNAL · PROCESSOR

Binaural / isochronic / modulation processor plus a session loop — and an offline **SSTV signal-gen** workstation.

Human surface: [index.html](index.html) on GitHub Pages.
Machine surface: `.babel/` discovery contract (manifest, capabilities, schemas).

## Apps on this page

- **Modulation / session** — binaural, isochronic, recipes, WAV export
- **SSTV · SIGNAL GEN** — Martin M1 / Robot 36 encode + decode, fidelity lab
- **Acoustic Probe** — independent browser acoustic subsystem

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

## License

See [LICENSE](LICENSE).
