/**
 * SSTV signal-gen dashboard — TX/RX with START TRANSMIT + START RECEIVE + FIDELITY lab.
 */
import {
  encodeImageToWav,
  decodeAudio,
  decodeWavPcm16,
  encodeWavPcm16Mono,
  listEncodableModes,
  listDecodableModes,
  validateMediaJobManifest,
  normalizeImage,
  getMode,
} from '../index.js';
import { createPlayback } from '../audio/playback.js';
import { createCapture } from '../audio/capture.js';
import { computeFidelityMetrics, differenceHeatmap } from '../dsp/metrics.js';
import { drawWaveform } from './waveform.js';
import { drawLevelMeter } from './level-meter.js';

export function mountSstvPanel(root) {
  if (!root) return;

  const playback = createPlayback();
  const capture = createCapture();
  let lastSamples = null;
  let lastSr = 48000;
  let lastWav = null;
  let lastPng = null;
  let transmitting = false;
  let receiving = false;
  let progressRaf = null;
  let levelRaf = null;
  let rxStartedAt = 0;
  let sourceImage = null;
  let lastNormalized = null;
  let lastDecodedImage = null;
  let lastMetrics = null;
  let diffGain = 4;

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
  const tabLab = btn('FIDELITY');
  tabTx.classList.add('active');
  tabs.append(tabTx, tabRx, tabLab);

  const tx = el('div', 'sstv-view');
  const rx = el('div', 'sstv-view');
  const lab = el('div', 'sstv-view');
  rx.hidden = true;
  lab.hidden = true;

  let labSrcMeta = null;
  let labFitSel = null;

  const txGrid = el('div', 'sstv-grid');
  const txSrc = el('div', 'sstv-card');
  txSrc.appendChild(h3('SOURCE'));
  const txCanvas = el('canvas');
  txCanvas.width = 320;
  txCanvas.height = 256;
  txCanvas.className = 'sstv-preview';
  paintTestPattern(txCanvas);
  sourceImage = canvasToImage(txCanvas);
  const txActions = el('div', 'sstv-actions');
  const loadImg = fileBtn('Load image', 'image/*', async (file) => {
    const bmp = await createImageBitmap(file);
    const off = document.createElement('canvas');
    off.width = bmp.width;
    off.height = bmp.height;
    off.getContext('2d').drawImage(bmp, 0, 0);
    sourceImage = canvasToImage(off);
    paintSourceOntoTx();
    setStatus('Image loaded · ' + bmp.width + '×' + bmp.height);
    if (labSrcMeta) labSrcMeta.textContent = 'source ' + bmp.width + '×' + bmp.height;
  });
  const loadManifest = fileBtn('Import manifest', 'application/json,.json', async (file) => {
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const v = validateMediaJobManifest(raw);
      if (!v.ok) throw new Error(v.errors.join('; '));
      const m = v.manifest;
      if (m.sstv?.mode && modeSel.querySelector('option[value="' + m.sstv.mode + '"]')) {
        modeSel.value = m.sstv.mode;
        applyModeCanvas();
      }
      if (m.audio?.sample_rate || m.sstv?.sample_rate_hz) {
        const sr = String(m.audio?.sample_rate || m.sstv.sample_rate_hz);
        if ([...srSel.options].some((o) => o.value === sr)) srSel.value = sr;
      }
      txDiag.textContent = [
        'manifest ok · contract v' + m.contract_version,
        'job ' + m.job_id,
        'op ' + m.operation + ' · asset ' + (m.asset?.filename || '—'),
        m.sstv?.mode ? 'mode hint ' + m.sstv.mode : '',
        'Load the companion PNG with Load image if not already set.',
      ].filter(Boolean).join('\n');
      setStatus('Manifest imported');
    } catch (e) {
      setErr(String(e.message || e));
      txDiag.textContent = String(e.message || e);
    }
  });
  const testPat = btn('Test pattern');
  testPat.addEventListener('click', () => {
    paintTestPattern(txCanvas);
    sourceImage = canvasToImage(txCanvas);
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
    o.textContent = m.name + ' · ' + m.width + '×' + m.height + ' · VIS ' + m.visCode;
    modeSel.appendChild(o);
  }
  modeField.appendChild(modeSel);
  function paintSourceOntoTx() {
    const m = listEncodableModes().find((x) => x.id === modeSel.value);
    if (!m) return;
    txCanvas.width = m.width;
    txCanvas.height = m.height;
    if (sourceImage) {
      const fit = (labFitSel && labFitSel.value) || 'stretch';
      const norm = normalizeImage(sourceImage, m.width, m.height, { fit });
      drawImageData(txCanvas, norm);
    } else {
      paintTestPattern(txCanvas);
    }
  }
  function applyModeCanvas() {
    paintSourceOntoTx();
  }
  modeSel.addEventListener('change', applyModeCanvas);

  const srField = field('Sample rate');
  const srSel = el('select');
  for (const [v, t] of [[48000, '48 kHz'], [44100, '44.1 kHz']]) {
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
  const stopTxBtn = btn('■ STOP');
  stopTxBtn.disabled = true;
  const encodeBtn = btn('Encode only');
  const playBtn = btn('Play');
  playBtn.disabled = true;
  const dlWav = btn('Download WAV');
  dlWav.disabled = true;
  const txDiag = el('div', 'sstv-diag');
  txDiag.textContent = 'START TRANSMIT = encode + play over Web Audio (not RF).';

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function stopProgressLoop() {
    if (progressRaf != null) { cancelAnimationFrame(progressRaf); progressRaf = null; }
  }
  function startProgressLoop() {
    stopProgressLoop();
    const tick = () => {
      const p = playback.getProgress();
      if (!p.playing) { progressRaf = null; return; }
      progressBar.style.width = Math.round(p.fraction * 100) + '%';
      const left = Math.max(0, p.duration - p.elapsed);
      clock.textContent = 'TX ' + fmtTime(p.elapsed) + ' / ' + fmtTime(p.duration) + '  ·  −' + fmtTime(left);
      badge.textContent = 'TX ' + fmtTime(left);
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
      onProgress: (p) => { progressBar.style.width = Math.round(p * 100) + '%'; },
    });
    lastWav = result.wav;
    lastSr = result.sampleRate;
    lastSamples = decodeWavPcm16(result.wav).samples;
    drawWaveform(waveCanvas, lastSamples);
    progressBar.style.width = '100%';
    clock.textContent = 'ready · ' + fmtTime(result.durationMs / 1000) + ' frame';
    dlWav.disabled = false;
    playBtn.disabled = false;
    txDiag.textContent = [
      'mode ' + result.mode + '  VIS ' + result.visCode,
      result.width + '×' + result.height + '  lines ' + result.lineCount,
      'sr ' + result.sampleRate + '  duration ' + (result.durationMs / 1000).toFixed(1) + 's',
      'wav ' + result.wav.byteLength + ' bytes',
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
      await playback.play(lastSamples, lastSr, { onEnded: () => onAudioEnded('Transmit complete (audio ended)') });
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
      await playback.play(lastSamples, lastSr, { onEnded: () => onAudioEnded('Playback ended') });
      startProgressLoop();
      setStatus('Playing');
    } catch (e) {
      setErr(String(e.message || e));
    }
  });
  dlWav.addEventListener('click', () => {
    if (lastWav) download(lastWav, 'sstv-' + (modeSel.value || 'out') + '.wav', 'audio/wav');
  });

  const txAct = el('div', 'sstv-actions');
  txAct.append(startTxBtn, stopTxBtn, encodeBtn, playBtn, dlWav);
  txCtl.append(modeField, srField, progress, clock, waveCanvas, txAct, txDiag);
  txGrid.append(txSrc, txCtl);
  tx.appendChild(txGrid);

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
    o.textContent = m.name + ' · VIS ' + m.visCode;
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
  rxDiag.textContent = 'START RECEIVE: mic (HTTPS/localhost) → STOP & DECODE. Cancel aborts. Or Load WAV.';

  const startRxBtn = btn('▶ START RECEIVE');
  startRxBtn.classList.add('primary');
  const stopRxBtn = btn('■ STOP & DECODE');
  stopRxBtn.disabled = true;
  const cancelRxBtn = btn('Cancel');
  cancelRxBtn.disabled = true;
  const rxPlay = btn('Play');
  rxPlay.disabled = true;
  const rxStopPlay = btn('Stop play');
  rxStopPlay.disabled = true;

  function stopLevelLoop() {
    if (levelRaf != null) { cancelAnimationFrame(levelRaf); levelRaf = null; }
  }
  function startLevelLoop() {
    stopLevelLoop();
    const tick = () => {
      if (!receiving) { levelRaf = null; return; }
      drawLevelMeter(rxLevel, capture.getLevel());
      const elapsed = (performance.now() - rxStartedAt) / 1000;
      rxClock.textContent = 'RX ' + fmtTime(elapsed) + ' · mic open';
      badge.textContent = 'RX ' + fmtTime(elapsed);
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
      rxDiag.textContent = 'Mic open — STOP & DECODE when done, or Cancel.';
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
      rxClock.textContent = 'captured ' + fmtTime(cap.durationMs / 1000) + ' @ ' + cap.sampleRate + ' Hz';
      if (!lastSamples.length) throw new Error('No audio captured');
      const hint = rxModeSel.value || undefined;
      const decoded = decodeAudio(lastSamples, { sampleRate: lastSr, modeHint: hint });
      drawImageData(rxCanvas, decoded.image);
      lastPng = await imageToPngBytes(decoded.image);
      dlPng.disabled = !lastPng;
      rxDiag.textContent = [
        'mode ' + decoded.mode + '  VIS ' + decoded.visCode,
        'lines ' + decoded.linesDecoded + '/' + decoded.expectedLines,
        'sync ' + decoded.syncScore.toFixed(2) + '  incomplete ' + decoded.incomplete,
        'captured ' + (cap.durationMs / 1000).toFixed(1) + 's @ ' + cap.sampleRate + ' Hz',
        decoded.diagnostics?.note || '',
        'Mic path is not RF.',
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
        'mode ' + decoded.mode + '  VIS ' + decoded.visCode,
        'lines ' + decoded.linesDecoded + '/' + decoded.expectedLines,
        'sync ' + decoded.syncScore.toFixed(2) + '  incomplete ' + decoded.incomplete,
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
        onEnded: () => { rxStopPlay.disabled = true; setStatus('Playback ended'); },
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

  // FIDELITY LAB
  const labGrid = el('div', 'sstv-grid-3');
  const labSrcCard = el('div', 'sstv-card');
  labSrcCard.appendChild(h3('SOURCE · NORMALIZED'));
  const labSrcCanvas = el('canvas');
  labSrcCanvas.width = 320;
  labSrcCanvas.height = 256;
  labSrcCanvas.className = 'sstv-preview';
  labSrcMeta = el('div', 'sstv-diag');
  labSrcMeta.textContent = 'No source — load image on TRANSMIT or use test pattern.';
  const fitField = field('Aspect fit');
  labFitSel = el('select');
  for (const [v, t] of [['stretch', 'Stretch'], ['contain', 'Contain'], ['cover', 'Cover']]) {
    const o = el('option');
    o.value = v;
    o.textContent = t;
    labFitSel.appendChild(o);
  }
  fitField.appendChild(labFitSel);
  labFitSel.addEventListener('change', () => paintSourceOntoTx());
  labSrcCard.append(labSrcCanvas, fitField, labSrcMeta);

  const labTxCard = el('div', 'sstv-card');
  labTxCard.appendChild(h3('TRANSMISSION'));
  const labWave = el('canvas');
  labWave.width = 640;
  labWave.height = 64;
  labWave.className = 'sstv-wave';
  const labTxMeta = el('div', 'sstv-diag');
  labTxMeta.textContent = 'Run FIDELITY ROUND-TRIP to encode.';
  labTxCard.append(labWave, labTxMeta);

  const labRxCard = el('div', 'sstv-card');
  labRxCard.appendChild(h3('RECONSTRUCTION'));
  const labRxCanvas = el('canvas');
  labRxCanvas.width = 320;
  labRxCanvas.height = 256;
  labRxCanvas.className = 'sstv-preview';
  const labRxMeta = el('div', 'sstv-diag');
  labRxMeta.textContent = '—';
  labRxCard.append(labRxCanvas, labRxMeta);
  labGrid.append(labSrcCard, labTxCard, labRxCard);

  const labGrid2 = el('div', 'sstv-grid-2');
  const labDiffCard = el('div', 'sstv-card');
  labDiffCard.appendChild(h3('DIFFERENCE (vs normalized)'));
  const labDiffCanvas = el('canvas');
  labDiffCanvas.width = 320;
  labDiffCanvas.height = 256;
  labDiffCanvas.className = 'sstv-preview';
  const diffControls = el('div', 'sstv-diff-controls');
  const diffLabel = el('span');
  diffLabel.textContent = 'Gain';
  const diffRange = el('input');
  diffRange.type = 'range';
  diffRange.min = '1';
  diffRange.max = '16';
  diffRange.value = '4';
  const diffVal = el('span');
  diffVal.textContent = '4×';
  diffRange.addEventListener('input', () => {
    diffGain = Number(diffRange.value) || 4;
    diffVal.textContent = diffGain + '×';
    if (lastNormalized && lastDecodedImage) {
      drawImageData(labDiffCanvas, differenceHeatmap(lastNormalized, lastDecodedImage, diffGain));
    }
  });
  diffControls.append(diffLabel, diffRange, diffVal);
  labDiffCard.append(labDiffCanvas, diffControls);

  const labMetCard = el('div', 'sstv-card');
  labMetCard.appendChild(h3('METRICS'));
  const labMetrics = el('div', 'sstv-metrics');
  labMetrics.innerHTML = '<span>MAE</span><b>—</b><span>PSNR</span><b>—</b><span>SSIM</span><b>—</b><span>MAE R/G/B</span><b>—</b><span>Lines</span><b>—</b><span>Sync</span><b>—</b>';
  const runLabBtn = btn('▶ FIDELITY ROUND-TRIP');
  runLabBtn.classList.add('primary');
  const labAct = el('div', 'sstv-actions');
  labAct.append(runLabBtn);
  const labDiag = el('div', 'sstv-diag');
  labDiag.textContent = 'Compares decoded image to the normalized transmission source (not the raw upload).';
  labMetCard.append(labMetrics, labAct, labDiag);
  labGrid2.append(labDiffCard, labMetCard);
  lab.append(labGrid, labGrid2);

  function setMetricsUI(m, decoded) {
    const cells = [
      ['MAE', m.mae.toFixed(2)],
      ['PSNR', m.psnr.toFixed(1) + ' dB'],
      ['SSIM', m.ssim.toFixed(3)],
      ['MAE R/G/B', m.maeR.toFixed(1) + ' / ' + m.maeG.toFixed(1) + ' / ' + m.maeB.toFixed(1)],
      ['Lines', decoded.linesDecoded + '/' + decoded.expectedLines],
      ['Sync', decoded.syncScore.toFixed(2)],
    ];
    labMetrics.innerHTML = '';
    for (const [k, v] of cells) {
      const s = el('span');
      s.textContent = k;
      const b = el('b');
      b.textContent = v;
      labMetrics.append(s, b);
    }
  }

  runLabBtn.addEventListener('click', async () => {
    try {
      setBusy(true, 'FIDELITY');
      runLabBtn.disabled = true;
      const modeId = modeSel.value;
      const mode = getMode(modeId) || listEncodableModes().find((x) => x.id === modeId);
      const fit = labFitSel.value || 'stretch';
      const src = sourceImage || canvasToImage(txCanvas);
      if (!sourceImage) sourceImage = src;
      const normalized = normalizeImage(src, mode.width, mode.height, { fit });
      lastNormalized = normalized;
      drawImageData(labSrcCanvas, normalized);
      drawImageData(txCanvas, normalized);
      labSrcMeta.textContent = ['mode ' + mode.id + ' · ' + mode.width + '×' + mode.height, 'fit ' + fit, 'src ' + (src.width || '?') + '×' + (src.height || '?')].join('\n');

      const encoded = encodeImageToWav(normalized, modeId, {
        sampleRate: Number(srSel.value) || 48000,
        fit,
        onProgress: (p) => { progressBar.style.width = Math.round(p * 100) + '%'; },
      });
      lastWav = encoded.wav;
      lastSr = encoded.sampleRate;
      lastSamples = decodeWavPcm16(encoded.wav).samples;
      drawWaveform(labWave, lastSamples);
      drawWaveform(waveCanvas, lastSamples);
      labTxMeta.textContent = ['VIS ' + encoded.visCode + ' · sr ' + encoded.sampleRate, 'duration ' + (encoded.durationMs / 1000).toFixed(1) + 's', 'samples ' + encoded.sampleCount, 'wav ' + encoded.wav.byteLength + ' bytes'].join('\n');

      const decoded = decodeAudio(encoded.wav, { modeHint: modeId });
      lastDecodedImage = decoded.image;
      drawImageData(labRxCanvas, decoded.image);
      drawImageData(rxCanvas, decoded.image);
      lastPng = await imageToPngBytes(decoded.image);
      dlPng.disabled = !lastPng;
      labRxMeta.textContent = ['decoder ' + (decoded.diagnostics?.decoder || decoded.mode), 'lines ' + decoded.linesDecoded + '/' + decoded.expectedLines, 'sync ' + decoded.syncScore.toFixed(2), decoded.diagnostics?.note || ''].join('\n');

      const metrics = computeFidelityMetrics(normalized, decoded.image);
      lastMetrics = metrics;
      setMetricsUI(metrics, decoded);
      drawImageData(labDiffCanvas, differenceHeatmap(normalized, decoded.image, diffGain));
      labDiag.textContent = ['Round-trip complete (clean digital path via WAV).', 'MAE ' + metrics.mae.toFixed(2) + ' · PSNR ' + metrics.psnr.toFixed(1) + ' · SSIM ' + metrics.ssim.toFixed(3), 'Difference uses normalized transmission source.'].join('\n');
      setStatus('Fidelity round-trip complete');
      playBtn.disabled = false;
      dlWav.disabled = false;
    } catch (e) {
      setErr(String(e.message || e));
      labDiag.textContent = String(e.message || e);
    } finally {
      runLabBtn.disabled = false;
      setBusy(false);
    }
  });

  const note = el('div', 'sstv-note');
  note.textContent = 'TX/RX use browser audio only — not radio. Mic needs HTTPS or localhost. FIDELITY compares reconstruction to the normalized transmission source.';
  root.append(head, tabs, tx, rx, lab, note);

  function showTab(which) {
    tabTx.classList.toggle('active', which === 'tx');
    tabRx.classList.toggle('active', which === 'rx');
    tabLab.classList.toggle('active', which === 'lab');
    tx.hidden = which !== 'tx';
    rx.hidden = which !== 'rx';
    lab.hidden = which !== 'lab';
  }
  tabTx.addEventListener('click', () => showTab('tx'));
  tabRx.addEventListener('click', () => showTab('rx'));
  tabLab.addEventListener('click', () => showTab('lab'));

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
    const cols = ['#c00', '#0c0', '#00c', '#cc0', '#0cc', '#c0c', '#eee', '#444'];
    const cw = canvas.width / cols.length;
    for (let i = 0; i < cols.length; i++) {
      ctx.fillStyle = cols[i];
      ctx.fillRect(i * cw, 0, cw + 1, canvas.height);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('SSTV test', 12, 24);
  }
  function canvasToImage(canvas) {
    const id = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    return { data: id.data, width: id.width, height: id.height };
  }
  function drawImageData(canvas, image) {
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').putImageData(
      new ImageData(image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data), image.width, image.height),
      0, 0
    );
  }
  async function imageToPngBytes(image) {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d').putImageData(
      new ImageData(image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data), image.width, image.height),
      0, 0
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
