# Acoustic Probe v0.1

Independent browser-native acoustic probing subsystem for SIGNAL·PROCESSOR.

This module generates coded linear-frequency chirps, detects them through the microphone via normalized cross-correlation, timestamps events, and exposes a transport-independent event interface.

It does **not** replace the existing signal processor, Echo Grid, optical sensors, or the neurofeedback reward pipeline.

## Public API

```js
window.AcousticProbe
```

| Method | Purpose |
|--------|---------|
| `setConfig(partial)` / `getConfig()` | Frequency range, duration, amplitude, interval, threshold |
| `startMonitoring()` | Request mic permission and begin continuous capture |
| `stopMonitoring()` | Release mic and stop detection loop |
| `ping()` | Emit one chirp through the audio output |
| `setAutoPing(enabled, intervalMs?)` | Periodic emission |
| `runSyntheticTest(opts?)` | Deterministic fixture — never claims to be physical |
| `onEvent(fn)` | Subscribe to emit / detection events |
| `getStatus()` / `getEvents()` / `clearEvents()` | Diagnostics |
| `generateChirp(opts)` / `matchedFilter(t, buf)` | Pure helpers (also used by tests) |

## Signal format

- **Type:** linear-frequency modulated (LFM) chirp
- **Default band:** 1.8–4.2 kHz (audible, configurable)
- **Default duration:** 40 ms
- **Envelope:** raised-cosine attack / release
- **Amplitude:** conservative linear gain (default 0.18)
- **Identity:** `probe_id` + frequency bounds + duration

Generation is pure and deterministic for identical parameters.

This is **not** advertised as a Doppler measurement. Frequency sweep is used only for coding / matched-filter discrimination.

## Detection

1. Template is generated at the AudioContext sample rate.
2. Microphone samples are captured continuously while monitoring.
3. A sliding window is correlated against the template using **normalized cross-correlation**.
4. Peaks above `detectionThreshold` (default 0.42) produce a detection event.
5. Duplicate peaks within `duplicateWindowMs` (default 80 ms) are suppressed.

## Timing semantics

| Field | Meaning |
|-------|---------|
| `emitted_at` / `detected_at` | Monotonic high-resolution timestamps (`performance.now`) |
| `wall_emitted_at` / `wall_detected_at` | Wall-clock (`Date.now`) — separate, not used for Δt |
| `estimated_latency_ms` | `detected_at − emitted_at` when both known |
| `sample_offset` | Lag (samples) of the correlation peak inside the analysis window |

**Measured:** sample rate, correlation peak, confidence, input RMS, clipping flag, monotonic emission/detection times.

**Estimated / approximate:** total system latency (includes output scheduling, hardware buffers, acoustic path, input capture). Browser audio buffering prevents treating single-device loopback latency as calibrated distance.

## Modes

| Mode | Meaning |
|------|---------|
| `idle` | Not monitoring |
| `live` | Real microphone capture |
| `synthetic` | Deterministic fixture test |
| `demo` | UI preview without claim of detection |
| `error` | Permission denied or device unavailable |

Synthetic detections always carry `mode: "synthetic"` and an explanatory `notes` field. They must never be confused with physical microphone detections.

## Independence

Acoustic events are **not** fed into:

- `SignalProducer` residual / isolation state
- Neurofeedback reward scoring
- `FieldObservation` / Echo SSE ingest

A future explicit adapter may bridge them; v0.1 does not.

## Browser limitations

- Requires HTTPS (or localhost) for `getUserMedia`.
- GitHub Pages satisfies HTTPS.
- Output scheduling time ≠ acoustic arrival time.
- Device-dependent latency and buffering.
- No guarantee of clock sync across tabs or devices.
- AudioWorklet is not required for v0.1 detection (main-thread correlation).

## Future spatial-grid groundwork

Interfaces are reserved (stubs only) for:

- Anchor identity and coordinates
- Transmission scheduling
- Clock synchronization
- Time Difference of Arrival (TDOA)
- Two-way ranging
- Sound-speed and Doppler compensation
- Position estimates with uncertainty

**v0.1 does not perform geographic positioning.** No fabricated coordinates or triangulation results are produced.

## Files

| File | Role |
|------|------|
| `acoustic-probe.js` | Core generator, detector, events, API |
| `acoustic-probe-ui.js` | Dashboard panel wiring |
| `acoustic-probe.css` | Panel styles |
| `acoustic-probe-tests.js` | Deterministic tests (no hardware) |
| `ACOUSTIC_EVENT_SCHEMA.md` | Event field reference |
| `ACOUSTIC_EXPERIMENT.md` | Local test procedure |
| `ACOUSTIC_TRANSPORT.md` | ESP32 / multi-node packet contract |

## Next step toward multi-anchor self-localization

1. ~~Define a stable serial / WebSocket packet for ESP32 acoustic anchors.~~ → [ACOUSTIC_TRANSPORT.md](ACOUSTIC_TRANSPORT.md)
2. Implement firmware on two ESP32 nodes emitting `tx` / `rx` events with independent `clock_id`s.
3. Log independent observations through `tools/acoustic_bridge.py`; verify CRC / schema / clock refusal guards.
4. Only after explicit `clock_uncertainty_us` binding, introduce a **separate** TDoA solver that never mutates neurofeedback.
