import { getMode } from '../modes/mode-registry.js';
import { encodeMartinM1 } from './martin-m1.js';
import { encodeWavPcm16Mono } from '../audio/wav-encoder.js';

/**
 * Encode image to SSTV WAV bytes.
 * @param {{ data: Uint8ClampedArray|Uint8Array, width: number, height: number }} image
 * @param {string} modeId
 * @param {{ sampleRate?: number, onProgress?: Function, signal?: AbortSignal }} [opts]
 */
export function encodeImageToWav(image, modeId, opts = {}) {
  const mode = getMode(modeId);
  if (!mode) throw new Error(`Unknown SSTV mode: ${modeId}`);
  if (!mode.encoder) throw new Error(`Encoder not implemented for mode: ${modeId}`);

  let result;
  if (modeId === 'martin_m1') {
    result = encodeMartinM1(image, opts);
  } else {
    throw new Error(`Encoder not implemented for mode: ${modeId}`);
  }

  const wav = encodeWavPcm16Mono(result.samples, result.sampleRate);
  return {
    wav,
    sampleRate: result.sampleRate,
    durationMs: result.durationMs,
    mode: result.mode,
    visCode: result.visCode,
    width: result.width,
    height: result.height,
    lineCount: result.lineCount,
    sampleCount: result.samples.length,
  };
}
