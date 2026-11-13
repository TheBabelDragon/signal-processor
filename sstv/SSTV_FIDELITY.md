# SSTV fidelity testing and interoperability

## Goal

Recover the information that was transmitted — correct position, time, frequency, and color channel — on a clean digital path. Cosmetic post-processing is out of scope.

## Clean-path metrics (measured, illustrative)

Martin M1 @ 48 kHz (digital encode → WAV → decode):

| Pattern | MAE (approx) | Notes |
|---------|--------------|-------|
| Solid green | 3–6 | Full frame, high sync |
| Horizontal gradient | 11–17 | SSIM ≳ 0.92; slight high-end roll-off from filter lag into separator |
| Color bars | 34–49 | Edge transitions limited by pixel duration and post-filter |
| Checkerboard 8px | 48–60 | High spatial frequency; expected harder |

Robot 36 @ 48 kHz:

| Pattern | MAE (approx) | Notes |
|---------|--------------|-------|
| Solid green | 29–45 | Full frame; chroma path still coarser than Martin RGB |
| Gradient / bars | higher | Alternating chroma + filter lag |

Thresholds in `sstv-fidelity-tests.js` are set from these measurements, not invented scores.

## What the suite covers

- Timing: pixel length sum ≡ scan samples @ 44.1 kHz and 48 kHz
- Robot matrix: exact rgb ↔ Y / R-Y / B-Y round-trip in float
- Martin / Robot clean digital + WAV path
- Stress: white noise SNR, amplitude scale, ±0.05% clock skew (synthetic)
- Not automated: multipath, real RF IF, third-party decoder scoreboards

## Stress path (automated)

`node --test sstv-stress-tests.js` exercises synthetic degradations on Martin M1 solid/gradient:

| Condition | Result (illustrative) |
|-----------|------------------------|
| ~20 dB white SNR | Full lines; MAE ~17 solid |
| ~12 dB white SNR | ≥150 lines; usable but degraded |
| 0.25× amplitude | Full frame; MAE ~5 |
| ±0.05% clock skew | ≥200 lines; MAE under 80 on gradient |

These are not RF multipath models — they bound decoder robustness on a digital path with mild distortion.

## Interoperability

Internal conventions (documented for external tools):

| Item | Convention |
|------|------------|
| VIS | Classic 7-bit + even parity, leader/break/leader |
| Martin M1 VIS | 44 · G-B-R order · 320×256 |
| Robot 36 VIS | 8 · Y then alternating R-Y (sep 1500) / B-Y (sep 2300) · 320×240 |
| Luma/chroma FM | 1500 Hz black … 2300 Hz white |
| Robot matrix | BT.601 Y; R-Y and B-Y scaled ×0.5 and biased to 0.5 for FM |

### Export vectors

```bash
node tools/sstv-export-vectors.js [outDir]
```

Writes WAV + JSON metadata (`mode`, `visCode`, geometry, conventions) for MMSSTV / QSSTV / rx_sstv checks.

Independent checks:

1. Decode exported WAV in an external tool; verify geometry and channel order.
2. Encode a known pattern externally and decode here; report VIS and line timing deltas.
3. Do **not** change standard timing solely to pass an internal or foreign test.

Document external disagreement under Known limitations without silently retuning standards.

## Known limitations

- Continuous demod post-filter softens the last pixels of a scan into the black separator (gradient high end); delay compensation reduces but does not eliminate this.
- 44.1 kHz residual is typically higher than 48 kHz.
- Robot chroma is half-rate alternating; solid colors recover better than fine chroma detail.
- Mic / real RF paths are not part of the clean-path baseline.
- No multipath or Doppler suite yet.
- Third-party interop is procedural (vectors + checklist), not a live scoreboard in CI.

## UI fidelity lab

FIDELITY tab → choose aspect fit → **FIDELITY ROUND-TRIP**. Panels show normalized source, waveform, reconstruction, amplified difference heatmap (gain control), and live MAE / PSNR / SSIM / per-channel / line / sync metrics. All values are computed from the actual buffers — not placeholders.
