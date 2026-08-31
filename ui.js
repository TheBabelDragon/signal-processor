const PRESETS = {
  focus_10hz: { mode: 'binaural', carrier_hz: 200.0, beat_hz: 10.0, tone_db: -24.0, music_db: 0.0, fade_in: 15.0, fade_out: 30.0 },
  deep_relax_ramp: { mode: 'binaural', carrier_hz: 180.0, beat_hz: { from: 10.0, to: 4.0, duration: 600.0, curve: 'smooth' }, tone_db: -22.0, music_db: 0.0, fade_in: 20.0, fade_out: 45.0 },
  isochronic_alpha: { mode: 'isochronic', carrier_hz: 200.0, pulse_hz: 10.0, depth: 1.0, duty: 0.5, shape: 'smooth_pulse', tone_db: -20.0, music_db: 0.0 },
};
const DEFAULTS = {
  mode: 'binaural', carrier_hz: 200.0, beat_hz: 10.0, pulse_hz: 10.0, tone_db: -24.0, music_db: 0.0,
  master_db: 0.0, fade_in: 0.0, fade_out: 0.0, waveform: 'sine', amp_left: 1.0, amp_right: 1.0,
  invert_stereo: false, depth: 1.0, duty: 0.5, attack: 0.1, release: 0.1, shape: 'square',
  modulation_depth: 0.5, modulation_stereo: 'linked', limiter_ceiling_db: -0.3,
};

let audioCtx = null, sourceBuffer = null, fileLabel = '', playing = null, meterAnalyser = null, meterRaf = null;

const el = (id) => document.getElementById(id);
const statusEl = el('status');
function setStatus(msg, kind) {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}
function num(id, fallback) {
  const n = parseFloat(el(id).value);
  return Number.isFinite(n) ? n : fallback;
}

function toParamSpec(constVal, autoToggleId, fromId, toId, durId, curveId) {
  if (el(autoToggleId).checked) {
    const v0 = parseFloat(el(fromId).value);
    const v1 = parseFloat(el(toId).value);
    const duration = parseFloat(el(durId).value);
    return {
      type: 'ramp',
      v0: Number.isFinite(v0) ? v0 : constVal,
      v1: Number.isFinite(v1) ? v1 : constVal,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 1,
      curve: el(curveId).value || 'linear',
    };
  }
  return { type: 'constant', value: constVal };
}

function readRecipeFromUI() {
  const mode = document.querySelector('#modeSeg button.active').dataset.mode;
  const carrier_hz = toParamSpec(num('carrierSlider', 200), 'carrierAutoToggle', 'carrierFrom', 'carrierTo', 'carrierDur', 'carrierCurve');
  const beatVal = num('beatSlider', 10);
  const beatSpec = toParamSpec(beatVal, 'beatAutoToggle', 'beatFrom', 'beatTo', 'beatDur', 'beatCurve');
  const depth = Math.min(1, Math.max(0, num('depth', 1)));
  return {
    mode,
    carrier_hz,
    beat_hz: beatSpec,
    pulse_hz: beatSpec,
    tone_db: num('toneSlider', -24),
    music_db: num('musicSlider', 0),
    master_db: num('masterDb', 0),
    fade_in: Math.max(0, num('fadeIn', 0)),
    fade_out: Math.max(0, num('fadeOut', 0)),
    waveform: el('waveform').value,
    shape: el('shape').value,
    duty: Math.min(0.95, Math.max(0.05, num('duty', 0.5))),
    attack: Math.min(0.5, Math.max(0, num('attack', 0.1))),
    release: Math.min(0.5, Math.max(0, num('release', 0.1))),
    depth,
    modulation_depth: depth,
    modulation_stereo: 'linked',
    amp_left: 1.0, amp_right: 1.0,
    invert_stereo: el('invertStereo').checked,
    limiter_ceiling_db: num('ceilingDb', -0.3),
  };
}

