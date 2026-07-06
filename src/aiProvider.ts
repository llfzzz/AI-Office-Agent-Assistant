// AI provider configuration is stored per-user in the database (encrypted at
// rest) and resolved server-side. The frontend only ever handles masked,
// non-secret projections — raw API keys are sent once on save and never
// returned, stored in localStorage, or logged.

export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_API_MODEL = 'gemini-3-flash-preview';

export type AiValidationStatus = 'unknown' | 'valid' | 'invalid' | 'unreachable';
export type AiApiMode = 'openai' | 'gemini';

/** Masked config as returned by the server. Never contains the API key. */
export type AiConfig = {
  id: string;
  label: string;
  provider: string;
  api_mode: AiApiMode;
  base_url: string;
  model: string;
  /** Masked hint only, e.g. "sk-****abcd". */
  api_key_hint: string;
  is_default: boolean;
  last_validation_status: AiValidationStatus;
  last_validation_message: string;
  last_validated_at: string;
  created_at: string;
  updated_at: string;
};

/** Payload for creating/updating a config. `api_key` is write-only. */
export type AiConfigInput = {
  label?: string;
  provider?: string;
  api_mode?: AiApiMode;
  base_url?: string;
  model?: string;
  api_key?: string;
  is_default?: boolean;
};

// --- Provider catalog (built-in presets, from the backend) ----------------
export type AiProviderModel = {
  id: string;
  label: string;
  group?: string;
  hint?: string;
};

export type AiProviderPreset = {
  id: string;
  label: string;
  apiMode: AiApiMode;
  baseUrl: string;
  editableBaseUrl: boolean;
  compatNote: string;
  defaultModel: string;
  models: AiProviderModel[];
  apiModeOptions?: string[];
};

export type AiProviderCatalog = {
  version: string;
  providers: AiProviderPreset[];
};

export const modelGroupLabels: Record<string, string> = {
  recommended: '推荐',
  fast: '快速 / 低成本',
  reasoning: '推理',
  legacy: '兼容 / 旧版',
};

export const validationStatusLabels: Record<AiValidationStatus, string> = {
  unknown: '未验证',
  valid: '验证通过',
  invalid: '验证失败',
  unreachable: '无法连接',
};
