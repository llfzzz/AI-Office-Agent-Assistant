import { useState } from 'react';
import { AlertTriangle, Loader2, Lock, Plus, Save, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { Alert, Button, Input, Modal, Select, Switch } from '../freejoy';
import { SourceBadge } from './primitives';
import {
  modelGroupLabels,
  validationStatusLabels,
  type AiApiMode,
  type AiConfig,
  type AiConfigInput,
  type AiProviderCatalog,
  type AiProviderPreset,
} from '../aiProvider';
import type { HealthResponse } from '../types';

const GROUP_ORDER = ['recommended', 'fast', 'reasoning', 'legacy'];

type FormState = {
  id: string | null;
  label: string;
  provider: string;
  api_mode: AiApiMode;
  base_url: string;
  model: string;
  api_key: string;
  is_default: boolean;
};

function presetFor(catalog: AiProviderCatalog | null, id: string): AiProviderPreset | null {
  return catalog?.providers.find((provider) => provider.id === id) || null;
}

function initialForm(catalog: AiProviderCatalog | null): FormState {
  const first = catalog?.providers[0];
  const editable = Boolean(first?.editableBaseUrl);
  return {
    id: null,
    label: '',
    provider: first?.id || 'deepseek',
    api_mode: first?.apiMode || 'openai',
    base_url: editable ? '' : first?.baseUrl || '',
    model: editable ? '' : first?.defaultModel || '',
    api_key: '',
    is_default: false,
  };
}

function modelOptions(preset: AiProviderPreset) {
  return [...preset.models]
    .sort((a, b) => GROUP_ORDER.indexOf(a.group || '') - GROUP_ORDER.indexOf(b.group || ''))
    .map((model) => {
      const group = model.group && modelGroupLabels[model.group] ? `【${modelGroupLabels[model.group]}】` : '';
      const hint = model.hint ? ` · ${model.hint}` : '';
      return { value: model.id, label: `${group}${model.label}${hint}` };
    });
}

export function AiSettingsModal({
  isOpen,
  onClose,
  health,
  catalog,
  configs,
  encryptionAvailable,
  onCreate,
  onUpdate,
  onDelete,
  onSetDefault,
  onValidate,
}: {
  isOpen: boolean;
  onClose: () => void;
  health: HealthResponse | null;
  catalog: AiProviderCatalog | null;
  configs: AiConfig[];
  encryptionAvailable: boolean;
  onCreate: (input: AiConfigInput) => Promise<AiConfig>;
  onUpdate: (id: string, input: AiConfigInput) => Promise<AiConfig>;
  onDelete: (id: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
  onValidate: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(catalog));
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: 'validate' | 'delete' | 'default' } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');

  // Reset the form each time the modal opens (render-time state adjustment).
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setForm(initialForm(catalog));
    setShowAdvanced(false);
    setError('');
    setBusy(null);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const preset = presetFor(catalog, form.provider);
  const isOther = Boolean(preset?.editableBaseUrl);
  const editing = form.id !== null;
  const defaultConfig = configs.find((config) => config.is_default) || null;
  const configured = defaultConfig
    ? defaultConfig.last_validation_status !== 'invalid'
    : Boolean(health?.provider.configured);
  const providerLabel = (config: AiConfig) => presetFor(catalog, config.provider)?.label || config.provider;

  function selectProvider(id: string) {
    const next = presetFor(catalog, id);
    const editable = Boolean(next?.editableBaseUrl);
    setForm((current) => ({
      ...current,
      provider: id,
      api_mode: next?.apiMode || 'openai',
      base_url: editable ? '' : next?.baseUrl || '',
      model: editable ? '' : next?.defaultModel || '',
    }));
    setError('');
  }

  function editConfig(config: AiConfig) {
    setForm({
      id: config.id,
      label: config.label,
      provider: config.provider,
      api_mode: config.api_mode,
      base_url: config.base_url,
      model: config.model,
      api_key: '',
      is_default: config.is_default,
    });
    setShowAdvanced(false);
    setError('');
  }

  function resetForm() {
    setForm(initialForm(catalog));
    setError('');
  }

  async function run(action: () => Promise<void>) {
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试');
    }
  }

  function buildInput(): AiConfigInput {
    const input: AiConfigInput = {
      label: form.label.trim() || preset?.label || '默认配置',
      provider: form.provider,
      model: form.model.trim(),
      is_default: form.is_default,
    };
    if (isOther) {
      input.base_url = form.base_url.trim();
      input.api_mode = form.api_mode;
    }
    if (form.api_key.trim()) {
      input.api_key = form.api_key.trim();
    }
    return input;
  }

  function validationError(): string {
    if (!form.model.trim()) return '请选择或填写模型';
    if (isOther && !form.base_url.trim()) return '请填写 Base URL';
    if (!editing && !form.api_key.trim()) return '请填写 API Key';
    return '';
  }

  async function handleSave(thenValidate: boolean) {
    const invalid = validationError();
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = editing ? await onUpdate(form.id as string, buildInput()) : await onCreate(buildInput());
      if (thenValidate && saved?.id) {
        await onValidate(saved.id);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试');
    }
    setSaving(false);
  }

  const providerSelectOptions = (catalog?.providers || []).map((provider) => ({
    value: provider.id,
    label: provider.label,
  }));

  return (
    <Modal open={isOpen} onClose={onClose} title="AI 连接配置" width={580}>
      <div className="modal-status">
        <SourceBadge configured={configured} />
        <p>
          {defaultConfig
            ? `${defaultConfig.label} · ${providerLabel(defaultConfig)} · ${defaultConfig.model}`
            : configured
              ? '服务器已配置 AI Provider'
              : '未配置 API Key（演示模式）'}
        </p>
      </div>

      {!encryptionAvailable && (
        <Alert tone="warn" icon={<AlertTriangle size={18} />}>
          服务器未启用密钥加密（缺少 AI_CONFIG_SECRET），暂时无法保存或使用自定义配置。
        </Alert>
      )}

      {error && (
        <Alert tone="danger" icon={<AlertTriangle size={18} />}>
          {error}
        </Alert>
      )}

      <div className="ai-config-list" aria-label="已保存的 AI 配置">
        {configs.length === 0 ? (
          <p className="muted-copy ai-config-empty">还没有自定义配置。未选择时会进入演示模式。</p>
        ) : (
          configs.map((config) => (
            <div className={config.is_default ? 'ai-config-row is-default' : 'ai-config-row'} key={config.id}>
              <div className="ai-config-main">
                <div className="ai-config-title">
                  <strong>{config.label}</strong>
                  <span className="ai-config-badge">{providerLabel(config)}</span>
                  <span className={`ai-config-badge status-${config.last_validation_status}`}>
                    {validationStatusLabels[config.last_validation_status]}
                  </span>
                </div>
                <span className="ai-config-meta">{config.model}</span>
                <span className="ai-config-key">密钥：{config.api_key_hint || '（未设置）'}</span>
                {config.last_validation_message && <span className="ai-config-note">{config.last_validation_message}</span>}
                <label className="ai-config-default-toggle">
                  <Switch
                    checked={config.is_default}
                    disabled={config.is_default || busy?.id === config.id}
                    onChange={() => {
                      setBusy({ id: config.id, action: 'default' });
                      run(() => onSetDefault(config.id)).finally(() => setBusy(null));
                    }}
                  />
                  {config.is_default ? '当前默认' : '设为默认'}
                </label>
              </div>
              <div className="ai-config-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy?.id === config.id}
                  iconLeft={busy?.id === config.id && busy.action === 'validate' ? <Loader2 className="spin" size={15} /> : <ShieldCheck size={15} />}
                  onClick={() => {
                    setBusy({ id: config.id, action: 'validate' });
                    run(() => onValidate(config.id)).finally(() => setBusy(null));
                  }}
                >
                  验证
                </Button>
                <Button size="sm" variant="secondary" onClick={() => editConfig(config)}>
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy?.id === config.id}
                  iconLeft={busy?.id === config.id && busy.action === 'delete' ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                  onClick={() => {
                    setBusy({ id: config.id, action: 'delete' });
                    run(() => onDelete(config.id)).finally(() => setBusy(null));
                  }}
                >
                  删除
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="ai-config-form">
        <div className="ai-config-form-head">
          <h3>{editing ? '编辑配置' : '新增配置'}</h3>
          {editing && (
            <button type="button" className="ai-config-cancel" onClick={resetForm}>
              <X size={13} /> 取消编辑
            </button>
          )}
        </div>

        <Input
          label="配置名称"
          value={form.label}
          onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
          placeholder={preset?.label || '例如：我的 DeepSeek'}
        />

        <Select
          label="服务商"
          value={form.provider}
          onChange={(event) => selectProvider(event.target.value)}
          options={providerSelectOptions}
          disabled={!catalog}
        />

        <Input
          label="API Key"
          type="password"
          value={form.api_key}
          onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))}
          placeholder={editing ? '留空则保留原密钥' : 'sk-...'}
          autoComplete="off"
        />

        {isOther ? (
          <Input
            label="模型名称"
            value={form.model}
            onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
            placeholder="例如：gpt-4o-mini"
          />
        ) : (
          <Select
            label="模型"
            value={form.model}
            onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
            options={preset ? modelOptions(preset) : []}
            disabled={!preset}
          />
        )}

        {isOther ? (
          <Input
            label="Base URL"
            value={form.base_url}
            onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
            placeholder="https://api.example.com/v1"
          />
        ) : (
          preset && (
            <p className="ai-config-auto-note">
              <Lock size={13} /> 接口地址已自动配置：{preset.baseUrl}
              {preset.compatNote ? ` · ${preset.compatNote}` : ''}
            </p>
          )
        )}

        {isOther && (
          <div className="ai-config-advanced">
            <button type="button" className="ai-config-cancel" onClick={() => setShowAdvanced((value) => !value)}>
              {showAdvanced ? '收起高级设置' : '高级设置'}
            </button>
            {showAdvanced && (
              <Select
                label="兼容模式"
                value={form.api_mode}
                onChange={(event) => setForm((current) => ({ ...current, api_mode: event.target.value as AiApiMode }))}
                options={[
                  { value: 'openai', label: 'OpenAI 兼容（/chat/completions）' },
                  { value: 'gemini', label: 'Gemini 兼容（generateContent）' },
                ]}
              />
            )}
          </div>
        )}

        <div className="ai-config-form-actions">
          <label className="ai-config-default-toggle">
            <Switch
              checked={form.is_default}
              onChange={(checked) => setForm((current) => ({ ...current, is_default: checked }))}
            />
            设为默认配置
          </label>
          <div className="ai-config-save-buttons">
            <Button
              variant="secondary"
              size="sm"
              disabled={saving || !encryptionAvailable}
              iconLeft={saving ? <Loader2 className="spin" size={15} /> : <ShieldCheck size={15} />}
              onClick={() => handleSave(true)}
            >
              保存并验证
            </Button>
            <Button
              size="sm"
              disabled={saving || !encryptionAvailable}
              iconLeft={saving ? <Loader2 className="spin" size={15} /> : editing ? <Save size={15} /> : <Plus size={15} />}
              onClick={() => handleSave(false)}
            >
              {editing ? '保存修改' : '保存配置'}
            </Button>
          </div>
        </div>
        {!editing && (
          <p className="ai-config-note ai-config-hint">
            <Sparkles size={12} /> 官方服务商无需填写接口地址，选择模型并填入 API Key 即可。
          </p>
        )}
      </div>
    </Modal>
  );
}
