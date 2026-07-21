import { jsonrepair } from 'jsonrepair';
import { ProxyAgent } from 'undici';
import { safeFetch } from './ssrfGuard.js';
import { logUpstreamError, providerHttpError, providerNetworkError } from './aiErrors.js';

const GEMINI_UPLOAD_BASE_URL = 'https://generativelanguage.googleapis.com/upload/v1beta';
const INLINE_FILE_LIMIT_BYTES = 18 * 1024 * 1024;
let proxyAgent;
let proxyAgentUrl = '';

function getProxyDispatcher() {
  const proxyUrl = String(process.env.AI_HTTPS_PROXY || '').trim();

  if (!proxyUrl) {
    return undefined;
  }

  if (!proxyAgent || proxyAgentUrl !== proxyUrl) {
    proxyAgent = new ProxyAgent(proxyUrl);
    proxyAgentUrl = proxyUrl;
  }

  return proxyAgent;
}

// All outbound AI provider requests go through the SSRF-hardened fetch
// (./ssrfGuard.js): unconditional URL validation, DNS resolution + per-address
// checks, connection pinning, redirect re-validation, and response caps. When
// an optional outbound proxy is configured it is used as the dispatcher (URL/DNS
// validation still runs; socket pinning is skipped for the proxy hop).
function outboundFetch(url, options, guard = {}) {
  return safeFetch(url, options, { dispatcher: getProxyDispatcher(), ...guard });
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

export function normalizeCustomBaseUrl(value) {
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
    apiKey: isCustom ? provider.api_key || '' : '',
    baseUrl: isCustom ? normalizeCustomBaseUrl(provider.base_url) : '',
    model: isCustom ? String(provider.model || '').trim() : '',
    // Which request adapter to use. Built-in providers pass api_mode via the
    // resolved config. There is intentionally no env/default provider.
    apiMode: isCustom ? (provider.api_mode === 'openai' ? 'openai' : 'gemini') : 'gemini',
    mode: isCustom ? 'custom' : 'none',
  };
}

