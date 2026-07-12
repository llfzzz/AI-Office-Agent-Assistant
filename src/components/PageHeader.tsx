import { useRef, useState } from 'react';
import { LogOut, Menu, Settings2 } from 'lucide-react';
import { Tooltip } from '../freejoy';
import { useDismiss } from '../hooks/useDismiss';
import { SourceBadge } from './primitives';
import type { AiConfig } from '../aiProvider';
import type { HealthResponse } from '../types';

/**
 * Per-view topbar: title + subtitle on the left, status / settings / account
 * cluster on the right. Owns the account popover (model status + logout).
 */
export function PageHeader({
  title,
  subtitle,
  health,
  configs,
  userLabel,
  onOpenSettings,
  onLogout,
  onToggleNav,
  navCollapsed,
}: {
  title: string;
  subtitle: string;
  health: HealthResponse | null;
  configs: AiConfig[];
  userLabel: string;
  onOpenSettings: () => void;
  onLogout: () => void;
  onToggleNav?: () => void;
  navCollapsed?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useDismiss(menuRef, menuOpen, () => setMenuOpen(false));

  const defaultConfig = configs.find((config) => config.is_default) || null;
  const configured = defaultConfig
    ? defaultConfig.last_validation_status !== 'invalid'
    : Boolean(health?.provider.configured);
  const displayModel = defaultConfig ? defaultConfig.model || '自定义模型' : '未选择自定义配置';
  const initial = (userLabel || '我').trim().charAt(0).toUpperCase();

  return (
    <header className="topbar">
      {onToggleNav && (
        <button
          type="button"
          className="icon-button topbar-nav-toggle"
          aria-label={navCollapsed ? '展开导航' : '收起导航'}
          aria-expanded={!navCollapsed}
          onClick={onToggleNav}
        >
          <Menu size={17} />
        </button>
      )}
      <div className="topbar-copy">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="topbar-actions">
        <SourceBadge configured={configured} />
        <Tooltip content="AI 连接设置" placement="bottom">
          <button
            type="button"
            className="icon-button"
            aria-label="打开 AI 连接设置"
            onClick={onOpenSettings}
          >
            <Settings2 size={17} />
          </button>
        </Tooltip>
        <div className="account-menu" ref={menuRef}>
          <button
            type="button"
            className="account-trigger"
            aria-label="账号菜单"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {initial}
          </button>
          {menuOpen && (
            <div className="account-popover" role="menu">
              <div className="account-popover-status">
                <span className="eyebrow">当前账号</span>
                <strong>{userLabel}</strong>
                <p>{configured ? displayModel : '未配置 AI Provider（体验模式）'}</p>
              </div>
              <button
                type="button"
                className="account-popover-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
              >
                <Settings2 size={16} />
                AI 连接设置
              </button>
              <button
                type="button"
                className="account-popover-item danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                <LogOut size={16} />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
