"use strict";

/**
 * SignalProducer — cold-start audio stimulus contract.
 *
 * This tab produces sound. It does not produce electrode voltage,
 * ultrasonic drive, or a reverse-bias rail.
 *
 * Phases match optical-body DarkTrack names on purpose:
 *   hold   = producer OFF, residual quiet
 *   charge = residual still rising after stop
 *   relax  = decaying toward baseline
 *   fault  = leftover too large to call the next packet isolated
 */
(function (root) {
  const HOLD_ABS = 0.02;
  const CHARGE_UP = 0.04;
  const FAULT_ABS = 0.25;
  const ETA = 0.35;
  const LEAK = 0.12;

  const state = {
    running: false,
    id: null,
    recipe: null,
    startedAt: 0,
    stoppedAt: 0,
    baseline: 0.01,
    q: 0,
    lastRms: 0,
    phase: "hold",
  };

  function rmsFromAnalyser(analyser) {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize || analyser.frequencyBinCount);
    if (typeof analyser.getByteTimeDomainData !== "function") return 0;
    analyser.getByteTimeDomainData(data);
    let acc = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      acc += v * v;
    }
    return Math.sqrt(acc / Math.max(1, data.length));
  }

  function setPhase(resid, dq) {
    if (Math.abs(state.q) >= FAULT_ABS || resid >= FAULT_ABS) state.phase = "fault";
    else if (resid > CHARGE_UP && dq > 0) state.phase = "charge";
    else if (Math.abs(state.q) > HOLD_ABS) state.phase = "relax";
    else state.phase = "hold";
  }

  function noteStart(id, recipe) {
    state.running = true;
    state.id = id || (recipe && recipe.mode) || "tone";
    state.recipe = recipe || null;
    state.startedAt = (typeof performance !== "undefined") ? performance.now() : Date.now();
    state.stoppedAt = 0;
    state.phase = "charge";
    return snapshot();
  }

  function updateResidual(rms) {
    const resid = rms - state.baseline;
    const dq = rms - state.lastRms;
    state.q = (state.q + ETA * resid) * (1 - LEAK);
    setPhase(resid, dq);
    state.lastRms = rms;
    if (!state.running) state.baseline = state.baseline * 0.98 + rms * 0.02;
    return snapshot();
  }

  function noteStop(analyser) {
    const rms = rmsFromAnalyser(analyser);
    state.running = false;
    state.stoppedAt = (typeof performance !== "undefined") ? performance.now() : Date.now();
    return updateResidual(rms);
  }

  function isolationOk() {
    return !state.running && (state.phase === "hold" || state.phase === "relax");
  }

  function snapshot() {
    return {
      kind: "signal-producer",
      modality: "audio",
      running: state.running,
      id: state.id,
      phase: state.phase,
      q: +state.q.toFixed(4),
      rms: +state.lastRms.toFixed(4),
      isolated: isolationOk(),
      health: state.running ? "ok" : (isolationOk() ? "ok" : "partial"),
      consumes: true,
      body_drive: false,
    };
  }

  function packet() {
    const s = snapshot();
    return {
      schema_version: 1,
      body_id: "signal-processor",
      body_type: "audio-producer",
      excitation_id: s.id,
      geometry_state: s.running ? "producing" : (s.isolated ? "isolated" : "settling"),
      health: s.health,
      timestamp: String(Date.now()),
      modality: {
        producer: "audio",
        phase: s.phase,
        q: s.q,
        isolated: s.isolated,
        body_drive: false,
      },
    };
  }

  root.SignalProducer = {
    noteStart: noteStart,
    noteStop: noteStop,
    updateResidual: updateResidual,
    rmsFromAnalyser: rmsFromAnalyser,
    isolationOk: isolationOk,
    snapshot: snapshot,
    packet: packet,
  };
})(typeof window !== "undefined" ? window : this);
