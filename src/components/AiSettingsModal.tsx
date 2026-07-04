import { useState } from 'react';
import { Check, Save } from 'lucide-react';
import { Button, Input, Modal, SegmentedControl } from '../freejoy';
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
  // Hold an editable draft so nothing persists until the user clicks Save.
  const [draft, setDraft] = useState<AiProviderSettings>(settings);
  const [justSaved, setJustSaved] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);

  // Reset the draft whenever the modal transitions to open (render-time state
  // adjustment — see React "You Might Not Need an Effect").
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setDraft(settings);
    setJustSaved(false);
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  const configured =
    draft.mode === 'custom'
      ? aiProviderIsLocallyConfigured(draft)
      : Boolean(health?.provider.configured);
  const displayModel =
    draft.mode === 'custom'
      ? draft.model.trim() || '自定义模型'
      : GEMINI_API_MODEL;

  const dirty =
    draft.mode !== settings.mode ||
    draft.baseUrl !== settings.baseUrl ||
    draft.apiKey !== settings.apiKey ||
    draft.model !== settings.model;

  const canSave = draft.mode === 'default' || aiProviderIsLocallyConfigured(draft);

  function update(patch: Partial<AiProviderSettings>) {
    setDraft((current) => ({ ...current, ...patch }));
    setJustSaved(false);
  }

  function handleSave() {
    onSettingsChange(draft);
    setJustSaved(true);
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
          value={draft.mode}
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

        {draft.mode === 'custom' && (
          <>
            <Input
              label="API Base URL"
              value={draft.baseUrl}
              onChange={(event) => update({ baseUrl: event.target.value })}
              placeholder="https://api.example.com/v1"
            />
            <Input
              label="API Key"
              type="password"
              value={draft.apiKey}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder="sk-..."
              autoComplete="off"
            />
            <Input
              label="模型名称"
              value={draft.model}
              onChange={(event) => update({ model: event.target.value })}
              placeholder="model-id"
            />
          </>
        )}
      </div>

      <div className="ai-provider-actions">
        <span className="ai-provider-hint">
          {draft.mode === 'custom' && !canSave
            ? '请填写 Base URL、Key 和模型名称'
            : justSaved && !dirty
              ? '已保存'
              : dirty
                ? '有未保存的修改'
                : '配置已是最新'}
        </span>
        <div className="ai-provider-buttons">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || (!dirty && justSaved)}
            iconLeft={justSaved && !dirty ? <Check size={16} /> : <Save size={16} />}
          >
            {justSaved && !dirty ? '已保存' : '保存配置'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
