# Acoustic Transport Contract v1

ESP32 anchor transport for SIGNAL·PROCESSOR acoustic events.

**Rule:** the logical acoustic event is transport-independent. Serial and WebSocket carry the *same* event object. Framing, checksums, and session handshake are transport concerns only.

This milestone defines the packet contract and a local bridge. It does **not** implement a TDoA solver, geographic positioning, or ultrasonic array drive.

---

## 1. Architectural boundaries

| Layer | Responsibility |
|-------|----------------|
| **Logical event** | Identity, timing metadata, probe parameters, detection scores |
| **Transport frame** | Magic, version, length, checksum (serial) or envelope (WebSocket) |
| **Bridge** | Host-side serial ↔ WebSocket/SSE fan-out |
| **TDoA solver** | *Future, separate* — consumes events; never mutates neurofeedback |

Shared `sequence` values **do not** imply synchronized clocks. See §4.

---

## 2. Node identity

| Field | Meaning |
|-------|---------|
| `node_id` | Persistent hardware identity (e.g. `esp32-` + MAC suffix). Survives reboot. |
| `boot_id` | Unique per power-on / firmware restart session. New boot ⇒ new `boot_id`. |
| `sequence` | Monotonic event counter **within** `(node_id, boot_id)`. Starts at 1 after boot. |
| `clock_id` | Local clock domain string: `{node_id}:{boot_id}`. Timestamps with the same `clock_id` share one oscillator domain. |

### Rules

- Never reuse `boot_id` across reboots.
- Never compare `sequence` across different `node_id` or `boot_id` as a time reference.
- `clock_id` is the only safe key for "same clock domain."

---

## 3. Logical event schema (v2)

