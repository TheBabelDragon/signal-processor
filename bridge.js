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
  return { score: clip01(raw), motion, entropy, drive, fuse, conf, health: (obs && obs.health) || 'unknown' };
}

function ingestObservation(payload) {
  if (payload == null) return null;
  let obs = payload;
  if (typeof payload === 'string') {
    const line = payload.trim();
    if (!line) return null;
    const json = line.indexOf('OBS ') === 0 ? line.slice(4) : line;
    try { obs = JSON.parse(json); } catch (e) { return null; }
  }
  if (typeof obs.score === 'number' && !obs.field_regions && !obs.regions) {
    return { score: clip01(obs.score), source: 'score' };
  }
  const scored = scoreFieldObservation(obs);
  scored.source = obs.body_type || obs.body_id || 'field';
  return scored;
}

function connectEchoStream(url, onScore, onStatus) {
  if (!url) return { close() {} };
  let closed = false;
  let es = null;
  let ws = null;
  function fail(msg) { if (onStatus) onStatus(msg, 'err'); }
  if (url.indexOf('ws') === 0) {
    try {
      ws = new WebSocket(url);
      ws.onopen = () => onStatus && onStatus('echo ws open', '');
      ws.onmessage = (ev) => {
        const scored = ingestObservation(ev.data);
        if (scored && onScore) onScore(scored);
      };
      ws.onerror = () => fail('echo ws error');
      ws.onclose = () => { if (!closed) fail('echo ws closed'); };
    } catch (err) { fail(err.message || String(err)); }
  } else {
    try {
      es = new EventSource(url);
      es.onopen = () => onStatus && onStatus('echo sse open', '');
      es.onmessage = (ev) => {
        const scored = ingestObservation(ev.data);
        if (scored && onScore) onScore(scored);
      };
      es.onerror = () => fail('echo sse error — is tools/echo_bridge.py running?');
    } catch (err) { fail(err.message || String(err)); }
  }
  return {
    close() {
      closed = true;
      try { if (es) es.close(); } catch (e) {}
      try { if (ws) ws.close(); } catch (e) {}
    }
  };
}

window.SignalField = { ingestObservation, scoreFieldObservation, connectEchoStream };
