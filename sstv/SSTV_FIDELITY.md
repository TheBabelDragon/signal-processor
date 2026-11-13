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
- Not yet automated: additive noise, clock skew, third-party decoder vectors  

## Interoperability

Internal conventions (documented for external tools):

| Item | Convention |
|------|------------|
| VIS | Classic 7-bit + even parity, leader/break/leader |
| Martin M1 VIS | 44 · G-B-R order · 320×256 |
| Robot 36 VIS | 8 · Y then alternating R-Y (sep 1500) / B-Y (sep 2300) · 320×240 |
| Luma/chroma FM | 1500 Hz black … 2300 Hz white |
| Robot matrix | BT.601 Y; R-Y and B-Y scaled ×0.5 and biased to 0.5 for FM |

Independent checks (manual / external):

1. Decode this encoder’s WAV with MMSSTV, QSSTV, or rx_sstv and compare geometry + channel order.  
2. Encode a known pattern in an external tool and decode here; report VIS and line timing deltas.  
3. Do **not** change standard timing solely to pass an internal test.

Document any external disagreement under Known limitations without silently retuning standards.

## Known limitations

- Continuous demod post-filter softens the last pixels of a scan into the black separator (gradient high end).  
- 44.1 kHz gradient residual is higher than 48 kHz; delay compensation is fixed Hilbert length.  
- Robot chroma is half-rate alternating; solid colors recover better than fine chroma detail.  
- Mic / real RF paths are not part of the clean-path baseline.  
- No automated multipath or Doppler suite yet.

## UI fidelity lab

FIDELITY tab → choose aspect fit → **FIDELITY ROUND-TRIP**. Panels show normalized source, waveform, reconstruction, amplified difference heatmap (gain control), and live MAE / PSNR / SSIM / per-channel / line / sync metrics. All values are computed from the actual buffers — not placeholders.
