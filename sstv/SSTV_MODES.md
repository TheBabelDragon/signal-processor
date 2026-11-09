# SSTV Modes

## Martin M1

| Property | Value |
|----------|-------|
| VIS | 44 (0x2C) |
| Resolution | 320 × 256 |
| Color | RGB, scan order **G-B-R** |
| Sync | 4.862 ms @ 1200 Hz |
| Porch | 0.572 ms @ 1500 Hz |
| Scan | 146.432 ms per component |
| Separator | 0.572 ms @ 1500 Hz after each component |
| Line | 446.446 ms |
| Encoder / Decoder | **Yes** / **Yes** (clean-path) |

## Robot 36

| Property | Value |
|----------|-------|
| VIS | 8 (0x08) |
| Resolution | 320 × 240 |
| Color | Y / R-Y / B-Y (alternating chroma) |
| Sync | 9.0 ms @ 1200 Hz |
| Sync porch | 3.0 ms @ 1500 Hz |
| Y scan | 88.0 ms |
| Separator | 4.5 ms — **1500 Hz even (R-Y)** / **2300 Hz odd (B-Y)** |
| Chroma porch | 1.5 ms @ 1900 Hz |
| Chroma scan | 44.0 ms |
| Line | ~150 ms |
| Encoder / Decoder | **Yes** / **Yes** (clean-path) |

## Frequency map

| Level | Hz |
|-------|-----|
| Sync | 1200 |
| Black | 1500 |
| White | 2300 |
| VIS 0 | 1300 |
| VIS 1 | 1100 |
| Leader | 1900 |
