import { jsonrepair } from 'jsonrepair';
import { ProxyAgent } from 'undici';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UPLOAD_BASE_URL = 'https://generativelanguage.googleapis.com/upload/v1beta';
const GEMINI_MODEL = 'gemini-3-flash-preview';
const INLINE_FILE_LIMIT_BYTES = 18 * 1024 * 1024;
let proxyAgent;
let proxyAgentUrl = '';

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function getGeminiDispatcher() {
  const proxyUrl = String(process.env.GEMINI_HTTPS_PROXY || '').trim();

  if (!proxyUrl) {
    return undefined;
  }

  if (!proxyAgent || proxyAgentUrl !== proxyUrl) {
    proxyAgent = new ProxyAgent(proxyUrl);
    proxyAgentUrl = proxyUrl;
  }

  return proxyAgent;
}

function fetchGemini(url, options) {
  const dispatcher = getGeminiDispatcher();
  return fetch(url, dispatcher ? { ...options, dispatcher } : options);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(response, attempt) {
  const retryAfter = Number(response.headers.get('retry-after'));

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  return Math.min(750 * (2 ** (attempt - 1)), 6000);
}

export function normalizeBaseUrl(value) {
  return String(value || GEMINI_BASE_URL)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/models\/[^/]+:(?:streamGenerateContent|generateContent)$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/messages$/i, '') || GEMINI_BASE_URL;
}

function normalizeCustomBaseUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/models\/[^/]+:(?:streamGenerateContent|generateContent)$/i, '')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/messages$/i, '');
}

function resolveProviderConfig(provider = {}) {
  const isCustom = provider.mode === 'custom' &&
    Boolean(provider.api_key && provider.base_url && provider.model);

  return {
    apiKey: isCustom
      ? provider.api_key || ''
      : provider.api_key || getGeminiApiKey(),
    baseUrl: isCustom
      ? normalizeCustomBaseUrl(provider.base_url)
      : normalizeBaseUrl(process.env.GEMINI_BASE_URL || GEMINI_BASE_URL),
    model: isCustom
      ? String(provider.model || '').trim()
      : String(process.env.GEMINI_MODEL || GEMINI_MODEL).trim(),
    mode: isCustom ? 'custom' : 'default',
  };
}

export function getProviderMeta(provider = {}) {
  const config = resolveProviderConfig(provider);

  return {
    base_url: config.baseUrl,
    model: config.model,
    configured: Boolean(config.apiKey),
  };
}

export function hasProviderConfig(provider = {}) {
  const config = resolveProviderConfig(provider);
  return Boolean(config.apiKey && config.baseUrl && config.model);
}

function endpointFor(config) {
  const modelPath = config.model.startsWith('models/') ? config.model : `models/${config.model}`;
  return `${config.baseUrl.replace(/\/+$/, '')}/${modelPath}:generateContent`;
}

function contentToText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.text) return part.text;
        return JSON.stringify(part);
      })
      .join('\n');
  }

  return String(content ?? '');
}

function messagesToGeminiRequest(messages = []) {
  const systemText = messages
    .filter((message) => message?.role === 'system')
    .map((message) => contentToText(message.content).trim())
    .filter(Boolean)
    .join('\n\n');
  const contents = messages
    .filter((message) => message?.role !== 'system')
    .map((message) => ({
      role: message?.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: contentToText(message?.content).trim() }],
    }))
    .filter((content) => content.parts[0].text);

  if (!contents.length) {
    contents.push({
      role: 'user',
      parts: [{ text: '请根据系统指令生成结果。' }],
    });
  }

  return {
    contents,
    systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
  };
}

function extractResponseText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part?.text || '').join('').trim();

  if (text) {
    return text;
  }

  const blockReason = payload?.promptFeedback?.blockReason;
  const finishReason = payload?.candidates?.[0]?.finishReason;
  throw new Error(
    `Gemini API returned an empty response${blockReason ? `; blockReason=${blockReason}` : ''}${finishReason ? `; finishReason=${finishReason}` : ''}`,
  );
}

function isGemini3Model(model) {
  return /^gemini-3(?:\.|\b|-)/i.test(model || '');
}

function generationConfig(options = {}, provider = {}) {
  const config = {
    maxOutputTokens: Number(options.max_tokens || process.env.GEMINI_MAX_OUTPUT_TOKENS || 2000),
  };

  if (isGemini3Model(provider.model)) {
    config.thinkingConfig = {
      thinkingLevel: String(options.thinking_level || process.env.GEMINI_THINKING_LEVEL || 'low'),
    };
  } else {
    config.temperature = options.temperature ?? 0.2;
  }

  if (options.response_mime_type) {
    config.responseMimeType = options.response_mime_type;
  }

  return config;
}

