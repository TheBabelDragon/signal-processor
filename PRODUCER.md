# Producer contract

`signal-processor` is the **audio stimulus** side of the pair:

```
signal-processor  = producer (sound)
eeg-loop          = observer (EEG)     — later
optical-body-s3   = observer (light)
```

It is a cold start. Each PLAY / SESSION is `start → run → stop → isolate`.
A packet after stop is not clean until residual is HOLD or RELAX.

## What this implements

- `producer.js` — `SignalProducer.noteStart` / `noteStop`
- residual `q` from the output analyser after STOP (graph leftover, not a photodiode)
- ingest of optical-body `health=partial` does **not** count as a full reward

## What this does not implement

- electrode voltage, TENS, −V bias on skin
- Echo Grid `--body --drive`
- iPhone private rails / Secure Enclave / undocumented IOKit
- a discrete memristor on the oscillator

Phone sensors may later feed **reward** the same way Echo already does.
They do not become the producer rail.

## Packet shape

See `SignalProducer.packet()`. Compatible with FieldObservation ingest:
`health`, `modality.phase`, `modality.isolated`, `modality.body_drive: false`.