Extends browser Acoustic Event Schema v1. All times that matter for ranging are **integer microseconds** on the node's local sample/clock domain, not browser `performance.now`.

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
  "peer_sequence": null,
  "peer_boot_id": null,
  "mode": "live",
  "notes": null
}
```

### Event types

| `event_type` | Producer | Meaning |
|--------------|----------|---------|
| `hello` | node | Session announce after boot (identity + sample_rate) |
| `status` | node | Health / buffer / clip diagnostics |
| `tx` | transmitter | Probe was (or will be) transmitted |
| `rx` | receiver | Probe template matched on this node |
| `miss` | receiver | Expected window closed without detection |
| `sync` | node | Optional clock-sync observation (offset + uncertainty) |

### Timing fields

| Field | Unit | Measured / estimated | Notes |
|-------|------|----------------------|-------|
| `sample_counter` | samples | measured | Hardware audio sample position at event |
| `tx_scheduled_at_us` | µs | scheduled | Intended TX time on local clock |
| `tx_actual_at_us` | µs | measured | Measured TX start on local clock |
| `rx_detected_at_us` | µs | measured | Detection time on **receiver** local clock |
| `clock_offset_estimate_us` | µs | **estimate** | Local − network (or peer) time, if known |
| `clock_uncertainty_us` | µs | **estimate** | 1σ or bound on offset; null if unknown |

**All `*_at_us` values are local to `clock_id` unless a documented sync protocol has bound `clock_uncertainty_us`.**

Browser v1 fields (`emitted_at`, `detected_at` in ms) remain valid for browser-local events. ESP32 nodes use the microsecond local-clock fields above. Bridges may map browser events into v2 by setting `node_id=browser-local`, a session `boot_id`, and leaving ESP32-only fields null.

### Peer references (optional on `rx`)

When a receiver believes it matched a specific transmitter's probe:

- `peer_node_id`, `peer_boot_id`, `peer_sequence` — **claims**, not proof of clock alignment.
- Correlation still runs against the known probe template; peer fields are scheduling metadata.

---

## 4. Clock discipline (critical)

```
sequence equality  ≠  synchronized clocks
same probe_id      ≠  common time base
wall-clock stamps  ≠  ranging timestamps
```

Safe TDoA inputs (future solver):

1. `rx_detected_at_us` on receiver `clock_id` A
2. `tx_actual_at_us` on transmitter `clock_id` B
3. An explicit sync relation between A and B with finite `clock_uncertainty_us`

Unsafe:

- Subtracting sequences across nodes
- Treating USB arrival time on the host as acoustic arrival
- Assuming NTP/wall clock is good enough without stating uncertainty

If `clock_uncertainty_us` is null, a TDoA solver **must refuse** to emit a position fix that depends on that clock pair.

---

## 5. Serial framing

Two modes. Implementations must support **NDJSON** for bring-up; **binary framed** is preferred for multi-node production.

### 5.1 NDJSON (debug / USB serial)

- UTF-8, one JSON object per line, terminated by `\n`
- Optional prefix `AP ` (ASCII) before JSON for easy grepping
- No checksum (rely on USB reliability + JSON parse)

Example:

```
AP {"schema_version":2,"event_type":"hello","node_id":"esp32-a1b2c3d4",...}
```

### 5.2 Binary frame (production)

| Offset | Size | Field |
|--------|------|-------|
| 0 | 2 | Magic `0x41 0x50` (`AP`) |
| 2 | 1 | `frame_version` = `1` |
| 3 | 1 | `payload_type` = `1` (JSON UTF-8) |
| 4 | 2 | `length` big-endian (payload bytes) |
| 6 | N | payload (logical event JSON) |
| 6+N | 2 | CRC-16/CCITT-FALSE over bytes `[2 .. 6+N)` (version through end of payload) |

Constraints:

- `length` ≤ 2048
- Invalid magic / CRC / length ⇒ drop frame, do not partially apply
- Host may reply with the same framing

CRC-16 poly `0x1021`, init `0xFFFF`, no final xor (CCITT-FALSE).

### 5.3 Baud / port defaults

- 115200 8N1 unless documented otherwise
- One logical node per serial port (or multiplexed with explicit `node_id` in every event)

---

## 6. WebSocket / SSE envelope

Host bridge may republish logical events without binary framing:

**WebSocket text message** — raw logical event JSON (preferred), or:

```json
{
  "transport": "ws",
  "frame_version": 1,
  "received_at_host_ms": 1730000000123,
  "payload": { /* logical event schema_version 2 */ }
}
```

`received_at_host_ms` is **host USB/network arrival time**. It is not an acoustic timestamp and must not be used for TDoA.

**SSE** (`text/event-stream`): `data: <logical-event-json>\n\n`

---

## 7. Session bootstrap

1. Node boots → generates `boot_id`, resets `sequence` to 0.
2. Node sends `hello` with `sequence=1`, `sample_rate`, `node_id`, `boot_id`, `clock_id`.
3. Host records session; subsequent events must match `(node_id, boot_id)` or be treated as a new session.
4. Optional host `sync` request (future) — out of scope for contract v1 beyond field reservation.

---

## 8. Hardware acceptance path

### Phase A — two nodes (this milestone's goal)

1. Two ESP32 nodes, independent clocks, known `node_id`s.
2. Node A transmits coded chirp → emits `tx` with `tx_actual_at_us` + `sample_counter`.
3. Node B detects → emits `rx` with `rx_detected_at_us` + `sample_counter` + optional peer refs.
4. Host logs both streams with transport framing stripped; events remain independently timed.
5. Verify: sequences monotonic per boot; CRC/NDJSON parse; no cross-node sequence arithmetic.

### Phase B — four anchors

Same contract; add scheduling so only one TX per time slot; still no TDoA solver required for transport acceptance.

### Explicit non-goals of transport v1

- Position estimates
- Sound-speed models
- Automatic clock steering
- Neurofeedback coupling

---

## 9. Host tools

| Tool | Role |
|------|------|
| `tools/acoustic_bridge.py` | Serial (NDJSON and binary) → SSE/HTTP fan-out |
| `tools/acoustic_transport_tests.py` | Framing, CRC, schema validation |
| `schemas/acoustic_event.v2.schema.json` | JSON Schema for logical events |

```bash
# Serial node → host
python tools/acoustic_bridge.py --serial /dev/ttyUSB0 --port 8766

# SSE for browser or logger
# GET http://127.0.0.1:8766/events
```

Pages remains static. The bridge is a **local** process, same pattern as `tools/echo_bridge.py`.

---

## 10. Compatibility with browser AcousticProbe v0.1

| Browser v1 | ESP32 / transport v2 |
|------------|----------------------|
| `emitted_at` (ms mono) | map to notes or omit; prefer `tx_actual_at_us` on hardware |
| `detected_at` | `rx_detected_at_us` |
| `node_id` | same |
| `sequence` | same semantics, scoped by `boot_id` |
| `mode: synthetic` | never emitted by ESP32 hardware path |

Browser synthetic events remain labeled `mode: "synthetic"` and must not enter hardware observation logs without an explicit adapter flag.

---

## 11. Versioning

| Version | Scope |
|---------|--------|
| Logical `schema_version: 2` | Identity + clock domain fields |
| `frame_version: 1` | Binary serial framing |
| Transport doc v1 | This document |

Breaking changes to field meaning require a schema_version bump. Additive optional fields may stay on the same version if defaults are null-safe.
