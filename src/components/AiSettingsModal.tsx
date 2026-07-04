import { Input, Modal, SegmentedControl } from '../freejoy';
import { SourceBadge } from './primitives';
import {
  GEMINI_API_BASE_URL,
  GEMINI_API_MODEL,
  aiProviderIsLocallyConfigured,
  type AiProviderSettings,
} from '../aiProvider';
import type { HealthResponse } from '../types';

export function AiSettingsModal({
  health,
  isOpen,
  settings,
  onClose,
  onSettingsChange,
}: {
  health: HealthResponse | null;
  isOpen: boolean;
  settings: AiProviderSettings;
  onClose: () => void;
  onSettingsChange: (settings: AiProviderSettings) => void;
}) {
  const configured =
    settings.mode === 'custom'
      ? aiProviderIsLocallyConfigured(settings)
      : Boolean(health?.provider.configured);
  const displayModel =
    settings.mode === 'custom'
      ? settings.model.trim() || '自定义模型'
      : GEMINI_API_MODEL;

  function update(patch: Partial<AiProviderSettings>) {
    onSettingsChange({ ...settings, ...patch });
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="AI 连接配置" width={500}>
      <div className="modal-status">
        <SourceBadge configured={configured} />
        <p>{configured ? displayModel : '未配置 API_KEY'}</p>
      </div>

      <div className="ai-provider-form">
        <SegmentedControl
          full
          value={settings.mode}
          onChange={(value) =>
            value === 'default'
              ? update({ mode: 'default', baseUrl: GEMINI_API_BASE_URL, apiKey: '', model: GEMINI_API_MODEL })
              : update({ mode: 'custom', baseUrl: '', apiKey: '', model: '' })
          }
          options={[
            { value: 'default', label: '默认 Gemini' },
            { value: 'custom', label: '自定义网络' },
          ]}
        />

        {settings.mode === 'custom' && (
          <>
            <Input
              label="API Base URL"
              value={settings.baseUrl}
              onChange={(event) => update({ baseUrl: event.target.value })}
              placeholder="https://api.example.com/v1"
            />
            <Input
              label="API Key"
              type="password"
              value={settings.apiKey}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder="sk-..."
              autoComplete="off"
            />
            <Input
              label="模型名称"
              value={settings.model}
              onChange={(event) => update({ model: event.target.value })}
              placeholder="model-id"
            />
          </>
        )}
      </div>
    </Modal>
  );
}
