/**
 * Resize RGBA ImageData-like buffers to target SSTV dimensions (nearest neighbor).
 */

/**
 * @param {{ data: Uint8ClampedArray|Uint8Array, width: number, height: number }} src
 * @param {number} tw
 * @param {number} th
 */
export function normalizeImage(src, tw, th) {
  const sw = src.width;
  const sh = src.height;
  const sd = src.data;
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / th));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / tw));
      const si = (sy * sw + sx) * 4;
      const di = (y * tw + x) * 4;
      out[di] = sd[si];
      out[di + 1] = sd[si + 1];
      out[di + 2] = sd[si + 2];
      out[di + 3] = 255;
    }
  }
  return { data: out, width: tw, height: th };
}

/** Create solid RGB test pattern ImageData-like */
export function solidImage(w, h, r, g, b) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return { data, width: w, height: h };
}
