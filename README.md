# SIGNAL · PROCESSOR

Browser app: binaural / isochronic / modulation processor plus a session loop for band-targeted audio work.

Repo: https://github.com/TheBabelDragon/signal-processor

Live (enable Pages once): https://thebabeldragon.github.io/signal-processor/

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## GitHub Pages

Settings → Pages → Source → **GitHub Actions**. One click. Until that is on, the deploy workflow fails.

## Neurofeedback

This is **not EEG**. Binaural/isochronic audio is open-loop entrainment. The session panel adds a reward loop on top:

- **entrain** — lock beat/pulse to delta / theta / alpha / SMR / beta / gamma
- **reward loop** — high reward holds the target Hz; low reward drifts it ~2 Hz off and drops tone level
- **sensors**
  - `none` — open loop
  - `manual tap` — you are the classifier
  - `mic stillness` — quiet room / still body raises reward (biofeedback proxy)
  - `external` — push a 0..1 score from a real headset / MetaField node

External hook:

```js
window.SignalObservation.push(0.8);
window.dispatchEvent(new CustomEvent('signal-observation', { detail: { score: 0.8 } }));
```

Beds: pink / brown / silence so you do not need a music file. Headphones on for binaural.

Not a medical device.

## License

MIT
