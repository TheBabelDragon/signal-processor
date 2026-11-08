/**
 * SSTV workstation panel — ES module, no coupling to Acoustic Probe.
 */
import { encodeImageToWav, decodeAudio, solidImage, listEncodableModes, MARTIN_M1 } from '../index.js';

export function mountSstvPanel(root) {
  if (!root) return;

  root.innerHTML = '';
  root.classList.add('sstv-panel');

  const head = el('div', 'sstv-head');
  const title = el('span', 'sstv-title');
  title.textContent = 'SSTV';
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
    ctx.fillRect(0, 0, 320, 256);
    ctx.drawImage(bmp, 0, 0, 320, 256);
    setStatus('Image loaded');
  });
  const testPat = btn('Test pattern');
  testPat.addEventListener('click', () => {
    paintTestPattern(txCanvas);
    setStatus('Test pattern');
  });
  txActions.append(loadImg, testPat);
  txSrc.append(txCanvas, txActions);

  const txCtl = el('div', 'sstv-card');
  txCtl.appendChild(h3('ENCODE'));
  const modeField = field('Mode');
  const modeSel = el('select');
  for (const m of listEncodableModes()) {
    const o = el('option');
    o.value = m.id;
    o.textContent = `${m.name} · ${m.width}×${m.height} · VIS ${m.visCode}`;
    modeSel.appendChild(o);
  }
  if (!modeSel.options.length) {
    const o = el('option');
    o.value = 'martin_m1';
    o.textContent = 'Martin M1';
    modeSel.appendChild(o);
  }
  modeField.appendChild(modeSel);
  const srField = field('Sample rate');
  const srSel = el('select');
  for (const [v, t] of [[48000, '48 kHz'], [44100, '44.1 kHz']]) {
    const o = el('option');
    o.value = String(v);
    o.textContent = t;
    srSel.appendChild(o);
  }
  srField.appendChild(srSel);
  const encodeBtn = btn('Encode WAV');
  encodeBtn.classList.add('primary');
  const dlWav = btn('Download WAV');
  dlWav.disabled = true;
  const txDiag = el('div', 'sstv-diag');
  txDiag.textContent = 'Martin M1 ≈ 114s + VIS header. Encoding runs fully offline.';
  let lastWav = null;
  encodeBtn.addEventListener('click', async () => {
    try {
      setBusy(true, 'ENCODING');
      const img = canvasToImage(txCanvas);
      const result = encodeImageToWav(img, modeSel.value, {
        sampleRate: Number(srSel.value) || 48000,
      });
      lastWav = result.wav;
      dlWav.disabled = false;
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
  dlWav.addEventListener('click', () => {
    if (!lastWav) return;
    download(lastWav, 'sstv-martin-m1.wav', 'audio/wav');
  });
  const txAct = el('div', 'sstv-actions');
  txAct.append(encodeBtn, dlWav);
  txCtl.append(modeField, srField, txAct, txDiag);
  txGrid.append(txSrc, txCtl);
  tx.appendChild(txGrid);

  // —— Receive ——
  const rxGrid = el('div', 'sstv-grid');
  const rxIn = el('div', 'sstv-card');
  rxIn.appendChild(h3('AUDIO IN'));
  const rxDiag = el('div', 'sstv-diag');
  rxDiag.textContent = 'Import a WAV produced by TRANSMIT (or compatible Martin M1).';
  const rxAct = el('div', 'sstv-actions');
  let lastPng = null;
  const loadWav = fileBtn('Load WAV', 'audio/wav,audio/*,.wav', async (file) => {
    try {
      setBusy(true, 'DECODING');
      const buf = new Uint8Array(await file.arrayBuffer());
      const decoded = decodeAudio(buf, { modeHint: 'martin_m1' });
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
  rxAct.append(loadWav);
  rxIn.append(rxAct, rxDiag);

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
    'SSTV is independent of Acoustic Probe and neurofeedback. WAV export is not a radio transmission. BabelCodec handoff: import PNG + manifest contract v1.';

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
    ctx.font = '16px monospace';
    ctx.fillText('Martin M1 test', 12, 28);
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
    const id = new ImageData(image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data), image.width, image.height);
    ctx.putImageData(id, 0, 0);
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
