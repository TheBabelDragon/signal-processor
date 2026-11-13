/**
 * Robot 36 decoder — continuous FM demod + absolute boundaries + chroma-preserving filter.
 */

import { ROBOT_36 } from '../modes/mode-definitions.js';
import { detectVis } from './vis-decoder.js';
import { buildLinePlan } from '../dsp/sample-timing.js';
import { demodulateToValues, samplePixels, recommendedPostFilterHz } from '../dsp/fm-demod.js';
import { acquireFirstSync, findSyncNear, LineTimingTracker } from '../dsp/sync.js';
import { estimateFreq } from './tone-estimator.js';
import { robotToRgb } from '../encoder/robot36.js';

export function decodeRobot36(samples, sampleRate, opts = {}) {
  const mode = ROBOT_36;
  const sr = sampleRate;
  const plan = buildLinePlan(mode.timing, mode.width, sr, 'robot');

  let offset = opts.sampleOffset || 0;
  let visInfo = null;
  if (offset === 0) {
    visInfo = detectVis(samples, sr);
    if (visInfo.modeId === 'robot36' || visInfo.visCode === 8) {
      offset = visInfo.sampleOffset || 0;
    }
  }

  const chromaPixelSamples = plan.cScanSamples / mode.width;
  const postHz = opts.postFilterHz ?? recommendedPostFilterHz(chromaPixelSamples, sr);

  const { values, delaySamples, iqAligned } = demodulateToValues(samples, sr, {
    postFilterHz: postHz,
    minAmp: 0.015,
    measureDelay: opts.measureDelay ?? true,
  });

  const width = mode.width;
  const height = mode.height;
  const Y = new Float32Array(width * height);
  const RY = new Float32Array(width * height);
  const BY = new Float32Array(width * height);
  RY.fill(0.5);
  BY.fill(0.5);

  const ryPresent = new Uint8Array(height);
  const byPresent = new Uint8Array(height);
  const lineDiagnostics = [];
  let linesDecoded = 0;
  let syncHits = 0;

  let first = acquireFirstSync(samples, offset, plan.syncSamples, sr, 900);
  let pos = first ? first.index : offset;
  if (first && first.score > 0.05) syncHits++;

  const tracker = new LineTimingTracker(plan.lineSamples, plan.syncSamples, sr);

  for (let y = 0; y < height; y++) {
    if (pos + plan.lineSamples > samples.length) {
      lineDiagnostics.push({ y, status: 'eof', confidence: 0 });
      break;
    }

    const expectedSync = pos;
    const sync = findSyncNear(samples, expectedSync, plan.syncSamples, sr, Math.round(0.012 * sr));
    let lineConf = 0;
    if (sync.score > 0.05) {
      const upd = tracker.update(sync.index, expectedSync, sync.score);
      if (upd.accepted) {
        pos = sync.index;
        syncHits++;
      }
      lineConf = upd.confidence;
    }

    let cursor = pos + plan.syncSamples + plan.porchSamples;

    const yVals = samplePixels(values, cursor + delaySamples, plan.yBounds, 'center50');
    for (let x = 0; x < width; x++) Y[y * width + x] = yVals[x];
    cursor += plan.yScanSamples;

    const sepEst = estimateFreq(samples, cursor, plan.sepSamples, sr, [1500, 1900, 2300]);
    cursor += plan.sepSamples + plan.cPorchSamples;

    const isRy = Math.abs(sepEst.freq - 1500) <= Math.abs(sepEst.freq - 2300);
    const cVals = samplePixels(values, cursor + delaySamples, plan.cBounds, 'center50');
    const plane = isRy ? RY : BY;
    for (let x = 0; x < width; x++) plane[y * width + x] = cVals[x];
    if (isRy) ryPresent[y] = 1;
    else byPresent[y] = 1;

    cursor += plan.cScanSamples;
    linesDecoded++;
    lineDiagnostics.push({
      y,
      status: 'ok',
      confidence: lineConf,
      syncScore: sync.score,
      chroma: isRy ? 'RY' : 'BY',
      sepFreq: sepEst.freq,
    });

    pos = Math.round(tracker.nextExpected(pos));
  }

  for (let y = 0; y < height; y++) {
    const pair = y % 2 === 0 ? Math.min(height - 1, y + 1) : Math.max(0, y - 1);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = pair * width + x;
      if (!byPresent[y] && byPresent[pair]) BY[i] = BY[p];
      if (!ryPresent[y] && ryPresent[pair]) RY[i] = RY[p];
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const c = robotToRgb(Y[i], RY[i], BY[i]);
    const o = i * 4;
    rgba[o] = Math.round(c.r * 255);
    rgba[o + 1] = Math.round(c.g * 255);
    rgba[o + 2] = Math.round(c.b * 255);
    rgba[o + 3] = 255;
  }

  const alignment = tracker.alignmentReport();
  const incomplete = linesDecoded < height;
  return {
    image: { data: rgba, width, height },
    mode: mode.id,
    visCode: visInfo?.visCode ?? mode.visCode,
    linesDecoded,
    expectedLines: height,
    syncHits,
    syncScore: height ? syncHits / height : 0,
    incomplete,
    sampleRate: sr,
    lineDiagnostics,
    alignment,
    diagnostics: {
      visConfidence: visInfo?.confidence ?? null,
      decoder: 'robot36_v2',
      demodDelay: delaySamples,
      postFilterHz: postHz,
      chromaPixelSamples,
      iqAligned,
      geometricallyAligned: alignment.geometricallyAligned,
      driftPpm: alignment.driftPpm,
      note: incomplete
        ? 'Partial frame — not all scanlines recovered'
        : alignment.geometricallyAligned
          ? 'Full frame recovered (chroma-preserving demod)'
          : 'Full frame recovered — geometry confidence low',
    },
  };
}
