"use strict";

function dbToLin(db) { return Math.pow(10, db / 20); }
function smoothstep(u) { return u * u * (3 - 2 * u); }
function buildRampCurve(v0, v1, curve, points) {
  const arr = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const u = points === 1 ? 1 : i / (points - 1);
    const s = curve === 'smooth' ? smoothstep(u) : u;
    arr[i] = v0 + (v1 - v0) * s;
  }
  return arr;
}
function cyclePosition(phaseRad) {
  const TWO_PI = 2 * Math.PI;
  let m = phaseRad % TWO_PI;
  if (m < 0) m += TWO_PI;
  return m / TWO_PI;
}
function applyAttackRelease(u, duty, attack, release) {
  if (u >= duty) return 0;
  const posInOn = u / Math.max(duty, 1e-9);
  const a = Math.min(Math.max(attack, 0), 0.5);
  const r = a < 0.5 ? Math.min(Math.max(release, 0), 0.5 - a) : 0;
  if (a > 0 && posInOn < a) return Math.max(0, Math.min(1, posInOn / a));
  if (r > 0 && posInOn > 1 - r) return Math.max(0, Math.min(1, (1 - posInOn) / r));
  return 1;
}
function envelopeShape(shape, phaseRad, duty, attack, release) {
  const u = cyclePosition(phaseRad);
  switch (shape) {
    case 'square': return applyAttackRelease(u, duty, attack, release);
    case 'sine': {
      const on = Math.max(duty, 1e-6);
      if (u >= on) return 0;
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * (u / on));
    }
    case 'triangle': {
      const on = Math.max(duty, 1e-6);
      if (u >= on) return 0;
      return 1 - Math.abs(2 * (u / on) - 1);
    }
    case 'smooth_pulse': {
      const lin = applyAttackRelease(u, duty, attack, release);
      return 3 * lin * lin - 2 * lin * lin * lin;
    }
    default: return applyAttackRelease(u, duty, attack, release);
  }
}
function encodeWav(audioBuffer) {
  const numCh = audioBuffer.numberOfChannels, sr = audioBuffer.sampleRate, n = audioBuffer.length;
  const blockAlign = numCh * 2, dataSize = n * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize), view = new DataView(buf);
  function writeStr(o, s) { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, dataSize, true);
  const channels = []; for (let ch = 0; ch < numCh; ch++) channels.push(audioBuffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < n; i++) for (let ch = 0; ch < numCh; ch++) {
    let s = Math.max(-1, Math.min(1, channels[ch][i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, s, true); offset += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

const WORKLET_SRC = `
${envelopeShape.toString()}
${cyclePosition.toString()}
${applyAttackRelease.toString()}

class IsochronicProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'carrierHz', defaultValue: 200, automationRate: 'a-rate' },
      { name: 'pulseHz', defaultValue: 10, automationRate: 'a-rate' },
      { name: 'depth', defaultValue: 1, automationRate: 'k-rate' },
      { name: 'duty', defaultValue: 0.5, automationRate: 'k-rate' },
      { name: 'attack', defaultValue: 0.1, automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.1, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    const po = options.processorOptions || {};
    this.mode = po.mode || 'isochronic';
    this.shape = po.shape || 'square';
    this.alternatingStereo = !!po.alternatingStereo;
    this.carrierPhase = 0;
    this.envPhase = 0;
    this.TWO_PI = 2 * Math.PI;
  }
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const input = inputs[0];
    const n = output[0].length;
    const carrierHz = parameters.carrierHz, pulseHz = parameters.pulseHz;
    const depth = parameters.depth[0], duty = parameters.duty[0];
    const attack = parameters.attack[0], release = parameters.release[0];
    const sr = sampleRate;

    for (let i = 0; i < n; i++) {
      const cHz = carrierHz.length > 1 ? carrierHz[i] : carrierHz[0];
      const pHz = pulseHz.length > 1 ? pulseHz[i] : pulseHz[0];
      this.carrierPhase = (this.carrierPhase + this.TWO_PI * cHz / sr) % this.TWO_PI;
      this.envPhase = (this.envPhase + this.TWO_PI * pHz / sr) % this.TWO_PI;

      const tone = Math.sin(this.carrierPhase);
      const envL = envelopeShape(this.shape, this.envPhase, duty, attack, release);
      const envR = this.alternatingStereo
        ? envelopeShape(this.shape, this.envPhase + Math.PI, duty, attack, release)
        : envL;
      const gL = 1 - depth + depth * envL;
      const gR = 1 - depth + depth * envR;

      if (this.mode === 'isochronic') {
        output[0][i] = tone * gL;
        if (output.length > 1) output[1][i] = tone * gR;
      } else {
        const inL = (input && input[0]) ? input[0][i] : 0;
        const inR = (input && input[1]) ? input[1][i] : inL;
        output[0][i] = inL * gL;
        if (output.length > 1) output[1][i] = inR * gR;
      }
    }
    return true;
  }
}
registerProcessor('isochronic-processor', IsochronicProcessor);
`;

const workletLoaded = new WeakSet();
async function ensureWorklet(ctx) {
  if (workletLoaded.has(ctx)) return;
  const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    await ctx.audioWorklet.addModule(url);
    workletLoaded.add(ctx);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scheduleParam(audioParam, spec, ctxNow, duration) {
  audioParam.cancelScheduledValues(ctxNow);
  if (!spec || spec.type === 'constant') {
    const value = spec && Number.isFinite(spec.value) ? spec.value : 0;
    audioParam.setValueAtTime(value, ctxNow);
    return;
  }
  const rampDur = Math.max(0.02, Number(spec.duration) || duration || 1);
  const v0 = Number.isFinite(spec.v0) ? spec.v0 : 0;
  const v1 = Number.isFinite(spec.v1) ? spec.v1 : v0;
  const points = Math.max(2, Math.min(4000, Math.round(rampDur * 50)));
  const curve = buildRampCurve(v0, v1, spec.curve || 'linear', points);
  audioParam.setValueCurveAtTime(curve, ctxNow, rampDur);
  audioParam.setValueAtTime(v1, ctxNow + rampDur);
}

function sumParam(specA, specB, points, duration) {
  const n = Math.max(2, Math.min(4000, points));
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = duration * i / (n - 1);
    arr[i] = paramValueAt(specA, t) + paramValueAt(specB, t);
  }
  return arr;
}
function paramValueAt(spec, t) {
  if (!spec || spec.type === 'constant') return spec && Number.isFinite(spec.value) ? spec.value : 0;
  const dur = Math.max(spec.duration || 1, 1e-9);
  const u = Math.min(1, Math.max(0, t / dur));
  const s = spec.curve === 'smooth' ? smoothstep(u) : u;
  return spec.v0 + (spec.v1 - spec.v0) * s;
}

async function buildGraph(ctx, sourceBuffer, p, opts) {
  opts = opts || {};
  const now = opts.startAt !== undefined ? opts.startAt : ctx.currentTime;
  const totalDuration = sourceBuffer.duration;

  const src = ctx.createBufferSource();
  src.buffer = sourceBuffer;

  const musicGain = ctx.createGain();
  musicGain.gain.value = dbToLin(p.music_db);

  const masterGain = ctx.createGain();
  const fadeGain = ctx.createGain();
  fadeGain.gain.setValueAtTime(p.fade_in > 0 ? 0 : 1, now);
  if (p.fade_in > 0) fadeGain.gain.linearRampToValueAtTime(1, now + p.fade_in);
  if (p.fade_out > 0) {
    const foStart = Math.max(now, now + totalDuration - p.fade_out);
    fadeGain.gain.setValueAtTime(1, foStart);
    fadeGain.gain.linearRampToValueAtTime(0, now + totalDuration);
  }

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = Number.isFinite(p.limiter_ceiling_db) ? p.limiter_ceiling_db : -0.3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.05;

  masterGain.gain.value = dbToLin(p.master_db);

  let toneNodes = null;

  if (p.mode === 'binaural') {
    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();
    oscL.type = p.waveform || 'sine'; oscR.type = p.waveform || 'sine';

    const carrierSpec = p.carrier_hz, beatSpec = p.beat_hz;
    if (carrierSpec.type === 'constant' && beatSpec.type === 'constant') {
      oscL.frequency.setValueAtTime(carrierSpec.value, now);
      oscR.frequency.setValueAtTime(carrierSpec.value + beatSpec.value, now);
    } else {
      scheduleParam(oscL.frequency, carrierSpec, now, totalDuration);
      const points = Math.max(2, Math.min(4000, Math.round(totalDuration * 50)));
      const rightCurve = sumParam(carrierSpec, beatSpec, points, totalDuration);
      oscR.frequency.setValueCurveAtTime(rightCurve, now, Math.max(0.02, totalDuration));
    }

    const gainL = ctx.createGain(), gainR = ctx.createGain();
    gainL.gain.value = (p.amp_left || 1) * dbToLin(p.tone_db);
    gainR.gain.value = (p.amp_right || 1) * dbToLin(p.tone_db);
    const merger = ctx.createChannelMerger(2);
    oscL.connect(gainL); oscR.connect(gainR);
    if (p.invert_stereo) { gainL.connect(merger, 0, 1); gainR.connect(merger, 0, 0); }
    else { gainL.connect(merger, 0, 0); gainR.connect(merger, 0, 1); }
    merger.connect(fadeGain);
    src.connect(musicGain).connect(fadeGain);
    oscL.start(now); oscR.start(now);
    toneNodes = [oscL, oscR];
  } else if (p.mode === 'isochronic' || p.mode === 'modulation') {
    await ensureWorklet(ctx);
    const worklet = new AudioWorkletNode(ctx, 'isochronic-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { mode: p.mode, shape: p.shape, alternatingStereo: p.modulation_stereo === 'alternating' },
    });
    scheduleParam(worklet.parameters.get('carrierHz'), p.carrier_hz, now, totalDuration);
    scheduleParam(worklet.parameters.get('pulseHz'), p.pulse_hz, now, totalDuration);
    worklet.parameters.get('depth').value = p.mode === 'isochronic' ? p.depth : p.modulation_depth;
    worklet.parameters.get('duty').value = p.duty;
    worklet.parameters.get('attack').value = p.attack;
    worklet.parameters.get('release').value = p.release;

    if (p.mode === 'isochronic') {
      const toneGain = ctx.createGain();
      toneGain.gain.value = dbToLin(p.tone_db);
      worklet.connect(toneGain).connect(fadeGain);
      src.connect(musicGain).connect(fadeGain);
    } else {
      src.connect(musicGain).connect(worklet).connect(fadeGain);
    }
    toneNodes = [worklet];
  } else {
    src.connect(musicGain).connect(fadeGain);
  }

  fadeGain.connect(masterGain).connect(limiter).connect(ctx.destination);
  src.start(now);

  return { src, limiter, masterGain, fadeGain, toneNodes, startedAt: now };
}
