"use strict";

/** Four-tone isochronic: one shared gate, four sine carriers. */
(function (root) {
  function specHz(spec, fallback) {
    if (spec && spec.type === "constant" && Number.isFinite(spec.value)) return spec.value;
    if (typeof spec === "number" && Number.isFinite(spec)) return spec;
    return fallback;
  }

  function stackFrom(p) {
    const c0 = specHz(p.carrier_hz, 180);
    const out = [c0, c0 * 5 / 4, c0 * 3 / 2, c0 * 2];
    const listed = p.carriers;
    if (Array.isArray(listed)) {
      for (let i = 0; i < 4 && i < listed.length; i++) {
        const n = Number(listed[i]);
        if (Number.isFinite(n) && n > 20) out[i] = n;
      }
    }
    return out;
  }

  function gateSchedule(gainParam, now, duration, pulseHz, duty, depth) {
    const period = 1 / Math.max(0.25, pulseHz);
    const on = period * Math.min(0.95, Math.max(0.05, duty));
    const hi = Math.max(0, Math.min(1, depth));
    const lo = 1 - hi;
    let t = now;
    const end = now + Math.max(0.2, duration);
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(lo, now);
    let n = 0;
    while (t < end && n < 20000) {
      gainParam.setValueAtTime(hi, t);
      gainParam.setValueAtTime(lo, t + on);
      t += period;
      n++;
    }
  }

  async function buildIso4(ctx, sourceBuffer, p, opts) {
    opts = opts || {};
    const now = opts.startAt !== undefined ? opts.startAt : ctx.currentTime;
    const totalDuration = sourceBuffer.duration;
    const src = ctx.createBufferSource();
    src.buffer = sourceBuffer;

    const musicGain = ctx.createGain();
    musicGain.gain.value = dbToLin(p.music_db);
    const masterGain = ctx.createGain();
    masterGain.gain.value = dbToLin(p.master_db);
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

    const mix = ctx.createGain();
    mix.gain.value = dbToLin(Number.isFinite(p.tone_db) ? p.tone_db : -18) * 0.45;
    const gate = ctx.createGain();
    const stack = stackFrom(p);
    const pulseHz = specHz(p.pulse_hz, specHz(p.beat_hz, 10));
    const voices = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = p.waveform || "sine";
      o.frequency.value = stack[i];
      o.connect(mix);
      o.start(now);
      voices.push(o);
    }
    mix.connect(gate);
    gateSchedule(gate.gain, now, totalDuration, pulseHz, p.duty || 0.5, p.depth == null ? 1 : p.depth);
    gate.connect(fadeGain);
    src.connect(musicGain).connect(fadeGain);
    fadeGain.connect(masterGain).connect(limiter).connect(ctx.destination);
    src.start(now);
    return {
      src: src,
      limiter: limiter,
      masterGain: masterGain,
      fadeGain: fadeGain,
      toneGain: mix,
      toneNodes: voices,
      startedAt: now,
      musicGain: musicGain,
      carriers: stack,
    };
  }

  const inner = root.buildGraph;
  root.buildGraph = async function (ctx, sourceBuffer, p, opts) {
    if (p && p.mode === "isochronic4") return buildIso4(ctx, sourceBuffer, p, opts);
    if (typeof inner === "function") return inner(ctx, sourceBuffer, p, opts);
    throw new Error("buildGraph missing");
  };

  root.SignalIso4 = { stackFrom: stackFrom, buildIso4: buildIso4 };
})(typeof window !== "undefined" ? window : this);
