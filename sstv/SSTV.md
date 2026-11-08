# SSTV subsystem (Signal Processor)

Standalone SSTV encode/decode for the Signal Processor app.

## Status

| Capability | State |
|------------|-------|
| Mode registry | Martin M1, Robot 36 defined |
| Martin M1 encode | **Implemented** |
| Robot 36 encode | Registry only |
| Decoder | Planned |
| WAV PCM s16le | Encode + decode |
| UI panel | Planned |
| BabelCodec contract v1 | Validator present |

## Boundaries

SSTV does **not** use Acoustic Probe, neurofeedback, Echo isolation, or ESP32 acoustic transport.

## Usage

```js
import { encodeImageToWav, solidImage, decodeWavPcm16 } from './sstv/index.js';

const img = solidImage(320, 256, 32, 160, 220);
const { wav, durationMs, visCode } = encodeImageToWav(img, 'martin_m1', { sampleRate: 48000 });
const decoded = decodeWavPcm16(wav);
```

## Contract

See BabelCodec `docs/integrations/SIGNAL_PROCESSOR.md` and `schemas/media/signal-processor-job.v1.schema.json`.
Signal Processor implements `contract_version: 1`.
