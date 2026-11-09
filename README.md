# SIGNAL · PROCESSOR

Binaural / isochronic / modulation processor plus a session loop — and an offline **SSTV signal-gen** workstation.

**Live demo → [thebabeldragon.github.io/signal-processor](https://thebabeldragon.github.io/signal-processor/)** ✨

https://github.com/TheBabelDragon/signal-processor

## Run locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080

### GitHub Pages

Already deployed: **[https://thebabeldragon.github.io/signal-processor/](https://thebabeldragon.github.io/signal-processor/)**

If deploys ever fail, check **Settings → Pages → Source → GitHub Actions** (one-time setup).

## SSTV · SIGNAL GEN

Offline Martin M1 and Robot 36 encode/decode (clean-path).

**Transmit**
- Load image or test pattern; optional BabelCodec `.job.json` manifest
- Encode → progress bar → waveform → **Play** / **Stop** / download WAV

**Receive**
- Load WAV → waveform → play → decode → download PNG
- Mode: Auto (VIS), Martin M1, or Robot 36

Contract v1 handoff with [BabelCodec](https://github.com/TheBabelDragon/BabelCodec).

Docs: [sstv/SSTV.md](sstv/SSTV.md) · [sstv/SSTV_MODES.md](sstv/SSTV_MODES.md)

Tests: `node --test sstv-tests.js`

WAV export is **not** an over-the-air transmission. Observe applicable regulations if you later feed audio to a radio.

## Producer contract

This app is the **stimulus**. Observation lives in optical-body-s3 / eeg-loop.

Each PLAY is a cold start: start → stop → isolate. See [PRODUCER.md](PRODUCER.md).
Audio only. No body voltage.

## Neurofeedback

Not EEG. Not a medical device.

Stacks: alpha up, theta down, SMR, alpha-theta, beta focus.
Loop: entrain (open) or reward (hold target when score is high).
Polarity: reward high or inhibit high.
Sensors: none, manual tap, mic stillness, Echo / FieldObservation.

## Acoustic Probe (v0.1)

Independent browser-native acoustic probing subsystem. Does **not** share code paths with SSTV.

Docs: [ACOUSTIC_PROBE.md](ACOUSTIC_PROBE.md)

## Acoustic Transport (ESP32)

Packet contract for independent acoustic anchors. See [ACOUSTIC_TRANSPORT.md](ACOUSTIC_TRANSPORT.md).

## License

MIT
