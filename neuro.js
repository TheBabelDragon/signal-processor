"use strict";

const NF_BANDS = {
  delta: { hz: 2.5,  label: 'delta 2.5',  hint: 'sleep / deep' },
  theta: { hz: 6.0,  label: 'theta 6',    hint: 'idle / hypnagogic' },
  alpha: { hz: 10.0, label: 'alpha 10',   hint: 'eyes-closed rest' },
  smr:   { hz: 13.5, label: 'smr 13.5',   hint: 'quiet body, alert' },
  beta:  { hz: 18.0, label: 'beta 18',    hint: 'active focus' },
  gamma: { hz: 40.0, label: 'gamma 40',   hint: 'binding / high' },
};

const NF_PROTOCOLS = {
  alpha_up:    { band: 'alpha', polarity: 1,  hint: 'reward alpha hold' },
  theta_down:  { band: 'theta', polarity: -1, hint: 'inhibit theta wander' },
  smr:         { band: 'smr',   polarity: 1,  hint: 'SMR uptrain' },
  alpha_theta: { band: 'alpha', polarity: 1,  hint: 'start theta, reward alpha' },
  beta_focus:  { band: 'beta',  polarity: 1,  hint: 'active focus hold' },
};

const ECHO_PRESETS = {
  echo_still_alpha: {
    label: 'echo · still α',
    band: 'alpha',
    polarity: 1,
    protocol: 'reward',
    stack: 'alpha_up',
    bed: 'silence',
    minutes: 12,
    hint: 'reward stillness · alpha hold',
  },
  echo_still_smr: {
    label: 'echo · still SMR',
    band: 'smr',
    polarity: 1,
    protocol: 'reward',
    stack: 'smr',
    bed: 'pink',
    minutes: 15,
    hint: 'quiet body · SMR uptrain',
  },
  echo_motion_beta: {
    label: 'echo · move β',
    band: 'beta',
    polarity: -1,
    protocol: 'reward',
    stack: 'beta_focus',
    bed: 'brown',
    minutes: 10,
    hint: 'inhibit high · motion rewarded',
  },
  echo_entrain_alpha: {
    label: 'echo · entrain α',
    band: 'alpha',
    polarity: 1,
    protocol: 'entrain',
    stack: 'alpha_up',
    bed: 'silence',
    minutes: 20,
    hint: 'open loop · Echo still visualizes',
  },
};

const nf = {
  band: 'alpha',
  running: false,
  startedAt: 0,
  duration: 600,
  reward: 0,
  score: 0,
  samples: 0,
  raf: 0,
  mic: null,
  analyser: null,
  baseline: 0.02,
  lastTap: 0,
  echo: null,
  log: [],
  field: {
    motion: 0,
    drive: 0,
    entropy: 0,
    fuse: 0,
    conf: 0,
    health: '—',
    phase: '—',
    isolated: true,
    source: '—',
    live: false,
  },
};

function nfSetStatus(msg, kind) {
  const n = document.getElementById('nfStatus');
  if (!n) return;
  n.textContent = msg;
  n.className = 'status' + (kind ? ' ' + kind : '');
}

/** Echo transport line only — never stomps session / play status */
function echoLinkStatus(msg, kind) {
  const n = document.getElementById('echoLinkStatus');
  if (!n) {
    // fallback only if markup missing
    if (kind === 'err') nfSetStatus(msg, kind);
    return;
  }
  n.textContent = msg;
  n.className = 'status echo-link' + (kind ? ' ' + kind : '');
}

function applyBandToUI(key) {
  const band = NF_BANDS[key];
  if (!band) return;
  nf.band = key;
  document.querySelectorAll('#bandChips .chip').forEach(c => c.classList.toggle('active', c.dataset.band === key));
  document.getElementById('beatSlider').value = band.hz;
  document.getElementById('beatVal').textContent = band.hz.toFixed(2);
  document.getElementById('beatAutoToggle').checked = false;
  document.getElementById('beatRamp').classList.remove('show');
  nfSetStatus(band.label + ' \u2014 ' + band.hint);
}

