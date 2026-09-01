"use strict";

(function () {
  async function unlockAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return audioCtx;
  }

  async function ensureBed(seconds) {
    await unlockAudio();
    if (sourceBuffer) return sourceBuffer;
    const kindEl = document.getElementById('nfBed');
    const kind = kindEl && kindEl.value && kindEl.value !== 'file' ? kindEl.value : 'silence';
    sourceBuffer = makeBedBuffer(audioCtx, Math.max(30, seconds || 600), kind);
    fileLabel = kind + '-bed';
    const name = document.getElementById('fileName');
    const dur = document.getElementById('fileDuration');
    if (name) name.textContent = fileLabel;
    if (dur) dur.textContent = formatTime(sourceBuffer.duration) + ' \u00b7 generated';
    return sourceBuffer;
  }

  const playBtn = document.getElementById('playBtn');
  const exportBtn = document.getElementById('exportBtn');
  if (playBtn) playBtn.disabled = false;
  if (exportBtn) exportBtn.disabled = false;

  if (playBtn) {
    const fresh = playBtn.cloneNode(true);
    playBtn.parentNode.replaceChild(fresh, playBtn);
    fresh.disabled = false;
    fresh.addEventListener('click', async function () {
      if (playing) { stopPlayback(); return; }
      try {
        await ensureBed(600);
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const recipe = readRecipeFromUI();
        if (document.getElementById('masterSlider')) {
          recipe.master_db = parseFloat(document.getElementById('masterSlider').value) || 0;
        }
        setStatus('building graph\u2026');
        const nodes = await buildGraph(audioCtx, sourceBuffer, recipe);
        meterAnalyser = audioCtx.createAnalyser();
        meterAnalyser.fftSize = 256;
        nodes.limiter.connect(meterAnalyser);
        playing = nodes;
        if (window.SignalProducer) SignalProducer.noteStart(recipe.mode, recipe);
        fresh.textContent = '\u25a0 STOP';
        fresh.classList.add('playing');
        setStatus('playing ' + fileLabel + ' \u00b7 headphones');
        startMeter();
        nodes.src.onended = function () { if (playing === nodes) stopPlayback(); };
      } catch (err) {
        console.error(err);
        setStatus('playback failed: ' + (err.message || err), 'err');
      }
    });
  }

  const master = document.getElementById('masterSlider');
  const masterVal = document.getElementById('masterVal');
  const masterDb = document.getElementById('masterDb');
  if (master) {
    master.addEventListener('input', function (e) {
      const v = parseFloat(e.target.value);
      if (masterVal) masterVal.textContent = v.toFixed(1) + ' dB';
      if (masterDb) masterDb.value = v;
      if (playing && playing.masterGain && audioCtx) {
        playing.masterGain.gain.setTargetAtTime(dbToLin(v), audioCtx.currentTime, 0.04);
      }
    });
  }

  ['pointerdown', 'keydown'].forEach(function (evt) {
    window.addEventListener(evt, function () {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }, { passive: true });
  });

  if (typeof stopPlayback === 'function' && !stopPlayback.__producerWrapped) {
    const inner = stopPlayback;
    function wrappedStop() {
      if (window.SignalProducer) SignalProducer.noteStop(meterAnalyser);
      return inner.apply(this, arguments);
    }
    wrappedStop.__producerWrapped = true;
    stopPlayback = wrappedStop;
  }

  setStatus('headphones \u00b7 play starts a tone bed if no file is loaded');
})();
