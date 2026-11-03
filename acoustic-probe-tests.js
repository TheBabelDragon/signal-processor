"use strict";

/**
 * Acoustic Probe unit tests — deterministic, no hardware required.
 * Run in browser console after loading acoustic-probe.js:
 *   AcousticProbeTests.runAll()
 */
(function (root) {
  const results = [];
  function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assertion failed");
  }
  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
      return true;
    } catch (e) {
      results.push({ name: name, ok: false, error: e.message || String(e) });
      return false;
    }
  }
  function runAll() {
    results.length = 0;
    const AP = root.AcousticProbe;
    if (!AP) {
      console.error("AcousticProbe not loaded");
      return { passed: 0, failed: 1, results: [{ name: "load", ok: false, error: "missing" }] };
    }
    test("generateChirp returns Float32Array of expected length", function () {
      const sr = 48000, dur = 40;
      const s = AP.generateChirp({ sampleRate: sr, durationMs: dur, amplitude: 0.2 });
      assert(s instanceof Float32Array, "not Float32Array");
      assert(s.length === Math.round((dur / 1000) * sr), "length mismatch");
    });
    test("chirp is deterministic for identical params", function () {
      const a = AP.generateChirp({ sampleRate: 16000, freqStartHz: 1800, freqEndHz: 4200, durationMs: 30, amplitude: 0.15 });
      const b = AP.generateChirp({ sampleRate: 16000, freqStartHz: 1800, freqEndHz: 4200, durationMs: 30, amplitude: 0.15 });
      assert(a.length === b.length, "len");
      let maxDiff = 0;
      for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
      assert(maxDiff < 1e-12, "non-deterministic " + maxDiff);
    });
    test("frequency boundaries respected in identity", function () {
      const id = AP.chirpIdentity({ freqStartHz: 2000, freqEndHz: 3500, durationMs: 25 });
      assert(id.freq_start_hz === 2000 && id.freq_end_hz === 3500 && id.duration_ms === 25, "identity");
    });
    test("amplitude bounds — peak within amplitude", function () {
      const amp = 0.12;
      const s = AP.generateChirp({ sampleRate: 24000, amplitude: amp, durationMs: 40 });
      let peak = 0;
      for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i]));
      assert(peak <= amp + 1e-6 && peak > amp * 0.5, "peak " + peak);
    });
    test("envelope — leading and trailing samples near zero", function () {
      const s = AP.generateChirp({ sampleRate: 24000, durationMs: 40, attackMs: 5, releaseMs: 5, amplitude: 0.2 });
      assert(Math.abs(s[0]) < 0.02 && Math.abs(s[s.length - 1]) < 0.02, "envelope");
    });
    test("matchedFilter self-correlation near 1", function () {
      const t = AP.generateChirp({ sampleRate: 16000, durationMs: 30, amplitude: 0.2 });
      const r = AP.matchedFilter(t, t);
      assert(r.peak > 0.99 && r.lag === 0, "self " + r.peak);
    });
    test("matchedFilter detects delayed template", function () {
      const t = AP.generateChirp({ sampleRate: 16000, durationMs: 25, amplitude: 0.2 });
      const buf = new Float32Array(t.length + 200);
      const lag = 80;
      for (let i = 0; i < t.length; i++) buf[lag + i] = t[i];
      const r = AP.matchedFilter(t, buf);
      assert(r.peak > 0.95 && Math.abs(r.lag - lag) <= 1, "lag " + r.lag);
    });
    test("detection threshold rejects pure noise", function () {
      const t = AP.generateChirp({ sampleRate: 16000, durationMs: 30, amplitude: 0.2 });
      const noise = new Float32Array(t.length + 100);
      for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * 0.05;
      const r = AP.matchedFilter(t, noise);
      assert(r.peak < 0.35, "noise peak " + r.peak);
    });
    test("synthetic test detects clean fixture", function () {
      AP.clearEvents();
      const res = AP.runSyntheticTest({ noise: 0.005, sampleRate: 24000 });
      assert(res.detected === true && res.event.mode === "synthetic", "synthetic detect");
    });
    test("synthetic vs live mode distinction", function () {
      const res = AP.runSyntheticTest({ noise: 0.01 });
      assert(res.event.mode === "synthetic", "must not claim live");
    });
    test("sequence numbering increments", function () {
      const before = AP.getStatus().sequence;
      AP.runSyntheticTest({ noise: 0.01 });
      AP.runSyntheticTest({ noise: 0.01 });
      assert(AP.getStatus().sequence === before + 2, "sequence");
    });
    test("event schema required fields", function () {
      const e = AP.runSyntheticTest({ noise: 0.01 }).event;
      ["schema_version", "event_id", "probe_id", "node_id", "sequence", "event_type", "sample_rate", "frequency_start_hz", "frequency_end_hz", "duration_ms", "mode"].forEach(function (k) {
        assert(e[k] != null, "missing " + k);
      });
      assert(e.schema_version === AP.SCHEMA_VERSION, "schema");
    });
    test("config set/get roundtrip", function () {
      AP.setConfig({ freqStartHz: 2100, durationMs: 35 });
      const c = AP.getConfig();
      assert(c.freqStartHz === 2100 && c.durationMs === 35, "config");
      AP.setConfig({ freqStartHz: 1800, durationMs: 40 });
    });
    test("duplicate suppression window exists in defaults", function () {
      assert(AP.DEFAULTS.duplicateWindowMs > 0, "dup window");
    });
    test("existing engine.js symbols intact", function () {
      if (root.SignalProducer) assert(typeof root.SignalProducer.packet === "function", "SignalProducer");
      if (root.SignalField) assert(typeof root.SignalField.ingestObservation === "function", "SignalField");
    });
    const passed = results.filter(function (r) { return r.ok; }).length;
    const failed = results.length - passed;
    console.log("[AcousticProbeTests] passed=" + passed + " failed=" + failed);
    results.forEach(function (r) {
      console.log((r.ok ? "  ✓ " : "  ✗ ") + r.name + (r.ok ? "" : " — " + r.error));
    });
    return { passed: passed, failed: failed, results: results };
  }
  root.AcousticProbeTests = { runAll: runAll, results: results };
})(typeof window !== "undefined" ? window : this);
