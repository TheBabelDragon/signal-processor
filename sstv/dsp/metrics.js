/**
 * Quantitative image fidelity metrics for SSTV round-trip tests.
 */

export function computeFidelityMetrics(a, b) {
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const n = w * h;
  if (n === 0) {
    return { mae: 255, mse: 65025, psnr: 0, maeR: 255, maeG: 255, maeB: 255, n: 0 };
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

  let meanA = 0, meanB = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      meanA += (a.data[ia] + a.data[ia + 1] + a.data[ia + 2]) / 3;
      meanB += (b.data[ib] + b.data[ib + 1] + b.data[ib + 2]) / 3;
    }
  }
  meanA /= n;
  meanB /= n;
  let cov = 0, varA = 0, varB = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const va = (a.data[ia] + a.data[ia + 1] + a.data[ia + 2]) / 3 - meanA;
      const vb = (b.data[ib] + b.data[ib + 1] + b.data[ib + 2]) / 3 - meanB;
      cov += va * vb;
      varA += va * va;
      varB += vb * vb;
    }
  }
  const c1 = 6.5025, c2 = 58.5225;
  const ssim =
    ((2 * meanA * meanB + c1) * (2 * cov / n + c2)) /
    ((meanA * meanA + meanB * meanB + c1) * (varA / n + varB / n + c2));

  return {
    mae, mse, psnr,
    ssim: Math.max(0, Math.min(1, ssim)),
    maeR: sumR / n, maeG: sumG / n, maeB: sumB / n,
    mseR: sumSqR / n, mseG: sumSqG / n, mseB: sumSqB / n,
    n, width: w, height: h,
  };
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