export async function generateContent(contents, options = {}) {
  const provider = resolveProviderConfig(options.provider || {});

  if (!provider.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  if (!provider.baseUrl) {
    throw new Error('AI base URL is not configured');
  }

  if (!provider.model) {
    throw new Error('AI model is not configured');
  }

  const timeoutMs = Number(options.timeout_ms || process.env.GEMINI_TIMEOUT_MS || 90000);
  const retryAttempts = Number(options.retry_attempts || process.env.GEMINI_RETRY_ATTEMPTS || 4);
  const body = {
    contents,
    generationConfig: generationConfig(options, provider),
  };

  if (options.system_instruction) {
    body.systemInstruction = { parts: [{ text: String(options.system_instruction) }] };
  }

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;

    try {
      response = await fetchGemini(endpointFor(provider), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': provider.apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Gemini API request timed out after ${timeoutMs}ms`, { cause: error });
      }

      if (attempt === retryAttempts) {
        throw error;
      }

      await wait(Math.min(750 * (2 ** (attempt - 1)), 6000));
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await response.text();

      if (!isRetryableStatus(response.status) || attempt === retryAttempts) {
        throw new Error(`Gemini API request failed (${response.status}): ${detail}`);
      }

      await wait(retryDelayMs(response, attempt));
      continue;
    }

    const payload = await response.json();

    return {
      text: extractResponseText(payload),
      payload,
      provider: {
        base_url: provider.baseUrl,
        model: provider.model,
        configured: true,
      },
      model: provider.model,
    };
  }

  throw new Error('Gemini API request failed after retry attempts');
}

export async function chatJson(messages, options = {}) {
  const request = messagesToGeminiRequest(messages);
  const result = await generateContent(request.contents, {
    ...options,
    response_mime_type: 'application/json',
    system_instruction: request.systemInstruction?.parts?.[0]?.text,
  });

  return parseJsonContent(result.text);
}

export async function filePartFromBuffer(buffer, meta = {}, options = {}) {
  const mimeType = String(meta.mimeType || 'application/octet-stream').split(';')[0].toLowerCase();

  if (buffer.byteLength <= INLINE_FILE_LIMIT_BYTES) {
    return {
      inline_data: {
        mime_type: mimeType,
        data: buffer.toString('base64'),
      },
    };
  }

  const provider = resolveProviderConfig(options.provider || {});
  const file = await uploadGeminiFile(buffer, { ...meta, mimeType }, provider, options);

  return {
    file_data: {
      mime_type: file.mimeType || mimeType,
      file_uri: file.uri,
    },
  };
}

async function uploadGeminiFile(buffer, meta, provider, options = {}) {
  if (!provider.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const timeoutMs = Number(options.upload_timeout_ms || process.env.GEMINI_UPLOAD_TIMEOUT_MS || 120000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const mimeType = String(meta.mimeType || 'application/octet-stream').split(';')[0].toLowerCase();
  const displayName = String(meta.fileName || meta.displayName || 'meeting-file').slice(0, 120);

  try {
    const startResponse = await fetchGemini(`${process.env.GEMINI_UPLOAD_BASE_URL || GEMINI_UPLOAD_BASE_URL}/files`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': provider.apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buffer.byteLength),
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: JSON.stringify({
        file: {
          display_name: displayName,
        },
      }),
    });

    if (!startResponse.ok) {
      const detail = await startResponse.text();
      throw new Error(`Gemini file upload init failed (${startResponse.status}): ${detail}`);
    }

    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      throw new Error('Gemini file upload did not return an upload URL');
    }

    const uploadResponse = await fetchGemini(uploadUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Length': String(buffer.byteLength),
        'Content-Type': mimeType,
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const detail = await uploadResponse.text();
      throw new Error(`Gemini file upload failed (${uploadResponse.status}): ${detail}`);
    }

    const payload = await uploadResponse.json();
    const file = payload?.file || payload;
    const uri = file?.uri;

    if (!uri) {
      throw new Error('Gemini file upload returned no file uri');
    }

    return {
      uri,
      mimeType: file.mimeType || file.mime_type || mimeType,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Gemini file upload timed out after ${timeoutMs}ms`, { cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseJsonContent(content) {
  const clean = String(content)
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');

    if (start >= 0 && end > start) {
      const candidate = clean.slice(start, end + 1);

      try {
        return JSON.parse(candidate);
      } catch {
        return JSON.parse(jsonrepair(candidate));
      }
    }

    return JSON.parse(jsonrepair(clean));
  }
}
