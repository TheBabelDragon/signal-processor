# SIGNAL · PROCESSOR

Browser app that layers binaural beats, isochronic pulses, or amplitude modulation onto a dropped audio file. Live preview and WAV export share the same Web Audio graph.

Repo: https://github.com/TheBabelDragon/signal-processor

Live (after Pages is enabled once): https://thebabeldragon.github.io/signal-processor/

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. Serve over http — AudioWorklet is unreliable on `file://`.

## GitHub Pages

A workflow deploys `main` on every push. First time only:

1. Repo → **Settings** → **Pages**
2. Source: **GitHub Actions**

After that, https://thebabeldragon.github.io/signal-processor/ tracks `main`.

## Layout

- `index.html` — UI shell
- `style.css` — phosphor theme
- `engine.js` — envelopes, worklet, graph, WAV encode
- `ui.js` — presets, playback, export
- `recipes/` — example JSON recipes (load from Advanced)

## Modes

- **Binaural** — carrier left, carrier + beat right. Headphones required.
- **Isochronic** — pulsed carrier mixed under the music.
- **Modulation** — the music itself is amplitude-gated at the pulse rate.

## Notes

- Export is 16-bit stereo WAV at the source sample rate.
- The compressor is a soft ceiling, not a mastering limiter.
- Not a clinical device.

## License

MIT
