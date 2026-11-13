/**
 * Same-device acoustic SSTV loopback orchestrator.
 * Encode → speaker → air → microphone → decode (mic muted to destination).
 */
import { encodeImageToWav } from '../encoder/frame-encoder.js';
import { decodeAudio } from '../decoder/frame-decoder.js';
import { decodeWavPcm16 } from './wav-decoder.js';
import { encodeWavPcm16Mono } from './wav-encoder.js';
import { computeFidelityMetrics, differenceHeatmap } from '../dsp/metrics.js';
import { analyzeSignal, classifyCapture } from './signal-stats.js';

export function createAcousticLoopback(deps) {
  const { capture, playback } = deps;
  let cancelled = false;
  let running = false;
  let ac = null;

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const t = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function run(opts) {
    if (running) throw new Error('Acoustic loopback already running');
    running = true;
    cancelled = false;
    ac = new AbortController();
    const signal = ac.signal;
    const onStatus = opts.onStatus || (() => {});
    const preMs = opts.preMs ?? 400;
    const postMs = opts.postMs ?? 600;
    const modeId = opts.modeId;
    const normalized = opts.normalizedImage;

    try {
      onStatus('Encoding digital baseline…');
      const encoded = encodeImageToWav(normalized, modeId, {
        sampleRate: opts.sampleRateHint || 48000,
        fit: opts.fit || 'stretch',
      });
      const txSamples = decodeWavPcm16(encoded.wav).samples;
      const digitalDecoded = decodeAudio(encoded.wav, { modeHint: modeId });
      const digitalMetrics = computeFidelityMetrics(normalized, digitalDecoded.image, {
        requireExactDimensions: true,
      });

      onStatus('Requesting microphone…');
      let capStart;
      try {
        capStart = await capture.start({ sampleRateHint: encoded.sampleRate });
      } catch (e) {
        const msg = String(e?.message || e);
        if (/NotAllowed|Permission|denied/i.test(msg)) {
          const err = new Error('Microphone permission denied');
          err.code = 'permission_denied';
          throw err;
        }
        throw e;
      }
      const captureSampleRate = capStart?.sampleRate || encoded.sampleRate;

      onStatus('Recording pre-roll…');
      await sleep(preMs, signal);

      onStatus('Playing SSTV (speaker)…');
      const playDone = new Promise((resolve) => {
        playback.play(txSamples, encoded.sampleRate, {
          onEnded: () => resolve('ended'),
        }).catch(() => resolve('error'));
      });
      const durMs = (txSamples.length / encoded.sampleRate) * 1000;
      await Promise.race([playDone, sleep(durMs + 50, signal)]);
      try { playback.stop(); } catch (_) {}

      onStatus('Recording post-roll…');
      await sleep(postMs, signal);

      onStatus('Stopping capture…');
      const cap = capture.stop();
      const samples = cap.samples || new Float32Array(0);
      const actualSr = cap.sampleRate || captureSampleRate;
      const channelCount = cap.channelCount ?? 1;

      const stats = analyzeSignal(samples, {
        noiseFloorSamples: Math.round((preMs / 1000) * actualSr),
      });
      const minSamples = Math.round(0.5 * (txSamples.length * actualSr) / encoded.sampleRate);
      const classification = classifyCapture(stats, {
        minDurationSamples: Math.min(minSamples, Math.round(actualSr * 2)),
      });

      const capturedWav = samples.length ? encodeWavPcm16Mono(samples, actualSr) : null;

      let acousticDecoded = null;
      let acousticMetrics = null;
      let digitalVsAcoustic = null;
      let decodeStatus = 'skipped';

      if (!classification.ok && classification.reason !== 'low_level') {
        decodeStatus = classification.reason;
      } else if (samples.length) {
        try {
          acousticDecoded = decodeAudio(samples, { sampleRate: actualSr, modeHint: modeId });
          acousticMetrics = computeFidelityMetrics(normalized, acousticDecoded.image);
          digitalVsAcoustic = computeFidelityMetrics(digitalDecoded.image, acousticDecoded.image);
          decodeStatus = acousticDecoded.incomplete ? 'incomplete_frame' : 'decoded';
        } catch (e) {
          decodeStatus = 'decode_failed';
          classification.message = String(e?.message || e);
        }
      }

      return {
        ok: classification.ok || decodeStatus === 'decoded',
        cancelled: false,
        modeId,
        digital: {
          encoded,
          decoded: digitalDecoded,
          metrics: digitalMetrics,
          heatmap: differenceHeatmap(normalized, digitalDecoded.image, 4),
        },
        acoustic: {
          samples,
          sampleRate: actualSr,
          channelCount,
          durationMs: cap.durationMs ?? (samples.length / actualSr) * 1000,
          wav: capturedWav,
          stats,
          classification,
          decoded: acousticDecoded,
          metrics: acousticMetrics,
          heatmap: acousticDecoded && differenceHeatmap(normalized, acousticDecoded.image, 4),
          decodeStatus,
        },
        comparison: {
          digitalVsAcoustic,
          pathMaeDelta:
            acousticMetrics && digitalMetrics
              ? Math.abs(acousticMetrics.mae - digitalMetrics.mae)
              : null,
        },
        transmissionSampleRate: encoded.sampleRate,
        note:
          actualSr !== encoded.sampleRate
            ? `Capture sample rate ${actualSr} Hz differs from TX ${encoded.sampleRate} Hz (AudioContext)`
            : null,
      };
    } catch (e) {
      try { playback.stop(); } catch (_) {}
      try { capture.stop?.(); } catch (_) {}
      if (e?.name === 'AbortError' || cancelled) {
        return { ok: false, cancelled: true, error: 'cancelled' };
      }
      throw e;
    } finally {
      running = false;
      ac = null;
    }
  }

  function cancel() {
    cancelled = true;
    try { ac?.abort(); } catch (_) {}
    try { playback.stop(); } catch (_) {}
    try { capture.stop(); } catch (_) {}
  }

  function isRunning() {
    return running;
  }

  return { run, cancel, isRunning };
}
