/**
 * Resize RGBA ImageData-like buffers to target SSTV dimensions.
 * Supports stretch (legacy), contain (letterbox), and cover (crop).
 */

export function normalizeImage(src, tw, th, opts = {}) {
  const fit = opts.fit || 'stretch';
  const fill = opts.fill || [0, 0, 0];
  const sw = src.width;
  const sh = src.height;
  const sd = src.data;
  const out = new Uint8ClampedArray(tw * th * 4);

  for (let i = 0; i < tw * th; i++) {
    const o = i * 4;
    out[o] = fill[0];
    out[o + 1] = fill[1];
    out[o + 2] = fill[2];
    out[o + 3] = 255;
  }

  if (fit === 'stretch') {
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
    return { data: out, width: tw, height: th, fit: 'stretch', srcWidth: sw, srcHeight: sh };
  }

  const srcAspect = sw / sh;
  const dstAspect = tw / th;
  let scale, drawW, drawH, ox, oy;

  if (fit === 'contain') {
    if (srcAspect > dstAspect) {
      scale = tw / sw;
      drawW = tw;
      drawH = Math.max(1, Math.round(sh * scale));
      ox = 0;
      oy = Math.floor((th - drawH) / 2);
    } else {
      scale = th / sh;
      drawH = th;
      drawW = Math.max(1, Math.round(sw * scale));
      ox = Math.floor((tw - drawW) / 2);
      oy = 0;
    }
  } else {
    if (srcAspect > dstAspect) {
      scale = th / sh;
      drawH = th;
      drawW = Math.max(1, Math.round(sw * scale));
      const cropFracX = opts.cropX != null ? opts.cropX : 0.5;
      ox = -Math.floor((drawW - tw) * cropFracX);
      oy = 0;
    } else {
      scale = tw / sw;
      drawW = tw;
      drawH = Math.max(1, Math.round(sh * scale));
      const cropFracY = opts.cropY != null ? opts.cropY : 0.5;
      ox = 0;
      oy = -Math.floor((drawH - th) * cropFracY);
    }
  }

  for (let y = 0; y < th; y++) {
    const syf = (y - oy) / scale;
    if (syf < 0 || syf >= sh) continue;
    const sy = Math.min(sh - 1, Math.floor(syf));
    for (let x = 0; x < tw; x++) {
      const sxf = (x - ox) / scale;
      if (sxf < 0 || sxf >= sw) continue;
      const sx = Math.min(sw - 1, Math.floor(sxf));
      const si = (sy * sw + sx) * 4;
      const di = (y * tw + x) * 4;
      out[di] = sd[si];
      out[di + 1] = sd[si + 1];
      out[di + 2] = sd[si + 2];
      out[di + 3] = 255;
    }
  }

  return {
    data: out,
    width: tw,
    height: th,
    fit,
    srcWidth: sw,
    srcHeight: sh,
    drawWidth: drawW,
    drawHeight: drawH,
  };
}

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

export function colorBarsImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  const colors = [
    [255, 255, 255], [255, 255, 0], [0, 255, 255], [0, 255, 0],
    [255, 0, 255], [255, 0, 0], [0, 0, 255], [0, 0, 0],
  ];
  const bw = Math.max(1, Math.floor(w / colors.length));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colors[Math.min(colors.length - 1, Math.floor(x / bw))];
      const o = (y * w + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

export function gradientImage(w, h, axis = 'x') {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = axis === 'x' ? x / Math.max(1, w - 1) : y / Math.max(1, h - 1);
      const v = Math.round(t * 255);
      const o = (y * w + x) * 4;
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

export function checkerboardImage(w, h, cell = 8) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const v = on ? 255 : 0;
      const o = (y * w + x) * 4;
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

export function channelImage(w, h, channel, value = 200) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    data[o] = channel === 'r' ? value : 0;
    data[o + 1] = channel === 'g' ? value : 0;
    data[o + 2] = channel === 'b' ? value : 0;
    data[o + 3] = 255;
  }
  return { data, width: w, height: h };
}
