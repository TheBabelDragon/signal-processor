#!/usr/bin/env node
/**
 * Export reference SSTV WAV vectors + JSON metadata for external interop checks.
 *
 * Usage:
 *   node tools/sstv-export-vectors.js [outDir]
 *
 * Writes:
 *   martin_m1_solid_48k.wav + .json
 *   martin_m1_bars_48k.wav + .json
 *   robot36_solid_48k.wav + .json
 *
 * JSON describes mode, VIS, geometry, duration, and conventions so MMSSTV /
 * QSSTV / rx_sstv operators can verify geometry without reverse-engineering.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  encodeImageToWav,
  solidImage,
  colorBarsImage,
  normalizeImage,
  MARTIN_M1,
  ROBOT_36,
} from '../sstv/index.js';

const outDir = process.argv[2] || 'sstv-vectors';
mkdirSync(outDir, { recursive: true });

function writeVector(name, modeId, image, sampleRate) {
  const mode = modeId === 'martin_m1' ? MARTIN_M1 : ROBOT_36;
  const normalized = normalizeImage(image, mode.width, mode.height, { fit: 'stretch' });
  const encoded = encodeImageToWav(normalized, modeId, { sampleRate });
  const wavPath = join(outDir, name + '.wav');
  const jsonPath = join(outDir, name + '.json');
  writeFileSync(wavPath, Buffer.from(encoded.wav));
  const meta = {
    name,
    mode: mode.id,
    visCode: mode.visCode,
    width: mode.width,
    height: mode.height,
    sampleRate: encoded.sampleRate,
    durationMs: encoded.durationMs,
    lineCount: encoded.lineCount,
    channelOrder: mode.channelOrder || ['Y', 'chroma'],
    conventions: {
      blackHz: 1500,
      whiteHz: 2300,
      syncHz: 1200,
      vis: 'classic 7-bit + even parity, leader/break/leader',
      note:
        modeId === 'robot36'
          ? 'Robot: Y then alternating R-Y (sep 1500) / B-Y (sep 2300); chroma biased at 0.5 for FM'
          : 'Martin M1: G-B-R scan order',
    },
    expected: {
      pattern: name.includes('bars') ? 'color_bars' : 'solid',
      geometry: mode.width + 'x' + mode.height,
    },
  };
  writeFileSync(jsonPath, JSON.stringify(meta, null, 2));
  console.log('wrote', wavPath, (encoded.durationMs / 1000).toFixed(1) + 's');
}

writeVector('martin_m1_solid_48k', 'martin_m1', solidImage(320, 256, 40, 180, 60), 48000);
writeVector('martin_m1_bars_48k', 'martin_m1', colorBarsImage(320, 256), 48000);
writeVector('robot36_solid_48k', 'robot36', solidImage(320, 240, 40, 180, 60), 48000);
console.log('vectors in', outDir);
