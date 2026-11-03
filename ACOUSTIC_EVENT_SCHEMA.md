# Acoustic Event Schema

Transport-independent, versioned event objects for acoustic probing.

- **v1** — browser AcousticProbe (ms monotonic + wall clocks)
- **v2** — ESP32 / multi-node transport (local µs clocks + identity domains)

Serial and WebSocket carry the **same logical event**. Framing is defined in [ACOUSTIC_TRANSPORT.md](ACOUSTIC_TRANSPORT.md).

---

## Schema version 2 (hardware / multi-node)

```json
{
  "schema_version": 2,
  "event_id": "uuid",
  "event_type": "tx",
  "node_id": "esp32-a1b2c3d4",
  "boot_id": "7f3c9e2a-1b0d-4e55-9c11-88aa00bbccdd",
  "sequence": 17,
  "clock_id": "esp32-a1b2c3d4:7f3c9e2a-1b0d-4e55-9c11-88aa00bbccdd",
  "sample_rate": 48000,
  "sample_counter": 129384000,
  "tx_scheduled_at_us": 2695500000,
  "tx_actual_at_us": 2695500125,
  "rx_detected_at_us": null,
  "clock_offset_estimate_us": null,
  "clock_uncertainty_us": null,
  "probe_id": "chirp-lf-v1",
  "frequency_start_hz": 1800,
  "frequency_end_hz": 4200,
  "duration_ms": 40,
  "correlation_peak": null,
  "confidence": null,
  "input_rms": null,
  "clipped": false,
  "peer_node_id": null,
  "peer_boot_id": null,
  "peer_sequence": null,
  "mode": "live",
  "notes": null
}
```

### Identity

| Field | Meaning |
|-------|---------|
| `node_id` | Persistent hardware identity |
| `boot_id` | Unique per power-on session |
| `sequence` | Monotonic counter within `(node_id, boot_id)` |
| `clock_id` | Clock domain key, typically `node_id:boot_id` |

**Shared sequence numbers do not imply synchronized clocks.**

### Timing (local to `clock_id`)

| Field | Unit | Notes |
|-------|------|-------|
| `sample_counter` | samples | Hardware position |
| `tx_scheduled_at_us` | µs | Intended TX |
| `tx_actual_at_us` | µs | Measured TX |
| `rx_detected_at_us` | µs | Measured detection on **this** node |
| `clock_offset_estimate_us` | µs | Estimate only |
| `clock_uncertainty_us` | µs | Required for cross-clock TDoA; null => refuse |

Machine-readable: [schemas/acoustic_event.v2.schema.json](schemas/acoustic_event.v2.schema.json)

---

## Schema version 1 (browser)

Browser AcousticProbe events use `schema_version: 1` with `emitted_at` / `detected_at` in monotonic milliseconds.

| Field | Notes |
|-------|-------|
| `emitted_at` / `detected_at` | Monotonic ms (`performance.now`) |
| `wall_*` | Wall clock; not for delta-t |
| `estimated_latency_ms` | Full system latency estimate |
| `mode: synthetic` | Never a physical detection |

### Transport

Logical events only. Framing: [ACOUSTIC_TRANSPORT.md](ACOUSTIC_TRANSPORT.md).
