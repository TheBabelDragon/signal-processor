"use strict";

(function () {
  if (typeof PRESETS === "object") {
    PRESETS.isochronic_4tone = {
      mode: "isochronic4",
      carrier_hz: 180.0,
      carriers: [180, 225, 270, 360],
      pulse_hz: 10.0,
      depth: 1.0,
      duty: 0.5,
      shape: "smooth_pulse",
      tone_db: -18.0,
      music_db: 0.0,
    };
    if (typeof renderPresetChips === "function") renderPresetChips();
  }

  if (typeof readRecipeFromUI === "function") {
    const inner = readRecipeFromUI;
    readRecipeFromUI = function () {
      const r = inner();
      const a = document.getElementById("toneA");
      if (a) {
        r.carriers = [
          parseFloat(document.getElementById("toneA").value) || 180,
          parseFloat(document.getElementById("toneB").value) || 225,
          parseFloat(document.getElementById("toneC").value) || 270,
          parseFloat(document.getElementById("toneD").value) || 360,
        ];
      }
      return r;
    };
  }

  if (typeof applyRecipeToUI === "function") {
    const innerApply = applyRecipeToUI;
    applyRecipeToUI = function (p) {
      innerApply(p);
      const stack = (p && p.carriers) || [180, 225, 270, 360];
      ["toneA", "toneB", "toneC", "toneD"].forEach(function (id, i) {
        const n = document.getElementById(id);
        if (n && stack[i] != null) n.value = stack[i];
      });
      const lab = document.getElementById("fourToneVal");
      if (lab) lab.textContent = stack.map(function (x) { return Number(x).toFixed(0); }).join(" \u00b7 ");
    };
  }

  if (typeof updateModeVisibility === "function") {
    const innerVis = updateModeVisibility;
    updateModeVisibility = function (mode) {
      innerVis(mode);
      const four = document.getElementById("fourToneField");
      if (four) four.style.display = mode === "isochronic4" ? "block" : "none";
      if (mode === "isochronic4") {
        ["shapeField", "dutyField", "attackField", "releaseField", "depthField"].forEach(function (id) {
          const n = document.getElementById(id);
          if (n) n.style.display = "flex";
        });
      }
    };
  }

  ["toneA", "toneB", "toneC", "toneD"].forEach(function (id) {
    const n = document.getElementById(id);
    if (!n) return;
    n.addEventListener("input", function () {
      const lab = document.getElementById("fourToneVal");
      if (!lab) return;
      lab.textContent = ["toneA", "toneB", "toneC", "toneD"].map(function (k) {
        return document.getElementById(k).value;
      }).join(" \u00b7 ");
    });
  });
})();
