import { Database, Tags } from 'lucide-react';
import type { MeetingAttachmentKind } from '../types';

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function EmptyState() {
  return (
    <div className="empty-state">
      <Database size={28} />
      <h3>还没有会议记忆</h3>
      <p>保存分析结果后会出现在这里。</p>
    </div>
  );
}

export function SourceBadge({ configured }: { configured: boolean }) {
  return (
    <span className={configured ? 'source-badge configured' : 'source-badge fallback'}>
      {configured ? 'API 已连接' : '演示模式'}
    </span>
  );
}

export function MemoryMap() {
  return (
    <div className="memory-map" aria-hidden="true">
      <div className="mock-toolbar">
        <span />
        <span />
        <span />
      </div>
      <div className="mock-title">
        <Tags size={18} />
        办公 Agent 链路
      </div>
      <div className="node-grid">
        <div className="node peach">目标</div>
        <div className="node sky">Skill</div>
        <div className="node lavender">生成</div>
        <div className="node mint">自检</div>
      </div>
      <div className="mock-lines">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function MeetingAssetIcon({ kind }: { kind: MeetingAttachmentKind }) {
  return (
    <svg className="meeting-asset-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === 'recording' && (
        <>
          <rect x="8.5" y="3" width="7" height="12" rx="3.5" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
          <path d="M12 18v3" />
          <path d="M8.5 21h7" />
          <path d="M10.5 7h3" />
        </>
      )}
      {kind === 'audio' && (
        <>
          <path d="M6.5 4.5h7l4 4v11h-11z" />
          <path d="M13.5 4.5v4h4" />
          <path d="M8.8 14.5h1.4l1-3 1.6 5 1.1-3.2h1.3" />
        </>
      )}
      {kind === 'image' && (
        <>
          <rect x="4.5" y="5" width="15" height="14" rx="2" />
          <circle cx="9" cy="9.5" r="1.25" />
          <path d="M6.8 16.8 10.3 13l2.4 2.2 2.2-2.7 2.4 4.3" />
        </>
      )}
      {kind === 'file' && (
        <>
          <path d="M6.5 4.5h7.2l3.8 3.8v11.2h-11z" />
          <path d="M13.5 4.8v3.9h3.8" />
          <path d="M9 12h6" />
          <path d="M9 15h6" />
          <path d="M9 18h4" />
        </>
      )}
    </svg>
  );
}
