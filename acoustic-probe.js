"use strict";

/**
 * AcousticProbe v0.1 — independent browser-native acoustic probing subsystem.
 * Generates coded LFM chirps, detects via mic normalized cross-correlation,
 * timestamps events. Does NOT feed neurofeedback reward pipeline.
 * Public: window.AcousticProbe
 */
(function (root) {
  const SCHEMA_VERSION = 1;
  const DEFAULTS = {
    freqStartHz: 1800, freqEndHz: 4200, durationMs: 40, amplitude: 0.18,
    attackMs: 4, releaseMs: 6, intervalMs: 1500, detectionThreshold: 0.42,
    duplicateWindowMs: 80, nodeId: "browser-local", probeId: "chirp-lf-v1",
  };

  function nowMono() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }
  function nowWall() { return Date.now(); }
  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "ev-" + Math.random().toString(36).slice(2, 11) + "-" + Date.now().toString(36);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function generateChirp(opts) {
    const sr = opts.sampleRate || 48000;
    const f0 = opts.freqStartHz != null ? opts.freqStartHz : DEFAULTS.freqStartHz;
    const f1 = opts.freqEndHz != null ? opts.freqEndHz : DEFAULTS.freqEndHz;
    const durMs = opts.durationMs != null ? opts.durationMs : DEFAULTS.durationMs;
    const amp = opts.amplitude != null ? opts.amplitude : DEFAULTS.amplitude;
    const attMs = opts.attackMs != null ? opts.attackMs : DEFAULTS.attackMs;
    const relMs = opts.releaseMs != null ? opts.releaseMs : DEFAULTS.releaseMs;
    const n = Math.max(1, Math.round((durMs / 1000) * sr));
    const samples = new Float32Array(n);
    const attN = Math.max(1, Math.round((attMs / 1000) * sr));
    const relN = Math.max(1, Math.round((relMs / 1000) * sr));
    const T = n / sr;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const instFreq = f0 + (f1 - f0) * (t / T);
      phase += (2 * Math.PI * instFreq) / sr;
      let env = 1;
      if (i < attN) env = 0.5 - 0.5 * Math.cos(Math.PI * (i / attN));
      else if (i > n - relN) {
        const u = (n - 1 - i) / relN;
        env = 0.5 - 0.5 * Math.cos(Math.PI * u);
      }
      samples[i] = amp * env * Math.sin(phase);
    }
    return samples;
  }

  function chirpIdentity(opts) {
    return {
      probe_id: opts.probeId || DEFAULTS.probeId,
      freq_start_hz: opts.freqStartHz != null ? opts.freqStartHz : DEFAULTS.freqStartHz,
      freq_end_hz: opts.freqEndHz != null ? opts.freqEndHz : DEFAULTS.freqEndHz,
      duration_ms: opts.durationMs != null ? opts.durationMs : DEFAULTS.durationMs,
      amplitude: opts.amplitude != null ? opts.amplitude : DEFAULTS.amplitude,
    };
  }

  function rms(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / Math.max(1, buf.length));
  }

  function matchedFilter(template, buffer) {
    const M = template.length, N = buffer.length;
    if (M < 8 || N < M) return { peak: 0, lag: 0, confidence: 0 };
    let tNorm = 0;
    for (let i = 0; i < M; i++) tNorm += template[i] * template[i];
    tNorm = Math.sqrt(tNorm);
    if (tNorm < 1e-12) return { peak: 0, lag: 0, confidence: 0 };
    let best = 0, bestLag = 0;
    for (let lag = 0; lag <= N - M; lag++) {
      let dot = 0, bNorm = 0;
      for (let i = 0; i < M; i++) {
        const b = buffer[lag + i];
        dot += template[i] * b;
        bNorm += b * b;
      }
      bNorm = Math.sqrt(bNorm);
      if (bNorm < 1e-12) continue;
      const corr = dot / (tNorm * bNorm);
      if (corr > best) { best = corr; bestLag = lag; }
    }
    return { peak: best, lag: bestLag, confidence: clamp(best, 0, 1) };
  }

  function makeEvent(partial) {
    return {
      schema_version: SCHEMA_VERSION,
      event_id: partial.event_id || uuid(),
      probe_id: partial.probe_id || DEFAULTS.probeId,
      node_id: partial.node_id || DEFAULTS.nodeId,
      sequence: partial.sequence != null ? partial.sequence : 0,
      event_type: partial.event_type || "detection",
      emitted_at: partial.emitted_at != null ? partial.emitted_at : null,
      detected_at: partial.detected_at != null ? partial.detected_at : null,
      wall_emitted_at: partial.wall_emitted_at != null ? partial.wall_emitted_at : null,
      wall_detected_at: partial.wall_detected_at != null ? partial.wall_detected_at : null,
      sample_rate: partial.sample_rate || 0,
      sample_offset: partial.sample_offset != null ? partial.sample_offset : null,
      estimated_latency_ms: partial.estimated_latency_ms != null ? partial.estimated_latency_ms : null,
      frequency_start_hz: partial.frequency_start_hz,
      frequency_end_hz: partial.frequency_end_hz,
      duration_ms: partial.duration_ms,
      correlation_peak: partial.correlation_peak != null ? partial.correlation_peak : null,
      confidence: partial.confidence != null ? partial.confidence : null,
      input_rms: partial.input_rms != null ? partial.input_rms : null,
      clipped: !!partial.clipped,
      mode: partial.mode || "live",
      notes: partial.notes || null,
    };
  }

  const state = {
    cfg: Object.assign({}, DEFAULTS),
    audioCtx: null, micStream: null, micSource: null, analyser: null,
    monitoring: false, autoPing: false, autoTimer: null,
    sequence: 0, lastDetectionMono: 0, lastEmitMono: 0,
    template: null, templateSr: 0,
    permission: "unknown", sampleRate: 0, inputRms: 0, clipped: false,
    mode: "idle", events: [], maxEvents: 64, listeners: [],
    nodeId: DEFAULTS.nodeId, pendingEmit: null,
  };

  function emitEvent(ev) {
    state.events.unshift(ev);
    if (state.events.length > state.maxEvents) state.events.length = state.maxEvents;
    for (let i = 0; i < state.listeners.length; i++) {
      try { state.listeners[i](ev); } catch (e) { console.warn("AcousticProbe listener", e); }
    }
  }

  function setConfig(partial) {
    if (!partial) return getConfig();
    ["freqStartHz","freqEndHz","durationMs","amplitude","attackMs","releaseMs","intervalMs","detectionThreshold","duplicateWindowMs","nodeId","probeId"].forEach(function (k) {
      if (partial[k] != null) state.cfg[k] = partial[k];
    });
    if (partial.nodeId) state.nodeId = partial.nodeId;
    state.template = null;
    return getConfig();
  }
  function getConfig() { return Object.assign({}, state.cfg, { nodeId: state.nodeId }); }

  function ensureTemplate(sr) {
    if (state.template && state.templateSr === sr) return state.template;
    state.template = generateChirp({
      sampleRate: sr, freqStartHz: state.cfg.freqStartHz, freqEndHz: state.cfg.freqEndHz,
      durationMs: state.cfg.durationMs, amplitude: state.cfg.amplitude,
      attackMs: state.cfg.attackMs, releaseMs: state.cfg.releaseMs,
    });
    state.templateSr = sr;
    return state.template;
  }

  function getAudioContext() {
    if (state.audioCtx) return state.audioCtx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) throw new Error("Web Audio API unavailable");
    state.audioCtx = new AC();
    return state.audioCtx;
  }

  async function requestMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      state.permission = "unavailable"; state.mode = "error";
      throw new Error("getUserMedia not available");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        video: false,
      });
      state.micStream = stream;
      state.permission = "granted";
      return stream;
    } catch (err) {
      state.permission = err && err.name === "NotAllowedError" ? "denied" : "unavailable";
      state.mode = "error";
      throw err;
    }
  }

  function stopMic() {
    if (state.micStream) { state.micStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); state.micStream = null; }
    if (state.micSource) { try { state.micSource.disconnect(); } catch (e) {} state.micSource = null; }
    if (state.analyser) { try { state.analyser.disconnect(); } catch (e) {} state.analyser = null; }
  }

  let captureRaf = 0, inputRing = null, inputWrite = 0;

  function startCaptureLoop() {
    if (captureRaf) return;
    const ctx = getAudioContext();
    const sr = ctx.sampleRate;
    state.sampleRate = sr;
    const template = ensureTemplate(sr);
    const winSamples = Math.max(template.length * 3, Math.round(0.12 * sr));
    inputRing = new Float32Array(winSamples);
    inputWrite = 0;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    state.analyser = analyser;
    if (state.micSource) state.micSource.connect(analyser);
    const td = new Float32Array(analyser.fftSize);

    function tick() {
      if (!state.monitoring) { captureRaf = 0; return; }
      captureRaf = requestAnimationFrame(tick);
      analyser.getFloatTimeDomainData(td);
      for (let i = 0; i < td.length; i++) {
        inputRing[inputWrite] = td[i];
        inputWrite = (inputWrite + 1) % inputRing.length;
      }
      let sum = 0, clip = false;
      for (let i = 0; i < td.length; i++) {
        const v = td[i]; sum += v * v;
        if (Math.abs(v) > 0.98) clip = true;
      }
      state.inputRms = Math.sqrt(sum / td.length);
      state.clipped = clip;
      if (!state.pendingEmit && !state.autoPing) return;
      const linear = new Float32Array(inputRing.length);
      const start = inputWrite;
      for (let i = 0; i < inputRing.length; i++) linear[i] = inputRing[(start + i) % inputRing.length];
      const result = matchedFilter(template, linear);
      if (result.peak >= state.cfg.detectionThreshold) {
        const mono = nowMono();
        if (mono - state.lastDetectionMono < state.cfg.duplicateWindowMs) return;
        state.lastDetectionMono = mono;
        let latencyMs = null;
        if (state.pendingEmit) latencyMs = mono - state.pendingEmit.mono;
        const ev = makeEvent({
          probe_id: state.cfg.probeId, node_id: state.nodeId,
          sequence: state.pendingEmit ? state.pendingEmit.sequence : state.sequence,
          event_type: "detection",
          emitted_at: state.pendingEmit ? state.pendingEmit.mono : null,
          detected_at: mono,
          wall_emitted_at: state.pendingEmit ? state.pendingEmit.wall : null,
          wall_detected_at: nowWall(),
          sample_rate: sr, sample_offset: result.lag, estimated_latency_ms: latencyMs,
          frequency_start_hz: state.cfg.freqStartHz, frequency_end_hz: state.cfg.freqEndHz,
          duration_ms: state.cfg.durationMs,
          correlation_peak: +result.peak.toFixed(4), confidence: +result.confidence.toFixed(4),
          input_rms: +state.inputRms.toFixed(5), clipped: state.clipped, mode: "live",
        });
        emitEvent(ev);
        state.pendingEmit = null;
      }
    }
    captureRaf = requestAnimationFrame(tick);
  }

  function stopCaptureLoop() {
    if (captureRaf) { cancelAnimationFrame(captureRaf); captureRaf = 0; }
  }

  async function startMonitoring() {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      await requestMic();
      stopMic();
      const stream = state.micStream || await requestMic();
      state.micSource = ctx.createMediaStreamSource(stream);
      state.monitoring = true;
      state.mode = "live";
      state.sampleRate = ctx.sampleRate;
      ensureTemplate(ctx.sampleRate);
      startCaptureLoop();
      return { ok: true, permission: state.permission, sampleRate: state.sampleRate, mode: state.mode };
    } catch (err) {
      state.monitoring = false; state.mode = "error";
      return { ok: false, permission: state.permission, error: err && err.message ? err.message : String(err), mode: state.mode };
    }
  }

  function stopMonitoring() {
    state.monitoring = false; state.autoPing = false;
    if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
    stopCaptureLoop(); stopMic();
    state.mode = "idle"; state.pendingEmit = null;
    return { ok: true, mode: state.mode };
  }

  async function ping(opts) {
    opts = opts || {};
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const sr = ctx.sampleRate;
    const template = ensureTemplate(sr);
    const buf = ctx.createBuffer(1, template.length, sr);
    buf.copyToChannel(template, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = clamp(opts.amplitudeScale != null ? opts.amplitudeScale : 1, 0, 1);
    src.connect(gain).connect(ctx.destination);
    const mono = nowMono(), wall = nowWall();
    state.sequence += 1;
    const seq = state.sequence;
    state.lastEmitMono = mono;
    state.pendingEmit = { sequence: seq, mono: mono, wall: wall };
    src.start();
    const emitEv = makeEvent({
      probe_id: state.cfg.probeId, node_id: state.nodeId, sequence: seq, event_type: "emit",
      emitted_at: mono, detected_at: null, wall_emitted_at: wall, wall_detected_at: null,
      sample_rate: sr, sample_offset: null, estimated_latency_ms: null,
      frequency_start_hz: state.cfg.freqStartHz, frequency_end_hz: state.cfg.freqEndHz,
      duration_ms: state.cfg.durationMs, correlation_peak: null, confidence: null,
      input_rms: state.inputRms, clipped: false, mode: state.mode === "live" ? "live" : "demo",
    });
    emitEvent(emitEv);
    return emitEv;
  }

  function setAutoPing(enabled, intervalMs) {
    if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
    state.autoPing = !!enabled;
    if (enabled) {
      const iv = intervalMs != null ? intervalMs : state.cfg.intervalMs;
      state.cfg.intervalMs = iv;
      state.autoTimer = setInterval(function () {
        if (state.monitoring || state.mode === "synthetic") {
          ping().catch(function (e) { console.warn("auto ping", e); });
        }
      }, Math.max(200, iv));
    }
    return { autoPing: state.autoPing, intervalMs: state.cfg.intervalMs };
  }

  function runSyntheticTest(opts) {
    opts = opts || {};
    const sr = opts.sampleRate || 48000;
    const template = generateChirp({
      sampleRate: sr, freqStartHz: state.cfg.freqStartHz, freqEndHz: state.cfg.freqEndHz,
      durationMs: state.cfg.durationMs, amplitude: state.cfg.amplitude,
      attackMs: state.cfg.attackMs, releaseMs: state.cfg.releaseMs,
    });
    const pad = Math.round(0.05 * sr);
    const buf = new Float32Array(pad + template.length + pad);
    for (let i = 0; i < template.length; i++) buf[pad + i] = template[i];
    const noise = opts.noise != null ? opts.noise : 0.01;
    for (let i = 0; i < buf.length; i++) buf[i] += (Math.random() * 2 - 1) * noise;
    const result = matchedFilter(template, buf);
    const mono = nowMono();
    state.sequence += 1;
    const detected = result.peak >= state.cfg.detectionThreshold;
    const ev = makeEvent({
      probe_id: state.cfg.probeId, node_id: state.nodeId, sequence: state.sequence,
      event_type: detected ? "detection" : "miss",
      emitted_at: mono, detected_at: detected ? mono + (result.lag / sr) * 1000 : null,
      wall_emitted_at: nowWall(), wall_detected_at: detected ? nowWall() : null,
      sample_rate: sr, sample_offset: result.lag,
      estimated_latency_ms: detected ? (result.lag / sr) * 1000 : null,
      frequency_start_hz: state.cfg.freqStartHz, frequency_end_hz: state.cfg.freqEndHz,
      duration_ms: state.cfg.durationMs,
      correlation_peak: +result.peak.toFixed(4), confidence: +result.confidence.toFixed(4),
      input_rms: +rms(buf).toFixed(5), clipped: false, mode: "synthetic",
      notes: "deterministic synthetic fixture — not a physical microphone detection",
    });
    emitEvent(ev);
    return { detected: detected, event: ev, peak: result.peak, lag: result.lag, threshold: state.cfg.detectionThreshold };
  }

  function onEvent(fn) {
    if (typeof fn === "function") state.listeners.push(fn);
    return function unsubscribe() {
      const i = state.listeners.indexOf(fn);
      if (i >= 0) state.listeners.splice(i, 1);
    };
  }

  function getStatus() {
    return {
      monitoring: state.monitoring, autoPing: state.autoPing, permission: state.permission,
      sampleRate: state.sampleRate, inputRms: state.inputRms, clipped: state.clipped,
      mode: state.mode, sequence: state.sequence, config: getConfig(),
      eventCount: state.events.length, lastEvents: state.events.slice(0, 8),
    };
  }
  function getEvents() { return state.events.slice(); }
  function clearEvents() { state.events.length = 0; }

  root.AcousticProbe = {
    version: "0.1.0", SCHEMA_VERSION: SCHEMA_VERSION, DEFAULTS: DEFAULTS,
    generateChirp: generateChirp, chirpIdentity: chirpIdentity, matchedFilter: matchedFilter, makeEvent: makeEvent,
    setConfig: setConfig, getConfig: getConfig,
    startMonitoring: startMonitoring, stopMonitoring: stopMonitoring,
    ping: ping, setAutoPing: setAutoPing, runSyntheticTest: runSyntheticTest,
    onEvent: onEvent, getStatus: getStatus, getEvents: getEvents, clearEvents: clearEvents,
    Spatial: {
      note: "v0.1 does not perform geographic positioning or TDOA.",
      reserveAnchors: function () { return { ok: false, reason: "not implemented in v0.1" }; },
      estimatePosition: function () { return { ok: false, reason: "not implemented in v0.1" }; },
    },
  };
})(typeof window !== "undefined" ? window : this);
