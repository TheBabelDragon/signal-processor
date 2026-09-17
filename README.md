# SIGNAL · PROCESSOR

Binaural / isochronic / modulation processor plus a session loop.

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

Incoming `health=partial` (optical dark isolation still CHARGE/FAULT) is not treated as a full reward.

## Echo Grid — perchance not the array

This tab does **not** drive ultrasonic emitters. Echo already has `--body --drive`.

It *can* ingest Echo `FieldObservation` as the reward signal. See [BRIDGE.md](BRIDGE.md).

Same JSON works for optical-body-s3.

## License

MIT
