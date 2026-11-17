/**
 * In-place Cooley-Tukey radix-2 FFT for Complex arrays.
 * Length must be power of 2. Deterministic.
 */
"use strict";

const { Complex } = require("./complex.js");

function isPowerOf2(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

function bitReverse(arr) {
  const n = arr.length;
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }
}

/**
 * In-place FFT. forward=true → analysis, false → inverse (no 1/N).
 * Caller must scale inverse by 1/N if needed.
 */
function fft(arr, forward = true) {
  const n = arr.length;
  if (!isPowerOf2(n)) throw new Error(`FFT length ${n} not power of 2`);
  bitReverse(arr);
  const sign = forward ? -1 : 1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (sign * 2 * Math.PI) / len;
    const wlen = new Complex(Math.cos(ang), Math.sin(ang));
    for (let i = 0; i < n; i += len) {
      let w = Complex.one();
      for (let j = 0; j < half; j++) {
        const u = arr[i + j];
        const v = arr[i + j + half].mul(w);
        arr[i + j] = u.add(v);
        arr[i + j + half] = u.sub(v);
        w = w.mul(wlen);
      }
    }
  }
  return arr;
}

function ifft(arr) {
  fft(arr, false);
  const inv = 1 / arr.length;
  for (let i = 0; i < arr.length; i++) arr[i] = arr[i].scale(inv);
  return arr;
}

/** Round-trip test helper */
function fftRoundTripError(arr) {
  const copy = arr.map(z => new Complex(z.re, z.im));
  fft(copy, true);
  ifft(copy);
  let maxErr = 0;
  for (let i = 0; i < arr.length; i++) {
    maxErr = Math.max(maxErr, Math.hypot(arr[i].re - copy[i].re, arr[i].im - copy[i].im));
  }
  return maxErr;
}

module.exports = { fft, ifft, isPowerOf2, fftRoundTripError };
