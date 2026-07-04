import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, ShieldCheck, Star, Trash2, X } from 'lucide-react';
import { Alert, Button, Input, Modal, Select } from '../freejoy';
import { SourceBadge } from './primitives';
import { GEMINI_API_MODEL, validationStatusLabels, type AiConfig, type AiConfigInput } from '../aiProvider';
import type { HealthResponse } from '../types';

type FormState = {
  id: string | null;
  label: string;
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  is_default: boolean;
};

const emptyForm: FormState = {
  id: null,
  label: '',
  provider: 'openai-compatible',
  base_url: '',
  model: '',
  api_key: '',
  is_default: false,
};

const providerOptions = ['gemini', 'openai-compatible', 'anthropic', 'custom'];

export function AiSettingsModal({
  isOpen,
  onClose,
  health,
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
  configs: AiConfig[];
  encryptionAvailable: boolean;
  onCreate: (input: AiConfigInput) => Promise<void>;
  onUpdate: (id: string, input: AiConfigInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
  onValidate: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<{ id: string; action: 'validate' | 'delete' | 'default' } | null>(null);
  const [error, setError] = useState('');

  // Reset the form each time the modal opens (render-time state adjustment).
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setForm(emptyForm);
    setError('');
    setBusy(null);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const defaultConfig = configs.find((config) => config.is_default) || null;
  const configured = defaultConfig
    ? defaultConfig.last_validation_status !== 'invalid'
    : Boolean(health?.provider.configured);
  const statusModel = defaultConfig ? defaultConfig.model || '自定义模型' : GEMINI_API_MODEL;
  const editing = form.id !== null;

  function editConfig(config: AiConfig) {
    setError('');
    setForm({
      id: config.id,
      label: config.label,
      provider: config.provider || 'custom',
      base_url: config.base_url,
      model: config.model,
      api_key: '',
      is_default: config.is_default,
    });
  }

  async function run(action: () => Promise<void>, onDone?: () => void) {
    setError('');
    try {
      await action();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试');
    }
  }

  async function handleSubmit() {
    if (!form.base_url.trim() || !form.model.trim()) {
      setError('请填写 Base URL 与模型名称');
      return;
    }
    if (!editing && !form.api_key.trim()) {
      setError('请填写 API Key');
      return;
    }

    const input: AiConfigInput = {
      label: form.label.trim() || '默认配置',
      provider: form.provider,
      base_url: form.base_url.trim(),
      model: form.model.trim(),
      is_default: form.is_default,
    };
    // Only send the key when the user actually entered one (blank = keep existing).
    if (form.api_key.trim()) {
      input.api_key = form.api_key.trim();
    }

    setSaving(true);
    await run(
      () => (editing ? onUpdate(form.id as string, input) : onCreate(input)),
      () => setForm(emptyForm),
    );
    setSaving(false);
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="AI 连接配置" width={560}>
      <div className="modal-status">
        <SourceBadge configured={configured} />
        <p>
          {defaultConfig
            ? `${defaultConfig.label} · ${statusModel}`
            : configured
              ? `服务器默认 Gemini · ${statusModel}`
              : '未配置 API_KEY（演示模式）'}
        </p>
      </div>

      {!encryptionAvailable && (
        <Alert tone="warn" icon={<AlertTriangle size={18} />}>
          服务器未启用密钥加密（缺少 AI_CONFIG_SECRET），暂时无法保存自定义配置。默认 Gemini 仍可使用。
        </Alert>
      )}

      {error && (
        <Alert tone="danger" icon={<AlertTriangle size={18} />}>
          {error}
        </Alert>
      )}

      <div className="ai-config-list" aria-label="已保存的 AI 配置">
        {configs.length === 0 ? (
          <p className="muted-copy ai-config-empty">
            还没有自定义配置。未选择时使用服务器默认 Gemini（由管理员配置）。
          </p>
        ) : (
          configs.map((config) => (
            <div className={config.is_default ? 'ai-config-row is-default' : 'ai-config-row'} key={config.id}>
              <div className="ai-config-main">
                <div className="ai-config-title">
                  <strong>{config.label}</strong>
                  {config.is_default && (
                    <span className="ai-config-badge default">
                      <Star size={12} /> 默认
                    </span>
                  )}
                  <span className={`ai-config-badge status-${config.last_validation_status}`}>
                    {validationStatusLabels[config.last_validation_status]}
                  </span>
                </div>
                <span className="ai-config-meta">
                  {config.model} · {config.base_url}
                </span>
                <span className="ai-config-key">密钥：{config.api_key_hint || '（未设置）'}</span>
                {config.last_validation_message && (
                  <span className="ai-config-note">{config.last_validation_message}</span>
                )}
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
                {!config.is_default && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy?.id === config.id}
                    iconLeft={busy?.id === config.id && busy.action === 'default' ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />}
                    onClick={() => {
                      setBusy({ id: config.id, action: 'default' });
                      run(() => onSetDefault(config.id)).finally(() => setBusy(null));
                    }}
                  >
                    设为默认
                  </Button>
                )}
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
                    run(() => onDelete(config.id), () => {
                      if (form.id === config.id) setForm(emptyForm);
                    }).finally(() => setBusy(null));
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
            <button type="button" className="ai-config-cancel" onClick={() => setForm(emptyForm)}>
              <X size={14} /> 取消编辑
            </button>
          )}
        </div>

        <div className="form-grid">
          <Input
            label="名称"
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            placeholder="例如：DeepSeek 生产 Key"
            disabled={!encryptionAvailable}
          />
          <Select
            label="服务商"
            value={form.provider}
            onChange={(event) => setForm({ ...form, provider: event.target.value })}
            options={providerOptions}
            disabled={!encryptionAvailable}
          />
        </div>
        <Input
          label="API Base URL"
          value={form.base_url}
          onChange={(event) => setForm({ ...form, base_url: event.target.value })}
          placeholder="https://api.example.com/v1"
          disabled={!encryptionAvailable}
        />
        <Input
          label="模型名称"
          value={form.model}
          onChange={(event) => setForm({ ...form, model: event.target.value })}
          placeholder="model-id"
          disabled={!encryptionAvailable}
        />
        <Input
          label={editing ? 'API Key（留空则保留原密钥）' : 'API Key'}
          type="password"
          value={form.api_key}
          onChange={(event) => setForm({ ...form, api_key: event.target.value })}
          placeholder={editing ? '••••••••（不修改请留空）' : 'sk-...'}
          autoComplete="off"
          disabled={!encryptionAvailable}
        />

        <div className="ai-config-form-actions">
          <label className="ai-config-default-toggle">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(event) => setForm({ ...form, is_default: event.target.checked })}
              disabled={!encryptionAvailable}
            />
            设为默认配置
          </label>
          <Button
            onClick={handleSubmit}
            disabled={!encryptionAvailable || saving}
            iconLeft={saving ? <Loader2 className="spin" size={16} /> : editing ? <Save size={16} /> : <Plus size={16} />}
          >
            {editing ? '保存修改' : '新增配置'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
