# SSTV subsystem (Signal Processor)

Standalone SSTV encode/decode + signal-gen dashboard UI.

## Status

| Capability | State |
|------------|-------|
| Martin M1 encode/decode | Clean-path |
| Robot 36 encode/decode | Clean-path |
| WAV PCM s16le | Encode + decode |
| Web Audio playback | Play / stop + TX progress |
| Waveform overview | Yes |
| START TRANSMIT | Encode + play audio |
| START RECEIVE | Mic capture + decode |
| Manifest import (contract v1) | Yes |

## Dashboard

**Transmit:** load image / test pattern / manifest → START TRANSMIT or Encode only → waveform → download WAV

**Receive:** START RECEIVE (mic) → STOP & DECODE, or Load WAV → reconstructed PNG

Mic path requires HTTPS or localhost. Captured audio is browser microphone input — not a calibrated radio IF.

## Tests

```bash
node --test sstv-tests.js
```

## Boundaries

Independent of Acoustic Probe, neurofeedback, Echo isolation, ESP32 transport.
