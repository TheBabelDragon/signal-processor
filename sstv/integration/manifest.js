/** Mirror of BabelCodec media job contract v1 (no runtime dependency). */

export const CONTRACT_VERSION = 1;

const OPS = new Set([
  'image_to_sstv',
  'sstv_to_image',
  'image_handoff',
  'audio_handoff',
  'reconstructed_image',
]);
const MODES = new Set(['martin_m1', 'robot36', 'unknown']);

export function validateMediaJobManifest(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  if (raw.contract_version !== CONTRACT_VERSION) errors.push('unsupported contract_version');
  if (typeof raw.job_id !== 'string' || !raw.job_id) errors.push('job_id required');
  if (typeof raw.created_at !== 'string') errors.push('created_at required');
  if (raw.source_application !== 'BabelCodec' && raw.source_application !== 'signal-processor') {
    errors.push('invalid source_application');
  }
  if (!OPS.has(raw.operation)) errors.push('unsupported operation');
  if (!raw.asset?.filename || !raw.asset?.mime_type) errors.push('asset.filename and mime_type required');
  if (raw.sstv?.mode && !MODES.has(raw.sstv.mode)) errors.push('unsupported sstv.mode');
  if (raw.audio?.encoding && raw.audio.encoding !== 'pcm_s16le') errors.push('audio.encoding must be pcm_s16le');
  if (errors.length) return { ok: false, errors };
  return { ok: true, manifest: JSON.parse(JSON.stringify(raw)) };
}
