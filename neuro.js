"use strict";

const NF_BANDS = {
  delta:  { hz: 2.5,  label: 'delta 2.5',  hint: 'sleep / deep' },
  theta:  { hz: 6.0,  label: 'theta 6',    hint: 'idle / hypnagogic' },
  alpha:  { hz: 10.0, label: 'alpha 10',   hint: 'eyes-closed rest' },
  smr:    { hz: 13.5, label: 'smr 13.5',   hint: 'quiet body, alert' },
  beta:  { hz: 18.0, label: 'beta 18',    hint: 'active focus' },
  gamma: { hz: 40.0, label: 'gamma 40',   hint: 'binding / high' },
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
};

function nfSetStatus(msg, kind) {
  const n = document.getElementById('nfStatus');
  if (!n) return;
  n.textContent = msg;
  n.className = 'status' + (kind ? ' ' + kind : '');
}

function applyBandToUI(key) {
  const band = NF_BANDS[key];
  if (!band) return;
  nf.band = key;
  document.querySelectorAll('#bandChips .chip').forEach(c => c.classList.toggle('active', c.dataset.band === key));
  const beat = document.getElementById('beatSlider');
  const beatVal = document.getElementById('beatVal');
  beat.value = band.hz;
  beatVal.textContent = band.hz.toFixed(2);
  document.getElementById('beatAutoToggle').checked = false;
  document.getElementById('beatRamp').classList.remove('show');
  nfSetStatus(band.label + ' \u2014 ' + band.hint);
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

function tickSession() {
  if (!nf.running) return;
  nf.raf = requestAnimationFrame(tickSession);
  const elapsed = (performance.now() - nf.startedAt) / 1000;
  const left = Math.max(0, nf.duration - elapsed);
  const m = Math.floor(left / 60), s = Math.floor(left % 60);
  document.getElementById('nfClock').textContent = m + ':' + String(s).padStart(2, '0');

  const sensor = document.getElementById('nfSensor').value;
  if (sensor === 'mic') nf.reward = readMicStillness();
  else if (sensor === 'manual') {
    const age = (performance.now() - nf.lastTap) / 1000;
    nf.reward = Math.max(0, nf.reward * 0.992 - age * 0.0004);
  }

  document.getElementById('nfRewardVal').textContent = (nf.reward * 100).toFixed(0) + '%';
  drawReward();

  nf.score += nf.reward;
  nf.samples += 1;

  const protocol = document.getElementById('nfProtocol').value;
  if (protocol === 'reward' && playing) {
    const target = NF_BANDS[nf.band].hz;
    const recipe = readRecipeFromUI();
    const drift = (1 - nf.reward) * 2;
    liveSetBeat(playing, recipe, target + drift);
    liveSetToneDb(playing, recipe, recipe.tone_db + nf.reward * 4);
  }

  if (elapsed >= nf.duration) stopSession('session complete \u00b7 avg reward ' + ((nf.score / Math.max(1, nf.samples)) * 100).toFixed(0) + '%');
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
    document.getElementById('playBtn').disabled = false;
    document.getElementById('exportBtn').disabled = false;
  } else if (!sourceBuffer) {
    nfSetStatus('load a file or pick a generated bed', 'warn');
    return;
  }

  const sensor = document.getElementById('nfSensor').value;
  if (sensor === 'mic') {
    try { await startMic(); }
    catch (err) { nfSetStatus('mic denied \u2014 use manual tap or entrain', 'err'); return; }
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
  document.getElementById('playBtn').textContent = '\u25a0 STOP';
  document.getElementById('playBtn').classList.add('playing');
  startMeter();
  nodes.src.onended = () => { if (playing === nodes) stopSession('bed ended'); };

  nf.running = true;
  nf.startedAt = performance.now();
  nf.reward = sensor === 'manual' ? 0.4 : 0.5;
  nf.score = 0;
  nf.samples = 0;
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
  document.getElementById('nfStartBtn').textContent = '\u25b6 SESSION';
  document.getElementById('nfStartBtn').classList.remove('playing');
  if (playing) stopPlayback();
  nfSetStatus(msg || 'session stopped');
}

window.SignalObservation = {
  push(score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return;
    nf.reward = Math.max(0, Math.min(1, n));
  }
};
window.addEventListener('signal-observation', (e) => {
  if (e && e.detail && Number.isFinite(Number(e.detail.score))) {
    nf.reward = Math.max(0, Math.min(1, Number(e.detail.score)));
  }
});

document.getElementById('nfRewardBtn').addEventListener('click', () => {
  nf.lastTap = performance.now();
  nf.reward = Math.min(1, nf.reward + 0.25);
});
document.getElementById('nfStartBtn').addEventListener('click', () => {
  startSession().catch(err => nfSetStatus(err.message || String(err), 'err'));
});

renderBandChips();
applyBandToUI('alpha');
drawReward();
