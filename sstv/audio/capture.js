/**
 * Browser microphone capture → Float32 mono PCM.
 * Mic path is gain-muted to destination (no speaker feedback).
 */
export function createCapture() {
  let stream = null;
  let ctx = null;
  let processor = null;
  let mute = null;
  let mediaSrc = null;
  let chunks = [];
  let capturing = false;
  let level = 0;
  let sampleRate = 48000;
  const channelCount = 1;

  async function start(opts = {}) {
    if (capturing) stop();
    chunks = [];
    level = 0;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone API not available (requires HTTPS or localhost)');
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio not available');
    const hint = opts.sampleRateHint || 48000;
    try { ctx = new AC({ sampleRate: hint }); } catch (_) { ctx = new AC(); }
    if (ctx.state === 'suspended') await ctx.resume();
    sampleRate = ctx.sampleRate;
    mediaSrc = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (ev) => {
      if (!capturing) return;
      const input = ev.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      level = level * 0.7 + Math.sqrt(sum / input.length) * 0.3;
      ev.outputBuffer.getChannelData(0).fill(0);
    };
    mute = ctx.createGain();
    mute.gain.value = 0;
    mediaSrc.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    capturing = true;
    return { sampleRate, channelCount };
  }

  function stop() {
    capturing = false;
    if (processor) { try { processor.disconnect(); } catch (_) {} processor.onaudioprocess = null; processor = null; }
    if (mute) { try { mute.disconnect(); } catch (_) {} mute = null; }
    if (mediaSrc) { try { mediaSrc.disconnect(); } catch (_) {} mediaSrc = null; }
    if (stream) { for (const t of stream.getTracks()) { try { t.stop(); } catch (_) {} } stream = null; }
    if (ctx) { const c = ctx; ctx = null; c.close().catch(() => {}); }
    let total = 0;
    for (const c of chunks) total += c.length;
    const samples = new Float32Array(total);
    let o = 0;
    for (const c of chunks) { samples.set(c, o); o += c.length; }
    const sr = sampleRate;
    const durationMs = sr > 0 ? (samples.length / sr) * 1000 : 0;
    chunks = [];
    level = 0;
    return { samples, sampleRate: sr, durationMs, channelCount };
  }

  function isCapturing() { return capturing; }
  function getLevel() { return level; }
  function dispose() { if (capturing || stream || processor || ctx) stop(); }
  return { start, stop, isCapturing, getLevel, dispose };
}
