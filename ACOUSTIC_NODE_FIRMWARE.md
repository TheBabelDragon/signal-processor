# Acoustic Node Firmware

See [firmware/README.md](firmware/README.md).

## Profiles

- `generic` — ESP32, configurable I2S/GPIO via config (not pin-validated)
- `esp32s3` — preferred initial profile

## Lifecycle

1. Boot → new `boot_id`, sequence reset
2. `hello` with capabilities, sample_rate, clock_id
3. Default **receive-only**
4. Explicit arm for TX; emit `tx` with `ping_id`, `tx_actual_at_us`, `sample_counter`
5. On detection emit `rx` / `miss` with local timing + optional peer refs

## Build status

ESP-IDF project structure is present. **Physical compile requires local IDF install** and is not executed in CI in this milestone. Components are stubs pending board-specific audio drivers.
