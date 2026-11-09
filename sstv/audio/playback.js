/**
 * Browser Web Audio playback for Float32 mono buffers.
 * Explicit user-gesture start; honest stopped state.
 */

/**
 * @returns {{ play: Function, stop: Function, isPlaying: Function, getProgress: Function, dispose: Function }}
 */
export function createPlayback() {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {AudioBufferSourceNode|null} */
  let source = null;
  let playing = false;
  /** @type {Function|null} */
  let onEndedCb = null;
  let startAt = 0;
  let duration = 0;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio not available');
      ctx = new AC();
    }
    return ctx;
  }

  /**
   * @param {Float32Array} samples
   * @param {number} sampleRate
   * @param {{ onEnded?: Function }} [opts]
   */
  async function play(samples, sampleRate, opts = {}) {
    stop();
    onEndedCb = typeof opts.onEnded === 'function' ? opts.onEnded : null;
    const c = ensureCtx();
    if (c.state === 'suspended') await c.resume();
    const buf = c.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples instanceof Float32Array ? samples : new Float32Array(samples), 0);
    duration = buf.duration;
    source = c.createBufferSource();
    source.buffer = buf;
    source.connect(c.destination);
    source.onended = () => {
      const wasPlaying = playing;
      playing = false;
      source = null;
      const cb = onEndedCb;
      onEndedCb = null;
      if (wasPlaying && cb) cb();
    };
    startAt = c.currentTime;
    source.start(0);
    playing = true;
  }

  function stop() {
    onEndedCb = null;
    if (source) {
      try {
        source.onended = null;
        source.stop(0);
      } catch (_) {
        /* already stopped */
      }
      try {
        source.disconnect();
      } catch (_) {}
      source = null;
    }
    playing = false;
    duration = 0;
  }

  function isPlaying() {
    return playing;
  }

  /**
   * @returns {{ playing: boolean, elapsed: number, duration: number, fraction: number }}
   */
  function getProgress() {
    if (!playing || !ctx || duration <= 0) {
      return { playing: false, elapsed: 0, duration, fraction: 0 };
    }
    const elapsed = Math.min(duration, Math.max(0, ctx.currentTime - startAt));
    return {
      playing: true,
      elapsed,
      duration,
      fraction: duration > 0 ? elapsed / duration : 0,
    };
  }

  function dispose() {
    stop();
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
  }

  return { play, stop, isPlaying, getProgress, dispose };
}
