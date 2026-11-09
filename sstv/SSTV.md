# SSTV subsystem (Signal Processor)

Standalone SSTV encode/decode for the Signal Processor app.

## Status

| Capability | State |
|------------|-------|
| Mode registry | Martin M1, Robot 36 |
| Martin M1 encode | **Implemented** |
| Martin M1 decode | **Implemented** (clean path) |
| Robot 36 encode | **Implemented** |
| Robot 36 decode | **Implemented** (clean path) |
| WAV PCM s16le | Encode + decode |
| UI panel | Transmit / Receive |
| BabelCodec contract v1 | Validator present |

## Round-trip

```js
import { encodeImageToWav, decodeAudio, solidImage } from './sstv/index.js';

const img = solidImage(320, 240, 40, 180, 60);
const { wav } = encodeImageToWav(img, 'robot36', { sampleRate: 48000 });
const decoded = decodeAudio(wav, { modeHint: 'robot36' });
```

Tests: `node --test sstv-tests.js`

## Boundaries

SSTV does **not** use Acoustic Probe, neurofeedback, Echo isolation, or ESP32 acoustic transport.

## Contract

BabelCodec integration uses `contract_version: 1` (file-based handoff only).
