/**
 * QUANTUM / RIEMANN LAB browser workbench panel.
 * Independent of SSTV and Acoustic Probe.
 */
"use strict";

(function () {
  const PANEL_ID = "quantumRiemannLab";

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return e;
  }

  function mountQuantumRiemannLab(container) {
    if (!container) return;
    container.innerHTML = "";
    container.id = PANEL_ID;

    const head = el("div", { className: "qrl-head" }, [
      el("span", { className: "qrl-title", text: "QUANTUM / RIEMANN LAB" }),
      el("span", { className: "qrl-badge", text: "numerical · falsifiable" }),
    ]);

    const tabs = el("div", { className: "qrl-tabs" });
    const panels = {};
    const tabNames = ["QUANTUM WAVE", "RIEMANN ZEROS", "SPECTRAL COUPLING", "EXPERIMENT HISTORY"];
    let active = tabNames[0];

    const content = el("div", { className: "qrl-content" });

    function show(name) {
      active = name;
      for (const t of tabs.querySelectorAll("button")) {
        t.classList.toggle("active", t.dataset.tab === name);
      }
      content.innerHTML = "";
      content.appendChild(panels[name] || el("div", { text: "—" }));
    }

    for (const name of tabNames) {
      const b = el("button", {
        type: "button",
        "data-tab": name,
        className: name === active ? "active" : "",
        text: name,
        onClick: () => show(name),
      });
      tabs.appendChild(b);
    }

    panels["QUANTUM WAVE"] = buildQuantumPanel();
    panels["RIEMANN ZEROS"] = buildRiemannPanel();
    panels["SPECTRAL COUPLING"] = buildCouplingPanel();
    panels["EXPERIMENT HISTORY"] = buildHistoryPanel();

    container.appendChild(head);
    container.appendChild(tabs);
    container.appendChild(content);
    show(active);

    function buildQuantumPanel() {
      const wrap = el("div", { className: "qrl-panel" });
      const controls = el("div", { className: "qrl-controls" });
      const fields = [
        { id: "qx0", label: "x0", val: 0, step: 0.1 },
        { id: "qk0", label: "k0", val: 2, step: 0.1 },
        { id: "qsig", label: "σ", val: 1, step: 0.05 },
        { id: "qdt", label: "dt", val: 0.02, step: 0.005 },
        { id: "qsteps", label: "steps", val: 80, step: 1 },
      ];
      const inputs = {};
      for (const f of fields) {
        const row = el("div", { className: "qrl-field" });
        row.appendChild(el("label", { text: f.label }));
        const inp = el("input", { type: "number", id: f.id, value: f.val, step: f.step });
        inputs[f.id] = inp;
        row.appendChild(inp);
        controls.appendChild(row);
      }
      const potSel = el("select", { id: "qpot" });
      for (const p of ["free", "harmonic", "barrier", "well"]) {
        potSel.appendChild(el("option", { value: p, text: p }));
      }
      controls.appendChild(el("div", { className: "qrl-field" }, [el("label", { text: "V" }), potSel]));

      const runBtn = el("button", { type: "button", className: "primary", text: "RUN WAVE" });
      const status = el("div", { className: "qrl-status", text: "idle · engines load on first run" });
      const canvas = el("canvas", { width: 640, height: 180, className: "qrl-canvas" });
      const readout = el("pre", { className: "qrl-readout", text: "—" });

      runBtn.addEventListener("click", async () => {
        status.textContent = "running…";
        try {
          if (typeof require === "function") {
            const { quantumExperiment } = require("./experiment.js");
            const rec = quantumExperiment({
              packet: {
                x0: +inputs.qx0.value,
                k0: +inputs.qk0.value,
                sigma: +inputs.qsig.value,
              },
              potential: potSel.value,
              potentialArgs: potSel.value === "harmonic" ? [1] : potSel.value === "barrier" ? [5, 2, 0] : [],
              dt: +inputs.qdt.value,
              steps: +inputs.qsteps.value | 0,
              grid: { nPoints: 256, xMin: -25, xMax: 25 },
            });
            drawDensity(canvas, rec.datasets.probabilityDensity, rec.datasets.x);
            readout.textContent = JSON.stringify(rec.output_summary, null, 2);
            pushHistory(rec);
            status.textContent = "done · " + rec.experiment_id;
          } else {
            status.textContent = "Browser: load spectral modules or run via Node tests";
            readout.textContent = "Engines are pure JS modules. Prefer node --test spectral/spectral-tests.js for full validation.";
          }
        } catch (err) {
          status.textContent = "error: " + err.message;
        }
      });

      wrap.appendChild(controls);
      wrap.appendChild(runBtn);
      wrap.appendChild(status);
      wrap.appendChild(canvas);
      wrap.appendChild(readout);
      return wrap;
    }

    function buildRiemannPanel() {
      const wrap = el("div", { className: "qrl-panel" });
      const note = el("div", {
        className: "qrl-note",
        text: "Finite numerical zero detection is NOT a proof of RH. Candidates are numerical only.",
      });
      const controls = el("div", { className: "qrl-controls" });
      const tMin = el("input", { type: "number", value: 14, step: 1 });
      const tMax = el("input", { type: "number", value: 50, step: 1 });
      controls.appendChild(el("div", { className: "qrl-field" }, [el("label", { text: "t min" }), tMin]));
      controls.appendChild(el("div", { className: "qrl-field" }, [el("label", { text: "t max" }), tMax]));
      const runBtn = el("button", { type: "button", className: "primary", text: "SCAN ZEROS" });
      const status = el("div", { className: "qrl-status", text: "idle" });
      const readout = el("pre", { className: "qrl-readout", text: "—" });

      runBtn.addEventListener("click", () => {
        status.textContent = "scanning…";
        try {
          if (typeof require === "function") {
            const { riemannExperiment } = require("./experiment.js");
            const rec = riemannExperiment({
              tMin: +tMin.value,
              tMax: +tMax.value,
              step: 0.04,
              maxN: 3000,
            });
            readout.textContent = JSON.stringify({
              summary: rec.output_summary,
              validation: rec.validation,
              firstCandidates: (rec.datasets.candidates || []).slice(0, 8),
            }, null, 2);
            pushHistory(rec);
            status.textContent = "done · candidates=" + (rec.output_summary.candidateCount || 0);
          } else {
            status.textContent = "Run under Node for full numerical engines";
          }
        } catch (err) {
          status.textContent = "error: " + err.message;
        }
      });

      wrap.appendChild(note);
      wrap.appendChild(controls);
      wrap.appendChild(runBtn);
      wrap.appendChild(status);
      wrap.appendChild(readout);
      return wrap;
    }

    function buildCouplingPanel() {
      const wrap = el("div", { className: "qrl-panel" });
      wrap.appendChild(el("div", {
        className: "qrl-note",
        text: "Compares quantum measurements with zero spacing statistics. Relationships are hypotheses only.",
      }));
      const runBtn = el("button", { type: "button", className: "primary", text: "RUN COMPARISON" });
      const status = el("div", { className: "qrl-status", text: "idle" });
      const readout = el("pre", { className: "qrl-readout", text: "—" });
      runBtn.addEventListener("click", () => {
        status.textContent = "comparing…";
        try {
          if (typeof require === "function") {
            const { spectralComparisonExperiment } = require("./experiment.js");
            const rec = spectralComparisonExperiment(
              { packet: { x0: 0, k0: 0, sigma: 0.8 }, potential: "harmonic", potentialArgs: [1], dt: 0.03, steps: 60, grid: { nPoints: 128 } },
              { tMin: 14, tMax: 45, step: 0.05, maxN: 2500 }
            );
            readout.textContent = JSON.stringify(rec.output_summary, null, 2);
            pushHistory(rec);
            status.textContent = "done · " + rec.experiment_id;
          } else {
            status.textContent = "Node required for engines";
          }
        } catch (err) {
          status.textContent = "error: " + err.message;
        }
      });
      wrap.appendChild(runBtn);
      wrap.appendChild(status);
      wrap.appendChild(readout);
      return wrap;
    }

    const history = [];
    function pushHistory(rec) {
      history.unshift({ id: rec.experiment_id, type: rec.experiment_type, ts: rec.timestamp, summary: rec.output_summary });
      if (history.length > 30) history.pop();
    }

    function buildHistoryPanel() {
      const wrap = el("div", { className: "qrl-panel" });
      const list = el("pre", { className: "qrl-readout", text: "No experiments yet this session." });
      const refresh = el("button", {
        type: "button",
        text: "REFRESH",
        onClick: () => {
          list.textContent = history.length
            ? history.map(h => `${h.ts}  ${h.type}  ${h.id}\n  ${JSON.stringify(h.summary)}`).join("\n\n")
            : "No experiments yet this session.";
        },
      });
      wrap.appendChild(refresh);
      wrap.appendChild(list);
      return wrap;
    }

    function drawDensity(canvas, dens, x) {
      if (!dens || !canvas.getContext) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width, h = canvas.height;
      ctx.fillStyle = "#0a0e12";
      ctx.fillRect(0, 0, w, h);
      const max = Math.max(...dens, 1e-12);
      ctx.strokeStyle = "#5dffb0";
      ctx.beginPath();
      for (let i = 0; i < dens.length; i++) {
        const px = (i / (dens.length - 1)) * w;
        const py = h - (dens[i] / max) * (h - 8) - 4;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { mountQuantumRiemannLab };
  }
  if (typeof window !== "undefined") {
    window.mountQuantumRiemannLab = mountQuantumRiemannLab;
  }
})();
