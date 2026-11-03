# Acoustic Grid Firmware (ESP-IDF)

Hardware-independent foundation for ESP32 / ESP32-S3 acoustic nodes.

**Status:** architecture + stubs. Not validated on physical hardware in this milestone.

## Layout

```
firmware/
  main/
  components/acoustic_{core,identity,clock,audio,transport,probe,observer}/
  config/
```

## Targets

| Profile | Target | Notes |
|---------|--------|-------|
| `generic` | ESP32 | Configurable pins; no assumed mic/codec |
| `esp32s3` | ESP32-S3 | Initial preferred profile |

## Build

```bash
cd firmware
idf.py set-target esp32s3
idf.py build
```

Requires ESP-IDF. Host Python tools do not need IDF.

## Safety defaults

- No automatic transmission at boot
- Receive-only until explicit TX arm
- No ultrasonic high-power drive in this tree

## Sample counter

`sample_counter` = audio **frames** (not channel-multiplied). See ACOUSTIC_CLOCK_MODEL.md.
