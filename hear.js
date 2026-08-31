"use strict";

(function () {
  const playBtn = document.getElementById('playBtn');
  const exportBtn = document.getElementById('exportBtn');
  if (playBtn) playBtn.disabled = false;
  if (exportBtn) exportBtn.disabled = false;

  window.unlockAudio = async function unlockAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return audioCtx;
  };

  window.ensureBed = async function ensureBed(seconds) {
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
  };

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
})();
