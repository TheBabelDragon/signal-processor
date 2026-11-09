# SSTV subsystem (Signal Processor)

Standalone SSTV encode/decode + signal-gen dashboard UI.

## Status

| Capability | State |
|------------|-------|
| Martin M1 encode/decode | Clean-path |
| Robot 36 encode/decode | Clean-path |
| WAV PCM s16le | Encode + decode |
| Web Audio playback | Play / stop |
| Waveform overview | Yes |
| Encode progress | Yes |
| Manifest import (contract v1) | Yes |
| Mic live decode | Not in this milestone |

## Dashboard

Panel title: **SSTV · SIGNAL GEN**

- **Transmit:** load image or test pattern, optional BabelCodec `.job.json`, encode, waveform, play, download WAV
- **Receive:** load WAV, waveform, play, decode, download PNG

## Tests

```bash
node --test sstv-tests.js
```

## Boundaries

Independent of Acoustic Probe, neurofeedback, Echo isolation, ESP32 transport.
