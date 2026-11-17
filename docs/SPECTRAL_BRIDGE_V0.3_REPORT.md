# Spectral Bridge v0.3 — Signal Processor side

**Parent:** `validate/spectral-bridge-v0.2` @ `a2c6e557455a9abe6f0365f17b95495158a98975`
**Branch:** `validate/spectral-bridge-v0.3`

## Commands executed

```bash
node --test spectral/bridge-v03-validation.js
# 6 pass, 0 fail
```

(JS tests assert that known-zero residuals **exceed** 1e-3 and finder offsets **exceed** 0.05 — documenting current production limits, not inventing PASS.)

## Hardy Z residuals (production float64 RS-approx vs |Z|→0)

| t (Odlyzko) | production Z | |Z| |
|-------------|--------------|------|
| 14.134725 | -0.31434 | 0.314 |
| 21.022040 | -0.25028 | 0.250 |
| 25.010858 | -0.97113 | 0.971 |
| 30.424876 | 0.25099 | 0.251 |
| 32.935062 | 0.18038 | 0.180 |

**Cause:** Riemann–Siegel remainder approximation is crude at low height (algorithmic, not float64 roundoff). Precision escalation vs mpmath stagnates at the same residual.

## Zero-finder offsets

| n | expected | detected | |offset| |
|---|----------|----------|---------|
| 1 | 14.1347 | 14.5348 | 0.400 |
| 2 | 21.0220 | 20.8194 | 0.203 |
| 3 | 25.0109 | 25.1327 | 0.122 |
| 4 | 30.4249 | 30.6132 | 0.188 |
| 5 | 32.9351 | 32.8019 | 0.133 |

Offsets follow from inaccurate Z (sign changes displaced).

## Independent reference

Python/mpmath (`siegelz`, `zetazero`) lives in **throne-room** `qwuack/spectral_ref/`. JS consumes shared `fixtures/spectral_fixtures_v0.3.json` only.

Finite numerical verification is **not** a proof of RH.
