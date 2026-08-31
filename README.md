# SIGNAL · PROCESSOR

Single-file browser app that layers binaural beats, isochronic pulses, or amplitude modulation onto a dropped audio file. Live preview and WAV export share the same Web Audio graph.

Open [`index.html`](index.html) in a modern Chromium or Firefox browser, or serve the folder:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Modes

- **Binaural** — carrier in the left ear, carrier + beat in the right. Headphones required.
- **Isochronic** — pulsed carrier mixed under the music.
- **Modulation** — the music itself is amplitude-gated at the pulse rate.

Recipes (JSON) can be exported and reloaded from Advanced. The three chips at the top are starting points, not locked presets.

## Notes

- Isochronic and modulation need `AudioWorklet`. Safari older than 14.1, and some `file://` contexts, fall back to binaural-only.
- Export is 16-bit stereo WAV at the source file's sample rate.
- The compressor at the end of the graph is a soft ceiling, not a mastering limiter.
- This is a signal processor, not a clinical device.

## License

MIT
