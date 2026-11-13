# SSTV DSP notes (post-v2 corrections)

## I/Q alignment

Centered Hilbert FIR produces Q at sample index `i`. The real branch uses `filtered[i]` at the **same** index (zero-phase alignment). Instantaneous frequency uses `freq = -Δφ · sr / 2π` so positive tones read positive.

Do **not** delay I by the Hilbert midpoint while using a centered Q — that misaligns the analytic pair and warps transitions.

## Mode-aware post-filter

`recommendedPostFilterHz(shortestPixelSamples, sr)` targets τ ≈ 0.25 × pixel duration.

- Martin scan pixel ~22 samples @ 48 kHz → milder cutoff
- Robot chroma pixel ~6–7 samples @ 48 kHz → much higher cutoff (up to 4 kHz)

A shared 700 Hz filter spans roughly one full Robot chroma pixel and washes chroma detail.

## Measured delay

`measureDemodDelay(sr, postFilterHz)` synthesizes a 1500→2300 Hz step and returns the 50% crossing lag. Decoders use this when `measureDelay: true` (default).

## Line timing

`LineTimingTracker` estimates period from consecutive accepted syncs, rejects weak candidates, tracks drift in ppm, and exposes `alignmentReport().geometricallyAligned`.

## Metrics

- `globalSsim` — single-window (legacy `ssim` alias)
- `localSsim` — mean 8×8 window SSIM
- `requireExactDimensions: true` throws on size mismatch
- `horizontalShift` — mid-band NCC shift estimate (ill-defined on flat fields)

## Acoustic loopback (UI)

FIDELITY → **ACOUSTIC LOOPBACK**: record pre-roll → play encoded SSTV on speaker → post-roll → decode. One-way path (no live mic→speaker passthrough). Compare digital vs acoustic MAE/PSNR/SSIM and input RMS.
