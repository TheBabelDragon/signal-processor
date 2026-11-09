/**
 * SSTV signal-gen dashboard — TX/RX with START TRANSMIT + START RECEIVE.
 */
import {
  encodeImageToWav,
  decodeAudio,
  decodeWavPcm16,
  encodeWavPcm16Mono,
  listEncodableModes,
  listDecodableModes,
  validateMediaJobManifest,
} from '../index.js';
import { createPlayback } from '../audio/playback.js';
import { createCapture } from '../audio/capture.js';
import { drawWaveform } from './waveform.js';
import { drawLevelMeter } from './level-meter.js';

export function mountSstvPanel(root) {
  if (!root) return;

  const playback = createPlayback();
  const capture = createCapture();
  /** @type {Float32Array|null} */
  let lastSamples = null;
  /** @type {number} */
  let lastSr = 48000;
  /** @type {Uint8Array|null} */
  let lastWav = null;
  /** @type {Uint8Array|null} */
  let lastPng = null;
  /** @type {boolean} */
  let transmitting = false;
  /** @type {boolean} */
  let receiving = false;
  /** @type {number|null} */
  let progressRaf = null;
  /** @type {number|null} */
  let levelRaf = null;
  let rxStartedAt = 0;

  root.innerHTML = '';
  root.classList.add('sstv-panel');

  const head = el('div', 'sstv-head');
  const title = el('span', 'sstv-title');
  title.textContent = 'SSTV · SIGNAL GEN';
  const badge = el('span', 'sstv-badge');
  badge.textContent = 'IDLE';
  head.append(title, badge);

  const tabs = el('div', 'sstv-tabs');
  const tabTx = btn('TRANSMIT');
  const tabRx = btn('RECEIVE');
  tabTx.classList.add('active');
  tabs.append(tabTx, tabRx);

  const tx = el('div', 'sstv-view');
  const rx = el('div', 'sstv-view');
  rx.hidden = true;

  // —— Transmit ——
  const txGrid = el('div', 'sstv-grid');
  const txSrc = el('div', 'sstv-card');
  txSrc.appendChild(h3('SOURCE'));
  const txCanvas = el('canvas');
  txCanvas.width = 320;
  txCanvas.height = 256;
  txCanvas.className = 'sstv-preview';
  paintTestPattern(txCanvas);
  const txActions = el('div', 'sstv-actions');
  const loadImg = fileBtn('Load image', 'image/*', async (file) => {
    const bmp = await createImageBitmap(file);
    const ctx = txCanvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, txCanvas.width, txCanvas.height);
    ctx.drawImage(bmp, 0, 0, txCanvas.width, txCanvas.height);
    setStatus('Image loaded');
  });
  const loadManifest = fileBtn('Import manifest', 'application/json,.json', async (file) => {
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const v = validateMediaJobManifest(raw);
      if (!v.ok) throw new Error(v.errors.join('; '));
      const m = v.manifest;
      if (m.sstv?.mode && modeSel.querySelector(`option[value="${m.sstv.mode}"]`)) {
        modeSel.value = m.sstv.mode;
        applyModeCanvas();
      }
      if (m.audio?.sample_rate || m.sstv?.sample_rate_hz) {
        const sr = String(m.audio?.sample_rate || m.sstv.sample_rate_hz);
        if ([...srSel.options].some((o) => o.value === sr)) srSel.value = sr;
      }
      txDiag.textContent = [
        `manifest ok · contract v${m.contract_version}`,
        `job ${m.job_id}`,
        `op ${m.operation} · asset ${m.asset?.filename || '—'}`,
        m.sstv?.mode ? `mode hint ${m.sstv.mode}` : '',
        'Load the companion PNG with Load image if not already set.',
      ]
        .filter(Boolean)
        .join('\n');
      setStatus('Manifest imported');
    } catch (e) {
      setErr(String(e.message || e));
      txDiag.textContent = String(e.message || e);
    }
  });
  const testPat = btn('Test pattern');
  testPat.addEventListener('click', () => {
    paintTestPattern(txCanvas);
    setStatus('Test pattern');
  });
  txActions.append(loadImg, loadManifest, testPat);
  txSrc.append(txCanvas, txActions);

  const txCtl = el('div', 'sstv-card');
  txCtl.appendChild(h3('ENCODE · TRANSPORT'));
  const modeField = field('Mode');
  const modeSel = el('select');
  for (const m of listEncodableModes()) {
    const o = el('option');
    o.value = m.id;
    o.textContent = `${m.name} · ${m.width}×${m.height} · VIS ${m.visCode}`;
    modeSel.appendChild(o);
  }
  modeField.appendChild(modeSel);
  function applyModeCanvas() {
    const m = listEncodableModes().find((x) => x.id === modeSel.value);
    if (m) {
      txCanvas.width = m.width;
      txCanvas.height = m.height;
      paintTestPattern(txCanvas);
    }
  }
  modeSel.addEventListener('change', applyModeCanvas);

  const srField = field('Sample rate');
  const srSel = el('select');
  for (const [v, t] of [
    [48000, '48 kHz'],
    [44100, '44.1 kHz'],
  ]) {
    const o = el('option');
    o.value = String(v);
    o.textContent = t;
    srSel.appendChild(o);
  }
  srField.appendChild(srSel);

  const progress = el('div', 'sstv-progress');
  const progressBar = el('i');
  progress.appendChild(progressBar);
  const clock = el('div', 'sstv-clock');
  clock.textContent = '—';

  const waveCanvas = el('canvas');
  waveCanvas.width = 640;
  waveCanvas.height = 64;
  waveCanvas.className = 'sstv-wave';

  const startTxBtn = btn('▶ START TRANSMIT');
  startTxBtn.classList.add('primary');
  startTxBtn.title = 'Encode image to SSTV and play audio (speaker/line-out — not RF)';
  const stopTxBtn = btn('■ STOP');
  stopTxBtn.disabled = true;
  const encodeBtn = btn('Encode only');
  const playBtn = btn('Play');
  playBtn.disabled = true;
  const dlWav = btn('Download WAV');
  dlWav.disabled = true;
  const txDiag = el('div', 'sstv-diag');
  txDiag.textContent =
    'START TRANSMIT = encode + play over Web Audio (not an RF transmission). Encode only prepares WAV.';

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function stopProgressLoop() {
    if (progressRaf != null) {
      cancelAnimationFrame(progressRaf);
      progressRaf = null;
    }
  }

  function startProgressLoop() {
    stopProgressLoop();
    const tick = () => {
      const p = playback.getProgress();
      if (!p.playing) {
        progressRaf = null;
        return;
      }
      progressBar.style.width = Math.round(p.fraction * 100) + '%';
      const left = Math.max(0, p.duration - p.elapsed);
      clock.textContent = `TX ${fmtTime(p.elapsed)} / ${fmtTime(p.duration)}  ·  −${fmtTime(left)}`;
      badge.textContent = `TX ${fmtTime(left)}`;
      badge.className = 'sstv-badge tx';
      progressRaf = requestAnimationFrame(tick);
    };
    progressRaf = requestAnimationFrame(tick);
  }

  async function runEncode() {
    stopProgressLoop();
    progressBar.style.width = '0%';
    clock.textContent = 'encoding…';
    playback.stop();
    transmitting = false;
    playBtn.disabled = true;
    stopTxBtn.disabled = true;
    const img = canvasToImage(txCanvas);
    const result = encodeImageToWav(img, modeSel.value, {
      sampleRate: Number(srSel.value) || 48000,
      onProgress: (p) => {
        progressBar.style.width = Math.round(p * 100) + '%';
      },
    });
    lastWav = result.wav;
    lastSr = result.sampleRate;
    const decoded = decodeWavPcm16(result.wav);
    lastSamples = decoded.samples;
    drawWaveform(waveCanvas, lastSamples);
    progressBar.style.width = '100%';
    clock.textContent = `ready · ${fmtTime(result.durationMs / 1000)} frame`;
    dlWav.disabled = false;
    playBtn.disabled = false;
    txDiag.textContent = [
      `mode ${result.mode}  VIS ${result.visCode}`,
      `${result.width}×${result.height}  lines ${result.lineCount}`,
      `sr ${result.sampleRate}  duration ${(result.durationMs / 1000).toFixed(1)}s`,
      `wav ${result.wav.byteLength} bytes`,
    ].join('\n');
    return result;
  }

  function onAudioEnded(msg) {
    stopProgressLoop();
    transmitting = false;
    stopTxBtn.disabled = true;
    startTxBtn.disabled = false;
    encodeBtn.disabled = false;
    progressBar.style.width = '100%';
    clock.textContent = 'complete';
    setStatus(msg);
  }

  async function startTransmit() {
    try {
      setBusy(true, 'ENCODING');
      startTxBtn.disabled = true;
      encodeBtn.disabled = true;
      await runEncode();
      setBusy(true, 'TX AUDIO');
      transmitting = true;
      stopTxBtn.disabled = false;
      await playback.play(lastSamples, lastSr, {
        onEnded: () => onAudioEnded('Transmit complete (audio ended)'),
      });
      startProgressLoop();
      setStatus('Transmitting audio…');
    } catch (e) {
      stopProgressLoop();
      transmitting = false;
      setErr(String(e.message || e));
      txDiag.textContent = String(e.message || e);
      startTxBtn.disabled = false;
      encodeBtn.disabled = false;
      stopTxBtn.disabled = true;
      setBusy(false);
    }
  }

  function stopTransmit() {
    stopProgressLoop();
    playback.stop();
    transmitting = false;
    stopTxBtn.disabled = true;
    startTxBtn.disabled = false;
    encodeBtn.disabled = false;
    clock.textContent = 'stopped';
    setStatus('Transmit stopped');
    setBusy(false);
  }

  startTxBtn.addEventListener('click', () => startTransmit());
  stopTxBtn.addEventListener('click', () => stopTransmit());

  encodeBtn.addEventListener('click', async () => {
    try {
      setBusy(true, 'ENCODING');
      startTxBtn.disabled = true;
      await runEncode();
      setStatus('Encode complete');
    } catch (e) {
      setErr(String(e.message || e));
      txDiag.textContent = String(e.message || e);
    } finally {
      setBusy(false);
      startTxBtn.disabled = false;
    }
  });

  playBtn.addEventListener('click', async () => {
    if (!lastSamples) return;
    try {
      transmitting = true;
      stopTxBtn.disabled = false;
      await playback.play(lastSamples, lastSr, {
        onEnded: () => onAudioEnded('Playback ended'),
      });
      startProgressLoop();
      setStatus('Playing');
    } catch (e) {
      setErr(String(e.message || e));
    }
  });

  dlWav.addEventListener('click', () => {
    if (lastWav) download(lastWav, `sstv-${modeSel.value || 'out'}.wav`, 'audio/wav');
  });

  const txAct = el('div', 'sstv-actions');
  txAct.append(startTxBtn, stopTxBtn, encodeBtn, playBtn, dlWav);
  txCtl.append(modeField, srField, progress, clock, waveCanvas, txAct, txDiag);
  txGrid.append(txSrc, txCtl);
  tx.appendChild(txGrid);

  // —— Receive ——
  const rxGrid = el('div', 'sstv-grid');
  const rxIn = el('div', 'sstv-card');
  rxIn.appendChild(h3('AUDIO IN'));
  const rxModeField = field('Decode mode');
  const rxModeSel = el('select');
  const autoOpt = el('option');
  autoOpt.value = '';
  autoOpt.textContent = 'Auto (VIS)';
  rxModeSel.appendChild(autoOpt);
  for (const m of listDecodableModes()) {
    const o = el('option');
    o.value = m.id;
    o.textContent = `${m.name} · VIS ${m.visCode}`;
    rxModeSel.appendChild(o);
  }
  rxModeField.appendChild(rxModeSel);

  const rxLevel = el('canvas');
  rxLevel.width = 440;
  rxLevel.height = 14;
  rxLevel.className = 'sstv-level';
  const rxClock = el('div', 'sstv-clock');
  rxClock.textContent = 'mic idle';

  const rxWave = el('canvas');
  rxWave.width = 640;
  rxWave.height = 64;
  rxWave.className = 'sstv-wave';
  const rxDiag = el('div', 'sstv-diag');
  rxDiag.textContent =
    'START RECEIVE uses the browser mic (HTTPS/localhost). Play SSTV from another device/speaker into the mic, then STOP & DECODE. Cancel aborts without decode. Or Load WAV.';

  const startRxBtn = btn('▶ START RECEIVE');
  startRxBtn.classList.add('primary');
  startRxBtn.title = 'Capture microphone until STOP & DECODE';
  const stopRxBtn = btn('■ STOP & DECODE');
  stopRxBtn.disabled = true;
  const cancelRxBtn = btn('Cancel');
  cancelRxBtn.disabled = true;
  cancelRxBtn.title = 'Abort capture without decoding';
  const rxPlay = btn('Play');
  rxPlay.disabled = true;
  const rxStopPlay = btn('Stop play');
  rxStopPlay.disabled = true;

  function stopLevelLoop() {
    if (levelRaf != null) {
      cancelAnimationFrame(levelRaf);
      levelRaf = null;
    }
  }

  function startLevelLoop() {
    stopLevelLoop();
    const tick = () => {
      if (!receiving) {
        levelRaf = null;
        return;
      }
      drawLevelMeter(rxLevel, capture.getLevel());
      const elapsed = (performance.now() - rxStartedAt) / 1000;
      rxClock.textContent = `RX ${fmtTime(elapsed)} · mic open`;
      badge.textContent = `RX ${fmtTime(elapsed)}`;
      badge.className = 'sstv-badge rx';
      levelRaf = requestAnimationFrame(tick);
    };
    levelRaf = requestAnimationFrame(tick);
  }

  async function startReceive() {
    try {
      if (transmitting) stopTransmit();
      playback.stop();
      setBusy(true, 'RX ARM');
      startRxBtn.disabled = true;
      await capture.start({ sampleRateHint: 48000 });
      receiving = true;
      rxStartedAt = performance.now();
      stopRxBtn.disabled = false;
      cancelRxBtn.disabled = false;
      startLevelLoop();
      setStatus('Receiving mic…');
      rxDiag.textContent = 'Mic open — play SSTV into the microphone, then STOP & DECODE (or Cancel).';
    } catch (e) {
      receiving = false;
      startRxBtn.disabled = false;
      stopRxBtn.disabled = true;
      cancelRxBtn.disabled = true;
      setErr(String(e.message || e));
      rxDiag.textContent = String(e.message || e);
      setBusy(false);
    }
  }

  async function stopReceiveAndDecode() {
    stopLevelLoop();
    receiving = false;
    stopRxBtn.disabled = true;
    cancelRxBtn.disabled = true;
    try {
      setBusy(true, 'DECODING');
      const cap = capture.stop();
      lastSamples = cap.samples;
      lastSr = cap.sampleRate;
      lastWav = encodeWavPcm16Mono(cap.samples, cap.sampleRate);
      drawWaveform(rxWave, lastSamples);
      rxPlay.disabled = lastSamples.length === 0;
      rxClock.textContent = `captured ${fmtTime(cap.durationMs / 1000)} @ ${cap.sampleRate} Hz`;

      if (!lastSamples.length) pen {
        throw new Error('No audio captured');
      }

      const hint = rxModeSel.value || undefined;
      const decoded = decodeAudio(lastSamples, {
        sampleRate: lastSr,
        modeHint: hint,
      });
      drawImageData(rxCanvas, decoded.image);
      lastPng = await imageToPngBytes(decoded.image);
      dlPng.disabled = !lastPng;
      rxDiag.textContent = [
        `mode ${decoded.mode}  VIS ${decoded.visCode}`,
        `lines ${decoded.linesDecoded}/${decoded.expectedLines}`,
        `sync ${decoded.syncScore.toFixed(2)}  incomplete ${decoded.incomplete}`,
        `captured ${(cap.durationMs / 1000).toFixed(1)}s @ ${cap.sampleRate} Hz`,
        decoded.diagnostics?.note || '',
        'Mic path is not RF — results depend on speaker/mic coupling and noise.',
      ].join('\n');
      setStatus('Decode complete');
    } catch (e) {
      setErr(String(e.message || e));
      rxDiag.textContent = String(e.message || e);
    } finally {
      startRxBtn.disabled = false;
      setBusy(false);
    }
  }

  function cancelReceive() {
    if (!receiving) return;
    stopLevelLoop();
    receiving = false;
    capture.stop();
    stopRxBtn.disabled = true;
    cancelRxBtn.disabled = true;
    startRxBtn.disabled = false;
    rxClock.textContent = 'cancelled';
    drawLevelMeter(rxLevel, 0);
    setStatus('Receive cancelled');
    setBusy(false);
    rxDiag.textContent = 'Capture cancelled — nothing decoded.';
  }

  startRxBtn.addEventListener('click', () => startReceive());
  stopRxBtn.addEventListener('click', () => stopReceiveAndDecode());
  cancelRxBtn.addEventListener('click', () => cancelReceive());

  const loadWav = fileBtn('Load WAV', 'audio/wav,audio/*,.wav', async (file) => {
    try {
      if (receiving) {
        stopLevelLoop();
        capture.stop();
        receiving = false;
        stopRxBtn.disabled = true;
        cancelRxBtn.disabled = true;
        startRxBtn.disabled = false;
      }
      setBusy(true, 'DECODING');
      const buf = new Uint8Array(await file.arrayBuffer());
      const pcm = decodeWavPcm16(buf);
      lastSamples = pcm.samples;
      lastSr = pcm.sampleRate;
      lastWav = buf;
      drawWaveform(rxWave, lastSamples);
      rxPlay.disabled = false;

      const hint = rxModeSel.value || undefined;
      const decoded = decodeAudio(buf, hint ? { modeHint: hint } : {});
      drawImageData(rxCanvas, decoded.image);
      lastPng = await imageToPngBytes(decoded.image);
      dlPng.disabled = !lastPng;
      rxDiag.textContent = [
        `mode ${decoded.mode}  VIS ${decoded.visCode}`,
        `lines ${decoded.linesDecoded}/${decoded.expectedLines}`,
        `sync ${decoded.syncScore.toFixed(2)}  incomplete ${decoded.incomplete}`,
        decoded.diagnostics?.note || '',
      ].join('\n');
      setStatus('Decode complete');
    } catch (e) {
      setErr(String(e.message || e));
      rxDiag.textContent = String(e.message || e);
    } finally {
      setBusy(false);
    }
  });

  rxPlay.addEventListener('click', async () => {
    if (!lastSamples) return;
    try {
      await playback.play(lastSamples, lastSr, {
        onEnded: () => {
          rxStopPlay.disabled = true;
          setStatus('Playback ended');
        },
      });
      rxStopPlay.disabled = false;
      setStatus('Playing');
    } catch (e) {
      setErr(String(e.message || e));
    }
  });
  rxStopPlay.addEventListener('click', () => {
    playback.stop();
    rxStopPlay.disabled = true;
    setStatus('Stopped');
  });

  const rxAct = el('div', 'sstv-actions');
  rxAct.append(startRxBtn, stopRxBtn, cancelRxBtn, loadWav, rxPlay, rxStopPlay);
  rxIn.append(rxModeField, rxLevel, rxClock, rxWave, rxAct, rxDiag);

  const rxOut = el('div', 'sstv-card');
  rxOut.appendChild(h3('RECONSTRUCTED'));
  const rxCanvas = el('canvas');
  rxCanvas.width = 320;
  rxCanvas.height = 256;
  rxCanvas.className = 'sstv-preview';
  const dlPng = btn('Download PNG');
  dlPng.disabled = true;
  dlPng.addEventListener('click', () => {
    if (lastPng) download(lastPng, 'sstv-reconstructed.png', 'image/png');
  });
  const rxOutAct = el('div', 'sstv-actions');
  rxOutAct.append(dlPng);
  rxOut.append(rxCanvas, rxOutAct);
  rxGrid.append(rxIn, rxOut);
  rx.appendChild(rxGrid);

  const note = el('div', 'sstv-note');
  note.textContent =
    'TX/RX use the browser audio path only — not radio. Mic receive needs HTTPS or localhost. Independent of Acoustic Probe / neurofeedback.';

  root.append(head, tabs, tx, rx, note);

  tabTx.addEventListener('click', () => {
    tabTx.classList.add('active');
    tabRx.classList.remove('active');
    tx.hidden = false;
    rx.hidden = true;
  });
  tabRx.addEventListener('click', () => {
    tabRx.classList.add('active');
    tabTx.classList.remove('active');
    rx.hidden = false;
    tx.hidden = true;
  });

  function setBusy(on, label) {
    if (on) {
      badge.textContent = label || 'BUSY';
      if (label === 'TX AUDIO') badge.className = 'sstv-badge tx';
      else if (String(label || '').startsWith('RX')) badge.className = 'sstv-badge rx';
      else badge.className = 'sstv-badge busy';
    } else if (!transmitting && !receiving) {
      badge.textContent = 'IDLE';
      badge.className = 'sstv-badge';
    }
    startTxBtn.disabled = (on && !transmitting) || receiving;
    encodeBtn.disabled = (on && !transmitting) || receiving;
  }
  function setStatus(msg) {
    if (transmitting) badge.className = 'sstv-badge tx';
    else if (receiving) badge.className = 'sstv-badge rx';
    else {
      badge.textContent = 'OK';
      badge.className = 'sstv-badge ok';
    }
    badge.title = msg;
  }
  function setErr(msg) {
    badge.textContent = 'ERR';
    badge.className = 'sstv-badge err';
    badge.title = msg;
  }

  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function btn(label) {
    const b = el('button');
    b.type = 'button';
    b.textContent = label;
    return b;
  }
  function h3(t) {
    const n = el('h3');
    n.textContent = t;
    return n;
  }
  function field(lab) {
    const w = el('label', 'sstv-field');
    w.textContent = lab;
    return w;
  }
  function fileBtn(label, accept, onFile) {
    const lab = el('label', 'btn');
    lab.textContent = label;
    const input = el('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    lab.appendChild(input);
    lab.style.display = 'inline-flex';
    lab.style.alignItems = 'center';
    lab.style.padding = '10px 14px';
    lab.style.borderRadius = '8px';
    lab.style.border = '1px solid var(--line, #2a3340)';
    lab.style.cursor = 'pointer';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (f) await onFile(f);
      input.value = '';
    });
    return lab;
  }

  function paintTestPattern(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cols = ['#c00', '#0c0', '#00c', '#cc0', '#0cc', '#c0c', '#eee', '#444'];
    const cw = w / cols.length;
    for (let i = 0; i < cols.length; i++) {
      ctx.fillStyle = cols[i];
      ctx.fillRect(i * cw, 0, cw + 1, h);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('SSTV test', 12, 24);
  }

  function canvasToImage(canvas) {
    const ctx = canvas.getContext('2d');
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data: id.data, width: id.width, height: id.height };
  }

  function drawImageData(canvas, image) {
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(
      new ImageData(
        image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data),
        image.width,
        image.height
      ),
      0,
      0
    );
  }

  async function imageToPngBytes(image) {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d').putImageData(
      new ImageData(
        image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data),
        image.width,
        image.height
      ),
      0,
      0
    );
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  }

  function download(bytes, name, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}
