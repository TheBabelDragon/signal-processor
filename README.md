# SIGNAL · PROCESSOR

Binaural / isochronic / modulation processor plus a session loop.

https://github.com/TheBabelDragon/signal-processor

## Run

```bash
python3 -m http.server 8080
```

Pages: Settings → Pages → Source → GitHub Actions. Until that click, deploys fail.

## Neurofeedback

Not EEG. Not a medical device.

Stacks: alpha up, theta down, SMR, alpha-theta, beta focus.
Loop: entrain (open) or reward (hold target when score is high).
Polarity: reward high or inhibit high.
Sensors: none, manual tap, mic stillness, Echo / FieldObservation.

## Echo Grid — perchance not the array

This tab does **not** drive ultrasonic emitters. Echo already has `--body --drive`.

It *can* ingest Echo `FieldObservation` as the reward signal. See [BRIDGE.md](BRIDGE.md).

```bash
# Echo repo
python visualization/dashboard.py --csi --metafield-log /tmp/metafield/echo.jsonl

# this repo
python tools/echo_bridge.py --file /tmp/metafield/echo.jsonl
```

Same JSON works for optical-body-s3.

## License

MIT
