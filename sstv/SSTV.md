# SSTV subsystem (Signal Processor)

Standalone SSTV encode/decode + signal-gen dashboard UI.

## Status

| Capability | State |
|------------|-------|
| Martin M1 encode/decode | Clean-path v2 (continuous FM demod) |
| Robot 36 encode/decode | Clean-path v2 (matched chroma inverse) |
| Sample timing contract | Absolute pixel boundaries (encoder ≡ decoder) |
| WAV PCM s16le | Encode + decode |
| Web Audio playback | Play / stop + TX progress |
| Waveform overview | Yes |
| START TRANSMIT | Encode + play audio |
| START RECEIVE | Mic capture + decode |
| FIDELITY lab | Normalized source vs reconstruction + metrics |
| Manifest import (contract v1) | Yes |

## Architecture (v2)

```
Image → normalize (stretch|contain|cover)
      → mode encoder (absolute sample plan, continuous phase FM)
      → WAV / Web Audio / capture
      → continuous FM demod (Hilbert → phase-diff IF)
      → sync acquisition + line timing tracker
      → pixel sample at absolute bounds (center 60%)
      → image + diagnostics
```

### Timing contract

Pixel intervals are derived from absolute boundaries:

```
start(x) = round(x * scanSamples / width)
end(x)   = round((x + 1) * scanSamples / width)
```

Encoder and decoder share `buildLinePlan()` so scan sample counts match exactly at 44.1 kHz and 48 kHz. Segment-level independent rounding is not used for pixel scans.

### Demodulation

Primary path: continuous instantaneous-frequency estimate (analytic signal via Hilbert FIR, phase-difference frequency, light post-filter). Short-window Goertzel remains available as a diagnostic/fallback in `tone-estimator.js`.

### Synchronization

Sync pulses are scored near the expected line start. A lightweight `LineTimingTracker` adapts line length and exposes per-line confidence. A bad line does not silently shift the remainder of the frame.

## Dashboard

**Transmit:** load image / test pattern / manifest → START TRANSMIT or Encode only → waveform → download WAV

**Receive:** START RECEIVE (mic) → STOP & DECODE, or Load WAV → reconstructed PNG

**Fidelity:** aspect fit → FIDELITY ROUND-TRIP → source / TX / reconstruction / difference heatmap / MAE·PSNR·SSIM

- Source image is stored separately from the mode transmission canvas; mode switches do not replace an uploaded image with the test pattern.
- Difference and metrics compare against the **normalized** transmission image, not the raw upload.

Mic path requires HTTPS or localhost. Captured audio is browser microphone input — not a calibrated radio IF.

## Tests

```bash
node --test sstv-tests.js
node --test sstv-fidelity-tests.js
```

See [SSTV_FIDELITY.md](./SSTV_FIDELITY.md) for measured targets, limitations, and interoperability notes.

## Boundaries

Independent of Acoustic Probe, neurofeedback, Echo isolation, ESP32 transport.
