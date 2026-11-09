/**
 * Browser Web Audio playback for Float32 or WAV-decoded mono buffers.
 * Explicit user-gesture start; honest stopped state.
 */

/**
 * @returns {{ play: Function, stop: Function, isPlaying: Function, dispose: Function }}
 */
export function createPlayback() {
  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {AudioBufferSourceNode|null} */
  let source = null;
  let playing = false;

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
   */
  async function play(samples, sampleRate) {
    stop();
    const c = ensureCtx();
    if (c.state === 'suspended') await c.resume();
    const buf = c.createBuffer(1, samples.length, sampleRate);
    buf.copyToChannel(samples instanceof Float32Array ? samples : new Float32Array(samples), 0);
    source = c.createBufferSource();
    source.buffer = buf;
    source.connect(c.destination);
    source.onended = () => {
      playing = false;
      source = null;
    };
    source.start(0);
    playing = true;
  }

  function stop() {
    if (source) {
      try {
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
  }

  function isPlaying() {
    return playing;
  }

  function dispose() {
    stop();
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
  }

  return { play, stop, isPlaying, dispose };
}
