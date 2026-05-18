export type AiProviderMode = 'default' | 'custom';

export type AiProviderSettings = {
  mode: AiProviderMode;
  model: string;
  baseUrl: string;
  apiKey: string;
};

export const AI_PROVIDER_STORAGE_KEY = 'office-agent-ai-provider-settings';
export const DEFAULT_GPTSAPI_BASE_URL = 'https://api.gptsapi.net/v1';
export const DEFAULT_GPTSAPI_MODEL = 'gemini-3-flash-preview';

export const GPTSAPI_CHAT_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-6-thinking',
  'claude-haiku-4-5-20251001',
  'gpt-5.5',
  'gpt-5.4-pro',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'grok-4.3',
  'gemini-2.5-flash',
  'grok-code-fast-1',
  'grok-4.20-multi-agent-beta-0309',
  'gemini-2.5-flash-lite',
  'grok-4.20-beta-0309-non-reasoning',
  'grok-4.20-beta-0309-reasoning',
  'gemini-2.5-flash-nothinking',
  'grok-4-1-fast-non-reasoning',
];

export const defaultAiProviderSettings: AiProviderSettings = {
  mode: 'default',
  model: DEFAULT_GPTSAPI_MODEL,
  baseUrl: DEFAULT_GPTSAPI_BASE_URL,
  apiKey: '',
};

export function normalizeAiProviderSettings(
  value: Partial<AiProviderSettings> | null | undefined,
): AiProviderSettings {
  return {
    ...defaultAiProviderSettings,
    ...value,
    mode: value?.mode === 'custom' ? 'custom' : 'default',
    model: value?.model?.trim() || defaultAiProviderSettings.model,
    baseUrl:
      value?.mode === 'custom'
        ? value?.baseUrl?.trim() || ''
        : DEFAULT_GPTSAPI_BASE_URL,
    apiKey: value?.mode === 'custom' ? value?.apiKey || '' : '',
  };
}

export function getStoredAiProviderSettings() {
  try {
    const saved = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    return normalizeAiProviderSettings(
      saved ? (JSON.parse(saved) as Partial<AiProviderSettings>) : null,
    );
  } catch {
    return defaultAiProviderSettings;
  }
}

export function hasStoredAiProviderSettings() {
  try {
    return Boolean(localStorage.getItem(AI_PROVIDER_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function storeAiProviderSettings(settings: AiProviderSettings) {
  localStorage.setItem(
    AI_PROVIDER_STORAGE_KEY,
    JSON.stringify(normalizeAiProviderSettings(settings)),
  );
}

export function aiProviderIsLocallyConfigured(settings: AiProviderSettings) {
  if (settings.mode === 'default') {
    return true;
  }

  return Boolean(
    settings.baseUrl.trim() &&
      settings.apiKey.trim() &&
      settings.model.trim(),
  );
}
