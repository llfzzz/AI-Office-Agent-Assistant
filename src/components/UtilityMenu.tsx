import { LogOut, Network, Settings2 } from 'lucide-react';
import type { RefObject } from 'react';
import { Tooltip } from '../freejoy';
import { SourceBadge } from './primitives';
import { GEMINI_API_MODEL, type AiConfig } from '../aiProvider';
import type { HealthResponse } from '../types';

export function UtilityMenu({
  refEl,
  health,
  isOpen,
  configs,
  userLabel,
  onOpenChange,
  onOpenSettings,
  onLogout,
}: {
  refEl: RefObject<HTMLDivElement | null>;
  health: HealthResponse | null;
  isOpen: boolean;
  configs: AiConfig[];
  userLabel: string;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const defaultConfig = configs.find((config) => config.is_default) || null;
  const configured = defaultConfig
    ? defaultConfig.last_validation_status !== 'invalid'
    : Boolean(health?.provider.configured);
  const displayModel = defaultConfig ? defaultConfig.model || '自定义模型' : GEMINI_API_MODEL;

  return (
    <div className="utility-menu" ref={refEl}>
      <Tooltip content="AI 设置" placement="bottom">
        <button
          type="button"
          className="icon-button utility-trigger"
          aria-label="打开设置菜单"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          onClick={() => onOpenChange(!isOpen)}
        >
          <Settings2 size={18} />
        </button>
      </Tooltip>

      {isOpen && (
        <div className="utility-popover" role="menu">
          <div className="utility-status">
            <span className="eyebrow">当前账号</span>
            <strong>{userLabel}</strong>
            <SourceBadge configured={configured} />
            <p>{configured ? displayModel : '未配置 API_KEY'}</p>
          </div>
          <button
            type="button"
            className="utility-item"
            role="menuitem"
            onClick={() => {
              onOpenSettings();
              onOpenChange(false);
            }}
          >
            <Network size={17} />
            API 设置
          </button>
          <button
            type="button"
            className="utility-item danger"
            role="menuitem"
            onClick={() => {
              onOpenChange(false);
              onLogout();
            }}
          >
            <LogOut size={17} />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
