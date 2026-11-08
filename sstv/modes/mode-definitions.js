/**
 * SSTV mode definitions — authoritative timing constants.
 * Sources: SSTV Handbook (Bruchanov), classic VIS map, Martin M1 / Robot 36 papers.
 *
 * Frequency map (Hz):
 *   sync 1200, black 1500, white 2300
 *   VIS bits: 1100 = 1, 1300 = 0, start/stop 1200
 */

export const FREQ = Object.freeze({
  SYNC: 1200,
  BLACK: 1500,
  WHITE: 2300,
  VIS_START_STOP: 1200,
  VIS_BIT_0: 1300,
  VIS_BIT_1: 1100,
  LEADER: 1900,
  BREAK: 1200,
});

/** Value 0..1 → frequency black..white */
export function valueToFreq(v) {
  const x = Math.max(0, Math.min(1, Number(v) || 0));
  return FREQ.BLACK + x * (FREQ.WHITE - FREQ.BLACK);
}

/**
 * Martin M1 — VIS 44 (0x2C), 320×256, G-B-R
 * Line: sync 4.862ms @1200, porch 0.572ms @1500,
 * then G/B/R scans 146.432ms each with 0.572ms sep @1500 after each.
 */
export const MARTIN_M1 = Object.freeze({
  id: 'martin_m1',
  name: 'Martin M1',
  family: 'martin',
  visCode: 44,
  width: 320,
  height: 256,
  colorModel: 'rgb',
  channelOrder: Object.freeze(['G', 'B', 'R']),
  timing: Object.freeze({
    syncPulseMs: 4.862,
    syncPorchMs: 0.572,
    scanMs: 146.432,
    sepPulseMs: 0.572,
    lineMs: 446.446,
  }),
  hasAltScan: false,
  encoder: true,
  decoder: false, // enabled when decoder lands
});

/**
 * Robot 36 — VIS 8 (0x08), 320×240, Y / R-Y / B-Y alternating chroma
 * Timing from classic Robot / classicsstv references (approx line ~150ms class).
 * Full encoder lands after Martin path is solid; registry carries authoritative IDs.
 */
export const ROBOT_36 = Object.freeze({
  id: 'robot36',
  name: 'Robot 36',
  family: 'robot',
  visCode: 8,
  width: 320,
  height: 240,
  colorModel: 'ycbcr_robot',
  channelOrder: Object.freeze(['Y', 'RY', 'BY']),
  timing: Object.freeze({
    // Representative Robot 36 timings (ms) — refine against reference fixtures in decoder milestone
    syncPulseMs: 9.0,
    syncPorchMs: 3.0,
    yScanMs: 88.0,
    chromaScanMs: 44.0,
    sepPulseMs: 4.5,
    lineMs: 150.0,
  }),
  hasAltScan: true,
  encoder: false,
  decoder: false,
});

export const MODES = Object.freeze({
  martin_m1: MARTIN_M1,
  robot36: ROBOT_36,
});

export function getMode(id) {
  return MODES[id] || null;
}

export function listModes() {
  return Object.values(MODES);
}

export function modeByVis(vis) {
  const code = Number(vis) & 0x7f;
  for (const m of Object.values(MODES)) {
    if (m.visCode === code) return m;
  }
  return null;
}
