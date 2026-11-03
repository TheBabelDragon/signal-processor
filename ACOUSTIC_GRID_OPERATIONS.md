# Acoustic Grid Operations

## Host tests

```bash
python tools/acoustic_transport_tests.py
python tools/acoustic_grid_tests.py
```

## Two-node physical path

1. Flash two boards with distinct node_id
2. Open serial sessions into host ingest / bridge
3. Verify independent `clock_id`s
4. TX on A, RX on B; correlate by `ping_id`
5. TDoA eligibility remains false until ClockService has a measured relationship

## Four-node expansion

1. One TX + three RX first
2. Node loss/recovery via registry status
3. Second TX only after collision-safe scheduling exists

## Limitations

- Firmware audio HAL not hardware-validated
- Clock relationships are not auto-estimated from acoustic data in this milestone
- No position fixes
