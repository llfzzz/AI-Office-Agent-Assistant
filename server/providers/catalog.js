// Versioned provider catalog — the single source of truth for built-in AI
// providers: official base URLs, API compatibility mode, and curated models.
//
// Sourced from official documentation (verified 2026-07):
//   DeepSeek   https://api-docs.deepseek.com/                 (OpenAI-compatible)
//   OpenAI     https://developers.openai.com/api/docs/models  (native OpenAI)
//   Anthropic  https://docs.anthropic.com/en/api/openai-sdk   (OpenAI-compat endpoint)
//   Gemini     https://ai.google.dev/gemini-api/docs/models   (native Gemini API)
//
// apiMode drives which request adapter is used:
//   'gemini' → native Gemini generateContent (X-goog-api-key)
//   'openai' → OpenAI-style POST {base}/chat/completions (Authorization: Bearer)
// Bump CATALOG_VERSION whenever presets/models change so clients can cache-bust.

export const CATALOG_VERSION = '2026-07-01';

export const PROVIDER_CATALOG = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiMode: 'openai',
    baseUrl: 'https://api.deepseek.com',
    editableBaseUrl: false,
    compatNote: 'DeepSeek 官方 OpenAI 兼容接口',
    defaultModel: 'deepseek-v4-pro',
    models: [
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', group: 'recommended', hint: '最强综合能力' },
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', group: 'fast', hint: '更快、更低成本' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiMode: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    editableBaseUrl: false,
    compatNote: 'OpenAI 原生 Chat Completions 接口',
    defaultModel: 'gpt-5.5',
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5', group: 'recommended', hint: '官方推荐用于生产' },
      { id: 'gpt-5.4', label: 'GPT-5.4', group: 'recommended', hint: '高能力通用模型' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', group: 'fast', hint: '更快、更低成本' },
      { id: 'o4-mini', label: 'o4-mini', group: 'reasoning', hint: '推理优化' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', group: 'legacy', hint: '兼容旧集成' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    apiMode: 'openai',
    baseUrl: 'https://api.anthropic.com/v1',
    editableBaseUrl: false,
    compatNote: '通过 Anthropic 官方 OpenAI 兼容端点访问（用于评估）',
    defaultModel: 'claude-sonnet-5',
    models: [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', group: 'recommended', hint: '均衡能力' },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', group: 'reasoning', hint: '最强能力' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', group: 'fast', hint: '更快、更低成本' },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    apiMode: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    editableBaseUrl: false,
    compatNote: 'Gemini 原生 generateContent 接口（支持多模态/文件提取）',
    defaultModel: 'gemini-3.5-flash',
    models: [
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', group: 'recommended', hint: 'GA 通用旗舰' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', group: 'fast', hint: '预览版' },
    ],
  },
  {
    id: 'other',
    label: '其他 / 自定义',
    apiMode: 'openai',
    baseUrl: '',
    editableBaseUrl: true,
    compatNote: '自定义 OpenAI 兼容或 Gemini 兼容端点',
    defaultModel: '',
    models: [],
    apiModeOptions: ['openai', 'gemini'],
  },
];

const BY_ID = new Map(PROVIDER_CATALOG.map((provider) => [provider.id, provider]));

export function getProviderPreset(id) {
  return BY_ID.get(String(id || '')) || null;
}

export function isKnownProvider(id) {
  return BY_ID.has(String(id || ''));
}

export function isCustomProvider(id) {
  const preset = getProviderPreset(id);
  return Boolean(preset?.editableBaseUrl);
}

/** Public catalog shape sent to the frontend (no secrets; safe to cache). */
export function publicCatalog() {
  return {
    version: CATALOG_VERSION,
    providers: PROVIDER_CATALOG.map((provider) => ({
      id: provider.id,
      label: provider.label,
      apiMode: provider.apiMode,
      baseUrl: provider.baseUrl,
      editableBaseUrl: provider.editableBaseUrl,
      compatNote: provider.compatNote || '',
      defaultModel: provider.defaultModel,
      models: provider.models,
      ...(provider.apiModeOptions ? { apiModeOptions: provider.apiModeOptions } : {}),
    })),
  };
}
