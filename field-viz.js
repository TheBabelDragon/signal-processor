"use strict";

/**
 * SIGNAL · FIELD visualizer
 * Always visible. Demo-animates when no live Echo packet;
 * snaps to real FieldObservation when nf.field.live is true.
 */
(function () {
  const state = {
    raf: 0,
    t0: performance.now(),
    particles: [],
    lastLive: 0,
  };

  function ensureParticles(n) {
    while (state.particles.length < n) {
      state.particles.push({
        a: Math.random() * Math.PI * 2,
        r: 0.25 + Math.random() * 0.55,
        s: 0.2 + Math.random() * 1.2,
        sz: 1 + Math.random() * 2.5,
        hue: Math.random(),
      });
    }
  }

  function fieldSnapshot() {
    const f = (window.nf && nf.field) || {};
    const live = !!f.live && (performance.now() - (state.lastLive || 0) < 2500);
    if (f.live) state.lastLive = performance.now();

    if (live) {
      return {
        motion: clamp01(f.motion),
        drive: clamp01(f.drive),
        entropy: clamp01(f.entropy),
        fuse: clamp01(f.fuse),
        reward: clamp01(typeof nf !== 'undefined' ? nf.reward : 0.5),
        isolated: f.isolated !== false,
        health: f.health || 'ok',
        phase: f.phase || 'hold',
        live: true,
        demo: false,
      };
    }

    // Idle / demo breathe so Pages always shows the layer
    const t = (performance.now() - state.t0) / 1000;
    const motion = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.7));
    const drive = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.45 + 1));
    const entropy = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.1 + 2));
    const fuse = 0.55 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.35));
    const reward =
      typeof nf !== 'undefined' && nf.running
        ? clamp01(nf.reward)
        : 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.55));
    return {
      motion, drive, entropy, fuse, reward,
      isolated: true,
      health: 'demo',
      phase: 'hold',
      live: false,
      demo: true,
    };
  }

  function clamp01(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  function resizeCanvas(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 440;
    const cssH = canvas.clientHeight || 220;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr, cssW, cssH };
  }

  function draw() {
    state.raf = requestAnimationFrame(draw);
    const canvas = document.getElementById('fieldViz');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = resizeCanvas(canvas);
    const snap = fieldSnapshot();
    const cx = w * 0.38;
    const cy = h * 0.5;
    const R = Math.min(w, h) * 0.38;
    const t = (performance.now() - state.t0) / 1000;

    // background
    ctx.fillStyle = '#0a100e';
    ctx.fillRect(0, 0, w, h);

    // subtle grid
    ctx.strokeStyle = 'rgba(125,255,178,0.04)';
    ctx.lineWidth = 1;
    const step = Math.max(16, Math.floor(R * 0.22));
    for (let x = 0; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // orbital rings
    const rings = [
      { k: snap.motion, c: '#ff6b6b', label: 'motion' },
      { k: snap.drive, c: '#ffb454', label: 'drive' },
      { k: snap.entropy, c: '#7dffb2', label: 'entropy' },
      { k: snap.fuse, c: '#5b9cff', label: 'fuse' },
    ];
    for (let i = 0; i < rings.length; i++) {
      const rr = R * (0.35 + i * 0.18);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = rings[i].c + '33';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // arc fill proportional to value
      const span = Math.PI * 1.6 * rings[i].k;
      const start = -Math.PI / 2 + t * (0.15 + i * 0.05);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, start, start + span);
      ctx.strokeStyle = rings[i].c;
      ctx.lineWidth = 3 + rings[i].k * 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // reward core
    const coreR = R * (0.12 + snap.reward * 0.14);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
    const coreCol = snap.isolated ? '#7dffb2' : '#ff6b6b';
    g.addColorStop(0, coreCol);
    g.addColorStop(0.45, coreCol + '55');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = coreCol;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    // particles
    ensureParticles(48);
    for (let i = 0; i < state.particles.length; i++) {
      const p = state.particles[i];
      p.a += 0.004 * p.s * (0.5 + snap.entropy);
      const jitter = snap.motion * 0.08 * Math.sin(t * 3 + i);
      const pr = R * (p.r + jitter) * (0.7 + snap.fuse * 0.5);
      const x = cx + Math.cos(p.a) * pr;
      const y = cy + Math.sin(p.a) * pr;
      const col = rings[i % 4].c;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.35 + snap.reward * 0.45;
      ctx.beginPath();
      ctx.arc(x, y, p.sz * (1 + snap.drive), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // right-side bar meters
    const barX = w * 0.68;
    const barW = w * 0.26;
    const barH = h * 0.12;
    const gap = h * 0.04;
    const startY = h * 0.14;
    ctx.font = Math.round(h * 0.055) + 'px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < rings.length; i++) {
      const y = startY + i * (barH + gap);
      const v = rings[i].k;
      ctx.fillStyle = '#1a2420';
      ctx.fillRect(barX, y, barW, barH);
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, rings[i].c + '88');
      grad.addColorStop(1, rings[i].c);
      ctx.fillStyle = grad;
      ctx.fillRect(barX, y, barW * v, barH);
      ctx.fillStyle = '#a8c4b6';
      ctx.fillText(rings[i].label + ' ' + Math.round(v * 100), barX, y - 4);
    }

    // reward readout
    ctx.fillStyle = '#7dffb2';
    ctx.font = 'bold ' + Math.round(h * 0.09) + 'px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(snap.reward * 100) + '%', cx, cy + coreR * 0.35);
    ctx.font = Math.round(h * 0.05) + 'px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#7f9a8e';
    ctx.fillText('reward', cx, cy + coreR + h * 0.07);

    // mode badge
    ctx.textAlign = 'left';
    ctx.font = Math.round(h * 0.05) + 'px ui-monospace, Menlo, monospace';
    if (snap.demo) {
      ctx.fillStyle = '#ffb454';
      ctx.fillText('FIELD · DEMO', 12, h - 12);
    } else {
      ctx.fillStyle = '#7dffb2';
      ctx.fillText('FIELD · LIVE · ' + (snap.phase || 'hold'), 12, h - 12);
    }

    // sync small neuro canvas if present
    const small = document.getElementById('echoFieldMeter');
    if (small) drawSmallBars(small, snap);

    // badges
    const healthEl = document.getElementById('echoHealth');
    if (healthEl) {
      healthEl.textContent = 'health ' + (snap.health || '—');
      healthEl.className = 'echo-badge' + (snap.demo ? ' warn' : snap.health === 'ok' ? ' ok' : ' warn');
    }
    const phaseEl = document.getElementById('echoPhase');
    if (phaseEl) {
      phaseEl.textContent = 'phase ' + (snap.phase || '—');
      phaseEl.className = 'echo-badge' + (snap.phase === 'hold' ? ' ok' : ' warn');
    }
    const isoEl = document.getElementById('echoIsolated');
    if (isoEl) {
      isoEl.textContent = snap.isolated ? 'iso ✓' : 'iso ✗';
      isoEl.className = 'echo-badge' + (snap.isolated ? ' ok' : ' err');
    }
    const srcEl = document.getElementById('echoSource');
    if (srcEl) {
      srcEl.textContent = snap.demo ? 'src demo' : 'src field';
      srcEl.className = 'echo-badge dim';
    }
    const panel = document.getElementById('echoViz');
    if (panel) {
      panel.classList.toggle('live', snap.live && snap.isolated);
      panel.classList.toggle('fault', snap.live && !snap.isolated);
      panel.classList.toggle('demo', snap.demo);
    }
  }

  function drawSmallBars(canvas, snap) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const keys = ['motion', 'drive', 'entropy', 'fuse'];
    const colors = ['#ff6b6b', '#ffb454', '#7dffb2', '#5b9cff'];
    const n = 4;
    const gap = 10;
    const barW = (w - gap * (n + 1)) / n;
    const maxH = h - 10;
    ctx.fillStyle = '#0f1613';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const v = snap[keys[i]];
      const x = gap + i * (barW + gap);
      const bh = Math.max(2, v * maxH);
      ctx.fillStyle = '#1a2420';
      ctx.fillRect(x, 5, barW, maxH);
      ctx.fillStyle = colors[i];
      ctx.fillRect(x, 5 + maxH - bh, barW, bh);
    }
  }

  function start() {
    if (state.raf) cancelAnimationFrame(state.raf);
    // unhide neuro panel always
    const panel = document.getElementById('echoViz');
    if (panel) panel.hidden = false;
    draw();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.SignalFieldViz = {
    start: start,
    snapshot: fieldSnapshot,
  };
})();