function applyProtocol(name) {
  const p = NF_PROTOCOLS[name];
  if (!p) return;
  applyBandToUI(p.band);
  const pol = document.getElementById('nfPolarity');
  if (pol) pol.value = String(p.polarity);
  if (name === 'alpha_theta') {
    document.getElementById('beatAutoToggle').checked = true;
    document.getElementById('beatRamp').classList.add('show');
    document.getElementById('beatFrom').value = '6';
    document.getElementById('beatTo').value = '10';
    const minutes = parseFloat(document.getElementById('nfMinutes').value) || 10;
    document.getElementById('beatDur').value = String(Math.round(minutes * 60 * 0.4));
    document.getElementById('beatCurve').value = 'smooth';
  }
  nfSetStatus(name.replace('_', ' ') + ' \u2014 ' + p.hint);
}

function applyEchoPreset(key) {
  const p = ECHO_PRESETS[key];
  if (!p) return;
  applyBandToUI(p.band);
  const stack = document.getElementById('nfStack');
  if (stack) stack.value = p.stack || '';
  const pol = document.getElementById('nfPolarity');
  if (pol) pol.value = String(p.polarity);
  const proto = document.getElementById('nfProtocol');
  if (proto) proto.value = p.protocol;
  const sensor = document.getElementById('nfSensor');
  if (sensor) sensor.value = 'external';
  const bed = document.getElementById('nfBed');
  if (bed) bed.value = p.bed;
  const minutes = document.getElementById('nfMinutes');
  if (minutes) minutes.value = String(p.minutes);
  document.querySelectorAll('#echoPresetChips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.echo === key);
  });
  showEchoViz(true);
  nfSetStatus(p.label + ' \u2014 ' + p.hint);
  echoLinkStatus('echo preset ready · start session to connect');
}

function renderBandChips() {
  const wrap = document.getElementById('bandChips');
  wrap.innerHTML = '';
  Object.keys(NF_BANDS).forEach(key => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (key === nf.band ? ' active' : '');
    chip.dataset.band = key;
    chip.textContent = NF_BANDS[key].label;
    chip.addEventListener('click', () => applyBandToUI(key));
    wrap.appendChild(chip);
  });
}

function renderEchoPresetChips() {
  const wrap = document.getElementById('echoPresetChips');
  if (!wrap) return;
  wrap.innerHTML = '';
  Object.keys(ECHO_PRESETS).forEach(key => {
    const p = ECHO_PRESETS[key];
    const chip = document.createElement('div');
    chip.className = 'chip echo';
    chip.dataset.echo = key;
    chip.textContent = p.label;
    chip.title = p.hint;
    chip.addEventListener('click', () => applyEchoPreset(key));
    wrap.appendChild(chip);
  });
}

function showEchoViz(on) {
  const panel = document.getElementById('echoViz');
  if (!panel) return;
  panel.hidden = !on;
  if (on) drawEchoField();
}

function updateEchoBadges() {
  const f = nf.field;
  const healthEl = document.getElementById('echoHealth');
  const phaseEl = document.getElementById('echoPhase');
  const isoEl = document.getElementById('echoIsolated');
  const srcEl = document.getElementById('echoSource');
  const panel = document.getElementById('echoViz');
  if (!healthEl) return;

  healthEl.textContent = 'health ' + (f.health || '—');
  phaseEl.textContent = 'phase ' + (f.phase || '—');
  isoEl.textContent = f.isolated ? 'iso ✓' : 'iso ✗';
  srcEl.textContent = 'src ' + (f.source || '—');

  const h = String(f.health || '').toLowerCase();
  healthEl.className = 'echo-badge' + (h === 'ok' || h === '—' ? ' ok' : h === 'partial' || h === 'stale' ? ' warn' : ' err');
  phaseEl.className = 'echo-badge' + (f.phase === 'hold' ? ' ok' : f.phase === 'charge' ? ' warn' : '');
  isoEl.className = 'echo-badge' + (f.isolated ? ' ok' : ' err');
  srcEl.className = 'echo-badge dim';

  if (panel) {
    panel.classList.toggle('live', !!f.live && f.isolated);
    panel.classList.toggle('fault', !!f.live && !f.isolated);
  }
}

