import { jsonrepair } from 'jsonrepair';

const DEFAULT_BASE_URL = 'https://api.gptsapi.net/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export function normalizeBaseUrl(value) {
  return (value || DEFAULT_BASE_URL)
    .replace(/\/$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/messages$/, '');
}

export function getProviderMeta() {
  return {
    base_url: normalizeBaseUrl(process.env.GPTSAPI_BASE_URL),
    model: process.env.GPTSAPI_MODEL || DEFAULT_MODEL,
    configured: hasProviderConfig(),
  };
}

export function hasProviderConfig() {
  return Boolean(process.env.GPTSAPI_KEY || process.env.OPENAI_API_KEY);
}

export async function chatJson(messages, options = {}) {
  const apiKey = process.env.GPTSAPI_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('GPTSAPI_KEY is not configured');
  }

  const baseUrl = normalizeBaseUrl(process.env.GPTSAPI_BASE_URL);
  const model = process.env.GPTSAPI_MODEL || DEFAULT_MODEL;
  const maxTokens = Number(options.max_tokens || process.env.GPTSAPI_MAX_TOKENS || 2000);
  const timeoutMs = Number(options.timeout_ms || process.env.GPTSAPI_TIMEOUT_MS || 45000);
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: options.temperature ?? 0.2,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`GPTSAPI request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GPTSAPI request failed (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('GPTSAPI returned an empty message');
  }

  return parseJsonContent(content);
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
