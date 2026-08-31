# Echo Grid bridge

**Perchance not:** this app does not fire the ultrasonic array.
Echo Grid already owns `--body --drive`. Keep it there.

**Perchance yes:** Echo `FieldObservation` packets can drive the *reward* loop.

```
CSI / body  →  Echo Grid  →  echo.jsonl  →  echo_bridge.py  →  SSE  →  SIGNAL·PROCESSOR reward
```

```bash
# terminal A — Echo (repo: echo-grid-ultrasonic-os)
python visualization/dashboard.py --csi --metafield-log /tmp/metafield/echo.jsonl

# terminal B — this repo
python tools/echo_bridge.py --file /tmp/metafield/echo.jsonl --port 8765

# terminal C
python3 -m http.server 8080
```

In the UI: sensor = `echo / field obs`, stream = `http://127.0.0.1:8765/events`.

Reward mapping (stillness-shaped):

```
score = 1 - (0.55·motion + 0.25·drive + 0.20·entropy)
```

Flip polarity to *inhibit high* if you want motion to be the rewarded state.

Same ingest works for optical-body-s3 packets — same schema.
