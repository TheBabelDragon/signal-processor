# Acoustic Grid Architecture

N-node distributed acoustic fabric. Two ESP32 nodes are the smallest useful deployment, not a design limit.

## Layers

| Layer | Location | Role |
|-------|----------|------|
| Logical events | schema v2 | Identity, probe, observation, timing fields |
| Transport framing | serial / WS | NDJSON or AP binary CRC frames |
| Host ingest | `tools/acoustic_grid/` | Registry, correlation, clock service, log |
| Firmware | `firmware/` | Identity, clock, audio HAL, probe, observer |
| TDoA solver | *future, separate* | Consumes eligible pairs only |

## Entities

- **Node** — persistent `node_id`, session `boot_id`, `clock_id`
- **Probe** — globally unique `ping_id` for one transmission experiment
- **Observation** — per-receiver report referencing `ping_id`
- **Clock relationship** — measured offset + uncertainty between `clock_id`s

One probe may yield 0..N observations. Missing receivers stay representable.

## Event flow

```
ESP32 A  --tx-->  acoustic medium  --rx-->  ESP32 B
   |                                         |
   +-- serial/WS event ----------------------+--> GridIngest
                                                  ├─ GridRegistry
                                                  ├─ ProbeCorrelationIndex
                                                  ├─ ClockService
                                                  └─ AppendOnlyEventLog
```

Host arrival time is diagnostic only and never used for ranging.

## Scale assumptions

- Arbitrary node counts (tested to 64 logical nodes in simulation)
- Independent clocks; no coordinator clock authority
- Topology snapshots and deterministic replay

## Boundaries

- No neurofeedback coupling
- No automatic TX at boot
- No fabricated positions or clock certainty
- No fixed 2/4-node arrays in code
