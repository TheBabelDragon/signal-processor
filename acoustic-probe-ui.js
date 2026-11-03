"use strict";

/**
 * Acoustic Probe dashboard UI — wires window.AcousticProbe into SIGNAL·PROCESSOR
 * without touching the neurofeedback pipeline.
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function setStatus(msg, kind) {
    const el = $("apStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "ap-status" + (kind ? " " + kind : "");
  }
  function setBadge(mode) {
    const el = $("apBadge");
    if (!el) return;
    el.textContent = (mode || "idle").toUpperCase();
    el.className = "ap-badge " + (mode || "idle");
  }
  function fmtMs(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    return v.toFixed(1) + " ms";
  }
  function fmtNum(v, dig) {
    if (v == null || !Number.isFinite(v)) return "—";
    return Number(v).toFixed(dig != null ? dig : 3);
  }
  function drawLevel(rms, clipped) {
    const c = $("apLevel");
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;
    ctx.fillStyle = "#0f1613";
    ctx.fillRect(0, 0, w, h);
    const level = Math.min(1, rms * 8);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#3f7a5c");
    grad.addColorStop(0.7, "#7dffb2");
    grad.addColorStop(1, clipped ? "#ff6b6b" : "#7dffb2");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w * level, h);
    if (clipped) { ctx.fillStyle = "#ff6b6b"; ctx.fillRect(w - 6, 0, 6, h); }
  }
  function drawWave(mode) {
    const c = $("apWave");
    if (!c || !window.AcousticProbe) return;
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;
    ctx.fillStyle = "#0f1613";
    ctx.fillRect(0, 0, w, h);
    const cfg = AcousticProbe.getConfig();
    const samples = AcousticProbe.generateChirp({
      sampleRate: 8000, freqStartHz: cfg.freqStartHz, freqEndHz: cfg.freqEndHz,
      durationMs: cfg.durationMs, amplitude: 0.9, attackMs: cfg.attackMs, releaseMs: cfg.releaseMs,
    });
    ctx.strokeStyle = mode === "synthetic" ? "#5b9cff" : "#7dffb2";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const mid = h / 2;
    for (let i = 0; i < samples.length; i++) {
      const x = (i / (samples.length - 1)) * w;
      const y = mid - samples[i] * (h * 0.42);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "#7f9a8e";
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.fillText(mode === "synthetic" ? "SYNTHETIC TEMPLATE" : "PROBE TEMPLATE", 6, 12);
  }
  function renderHistory(events) {
    const el = $("apHistory");
    if (!el) return;
    if (!events || !events.length) {
      el.innerHTML = '<div class="row"><span class="k">no events yet</span></div>';
      return;
    }
    el.innerHTML = events.slice(0, 12).map(function (ev) {
      const kind = ev.event_type || "?";
      const cls = kind === "emit" ? "emit" : kind === "detection" ? (ev.mode === "synthetic" ? "synthetic" : "detection") : kind === "miss" ? "miss" : "";
      const conf = ev.confidence != null ? " c=" + fmtNum(ev.confidence, 2) : "";
      const lat = ev.estimated_latency_ms != null ? " Δ=" + fmtMs(ev.estimated_latency_ms) : "";
      const modeTag = ev.mode === "synthetic" ? " [SYN]" : "";
      return '<div class="row ' + cls + '"><span>#' + ev.sequence + " " + kind + modeTag + conf + lat +
        '</span><span>' + (ev.correlation_peak != null ? fmtNum(ev.correlation_peak, 3) : "—") + "</span></div>";
    }).join("");
  }
  function updateReadouts(st) {
    const set = function (id, text) { const el = $(id); if (el) el.textContent = text; };
    set("apSeq", st.sequence != null ? String(st.sequence) : "—");
    set("apSr", st.sampleRate ? st.sampleRate + " Hz" : "—");
    set("apRms", st.inputRms != null ? fmtNum(st.inputRms, 4) : "—");
    set("apClip", st.clipped ? "YES" : "no");
    set("apPerm", st.permission || "—");
    set("apNode", (st.config && st.config.nodeId) || "browser-local");
    const lastDet = (st.lastEvents || []).find(function (e) { return e.event_type === "detection"; });
    set("apConf", lastDet && lastDet.confidence != null ? fmtNum(lastDet.confidence, 3) : "—");
    set("apLat", lastDet ? fmtMs(lastDet.estimated_latency_ms) : "—");
    drawLevel(st.inputRms || 0, !!st.clipped);
    setBadge(st.mode || "idle");
  }
  function bindControls() {
    const cfg = AcousticProbe.getConfig();
    function bindRange(id, key, fmt) {
      const el = $(id), val = $(id + "Val");
      if (!el) return;
      el.value = cfg[key];
      if (val) val.textContent = fmt(cfg[key]);
      el.addEventListener("input", function () {
        const v = parseFloat(el.value);
        const o = {}; o[key] = v;
        AcousticProbe.setConfig(o);
        if (val) val.textContent = fmt(v);
        drawWave(AcousticProbe.getStatus().mode);
      });
    }
    bindRange("apFreqStart", "freqStartHz", function (v) { return v + " Hz"; });
    bindRange("apFreqEnd", "freqEndHz", function (v) { return v + " Hz"; });
    bindRange("apDur", "durationMs", function (v) { return v + " ms"; });
    bindRange("apAmp", "amplitude", function (v) { return v.toFixed(2); });
    bindRange("apInterval", "intervalMs", function (v) { return v + " ms"; });
    bindRange("apThresh", "detectionThreshold", function (v) { return v.toFixed(2); });

    const monBtn = $("apMonBtn");
    if (monBtn) {
      monBtn.addEventListener("click", async function () {
        const st = AcousticProbe.getStatus();
        if (st.monitoring) {
          AcousticProbe.stopMonitoring();
          monBtn.textContent = "▶ START MONITOR";
          monBtn.classList.remove("active");
          setStatus("monitoring stopped");
          updateReadouts(AcousticProbe.getStatus());
          return;
        }
        monBtn.disabled = true;
        setStatus("requesting microphone…");
        const res = await AcousticProbe.startMonitoring();
        monBtn.disabled = false;
        if (res.ok) {
          monBtn.textContent = "■ STOP MONITOR";
          monBtn.classList.add("active");
          setStatus("LIVE · mic " + res.sampleRate + " Hz · permission " + res.permission);
          updateReadouts(AcousticProbe.getStatus());
        } else {
          setStatus("mic failed: " + (res.error || res.permission), "err");
          updateReadouts(AcousticProbe.getStatus());
        }
      });
    }
    const pingBtn = $("apPingBtn");
    if (pingBtn) {
      pingBtn.addEventListener("click", async function () {
        try {
          setStatus("emitting chirp…");
          await AcousticProbe.ping();
          setStatus("chirp emitted · listening for return");
          updateReadouts(AcousticProbe.getStatus());
          renderHistory(AcousticProbe.getEvents());
        } catch (e) {
          setStatus("ping failed: " + (e.message || e), "err");
        }
      });
    }
    const autoBtn = $("apAutoBtn");
    if (autoBtn) {
      autoBtn.addEventListener("click", function () {
        const st = AcousticProbe.getStatus();
        const next = !st.autoPing;
        AcousticProbe.setAutoPing(next);
        autoBtn.textContent = next ? "■ AUTO OFF" : "AUTO PING";
        autoBtn.classList.toggle("active", next);
        setStatus(next ? "auto-ping every " + AcousticProbe.getConfig().intervalMs + " ms" : "auto-ping off");
      });
    }
    const synthBtn = $("apSynthBtn");
    if (synthBtn) {
      synthBtn.addEventListener("click", function () {
        const res = AcousticProbe.runSyntheticTest({ noise: 0.015 });
        setStatus(res.detected ? "SYNTHETIC detection · peak " + res.peak.toFixed(3) : "SYNTHETIC miss · peak " + res.peak.toFixed(3), res.detected ? "" : "warn");
        updateReadouts(AcousticProbe.getStatus());
        renderHistory(AcousticProbe.getEvents());
        drawWave("synthetic");
      });
    }
    const clearBtn = $("apClearBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        AcousticProbe.clearEvents();
        renderHistory([]);
        setStatus("event history cleared");
      });
    }
  }
  function boot() {
    if (!window.AcousticProbe) { setStatus("AcousticProbe module missing", "err"); return; }
    bindControls();
    drawWave("idle");
    AcousticProbe.onEvent(function () {
      updateReadouts(AcousticProbe.getStatus());
      renderHistory(AcousticProbe.getEvents());
    });
    setInterval(function () {
      const st = AcousticProbe.getStatus();
      if (st.monitoring) updateReadouts(st);
    }, 200);
    updateReadouts(AcousticProbe.getStatus());
    renderHistory([]);
    setStatus("idle · grant mic then start monitor · synthetic test needs no hardware");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
