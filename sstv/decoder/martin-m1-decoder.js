/**
 * Martin M1 decoder — continuous FM demod + absolute sample boundaries.
 */

import { MARTIN_M1 } from '../modes/mode-definitions.js';
import { detectVis } from './vis-decoder.js';
import { buildLinePlan } from '../dsp/sample-timing.js';
import { demodulateToValues, samplePixels, recommendedPostFilterHz } from '../dsp/fm-demod.js';
import { acquireFirstSync, findSyncNear, LineTimingTracker } from '../dsp/sync.js';

export function decodeMartinM1(samples, sampleRate, opts = {}) {
  const mode = MARTIN_M1;
  const sr = sampleRate;
  const plan = buildLinePlan(mode.timing, mode.width, sr, 'martin');

  let offset = opts.sampleOffset || 0;
  let visInfo = null;
  if (offset === 0) {
    visInfo = detectVis(samples, sr);
    if (visInfo.modeId === 'martin_m1' || !opts.modeHint) {
      offset = visInfo.sampleOffset || 0;
    }
  }

  const pixelSamples = plan.scanSamples / mode.width;
  const postHz = opts.postFilterHz ?? recommendedPostFilterHz(pixelSamples, sr);

  const { values, delaySamples, iqAligned } = demodulateToValues(samples, sr, {
    postFilterHz: postHz,
    minAmp: 0.015,
    measureDelay: opts.measureDelay ?? true,
  });

  const width = mode.width;
  const height = mode.height;
  const rgba = new Uint8ClampedArray(width * height * 4);
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

    let scanBase = pos + plan.syncSamples + plan.porchSamples;
    const channels = { G: null, B: null, R: null };
    for (const ch of mode.channelOrder) {
      const pixelVals = samplePixels(values, scanBase + delaySamples, plan.bounds, 'center50');
      channels[ch] = pixelVals;
      scanBase += plan.scanSamples + plan.sepSamples;
    }

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = Math.round(clamp01(channels.R[x]) * 255);
      rgba[i + 1] = Math.round(clamp01(channels.G[x]) * 255);
      rgba[i + 2] = Math.round(clamp01(channels.B[x]) * 255);
      rgba[i + 3] = 255;
    }
    linesDecoded++;
    lineDiagnostics.push({
      y,
      status: 'ok',
      confidence: lineConf,
      syncScore: sync.score,
      syncIndex: sync.index,
    });

    pos = Math.round(tracker.nextExpected(pos));
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
      decoder: 'martin_m1_v2',
      demodDelay: delaySamples,
      postFilterHz: postHz,
      iqAligned,
      geometricallyAligned: alignment.geometricallyAligned,
      driftPpm: alignment.driftPpm,
      note: incomplete
        ? 'Partial frame — not all scanlines recovered'
        : alignment.geometricallyAligned
          ? 'Full frame recovered (continuous FM demod, geometry OK)'
          : 'Full frame recovered — geometry confidence low',
    },
  };
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
