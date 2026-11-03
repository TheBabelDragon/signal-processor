# Acoustic Event Schema v1

Transport-independent, versioned event objects produced by AcousticProbe.

```json
{
  "schema_version": 1,
  "event_id": "uuid",
  "probe_id": "chirp-lf-v1",
  "node_id": "browser-local",
  "sequence": 1,
  "event_type": "detection",
  "emitted_at": 12345.67,
  "detected_at": 12378.21,
  "wall_emitted_at": 1730000000123,
  "wall_detected_at": 1730000000156,
  "sample_rate": 48000,
  "sample_offset": 412,
  "estimated_latency_ms": 32.54,
  "frequency_start_hz": 1800,
  "frequency_end_hz": 4200,
  "duration_ms": 40,
  "correlation_peak": 0.91,
  "confidence": 0.91,
  "input_rms": 0.0123,
  "clipped": false,
  "mode": "live",
  "notes": null
}
```

## Field reference

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `schema_version` | number | fixed | Currently `1` |
| `event_id` | string | generated | Unique per event |
| `probe_id` | string | config | Template identity |
| `node_id` | string | config | Local or future anchor ID |
| `sequence` | number | monotonic | Emission sequence counter |
| `event_type` | string | measured | `emit` · `detection` · `miss` |
| `emitted_at` | number \| null | measured | Monotonic ms (`performance.now`) |
| `detected_at` | number \| null | measured | Monotonic ms |
| `wall_emitted_at` | number \| null | measured | Wall clock; not for Δt |
| `wall_detected_at` | number \| null | measured | Wall clock; not for Δt |
| `sample_rate` | number | measured | AudioContext / capture rate |
| `sample_offset` | number \| null | measured | Correlation lag (samples) |
| `estimated_latency_ms` | number \| null | **estimate** | `detected_at − emitted_at` when both known |
| `frequency_start_hz` | number | config | Chirp start |
| `frequency_end_hz` | number | config | Chirp end |
| `duration_ms` | number | config | Chirp duration |
| `correlation_peak` | number \| null | measured | Normalized cross-correlation peak |
| `confidence` | number \| null | measured | Currently equal to peak (0–1) |
| `input_rms` | number \| null | measured | Recent input RMS |
| `clipped` | boolean | measured | Any sample near full-scale |
| `mode` | string | measured | `live` · `synthetic` · `demo` · `error` |
| `notes` | string \| null | optional | Human-readable caveat |

## Measured vs estimated

**Directly measured**

- Sample rate, correlation peak, confidence, input RMS, clipping
- Monotonic emit / detect times
- Sequence number and event identity

**Estimated / approximate**

- `estimated_latency_ms` — includes OS/audio-stack buffering, not pure acoustic flight time
- Future TDOA / range / position fields (not present in v0.1)

## Event types

| Type | Meaning |
|------|---------|
| `emit` | Local generation of a probe chirp |
| `detection` | Template match above threshold |
| `miss` | Synthetic or scheduled attempt that did not exceed threshold |

## Mode discipline

- `mode: "synthetic"` events are **never** physical microphone detections.
- UI and consumers must treat synthetic and live streams as distinct.
- No event in v0.1 claims calibrated distance or geographic position.

## Transport

Events are plain JSON-serializable objects. Compatible future transports:

- In-page callbacks (`onEvent`)
- WebSocket
- SSE
- Serial-connected ESP32 nodes (via a local bridge)

Pages hosting remains static. A persistent server is not required for local mic experiments.
