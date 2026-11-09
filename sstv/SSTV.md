# SSTV subsystem (Signal Processor)

Standalone SSTV encode/decode for the Signal Processor app.

## Status

| Capability | State |
|------------|-------|
| Mode registry | Martin M1, Robot 36 |
| Martin M1 encode | **Implemented** |
| Martin M1 decode | **Implemented** (clean / lightly degraded path) |
| Robot 36 encode | **Implemented** |
| Robot 36 decode | Not yet |
| WAV PCM s16le | Encode + decode |
| UI panel | Transmit / Receive |
| BabelCodec contract v1 | Validator present |

## Round-trip (Martin M1)

```js
import { encodeImageToWav, decodeAudio, solidImage } from './sstv/index.js';

const img = solidImage(320, 256, 40, 180, 60);
const { wav } = encodeImageToWav(img, 'martin_m1', { sampleRate: 48000 });
const decoded = decodeAudio(wav, { modeHint: 'martin_m1' });
```

Robot 36 can be encoded the same way (`mode: 'robot36'`); decode still requires Martin path or an external decoder.

Tests: `node --test sstv-tests.js`

## Boundaries

SSTV does **not** use Acoustic Probe, neurofeedback, Echo isolation, or ESP32 acoustic transport.

## Contract

BabelCodec `docs/integrations/SIGNAL_PROCESSOR.md` · `contract_version: 1`.
