import { getProviderMeta, hasProviderConfig, normalizeBaseUrl } from './gptsapi.js';

const SUPPORTED_AUDIO_TYPES = new Set([
  'audio/flac',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/mpga',
  'audio/m4a',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/webm',
  'application/octet-stream',
]);

function extensionFromType(mimeType) {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('flac')) return 'flac';
  if (mimeType.includes('m4a')) return 'm4a';
  return 'webm';
}

function safeDecodeFileName(value) {
  if (!value) return '';

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function transcribeAudio(buffer, meta = {}) {
  if (!hasProviderConfig()) {
    throw new Error('GPTSAPI_KEY or OPENAI_API_KEY is required for audio transcription');
  }

  if (!buffer?.byteLength) {
    throw new Error('audio file is required');
  }

  const mimeType = String(meta.mimeType || 'application/octet-stream').split(';')[0];
  if (!SUPPORTED_AUDIO_TYPES.has(mimeType)) {
    throw new Error(`unsupported audio type: ${mimeType}`);
  }

  const apiKey = process.env.GPTSAPI_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = normalizeBaseUrl(process.env.GPTSAPI_BASE_URL);
  const model = process.env.GPTSAPI_TRANSCRIBE_MODEL || process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
  const timeoutMs = Number(process.env.GPTSAPI_TRANSCRIBE_TIMEOUT_MS || 90000);
  const endpoint = `${baseUrl}/audio/transcriptions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fileName = safeDecodeFileName(meta.fileName) || `meeting-audio.${extensionFromType(mimeType)}`;
  const formData = new FormData();

  formData.set('model', model);
  formData.set('response_format', 'json');
  formData.set('file', new Blob([buffer], { type: mimeType }), fileName);

  if (meta.language) {
    formData.set('language', meta.language);
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`transcription request failed (${response.status}): ${detail}`);
    }

    const payload = await response.json();
    return {
      text: payload.text || '',
      model,
      provider: getProviderMeta(),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`transcription request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
