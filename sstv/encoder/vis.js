/**
 * VIS (Vertical Interval Signaling) header generation.
 * Leader 1900Hz, break 1200Hz, leader 1900Hz, then start bit + 7 data bits LSB-first + parity + stop.
 */

import { FREQ } from '../modes/mode-definitions.js';

/**
 * @param {number} visCode 0..127 (7-bit mode id)
 * @returns {{ freq: number, ms: number }[]}
 */
export function buildVisHeader(visCode) {
  const code = Number(visCode) & 0x7f;
  const bits = [];
  for (let i = 0; i < 7; i++) bits.push((code >> i) & 1);
  // even parity over 7 data bits
  const parity = bits.reduce((a, b) => a ^ b, 0);

  /** @type {{ freq: number, ms: number }[]} */
  const segs = [];
  // Calibration leader
  segs.push({ freq: FREQ.LEADER, ms: 300 });
  segs.push({ freq: FREQ.BREAK, ms: 10 });
  segs.push({ freq: FREQ.LEADER, ms: 300 });
  // VIS start
  segs.push({ freq: FREQ.VIS_START_STOP, ms: 30 });
  for (const b of bits) {
    segs.push({ freq: b ? FREQ.VIS_BIT_1 : FREQ.VIS_BIT_0, ms: 30 });
  }
  segs.push({ freq: parity ? FREQ.VIS_BIT_1 : FREQ.VIS_BIT_0, ms: 30 });
  segs.push({ freq: FREQ.VIS_START_STOP, ms: 30 });
  return segs;
}

export function visParityBit(visCode) {
  const code = Number(visCode) & 0x7f;
  let p = 0;
  for (let i = 0; i < 7; i++) p ^= (code >> i) & 1;
  return p;
}
