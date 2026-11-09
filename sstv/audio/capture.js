/**
 * Browser microphone capture → Float32 mono PCM.
 * Uses getUserMedia + ScriptProcessor (widely available).
 * Not a calibrated RF front-end.
 */

/**
 * @returns {{ start: Function, stop: Function, isCapturing: Function, getLevel: Function, dispose: Function }}
 */
export function createCapture() {
  /** @type {MediaStream|null} */
  let stream = null;
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {ScriptProcessorNode|null} */
  let processor = null;
  /** @type {GainNode|null} */
  let mute = null;
  /** @type {Float32Array[]} */
  let chunks = [];
  let capturing = false;
  let level = 0;
  let sampleRate = 48000;

  /**
   * @param {{ sampleRateHint?: number }} [opts]
   */
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
    try {
      ctx = new AC({ sampleRate: hint });
    } catch (_) {
      ctx = new AC();
    }
    if (ctx.state === 'suspended') await ctx.resume();
    sampleRate = ctx.sampleRate;

    const src = ctx.createMediaStreamSource(stream);
    // ScriptProcessor: deprecated but reliable for offline capture without AudioWorklet bundling
    const bufferSize = 4096;
    processor = ctx.createScriptProcessor(bufferSize, 1, 1);
    processor.onaudioprocess = (ev) => {
      if (!capturing) return;
      const input = ev.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      level = level * 0.7 + rms * 0.3;
      // Keep output silent
      const out = ev.outputBuffer.getChannelData(0);
      out.fill(0);
    };

    mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);

    capturing = true;
    return { sampleRate };
  }

  /**
   * Stop capture and return concatenated samples.
   * @returns {{ samples: Float32Array, sampleRate: number, durationMs: number }}
   */
  function stop() {
    capturing = false;
    if (processor) {
      try {
        processor.disconnect();
      } catch (_) {}
      processor.onaudioprocess = null;
      processor = null;
    }
    if (mute) {
      try {
        mute.disconnect();
      } catch (_) {}
      mute = null;
    }
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
    // Leave ctx open for possible reuse, or close
    if (ctx) {
      const c = ctx;
      ctx = null;
      c.close().catch(() => {});
    }

    let total = 0;
    for (const c of chunks) total += c.length;
    const samples = new Float32Array(total);
    let o = 0;
    for (const c of chunks) {
      samples.set(c, o);
      o += c.length;
    }
    const sr = sampleRate;
    const durationMs = sr > 0 ? (samples.length / sr) * 1000 : 0;
    chunks = [];
    level = 0;
    return { samples, sampleRate: sr, durationMs };
  }

  function isCapturing() {
    return capturing;
  }

  function getLevel() {
    return level;
  }

  function dispose() {
    if (capturing) stop();
  }

  return { start, stop, isCapturing, getLevel, dispose };
}
