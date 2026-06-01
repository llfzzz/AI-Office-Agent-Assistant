export type AiProviderMode = 'default' | 'custom';

export type AiProviderSettings = {
  mode: AiProviderMode;
  model: string;
  baseUrl: string;
  apiKey: string;
};

export const AI_PROVIDER_STORAGE_KEY = 'office-agent-gemini-provider-settings';
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_API_MODEL = 'gemini-3-flash-preview';

export const defaultAiProviderSettings: AiProviderSettings = {
  mode: 'default',
  model: GEMINI_API_MODEL,
  baseUrl: GEMINI_API_BASE_URL,
  apiKey: '',
};

export function normalizeAiProviderSettings(
  value: Partial<AiProviderSettings> | null | undefined,
): AiProviderSettings {
  const mode = value?.mode === 'custom' ? 'custom' : 'default';

  return {
    mode,
    model: mode === 'custom' ? value?.model?.trim() || '' : GEMINI_API_MODEL,
    baseUrl: mode === 'custom' ? value?.baseUrl?.trim() || '' : GEMINI_API_BASE_URL,
    apiKey: mode === 'custom' ? value?.apiKey || '' : '',
  };
}

export function getStoredAiProviderSettings() {
  try {
    const saved = localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
    const settings = normalizeAiProviderSettings(
      saved ? (JSON.parse(saved) as Partial<AiProviderSettings>) : null,
    );

    if (saved && settings.mode === 'default') {
      storeAiProviderSettings(settings);
    }

    return settings;
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
