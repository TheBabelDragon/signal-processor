/**
 * Deterministic mono PCM s16le WAV writer.
 */

/**
 * @param {Float32Array} samples values in [-1, 1]
 * @param {number} sampleRate
 * @returns {Uint8Array}
 */
export function encodeWavPcm16Mono(samples, sampleRate) {
  const sr = sampleRate === 44100 ? 44100 : 48000;
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = samples[i];
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    const v = (s < 0 ? s * 0x8000 : s * 0x7fff) | 0;
    view.setInt16(o, v, true);
    o += 2;
  }
  return new Uint8Array(buffer);
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
