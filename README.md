# SIGNAL · PROCESSOR

Browser app that layers binaural beats, isochronic pulses, or amplitude modulation onto a dropped audio file. Live preview and WAV export share the same Web Audio graph.

https://github.com/TheBabelDragon/signal-processor

Serve the folder (needed for AudioWorklet):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Layout

- `index.html` — UI shell
- `style.css` — phosphor theme
- `engine.js` — envelopes, worklet, graph, WAV encode
- `ui.js` — presets, playback, export

## Modes

- **Binaural** — carrier in the left ear, carrier + beat in the right. Headphones required.
- **Isochronic** — pulsed carrier mixed under the music.
- **Modulation** — the music itself is amplitude-gated at the pulse rate.

Recipes (JSON) can be exported and reloaded from Advanced.

## Fixes vs the original single-file draft

- Offline export now connects the limiter to `destination` (was rendering silent WAVs).
- Meter taps the limiter instead of stealing the only output path.
- Empty / NaN advanced fields no longer throw during play/export.
- Share-sheet cancel is treated as cancel, not a hard failure.
- Worklet blob URLs are revoked after load.

## Notes

- Isochronic and modulation need `AudioWorklet`. Prefer http(s), not `file://`.
- Export is 16-bit stereo WAV at the source file's sample rate.
- The compressor at the end of the graph is a soft ceiling, not a mastering limiter.
- This is a signal processor, not a clinical device.

## License

MIT
