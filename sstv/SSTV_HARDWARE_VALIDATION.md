# SSTV hardware / browser validation report

Status date: 2026-11-13  
Branch: `fix/sstv-v2-dsp-iq-chroma-timing`

## Synthetically validated (automated)

| Area | Suite | Result |
|------|-------|--------|
| I/Q polarity & tones | sstv-dsp-tests | Automated pass |
| Frequency step / delay | sstv-dsp-tests | Automated pass |
| Digital fidelity | sstv-fidelity* | Automated pass |
| Stress | sstv-stress-tests | Automated pass |
| Acoustic orchestration API | sstv-acoustic-tests | Automated pass (mocked I/O) |
| Signal stats | sstv-acoustic-tests | Automated pass |

Automated tests do **not** prove real speaker→microphone physics.

## Physical matrix (operator)

FIDELITY → DIGITAL ROUND-TRIP, then ACOUSTIC LOOPBACK with device speaker (not headphones).

| Setup | Mode | TX sr | Volume | Env | Digital MAE | Acoustic MAE | Notes |
|-------|------|-------|--------|-----|-------------|--------------|-------|
| Built-in spk+mic | Martin M1 | 48k | med | quiet | | | |
| Built-in spk+mic | Robot 36 | 48k | med | quiet | | | |
| Built-in spk+mic | Martin M1 | 44.1k | med | quiet | | | |
| Built-in spk+mic | Martin M1 | 48k | low/high | quiet | | | watch clipping |
| External spk + built-in mic | Martin M1 | 48k | med | quiet | | | |
| Built-in spk + external mic | Martin M1 | 48k | med | quiet | | | if available |

Mark unavailable setups N/A — not pass.

## Score separation

Digital = WAV buffer path. Acoustic = speaker→air→mic. Never merge into one score.
