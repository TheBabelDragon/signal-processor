import { decodeWavPcm16 } from '../audio/wav-decoder.js';
import { decodeMartinM1 } from './martin-m1-decoder.js';
import { detectVis } from './vis-decoder.js';

/**
 * Decode SSTV audio (WAV bytes or raw samples) into an image.
 * @param {Uint8Array|Float32Array} input
 * @param {{ sampleRate?: number, modeHint?: string }} [opts]
 */
export function decodeAudio(input, opts = {}) {
  let samples;
  let sampleRate = opts.sampleRate || 48000;

  if (input instanceof Uint8Array || (input?.buffer && input.byteLength != null && !(input instanceof Float32Array))) {
    const wav = decodeWavPcm16(input instanceof Uint8Array ? input : new Uint8Array(input));
    samples = wav.samples;
    sampleRate = wav.sampleRate;
  } else if (input instanceof Float32Array) {
    samples = input;
  } else {
    throw new Error('decodeAudio expects WAV Uint8Array or Float32Array samples');
  }

  let modeHint = opts.modeHint;
  if (!modeHint) {
    const vis = detectVis(samples, sampleRate);
    modeHint = vis.modeId || 'martin_m1';
  }

  if (modeHint === 'martin_m1') {
    return decodeMartinM1(samples, sampleRate, { modeHint });
  }

  throw new Error(`Decoder not implemented for mode: ${modeHint}`);
}
