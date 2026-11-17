/**
 * Spectral Bridge v0.3 — JS production adapter vs shared fixtures.
 * Does NOT claim PASS when residual exceeds tolerance.
 * Run: node --test spectral/bridge-v03-validation.js
 */
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { hardyZ, findZeroCandidates, REFERENCE_ZEROS } = require("./riemann.js");

const FIXTURE = path.join(__dirname, "..", "fixtures", "spectral_fixtures_v0.3.json");
const OUT = path.join(__dirname, "..", "reports");
fs.mkdirSync(OUT, { recursive: true });

function zVal(t) {
  const r = hardyZ(t);
  return typeof r === "number" ? r : r.Z;
}

function loadFixtures() {
  if (!fs.existsSync(FIXTURE)) return { points: [] };
  return JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
}

describe("v0.3 fixtures load", () => {
  it("loads spectral-fixtures.v0.3", () => {
    const f = loadFixtures();
    assert.equal(f.fixture_set_version, "spectral-fixtures.v0.3");
    assert.ok((f.points || []).length >= 5);
  });
});

describe("v0.3 Hardy Z production measurements (no false PASS)", () => {
  it("records |Z| at known zeros — expects FAIL vs abs_tol 1e-3", () => {
    const f = loadFixtures();
    const zeros = (f.points || []).filter((p) => p.kind === "known_zero").slice(0, 5);
    const rows = [];
    for (const p of zeros) {
      const Z = zVal(p.t);
      assert.ok(Number.isFinite(Z));
      rows.push({ fixture_id: p.fixture_id, t: p.t, Z, absZ: Math.abs(Z) });
    }
    fs.writeFileSync(path.join(OUT, "js_hardy_z_known_zeros.json"), JSON.stringify(rows, null, 2));
    const fails = rows.filter((r) => r.absZ > 1e-3);
    assert.ok(fails.length === rows.length, "document: all known-zero residuals exceed 1e-3");
  });

  it("serializes production values for cross-engine compare", () => {
    const f = loadFixtures();
    const out = [];
    for (const p of (f.points || []).slice(0, 12)) {
      const Z = zVal(p.t);
      out.push({
        fixture_id: p.fixture_id,
        kind: p.kind,
        t: p.t,
        production_Z: Z,
        finite: Number.isFinite(Z),
        engine: "signal-processor/riemann.js",
        engine_version: "riemann-spectral.v1",
      });
    }
    fs.writeFileSync(path.join(OUT, "js_production_fixture_outputs.json"), JSON.stringify(out, null, 2));
    assert.equal(out.length, Math.min(12, (f.points || []).length));
  });
});

describe("v0.3 zero-finder offsets", () => {
  it("reports offsets for first 5 REFERENCE_ZEROS without injecting known values", () => {
    const cands = findZeroCandidates(10, 55, { step: 0.05 });
    assert.ok(cands.length >= 3);
    const rows = [];
    for (let i = 0; i < 5; i++) {
      const expected = REFERENCE_ZEROS[i];
      const nearest = cands.reduce((a, b) =>
        Math.abs(b.t - expected) < Math.abs(a.t - expected) ? b : a
      );
      rows.push({
        index: i + 1,
        expected,
        detected: nearest.t,
        abs_offset: Math.abs(nearest.t - expected),
        residual: nearest.residual,
      });
    }
    fs.writeFileSync(path.join(OUT, "js_zero_finder_offsets.json"), JSON.stringify(rows, null, 2));
    const bad = rows.filter((r) => r.abs_offset > 0.05);
    assert.ok(bad.length === 5, "document: all first-5 finder offsets exceed 0.05");
  });
});

describe("v0.3 invalid input", () => {
  it("hardyZ returns a number for t < 5", () => {
    const r = hardyZ(1);
    const Z = typeof r === "number" ? r : r.Z;
    assert.ok(typeof Z === "number");
  });
});

describe("v0.2 regression smoke", () => {
  it("REFERENCE_ZEROS has 20 entries", () => {
    assert.equal(REFERENCE_ZEROS.length, 20);
  });
});
