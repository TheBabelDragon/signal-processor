/**
 * SSTV signal-gen dashboard — encode/decode + playback + waveform + manifest.
 */
import {
  encodeImageToWav,
  decodeAudio,
  decodeWavPcm16,
  listEncodableModes,
  listDecodableModes,
  validateMediaJobManifest,
} from '../index.js';
import { createPlayback } from '../audio/playback.js';
import { drawWaveform } from './waveform.js';

export function mountSstvPanel(root) {
  if (!root) return;

  const playback = createPlayback();
  /** @type {Float32Array|null} */
  let lastSamples = null;
  /** @type {number} */
  let lastSr = 48000;
  /** @type {Uint8Array|null} */
  let lastWav = null;
  /** @type {Uint8Array|null} */
  let lastPng = null;

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
  modeSel.addEventListener('change', () => {
    const m = listEncodableModes().find((x) => x.id === modeSel.value);
    if (m) {
      txCanvas.width = m.width;
      txCanvas.height = m.height;
      paintTestPattern(txCanvas);
    }
  });

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

  const waveCanvas = el('canvas');
  waveCanvas.width = 640;
  waveCanvas.height = 64;
  waveCanvas.className = 'sstv-wave';

  const encodeBtn = btn('Encode');
  encodeBtn.classList.add('primary');
  const playBtn = btn('Play');
  playBtn.disabled = true;
  const stopBtn = btn('Stop');
  stopBtn.disabled = true;
  const dlWav = btn('Download WAV');
  dlWav.disabled = true;
  const txDiag = el('div', 'sstv-diag');
  txDiag.textContent =
    'Encode offline · Play uses Web Audio · Import BabelCodec .job.json then load PNG.';

  encodeBtn.addEventListener('click', async () => {
    try {
      setBusy(true, 'ENCODING');
      progressBar.style.width = '0%';
      playback.stop();
      playBtn.disabled = true;
      stopBtn.disabled = true;
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
      dlWav.disabled = false;
      playBtn.disabled = false;
      txDiag.textContent = [
        `mode ${result.mode}  VIS ${result.visCode}`,
        `${result.width}×${result.height}  lines ${result.lineCount}`,
        `sr ${result.sampleRate}  duration ${(result.durationMs / 1000).toFixed(1)}s`,
        `wav ${result.wav.byteLength} bytes`,
      ].join('\n');
      setStatus('Encode complete');
    } catch (e) {
      setErr(String(e.message || e));
      txDiag.textContent = String(e.message || e);
    } finally {
      setBusy(false);
    }
  });

  playBtn.addEventListener('click', async () => {
    if (!lastSamples) return;
    try {
      await playback.play(lastSamples, lastSr);
      stopBtn.disabled = false;
      setStatus('Playing');
    } catch (e) {
      setErr(String(e.message || e));
    }
  });
  stopBtn.addEventListener('click', () => {
    playback.stop();
    stopBtn.disabled = true;
    setStatus('Stopped');
  });
  dlWav.addEventListener('click', () => {
    if (lastWav) download(lastWav, `sstv-${modeSel.value || 'out'}.wav`, 'audio/wav');
  });

  const txAct = el('div', 'sstv-actions');
  txAct.append(encodeBtn, playBtn, stopBtn, dlWav);
  txCtl.append(modeField, srField, progress, waveCanvas, txAct, txDiag);
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
  const rxWave = el('canvas');
  rxWave.width = 640;
  rxWave.height = 64;
  rxWave.className = 'sstv-wave';
  const rxDiag = el('div', 'sstv-diag');
  rxDiag.textContent = 'Load WAV from TRANSMIT or external clean SSTV recording.';
  const rxAct = el('div', 'sstv-actions');
  const rxPlay = btn('Play');
  rxPlay.disabled = true;
  const rxStop = btn('Stop');
  rxStop.disabled = true;

  const loadWav = fileBtn('Load WAV', 'audio/wav,audio/*,.wav', async (file) => {
    try {
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
      await playback.play(lastSamples, lastSr);
      rxStop.disabled = false;
      setStatus('Playing');
    } catch (e) {
      setErr(String(e.message || e));
    }
  });
  rxStop.addEventListener('click', () => {
    playback.stop();
    rxStop.disabled = true;
    setStatus('Stopped');
  });
  rxAct.append(loadWav, rxPlay, rxStop);
  rxIn.append(rxModeField, rxWave, rxAct, rxDiag);

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
    'SSTV signal-gen dashboard · independent of Acoustic Probe / neurofeedback. WAV is not an RF transmission. BabelCodec: Export SSTV handoff → import manifest + PNG here.';

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
    badge.textContent = on ? label || 'BUSY' : 'IDLE';
    badge.className = 'sstv-badge' + (on ? ' busy' : '');
    encodeBtn.disabled = on;
  }
  function setStatus(msg) {
    badge.textContent = 'OK';
    badge.className = 'sstv-badge ok';
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