function drawEchoField() {
  const canvas = document.getElementById('echoFieldMeter');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const f = nf.field;
  const keys = ['motion', 'drive', 'entropy', 'fuse'];
  const colors = ['#ff6b6b', '#ffb454', '#7dffb2', '#5b9cff'];
  const n = keys.length;
  const gap = 10;
  const barW = (w - gap * (n + 1)) / n;
  const maxH = h - 10;

  ctx.fillStyle = '#0f1613';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, Number(f[keys[i]]) || 0));
    const x = gap + i * (barW + gap);
    const bh = Math.max(2, v * maxH);
    ctx.fillStyle = '#1a2420';
    ctx.fillRect(x, 5, barW, maxH);
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, colors[i]);
    grad.addColorStop(1, colors[i] + '88');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 5 + maxH - bh, barW, bh);
    ctx.fillStyle = '#7f9a8e';
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText((v * 100).toFixed(0), x + barW / 2, h - 2);
  }
}

function drawReward() {
  const canvas = document.getElementById('nfRewardMeter');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0f1613';
  ctx.fillRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#3f7a5c');
  grad.addColorStop(0.7, '#7dffb2');
  grad.addColorStop(1, '#ffb454');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, Math.max(0, Math.min(1, nf.reward)) * w, h);
}

function applyScoredField(scored) {
  if (!scored) return;
  nf.field.motion = scored.motion != null ? scored.motion : nf.field.motion;
  nf.field.drive = scored.drive != null ? scored.drive : nf.field.drive;
  nf.field.entropy = scored.entropy != null ? scored.entropy : nf.field.entropy;
  nf.field.fuse = scored.fuse != null ? scored.fuse : nf.field.fuse;
  nf.field.conf = scored.conf != null ? scored.conf : nf.field.conf;
  nf.field.health = scored.health != null ? scored.health : nf.field.health;
  nf.field.phase = scored.phase != null ? scored.phase : nf.field.phase;
  nf.field.isolated = scored.isolated != null ? scored.isolated : nf.field.isolated;
  nf.field.source = scored.source != null ? scored.source : nf.field.source;
  nf.field.live = true;
  updateEchoBadges();
  drawEchoField();
}

async function startMic() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false }, video: false });
  const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  audioCtx = ctx;
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  nf.mic = { stream, src };
  nf.analyser = analyser;
}

function stopMic() {
  if (nf.mic && nf.mic.stream) nf.mic.stream.getTracks().forEach(t => t.stop());
  try { if (nf.mic && nf.mic.src) nf.mic.src.disconnect(); } catch (e) {}
  nf.mic = null;
  nf.analyser = null;
}

function stopEcho() {
  if (nf.echo && nf.echo.close) nf.echo.close();
  nf.echo = null;
  nf.field.live = false;
  updateEchoBadges();
}

function readMicStillness() {
  if (!nf.analyser) return nf.reward;
  const data = new Uint8Array(nf.analyser.fftSize);
  nf.analyser.getByteTimeDomainData(data);
  let acc = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    acc += v * v;
  }
  const rms = Math.sqrt(acc / data.length);
  nf.baseline = nf.baseline * 0.995 + rms * 0.005;
  const thresh = Math.max(0.008, nf.baseline * 1.8);
  const raw = 1 - Math.min(1, rms / thresh);
  return nf.reward * 0.85 + raw * 0.15;
}

