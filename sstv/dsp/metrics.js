/**
 * Quantitative image fidelity metrics for SSTV round-trip tests.
 *
 * Notes:
 * - `globalSsim` is a single-window luminance SSIM (not conventional local SSIM).
 * - `localSsim` is mean of 8×8 window SSIM (closer to standard SSIM).
 * - Dimension mismatch is reported; by default metrics use overlap only and set
 *   `dimensionMatch: false`. Pass `{ requireExactDimensions: true }` to throw.
 */

const C1 = 6.5025;
const C2 = 58.5225;

function luma(data, width, x, y) {
  const i = (y * width + x) * 4;
  return (data[i] + data[i + 1] + data[i + 2]) / 3;
}

function windowSsim(a, b, x0, y0, ww, hh) {
  let meanA = 0, meanB = 0, n = 0;
  for (let y = y0; y < y0 + hh; y++) {
    for (let x = x0; x < x0 + ww; x++) {
      meanA += luma(a.data, a.width, x, y);
      meanB += luma(b.data, b.width, x, y);
      n++;
    }
  }
  meanA /= n;
  meanB /= n;
  let varA = 0, varB = 0, cov = 0;
  for (let y = y0; y < y0 + hh; y++) {
    for (let x = x0; x < x0 + ww; x++) {
      const va = luma(a.data, a.width, x, y) - meanA;
      const vb = luma(b.data, b.width, x, y) - meanB;
      varA += va * va;
      varB += vb * vb;
      cov += va * vb;
    }
  }
  varA /= n;
  varB /= n;
  cov /= n;
  return ((2 * meanA * meanB + C1) * (2 * cov + C2)) /
    ((meanA * meanA + meanB * meanB + C1) * (varA + varB + C2));
}

export function computeFidelityMetrics(a, b, opts = {}) {
  if (opts.requireExactDimensions && (a.width !== b.width || a.height !== b.height)) {
    throw new Error(`dimension mismatch: ${a.width}×${a.height} vs ${b.width}×${b.height}`);
  }
  const dimensionMatch = a.width === b.width && a.height === b.height;
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const n = w * h;
  if (n === 0) {
    return {
      mae: 255, mse: 65025, psnr: 0, globalSsim: 0, localSsim: 0, ssim: 0,
      maeR: 255, maeG: 255, maeB: 255, n: 0, dimensionMatch, horizontalShift: 0,
    };
  }

  let sumAbs = 0, sumSq = 0;
  let sumR = 0, sumG = 0, sumB = 0;
  let sumSqR = 0, sumSqG = 0, sumSqB = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const dr = a.data[ia] - b.data[ib];
      const dg = a.data[ia + 1] - b.data[ib + 1];
      const db = a.data[ia + 2] - b.data[ib + 2];
      const abs = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
      sumAbs += abs;
      sumSq += (dr * dr + dg * dg + db * db) / 3;
      sumR += Math.abs(dr);
      sumG += Math.abs(dg);
      sumB += Math.abs(db);
      sumSqR += dr * dr;
      sumSqG += dg * dg;
      sumSqB += db * db;
    }
  }

  const mae = sumAbs / n;
  const mse = sumSq / n;
  const psnr = mse <= 1e-12 ? 99 : 10 * Math.log10((255 * 255) / mse);
  const globalSsim = Math.max(0, Math.min(1, windowSsim(a, b, 0, 0, w, h)));

  const win = 8;
  let localSum = 0, localN = 0;
  for (let y = 0; y + win <= h; y += win) {
    for (let x = 0; x + win <= w; x += win) {
      localSum += windowSsim(a, b, x, y, win, win);
      localN++;
    }
  }
  const localSsim = localN ? Math.max(0, Math.min(1, localSum / localN)) : globalSsim;
  const horizontalShift = estimateHorizontalShift(a, b, w, h);

  return {
    mae, mse, psnr, globalSsim, localSsim, ssim: globalSsim,
    maeR: sumR / n, maeG: sumG / n, maeB: sumB / n,
    mseR: sumSqR / n, mseG: sumSqG / n, mseB: sumSqB / n,
    n, width: w, height: h, dimensionMatch, horizontalShift,
  };
}

function estimateHorizontalShift(a, b, w, h) {
  const y0 = Math.floor(h * 0.25);
  const y1 = Math.floor(h * 0.75);
  const maxShift = Math.min(16, Math.floor(w / 8));
  let bestShift = 0;
  let bestScore = -Infinity;
  for (let s = -maxShift; s <= maxShift; s++) {
    let score = 0;
    let cnt = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = maxShift; x < w - maxShift; x++) {
        const xb = x + s;
        if (xb < 0 || xb >= w) continue;
        score += luma(a.data, a.width, x, y) * luma(b.data, b.width, xb, y);
        cnt++;
      }
    }
    if (cnt && score / cnt > bestScore) {
      bestScore = score / cnt;
      bestShift = s;
    }
  }
  return bestShift;
}

export function differenceHeatmap(a, b, gain = 4) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const dr = Math.abs(a.data[ia] - b.data[ib]);
      const dg = Math.abs(a.data[ia + 1] - b.data[ib + 1]);
      const db = Math.abs(a.data[ia + 2] - b.data[ib + 2]);
      const e = Math.min(255, Math.round(((dr + dg + db) / 3) * gain));
      const o = (y * w + x) * 4;
      data[o] = e;
      data[o + 1] = Math.round(e * 0.2);
      data[o + 2] = Math.round(e * 0.2);
      data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}
