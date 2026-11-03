# Acoustic Clock Model

## Domains

| Domain | Unit | Meaning |
|--------|------|---------|
| Local monotonic timer | µs | Node `*_at_us` fields; scoped by `clock_id` |
| Audio sample counter | frames | `sample_counter`; one frame = one multi-channel sample set |
| Host receive time | ms | Diagnostic ingest time only |

`sample_rate` is **frames per second**. Channel count does **not** multiply `sample_counter`.

## Relation between domains

Converting frames ↔ microseconds requires **measured** calibration (rate + uncertainty).
Do not use a nominal sample rate as a verified clock relationship.

On reboot, both domains reset; a new `boot_id` / `clock_id` begins.

DMA overruns: report explicit overrun; do not invent continuity across lost buffers.
If hardware cannot provide a trustworthy counter, leave `sample_counter` null / unavailable.

## Clock relationships

Stored separately from acoustic events (`ClockService`).

```
target_time ≈ source_time + offset_us
```

with `uncertainty_us` and optional relative rate. Direction is explicit; inverse may be derived by negating offset.

## TDoA eligibility

Cross-clock calculation is allowed only when:

1. A relationship exists between the two `clock_id`s
2. Status is `estimated` or `validated`
3. Relationship is not expired
4. Propagated uncertainty ≤ configured limit

Matching `sequence` or `ping_id` does **not** establish synchronization.