function polarity() {
  const el = document.getElementById('nfPolarity');
  return el && el.value === '-1' ? -1 : 1;
}

function shapedReward(raw) {
  return polarity() < 0 ? (1 - raw) : raw;
}

function tickSession() {
  if (!nf.running) return;
  nf.raf = requestAnimationFrame(tickSession);
  const elapsed = (performance.now() - nf.startedAt) / 1000;
  const left = Math.max(0, nf.duration - elapsed);
  const m = Math.floor(left / 60), s = Math.floor(left % 60);
  document.getElementById('nfClock').textContent = m + ':' + String(s).padStart(2, '0');

  const sensor = document.getElementById('nfSensor').value;
  if (sensor === 'mic') nf.reward = shapedReward(readMicStillness());
  else if (sensor === 'manual') {
    const age = (performance.now() - nf.lastTap) / 1000;
    nf.reward = Math.max(0, nf.reward * 0.992 - age * 0.0004);
  }

  document.getElementById('nfRewardVal').textContent = (nf.reward * 100).toFixed(0) + '%';
  drawReward();
  nf.score += nf.reward;
  nf.samples += 1;
  if (nf.samples % 30 === 0) {
    nf.log.push({
      t: +elapsed.toFixed(2),
      reward: +nf.reward.toFixed(3),
      band: nf.band,
      motion: +nf.field.motion.toFixed(3),
      drive: +nf.field.drive.toFixed(3),
      entropy: +nf.field.entropy.toFixed(3),
      isolated: nf.field.isolated,
    });
  }

  const protocol = document.getElementById('nfProtocol').value;
  if (protocol === 'reward' && playing) {
    const target = NF_BANDS[nf.band].hz;
    const recipe = readRecipeFromUI();
    liveSetBeat(playing, recipe, target + (1 - nf.reward) * 2);
    liveSetToneDb(playing, recipe, recipe.tone_db + nf.reward * 4);
  }

  if (elapsed >= nf.duration) stopSession('session complete \u00b7 avg ' + ((nf.score / Math.max(1, nf.samples)) * 100).toFixed(0) + '%');
}

async function startSession() {
  if (nf.running) { stopSession('session stopped'); return; }
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const minutes = Math.max(1, Math.min(90, parseFloat(document.getElementById('nfMinutes').value) || 10));
  nf.duration = minutes * 60;
  applyBandToUI(nf.band);

  const bed = document.getElementById('nfBed').value;
  if (bed !== 'file') {
    sourceBuffer = makeBedBuffer(audioCtx, nf.duration + 2, bed === 'brown' ? 'brown' : bed === 'silence' ? 'silence' : 'pink');
    fileLabel = bed + '-bed';
    document.getElementById('fileName').textContent = fileLabel;
    document.getElementById('fileDuration').textContent = formatTime(sourceBuffer.duration) + ' \u00b7 generated';
    const pb = document.getElementById('playBtn');
    const eb = document.getElementById('exportBtn');
    if (pb) pb.disabled = false;
    if (eb) eb.disabled = false;
  } else if (!sourceBuffer) {
    nfSetStatus('load a file or pick a generated bed', 'warn');
    return;
  }

  const sensor = document.getElementById('nfSensor').value;
  if (sensor === 'mic') {
    try { await startMic(); }
    catch (err) { nfSetStatus('mic denied \u2014 use tap or echo stream', 'err'); return; }
  }
  if (sensor === 'external') {
    showEchoViz(true);
    const url = (document.getElementById('nfEchoUrl').value || '').trim() || 'http://127.0.0.1:8765/events';
    echoLinkStatus('connecting echo…');
    nf.echo = connectEchoStream(url, (scored) => {
      nf.reward = shapedReward(scored.score);
      applyScoredField(scored);
    }, echoLinkStatus);
  } else {
    showEchoViz(false);
    echoLinkStatus('echo link idle');
  }

  document.getElementById('fadeIn').value = Math.min(20, Math.max(4, minutes));
  document.getElementById('fadeOut').value = Math.min(30, Math.max(8, minutes * 1.5));

  if (playing) stopPlayback();
  const recipe = readRecipeFromUI();
  const nodes = await buildGraph(audioCtx, sourceBuffer, recipe);
  meterAnalyser = audioCtx.createAnalyser();
  meterAnalyser.fftSize = 256;
  nodes.limiter.connect(meterAnalyser);
  playing = nodes;
  const playBtn = document.getElementById('playBtn');
  if (playBtn) {
    playBtn.textContent = '\u25a0 STOP';
    playBtn.classList.add('playing');
  }
  startMeter();
  nodes.src.onended = () => { if (playing === nodes) stopSession('bed ended'); };

  nf.running = true;
  nf.startedAt = performance.now();
  nf.reward = sensor === 'manual' ? 0.4 : 0.5;
  nf.score = 0;
  nf.samples = 0;
  nf.log = [];
  document.getElementById('nfStartBtn').textContent = '\u25a0 STOP SESSION';
  document.getElementById('nfStartBtn').classList.add('playing');
  nfSetStatus('session live \u00b7 ' + NF_BANDS[nf.band].label + ' \u00b7 ' + sensor);
  tickSession();
}

