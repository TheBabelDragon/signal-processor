/**
 * Minimal PCM WAV reader (mono/stereo, 16-bit LE).
 */

/**
 * @param {Uint8Array} bytes
 * @returns {{ sampleRate: number, channels: number, samples: Float32Array }}
 */
export function decodeWavPcm16(bytes) {
  if (!bytes || bytes.length < 44) throw new Error('WAV too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = str(view, 0, 4);
  const wave = str(view, 8, 4);
  if (riff !== 'RIFF' || wave !== 'WAVE') throw new Error('Not a RIFF/WAVE file');

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const id = str(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      const format = view.getUint16(body, true);
      if (format !== 1) throw new Error('Only PCM WAV supported');
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (bits !== 16) throw new Error('Only 16-bit PCM supported');
    } else if (id === 'data') {
      dataOffset = body;
      dataSize = size;
      break;
    }
    offset = body + size + (size & 1);
  }
  if (dataOffset < 0) throw new Error('WAV missing data chunk');
  if (![44100, 48000].includes(sampleRate)) {
    // allow other rates but flag
  }
  const frameCount = Math.floor(dataSize / (2 * channels));
  const mono = new Float32Array(frameCount);
  let o = dataOffset;
  for (let i = 0; i < frameCount; i++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const v = view.getInt16(o, true);
      acc += v / (v < 0 ? 0x8000 : 0x7fff);
      o += 2;
    }
    mono[i] = acc / channels;
  }
  return { sampleRate, channels, samples: mono };
}

function str(view, offset, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}
