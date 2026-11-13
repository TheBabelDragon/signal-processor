export { MODES, getMode, listModes, modeByVis, listEncodableModes, listDecodableModes, MARTIN_M1, ROBOT_36 } from './modes/mode-registry.js';
export { FREQ, valueToFreq } from './modes/mode-definitions.js';
export { buildVisHeader, visParityBit } from './encoder/vis.js';
export { encodeMartinM1 } from './encoder/martin-m1.js';
export { encodeRobot36, rgbToRobot, robotToRgb } from './encoder/robot36.js';
export { encodeImageToWav } from './encoder/frame-encoder.js';
export { encodeWavPcm16Mono } from './audio/wav-encoder.js';
export { decodeWavPcm16 } from './audio/wav-decoder.js';
export { createPlayback } from './audio/playback.js';
export { createCapture } from './audio/capture.js';
export {
  normalizeImage,
  solidImage,
  colorBarsImage,
  gradientImage,
  checkerboardImage,
  channelImage,
} from './encoder/image-normalizer.js';
export { decodeAudio } from './decoder/frame-decoder.js';
export { decodeMartinM1 } from './decoder/martin-m1-decoder.js';
export { decodeRobot36 } from './decoder/robot36-decoder.js';
export { detectVis } from './decoder/vis-decoder.js';
export { validateMediaJobManifest, CONTRACT_VERSION } from './integration/manifest.js';
export {
  msToSamples,
  pixelBoundaries,
  assertPixelSum,
  buildLinePlan,
  synthesizeScanFromBounds,
  synthesizeToneSamples,
} from './dsp/sample-timing.js';
export {
  demodulateFM,
  demodulateToValues,
  samplePixels,
  freqToValueTrack,
  measureDemodDelay,
  recommendedPostFilterHz,
  onePoleLagSamples,
} from './dsp/fm-demod.js';
export { computeFidelityMetrics, differenceHeatmap } from './dsp/metrics.js';
