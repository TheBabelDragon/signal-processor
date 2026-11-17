/**
 * Complex number arithmetic for Quantum Wave Engine.
 * Deterministic, no external deps. Browser + Node.
 */
"use strict";

class Complex {
  constructor(re = 0, im = 0) {
    this.re = +re;
    this.im = +im;
  }

  static fromPolar(r, theta) {
    return new Complex(r * Math.cos(theta), r * Math.sin(theta));
  }

  static zero() { return new Complex(0, 0); }
  static one() { return new Complex(1, 0); }
  static i() { return new Complex(0, 1); }

  add(z) { return new Complex(this.re + z.re, this.im + z.im); }
  sub(z) { return new Complex(this.re - z.re, this.im - z.im); }
  mul(z) {
    return new Complex(
      this.re * z.re - this.im * z.im,
      this.re * z.im + this.im * z.re
    );
  }
  div(z) {
    const d = z.re * z.re + z.im * z.im;
    if (d === 0) throw new Error("Complex division by zero");
    return new Complex(
      (this.re * z.re + this.im * z.im) / d,
      (this.im * z.re - this.re * z.im) / d
    );
  }
  scale(s) { return new Complex(this.re * s, this.im * s); }
  conj() { return new Complex(this.re, -this.im); }
  abs() { return Math.hypot(this.re, this.im); }
  abs2() { return this.re * this.re + this.im * this.im; }
  arg() { return Math.atan2(this.im, this.re); }
  exp() {
    const e = Math.exp(this.re);
    return new Complex(e * Math.cos(this.im), e * Math.sin(this.im));
  }
  neg() { return new Complex(-this.re, -this.im); }
  toString() {
    const s = this.im >= 0 ? "+" : "";
    return `${this.re}${s}${this.im}i`;
  }
  equals(z, eps = 1e-12) {
    return Math.abs(this.re - z.re) < eps && Math.abs(this.im - z.im) < eps;
  }
}

/** Element-wise operations on Complex arrays */
function complexArray(n, fill = () => Complex.zero()) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = fill(i);
  return a;
}

function copyComplexArray(arr) {
  return arr.map(z => new Complex(z.re, z.im));
}

function normalizeWavefunction(psi, dx) {
  let norm2 = 0;
  for (const z of psi) norm2 += z.abs2();
  const norm = Math.sqrt(norm2 * dx);
  if (norm < 1e-15) return { psi, norm: 0, error: 1 };
  const inv = 1 / norm;
  for (let i = 0; i < psi.length; i++) psi[i] = psi[i].scale(inv);
  let check = 0;
  for (const z of psi) check += z.abs2();
  return { psi, norm, error: Math.abs(check * dx - 1) };
}

module.exports = { Complex, complexArray, copyComplexArray, normalizeWavefunction };
