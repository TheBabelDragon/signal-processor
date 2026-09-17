"use strict";

function clip01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function regionMap(obs) {
  const out = {};
  const regions = (obs && (obs.field_regions || obs.regions)) || [];
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (!r || !r.region) continue;
    out[r.region] = clip01(r.observed);
  }
  return out;
}

function scoreFieldObservation(obs) {
  const r = regionMap(obs);
  const motion = r.motion !== undefined ? r.motion : 0;
  const entropy = r.entropy !== undefined ? r.entropy : 0;
  const drive = r.drive !== undefined ? r.drive : 0;
  const fuse = r.fuse !== undefined ? r.fuse : 0;
  const raw = 1 - (0.55 * motion + 0.25 * drive + 0.20 * entropy);
  const conf = fuse > 0 ? (0.4 + 0.6 * fuse) : 0.7;
  const health = (obs && obs.health) || "unknown";
  const phase = (obs && obs.modality && obs.modality.phase) || "hold";
  let isolated = true;
  if (obs && obs.modality && obs.modality.isolated === false) isolated = false;
  if (health === "partial" || health === "error") isolated = false;

  let score = clip01(raw);
  if (!isolated) score = clip01(score * 0.3);

  return { score: score, motion: motion, entropy: entropy, drive: drive, fuse: fuse, conf: conf, health: health, phase: phase, isolated: isolated };
}

function ingestObservation(payload) {
  if (payload == null) return null;
  let obs = payload;
  if (typeof payload === "string") {
    const line = payload.trim();
    if (!line) return null;
    const json = line.indexOf("OBS ") === 0 ? line.slice(4) : line;
    try { obs = JSON.parse(json); } catch (e) { return null; }
  }
  if (typeof obs.score === "number" && !obs.field_regions && !obs.regions) {
    return { score: clip01(obs.score), source: "score", isolated: true, phase: "hold", health: "ok" };
  }
  const scored = scoreFieldObservation(obs);
  scored.source = obs.body_type || obs.body_id || "field";
  return scored;
}

function isMixedLocal(url) {
  try {
    if (typeof location === "undefined") return false;
    if (location.protocol !== "https:") return false;
    const u = new URL(url, location.href);
    if (u.protocol !== "http:") return false;
    const h = u.hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "0.0.0.0";
  } catch (e) {
    return false;
  }
}

function connectEchoStream(url, onScore, onStatus) {
  if (!url) return { close() {} };
  let closed = false;
  let es = null;
  let ws = null;
  let lastFailAt = 0;
  let failCount = 0;

  function fail(msg, hard) {
    if (closed) return;
    const now = Date.now();
    // EventSource retries aggressively — only surface status every 4s
    if (now - lastFailAt < 4000 && !hard) return;
    lastFailAt = now;
    failCount += 1;
    if (onStatus) onStatus(msg, "err");
    if (hard || failCount >= 3) {
      closed = true;
      try { if (es) es.close(); } catch (e) {}
      try { if (ws) ws.close(); } catch (e) {}
    }
  }

  if (isMixedLocal(url)) {
    fail("echo blocked on Pages (https→http localhost). serve locally or use a public SSE URL", true);
    return {
      close() {
        closed = true;
      }
    };
  }

  if (url.indexOf("ws") === 0) {
    try {
      ws = new WebSocket(url);
      ws.onopen = () => {
        failCount = 0;
        if (onStatus) onStatus("echo ws open", "");
      };
      ws.onmessage = (ev) => {
        const scored = ingestObservation(ev.data);
        if (scored && onScore) onScore(scored);
      };
      ws.onerror = () => fail("echo ws error");
      ws.onclose = () => {
        if (!closed) fail("echo ws closed");
      };
    } catch (err) {
      fail(err.message || String(err), true);
    }
  } else {
    try {
      es = new EventSource(url);
      es.onopen = () => {
        failCount = 0;
        if (onStatus) onStatus("echo sse open", "");
      };
      es.onmessage = (ev) => {
        const scored = ingestObservation(ev.data);
        if (scored && onScore) onScore(scored);
      };
      es.onerror = () => {
        const state = es ? es.readyState : 2;
        // CONNECTING=0 keeps retrying; CLOSED=2 is done
        if (state === 2) {
          fail("echo sse closed — is tools/echo_bridge.py running?", true);
        } else {
          fail("echo sse reconnecting… bridge up?");
        }
      };
    } catch (err) {
      fail(err.message || String(err), true);
    }
  }

  return {
    close() {
      closed = true;
      try { if (es) es.close(); } catch (e) {}
      try { if (ws) ws.close(); } catch (e) {}
    }
  };
}

window.SignalField = {
  ingestObservation: ingestObservation,
  scoreFieldObservation: scoreFieldObservation,
  connectEchoStream: connectEchoStream,
  isMixedLocal: isMixedLocal
};
