"use strict";

function makeBedBuffer(ctx, seconds, color) {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.ceil(Math.max(1, seconds) * sr));
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    if (color === 'silence') continue;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') {
        last += 0.02 * w;
        last /= 1.02;
        d[i] = last * 3.5;
      } else {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
  }
  return buf;
}

function liveSetBeat(nodes, recipe, hz) {
  if (!nodes) return;
  hz = Math.max(0.5, Math.min(40, Number(hz) || 10));
  const now = nodes.limiter.context.currentTime;
  if (recipe.mode === 'binaural' && nodes.toneNodes && nodes.toneNodes[0] && nodes.toneNodes[0].frequency) {
    const c = recipe.carrier_hz && recipe.carrier_hz.type === 'constant' ? recipe.carrier_hz.value : 200;
    nodes.toneNodes[0].frequency.setTargetAtTime(c, now, 0.05);
    nodes.toneNodes[1].frequency.setTargetAtTime(c + hz, now, 0.05);
  } else if (nodes.toneNodes && nodes.toneNodes[0] && nodes.toneNodes[0].parameters) {
    const p = nodes.toneNodes[0].parameters.get('pulseHz');
    if (p) p.setTargetAtTime(hz, now, 0.05);
  }
}

function liveSetToneDb(nodes, recipe, db) {
  if (!nodes || !nodes.toneGain) return;
  nodes.toneGain.gain.setTargetAtTime(dbToLin(db), nodes.limiter.context.currentTime, 0.08);
}

function liveSetMusicDb(nodes, db) {
  if (!nodes || !nodes.musicGain) return;
  nodes.musicGain.gain.setTargetAtTime(dbToLin(db), nodes.limiter.context.currentTime, 0.08);
}
