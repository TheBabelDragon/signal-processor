/**
 * SSTV mode definitions — authoritative timing constants.
 * Sources: SSTV Handbook (Bruchanov), classic VIS map, Martin M1 / Robot 36 papers.
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
  ROBOT_PORCH: 1900,
  ROBOT_SEP_EVEN: 1500, // before R-Y
  ROBOT_SEP_ODD: 2300, // before B-Y
});

export function valueToFreq(v) {
  const x = Math.max(0, Math.min(1, Number(v) || 0));
  return FREQ.BLACK + x * (FREQ.WHITE - FREQ.BLACK);
}

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
  decoder: true,
});

/**
 * Robot 36 — VIS 8, 320×240, Y + alternating R-Y / B-Y
 * Line ≈ 150ms: sync 9 + porch 3 + Y 88 + sep 4.5 + porch 1.5 + chroma 44
 * Even lines: sep 1500 Hz + R-Y; odd lines: sep 2300 Hz + B-Y
 * (Dayton paper / classic Robot references)
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
    syncPulseMs: 9.0,
    syncPorchMs: 3.0,
    yScanMs: 88.0,
    sepPulseMs: 4.5,
    chromaPorchMs: 1.5,
    chromaScanMs: 44.0,
    lineMs: 150.0,
  }),
  hasAltScan: true,
  encoder: true,
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
