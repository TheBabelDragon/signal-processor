# Acoustic Probe — Local Experiment (v0.1)

Single-device speaker → microphone loop experiment.

## Goal

Verify that the browser can:

1. Generate a coded LFM chirp.
2. Capture microphone audio with explicit permission.
3. Detect the known template via normalized cross-correlation.
4. Emit versioned events with sequence IDs and timing fields.
5. Display results without confusing synthetic and live detections.

## Prerequisites

- Modern Chromium / Firefox / Safari with Web Audio + `getUserMedia`.
- HTTPS context (GitHub Pages or `localhost`).
- Speakers or headphones **and** a microphone (built-in is fine).
- For headphones-only: expect higher latency and possible cancellation; results still valid as system-latency measurements, not distance.

## Procedure

### A. Synthetic (no hardware)

1. Open the SIGNAL·PROCESSOR page.
2. Locate the **ACOUSTIC PROBE** panel.
3. Click **SYNTHETIC TEST**.
4. Confirm:
   - An event appears with `mode: synthetic`.
   - `event_type` is `detection` (or `miss` if threshold is extreme).
   - Notes field states it is not a physical detection.
5. Run tests in console: `AcousticProbeTests.runAll()`.

### B. Live microphone

1. Click **START MONITOR**.
2. Grant microphone permission when prompted.
3. Confirm badge shows **LIVE** and sample rate is reported.
4. Click **PING** (or enable **AUTO PING**).
5. Observe:
   - An `emit` event.
   - Shortly after, a `detection` event with `mode: live` (if the acoustic path is open).
   - Confidence / correlation peak / estimated latency readouts update.
6. Input level meter should respond to ambient sound; clipping flag if overloaded.

### C. Failure cases

| Condition | Expected |
|-----------|----------|
| Permission denied | Badge **ERROR**, status message, no silent fake detections |
| No microphone | Same as denied / unavailable |
| Threshold too high | Emits without detections |
| Synthetic only | Never labels events as `live` |

## Interpreting latency

`estimated_latency_ms` is **total system latency**:

```
output scheduling + DAC buffer + acoustic path + ADC buffer + capture pipeline
```

Do **not** treat single-device loopback latency as calibrated distance.

Acoustic propagation delay is only a fraction of the observed Δt on typical laptops/phones.

## Known measurement error sources

- Browser audio thread buffering and quantum size
- OS mixer / exclusive-mode vs shared-mode differences
- Echo cancellation / AGC (disabled by default in the getUserMedia constraints)
- Speaker–mic coupling and room reflections
- Sample-rate conversion in the capture path
- Main-thread correlation stride / window placement (v0.1)

## Console checks

```js
AcousticProbe.getStatus()
AcousticProbe.getEvents()
AcousticProbeTests.runAll()
```

## ESP32 boundary (future)

V0.1 defines the browser event schema only. A later milestone may:

- Accept the same JSON over WebSocket / serial bridge from ESP32 nodes.
- Schedule transmissions by `node_id` + `sequence`.
- Compute TDOA across multiple anchors.

No ultrasonic hardware control is included in this milestone.