export function getProviderMeta(provider = {}) {
  const config = resolveProviderConfig(provider);

  return {
    base_url: config.baseUrl,
    model: config.model,
    api_mode: config.apiMode,
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
    maxOutputTokens: Number(options.max_tokens || process.env.AI_MAX_OUTPUT_TOKENS || 2000),
  };

  if (isGemini3Model(provider.model)) {
    config.thinkingConfig = {
      thinkingLevel: String(options.thinking_level || process.env.AI_THINKING_LEVEL || 'low'),
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
    throw new Error('AI API key is not configured');
  }

  if (!provider.baseUrl) {
    throw new Error('AI base URL is not configured');
  }

  if (!provider.model) {
    throw new Error('AI model is not configured');
  }

  // Route OpenAI-compatible providers (DeepSeek, OpenAI, Anthropic-compat, and
  // custom "other" endpoints) through the chat/completions adapter.
  if (provider.apiMode === 'openai') {
    return generateOpenAiChat(contents, options, provider);
  }

  const timeoutMs = Number(options.timeout_ms || process.env.AI_TIMEOUT_MS || 90000);
  const retryAttempts = Number(options.retry_attempts || process.env.AI_RETRY_ATTEMPTS || 4);
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
      response = await outboundFetch(endpointFor(provider), {
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

      // SSRF blocks and already-sanitized errors are safe and non-retryable.
      if (error?.isSsrfBlock || error?.sanitized) {
        throw error;
      }

      if (attempt === retryAttempts) {
        logUpstreamError('network', String(error?.message || error), provider.apiKey);
        throw providerNetworkError();
      }

      await wait(Math.min(750 * (2 ** (attempt - 1)), 6000));
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await response.text();
      logUpstreamError(`http ${response.status}`, detail, provider.apiKey);

      if (!isRetryableStatus(response.status) || attempt === retryAttempts) {
        throw providerHttpError(response.status);
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

function openAiEndpoint(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
}

export const OPENAI_MULTIMODAL_ERROR =
  '当前 AI 配置使用 OpenAI 兼容接口，不支持音频转写和图片提取；请改用 Gemini 兼容配置。';

function multimodalNotSupportedError() {
  const error = new Error(OPENAI_MULTIMODAL_ERROR);
  error.status = 400;
  return error;
}

// Flatten Gemini-style contents (+ system instruction) into OpenAI chat messages.
// File/image parts are Gemini-only: dropping them silently would make the model
// invent a "transcription", so they are rejected with a clear error instead.
function geminiContentsToOpenAiMessages(contents, options) {
  const messages = [];

  if (options.system_instruction) {
    messages.push({ role: 'system', content: String(options.system_instruction) });
  }

  for (const content of contents || []) {
    const role = content?.role === 'model' ? 'assistant' : 'user';
    const parts = content?.parts || [];

    if (parts.some((part) => part && (part.inline_data || part.file_data))) {
      throw multimodalNotSupportedError();
    }

    const text = parts
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();

    if (text) {
      messages.push({ role, content: text });
    }
  }

  if (!messages.some((message) => message.role !== 'system')) {
    messages.push({ role: 'user', content: '请根据系统指令生成结果。' });
  }

  return messages;
}

// OpenAI reasoning-family models (gpt-5*, o1/o3/o4…) reject `max_tokens` and
// non-default `temperature` on chat/completions; they require
// `max_completion_tokens` and run at the default temperature. Other
// OpenAI-compatible providers (DeepSeek, Anthropic-compat, self-hosted) keep
// the classic parameters.
export function isOpenAiReasoningModel(model) {
  return /^(?:gpt-5|o\d)(?:$|[.-])/i.test(String(model || '').trim());
}

/** Build the chat/completions request body. Exported for unit testing. */
export function buildOpenAiRequestBody(contents, options, provider) {
  const maxTokens = Number(options.max_tokens || process.env.AI_MAX_OUTPUT_TOKENS || 2000);
  const body = {
    model: provider.model,
    messages: geminiContentsToOpenAiMessages(contents, options),
  };

  if (isOpenAiReasoningModel(provider.model)) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;

    if (typeof options.temperature === 'number') {
      body.temperature = options.temperature;
    }
  }

  return body;
}

function extractOpenAiText(payload) {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  let text = '';

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  }

  text = String(text || '').trim();

  if (text) {
    return text;
  }

  const finishReason = choice?.finish_reason;
  throw new Error(`AI API returned an empty response${finishReason ? `; finish_reason=${finishReason}` : ''}`);
}

// OpenAI-compatible chat/completions adapter (DeepSeek, OpenAI, Anthropic-compat,
// and custom "other" openai-mode endpoints). Uses Authorization: Bearer.
async function generateOpenAiChat(contents, options, provider) {
  const timeoutMs = Number(options.timeout_ms || process.env.AI_TIMEOUT_MS || 90000);
  const retryAttempts = Number(options.retry_attempts || process.env.AI_RETRY_ATTEMPTS || 4);
  const body = buildOpenAiRequestBody(contents, options, provider);
  const endpoint = openAiEndpoint(provider.baseUrl);

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;

    try {
      response = await outboundFetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`AI request timed out after ${timeoutMs}ms`, { cause: error });
      }

      // SSRF blocks and already-sanitized errors are safe and non-retryable.
      if (error?.isSsrfBlock || error?.sanitized) {
        throw error;
      }

      if (attempt === retryAttempts) {
        logUpstreamError('network', String(error?.message || error), provider.apiKey);
        throw providerNetworkError();
      }

      await wait(Math.min(750 * (2 ** (attempt - 1)), 6000));
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await response.text();
      logUpstreamError(`http ${response.status}`, detail, provider.apiKey);

      if (!isRetryableStatus(response.status) || attempt === retryAttempts) {
        throw providerHttpError(response.status);
      }

      await wait(retryDelayMs(response, attempt));
      continue;
    }

    const payload = await response.json();

    return {
      text: extractOpenAiText(payload),
      payload,
      provider: {
        base_url: provider.baseUrl,
        model: provider.model,
        configured: true,
      },
      model: provider.model,
    };
  }

  throw new Error('AI API request failed after retry attempts');
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

  if (resolveProviderConfig(options.provider || {}).apiMode === 'openai') {
    throw multimodalNotSupportedError();
  }

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
    throw new Error('AI API key is not configured');
  }

  const timeoutMs = Number(options.upload_timeout_ms || process.env.AI_UPLOAD_TIMEOUT_MS || 120000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const mimeType = String(meta.mimeType || 'application/octet-stream').split(';')[0].toLowerCase();
  const displayName = String(meta.fileName || meta.displayName || 'meeting-file').slice(0, 120);

  try {
    const uploadBaseUrl = process.env.AI_GEMINI_UPLOAD_BASE_URL || GEMINI_UPLOAD_BASE_URL;
    const startResponse = await outboundFetch(`${uploadBaseUrl}/files`, {
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
      logUpstreamError(`upload-init http ${startResponse.status}`, detail, provider.apiKey);
      throw providerHttpError(startResponse.status);
    }

    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      throw new Error('Gemini file upload did not return an upload URL');
    }

    const uploadResponse = await outboundFetch(uploadUrl, {
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
      logUpstreamError(`upload http ${uploadResponse.status}`, detail, provider.apiKey);
      throw providerHttpError(uploadResponse.status);
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