function applyRecipeToUI(p) {
  const merged = { ...DEFAULTS, ...p };
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode === merged.mode));
  updateModeVisibility(merged.mode);

  const setParamField = (val, sliderId, valId, autoToggleId, fromId, toId, durId, curveId) => {
    if (val && typeof val === 'object') {
      el(autoToggleId).checked = true;
      el(fromId).value = val.from; el(toId).value = val.to; el(durId).value = val.duration; el(curveId).value = val.curve || 'linear';
      el(sliderId).value = val.from;
    } else {
      el(autoToggleId).checked = false;
      el(sliderId).value = val;
    }
    el(valId).textContent = Number(typeof val === 'object' ? val.from : val).toFixed(2);
  };
  setParamField(merged.carrier_hz, 'carrierSlider', 'carrierVal', 'carrierAutoToggle', 'carrierFrom', 'carrierTo', 'carrierDur', 'carrierCurve');
  const beatOrPulse = merged.mode === 'isochronic' || merged.mode === 'modulation' ? (merged.pulse_hz ?? merged.beat_hz) : merged.beat_hz;
  setParamField(beatOrPulse, 'beatSlider', 'beatVal', 'beatAutoToggle', 'beatFrom', 'beatTo', 'beatDur', 'beatCurve');
  el('carrierRamp').classList.toggle('show', el('carrierAutoToggle').checked);
  el('beatRamp').classList.toggle('show', el('beatAutoToggle').checked);

  el('toneSlider').value = merged.tone_db; el('toneVal').textContent = Number(merged.tone_db).toFixed(1) + ' dB';
  el('musicSlider').value = merged.music_db; el('musicVal').textContent = Number(merged.music_db).toFixed(1) + ' dB';
  el('masterDb').value = merged.master_db;
  el('fadeIn').value = merged.fade_in; el('fadeOut').value = merged.fade_out;
  el('waveform').value = merged.waveform; el('shape').value = merged.shape;
  el('duty').value = merged.duty; el('attack').value = merged.attack; el('release').value = merged.release;
  el('depth').value = merged.mode === 'isochronic' ? merged.depth : merged.modulation_depth;
  el('invertStereo').checked = !!merged.invert_stereo;
  el('ceilingDb').value = merged.limiter_ceiling_db;
}

function updateModeVisibility(mode) {
  el('beatLabel').textContent = mode === 'binaural' ? 'BEAT' : 'PULSE';
  el('toneLabel').textContent = mode === 'modulation' ? 'TONE (unused)' : 'TONE';
  el('shapeField').style.display = mode === 'binaural' ? 'none' : 'flex';
  el('dutyField').style.display = mode === 'binaural' ? 'none' : 'flex';
  el('attackField').style.display = mode === 'binaural' ? 'none' : 'flex';
  el('releaseField').style.display = mode === 'binaural' ? 'none' : 'flex';
  el('depthField').style.display = mode === 'binaural' ? 'none' : 'flex';
  el('invertField').style.display = mode === 'binaural' ? 'flex' : 'none';
  el('carrierField').style.display = mode === 'modulation' ? 'none' : 'block';
}

document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#modeSeg button').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  updateModeVisibility(b.dataset.mode);
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
}));

['carrier', 'beat'].forEach(name => {
  el(name + 'Slider').addEventListener('input', e => el(name + 'Val').textContent = parseFloat(e.target.value).toFixed(2));
  el(name + 'AutoToggle').addEventListener('change', e => el(name + 'Ramp').classList.toggle('show', e.target.checked));
});
el('toneSlider').addEventListener('input', e => el('toneVal').textContent = parseFloat(e.target.value).toFixed(1) + ' dB');
el('musicSlider').addEventListener('input', e => el('musicVal').textContent = parseFloat(e.target.value).toFixed(1) + ' dB');

function renderPresetChips() {
  const wrap = el('presetChips');
  wrap.innerHTML = '';
  Object.keys(PRESETS).forEach(name => {
    const chip = document.createElement('div');
    chip.className = 'chip'; chip.textContent = name;
    chip.addEventListener('click', () => { applyRecipeToUI(PRESETS[name]); document.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); });
    wrap.appendChild(chip);
  });
}
renderPresetChips();
updateModeVisibility('binaural');

el('downloadRecipe').addEventListener('click', (e) => {
  e.preventDefault();
  const recipe = readRecipeFromUI();
  const json = JSON.stringify({ name: 'browser-export', ...specToJsonFriendly(recipe) }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(blob, 'recipe.json');
});
function specToJsonFriendly(p) {
  const out = { ...p };
  ['carrier_hz', 'beat_hz', 'pulse_hz'].forEach(k => {
    if (out[k] && out[k].type === 'ramp') out[k] = { from: out[k].v0, to: out[k].v1, duration: out[k].duration, curve: out[k].curve };
    else if (out[k] && out[k].type === 'constant') out[k] = out[k].value;
  });
  return out;
}
el('recipeFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    applyRecipeToUI(data);
    setStatus('recipe loaded: ' + (data.name || f.name));
  } catch (err) {
    setStatus('could not parse recipe JSON', 'err');
  }
});