function stopSession(msg) {
  nf.running = false;
  if (nf.raf) cancelAnimationFrame(nf.raf);
  nf.raf = 0;
  stopMic();
  stopEcho();
  document.getElementById('nfStartBtn').textContent = '\u25b6 SESSION';
  document.getElementById('nfStartBtn').classList.remove('playing');
  if (playing) stopPlayback();
  nfSetStatus(msg || 'session stopped');
  echoLinkStatus('echo link idle');
}

function exportSessionLog() {
  const blob = new Blob([JSON.stringify({
    band: nf.band,
    duration: nf.duration,
    avg: nf.samples ? nf.score / nf.samples : 0,
    samples: nf.log,
    field_last: nf.field,
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nf-session.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

window.SignalObservation = {
  push(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return;
    nf.reward = shapedReward(Math.max(0, Math.min(1, n)));
  },
  observe(payload) {
    const scored = ingestObservation(payload);
    if (scored) {
      nf.reward = shapedReward(scored.score);
      applyScoredField(scored);
      showEchoViz(true);
    }
  }
};
window.addEventListener('signal-observation', (e) => {
  if (!e || !e.detail) return;
  if (Number.isFinite(Number(e.detail.score)) && !e.detail.field_regions) {
    nf.reward = shapedReward(Number(e.detail.score));
    return;
  }
  const scored = ingestObservation(e.detail);
  if (scored) {
    nf.reward = shapedReward(scored.score);
    applyScoredField(scored);
    showEchoViz(true);
  }
});

document.getElementById('nfRewardBtn').addEventListener('click', () => {
  nf.lastTap = performance.now();
  nf.reward = Math.min(1, nf.reward + 0.25);
});
document.getElementById('nfStartBtn').addEventListener('click', () => {
  startSession().catch(err => nfSetStatus(err.message || String(err), 'err'));
});
document.getElementById('nfLogBtn').addEventListener('click', exportSessionLog);
document.getElementById('nfStack').addEventListener('change', (e) => applyProtocol(e.target.value));
document.getElementById('nfSensor').addEventListener('change', (e) => {
  const ext = e.target.value === 'external';
  showEchoViz(ext);
  echoLinkStatus(ext ? 'echo selected · start session to connect' : 'echo link idle');
});

renderBandChips();
renderEchoPresetChips();
applyBandToUI('alpha');
drawReward();
drawEchoField();
updateEchoBadges();
if (typeof location !== 'undefined' && location.protocol === 'https:') {
  echoLinkStatus('on Pages (https) · localhost SSE is blocked — serve over http for echo bridge');
}
