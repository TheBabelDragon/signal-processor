"use strict";

(function () {
  function AC() {
    return window.AudioContext || window.webkitAudioContext;
  }

  function dbg() {
    const parts = [];
    parts.push(typeof buildGraph === 'function' ? 'engine-ok' : 'ENGINE MISSING');
    if (audioCtx) parts.push(audioCtx.state + '@' + audioCtx.sampleRate);
    else parts.push('no-ctx');
    const mode = document.querySelector('#modeSeg button.active');
    if (mode) parts.push(mode.dataset.mode);
    const tone = document.getElementById('toneSlider');
    if (tone) parts.push('tone ' + tone.value + 'dB');
    const master = document.getElementById('masterSlider');
    if (master) parts.push('master ' + master.value + 'dB');
    if (location.protocol === 'file:') parts.push('file:// (worklet will fail)');
    return parts.join(' · ');
  }

  function stopKeepalive() {
    const k = window.__spKeep;
    window.__spKeep = null;
    if (!k) return;
    try { k.osc.stop(); } catch (e) {}
    try { k.osc.disconnect(); } catch (e) {}
    try { k.gain.disconnect(); } catch (e) {}
  }

  function startKeepalive(ctx) {
    stopKeepalive();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.value = 0.07;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    window.__spKeep = { osc: osc, gain: gain };
    return { osc: osc, gain: gain };
  }

  async function unlockAudio() {
    if (!audioCtx) audioCtx = new (AC())();
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

  async function preloadWorklet() {
    try {
      await unlockAudio();
      if (typeof ensureWorklet === 'function') await ensureWorklet(audioCtx);
    } catch (e) {
      console.warn('worklet preload', e);
    }
  }

  const playBtn = document.getElementById('playBtn');
  const exportBtn = document.getElementById('exportBtn');
  if (playBtn) playBtn.disabled = false;
  if (exportBtn) exportBtn.disabled = false;

  if (playBtn) {
    const fresh = playBtn.cloneNode(true);
    playBtn.parentNode.replaceChild(fresh, playBtn);
    fresh.id = 'playBtn';
    fresh.disabled = false;
    fresh.addEventListener('click', async function () {
      if (playing) {
        stopKeepalive();
        stopPlayback();
        return;
      }
      try {
        if (typeof buildGraph !== 'function') {
          setStatus('engine.js did not load — hard refresh', 'err');
          return;
        }
        if (!audioCtx) audioCtx = new (AC())();
        setStatus('unlocking audio · ' + dbg());
        await audioCtx.resume();
        startKeepalive(audioCtx);
        await ensureBed(600);
        const recipe = readRecipeFromUI();
        if (document.getElementById('masterSlider')) {
          recipe.master_db = parseFloat(document.getElementById('masterSlider').value) || 0;
        }
        if (!(recipe.tone_db > -45)) recipe.tone_db = -16;
        setStatus('building graph · ' + dbg());
        const nodes = await buildGraph(audioCtx, sourceBuffer, recipe);
        meterAnalyser = audioCtx.createAnalyser();
        meterAnalyser.fftSize = 256;
        nodes.limiter.connect(meterAnalyser);
        playing = nodes;
        if (window.SignalProducer) SignalProducer.noteStart(recipe.mode, recipe);
        fresh.textContent = '\u25a0 STOP';
        fresh.classList.add('playing');
        setStatus('PLAY · 440Hz probe + ' + recipe.mode + ' · ' + dbg());
        startMeter();
        nodes.src.onended = function () { if (playing === nodes) stopPlayback(); };
        setTimeout(function () {
          if (!playing || !meterAnalyser) return;
          const data = new Uint8Array(meterAnalyser.frequencyBinCount);
          meterAnalyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
          if (peak < 2) {
            setStatus('graph peak ~0 — probe 440 still on destination · ' + dbg(), 'warn');
          } else {
            stopKeepalive();
            setStatus('graph live · probe off · ' + recipe.mode + ' · ' + dbg());
          }
        }, 350);
      } catch (err) {
        console.error(err);
        setStatus('playback failed: ' + (err && err.message ? err.message : err) + ' · ' + dbg(), 'err');
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
      if (window.__spKeep) {
        window.__spKeep.gain.gain.setTargetAtTime(Math.max(0.02, dbToLin(v) * 0.07), audioCtx ? audioCtx.currentTime : 0, 0.04);
      }
    });
  }

  ['pointerdown', 'keydown'].forEach(function (evt) {
    window.addEventListener(evt, function () {
      if (!audioCtx && AC()) {
        try { audioCtx = new (AC())(); } catch (e) {}
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      preloadWorklet();
    }, { passive: true, once: false });
  });

  if (typeof stopPlayback === 'function' && !stopPlayback.__producerWrapped) {
    const inner = stopPlayback;
    function wrappedStop() {
      stopKeepalive();
      if (window.SignalProducer) SignalProducer.noteStop(meterAnalyser);
      return inner.apply(this, arguments);
    }
    wrappedStop.__producerWrapped = true;
    stopPlayback = wrappedStop;
  }

  setStatus('debug-max · PLAY starts a 440 probe + graph · ' + dbg());
})();