const dz = el('dropzone');
dz.addEventListener('click', () => el('fileInput').click());
['dragover', 'dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => e.preventDefault()));
dz.addEventListener('dragover', () => dz.classList.add('drag'));
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => { dz.classList.remove('drag'); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
el('fileInput').addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

async function loadFile(file) {
  setStatus('decoding ' + file.name + '\u2026');
  fileLabel = file.name;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const arrayBuf = await file.arrayBuffer();
    sourceBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
    el('fileName').textContent = file.name;
    el('fileDuration').textContent = formatTime(sourceBuffer.duration) + ' \u00b7 ' + sourceBuffer.sampleRate + ' Hz \u00b7 ' + (sourceBuffer.numberOfChannels === 2 ? 'stereo' : 'mono');
    el('playBtn').disabled = false;
    el('exportBtn').disabled = false;
    setStatus('ready');
  } catch (err) {
    console.error(err);
    setStatus('could not decode this file \u2014 try a WAV, M4A, or MP3', 'err');
  }
}
function formatTime(s) { const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + String(r).padStart(2, '0'); }

el('playBtn').addEventListener('click', async () => {
  if (playing) { stopPlayback(); return; }
  if (!sourceBuffer) return;
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const recipe = readRecipeFromUI();
  setStatus('building graph\u2026');
  try {
    const nodes = await buildGraph(audioCtx, sourceBuffer, recipe);
    meterAnalyser = audioCtx.createAnalyser();
    meterAnalyser.fftSize = 256;
    nodes.limiter.connect(meterAnalyser);
    playing = nodes;
    el('playBtn').textContent = '\u25a0 STOP';
    el('playBtn').classList.add('playing');
    setStatus('playing ' + fileLabel);
    startMeter();
    nodes.src.onended = () => { if (playing === nodes) stopPlayback(); };
  } catch (err) {
    console.error(err);
    setStatus('playback failed: ' + err.message, 'err');
  }
});

function stopPlayback() {
  if (!playing) return;
  try { playing.src.stop(); } catch (e) {}
  if (playing.toneNodes) playing.toneNodes.forEach(n => { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
  try { playing.limiter.disconnect(); } catch (e) {}
  try { playing.masterGain.disconnect(); } catch (e) {}
  try { playing.fadeGain.disconnect(); } catch (e) {}
  playing = null;
  el('playBtn').textContent = '\u25b6 PLAY';
  el('playBtn').classList.remove('playing');
  setStatus('ready');
  stopMeter();
}

function startMeter() {
  const canvas = el('meter'), ctx2d = canvas.getContext('2d');
  const data = new Uint8Array(meterAnalyser.frequencyBinCount);
  function draw() {
    meterRaf = requestAnimationFrame(draw);
    meterAnalyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.fillStyle = '#0f1613'; ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    const w = Math.min(canvas.width, peak * canvas.width);
    const grad = ctx2d.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, '#3f7a5c'); grad.addColorStop(0.75, '#7dffb2'); grad.addColorStop(0.93, '#ffb454'); grad.addColorStop(1, '#ff6b6b');
    ctx2d.fillStyle = grad; ctx2d.fillRect(0, 0, w, canvas.height);
  }
  draw();
}
function stopMeter() {
  if (meterRaf) cancelAnimationFrame(meterRaf);
  meterRaf = null;
  const canvas = el('meter'), ctx2d = canvas.getContext('2d');
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  ctx2d.fillStyle = '#0f1613'; ctx2d.fillRect(0, 0, canvas.width, canvas.height);
}

el('exportBtn').addEventListener('click', async () => {
  if (!sourceBuffer) return;
  if (playing) stopPlayback();
  const recipe = readRecipeFromUI();
  setStatus('rendering export\u2026');
  el('exportBtn').disabled = true;
  try {
    const frames = Math.max(1, Math.ceil(sourceBuffer.duration * sourceBuffer.sampleRate));
    const offlineCtx = new OfflineAudioContext(2, frames, sourceBuffer.sampleRate);
    await buildGraph(offlineCtx, sourceBuffer, recipe, { startAt: 0 });
    const rendered = await offlineCtx.startRendering();
    const blob = encodeWav(rendered);
    const outName = (fileLabel.replace(/\.[^.]+$/, '') || 'processed') + '_' + recipe.mode + '.wav';
    const file = new File([blob], outName, { type: 'audio/wav' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: outName });
        setStatus('exported: ' + outName);
      } catch (shareErr) {
        if (shareErr && shareErr.name === 'AbortError') setStatus('export cancelled');
        else { triggerDownload(blob, outName); setStatus('exported: ' + outName); }
      }
    } else {
      triggerDownload(blob, outName);
      setStatus('exported: ' + outName);
    }
  } catch (err) {
    console.error(err);
    setStatus('export failed: ' + err.message, 'err');
  } finally {
    el('exportBtn').disabled = false;
  }
});

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

window.addEventListener('load', () => {
  const hasAudioWorklet = !!(window.AudioContext && AudioContext.prototype.audioWorklet !== undefined);
  const fileProto = location.protocol === 'file:';
  if (!hasAudioWorklet) {
    el('engineState').textContent = 'limited (binaural only)';
    document.querySelector('[data-mode="isochronic"]').disabled = true;
    document.querySelector('[data-mode="modulation"]').disabled = true;
    setStatus('AudioWorklet missing \u2014 binaural only', 'warn');
  } else if (fileProto) {
    el('engineState').textContent = 'ready \u00b7 serve over http for worklets';
  } else {
    el('engineState').textContent = 'ready';
  }
});
