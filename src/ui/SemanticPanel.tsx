import type { CSSProperties, ReactNode } from 'react';
import { Card } from '../freejoy';
import './ui.css';

/** App tone names mapped onto Free Joy soft tints (kept stable across the app). */
export type PanelTone = 'mint' | 'sky' | 'peach' | 'rose' | 'lavender' | 'yellow';

// [soft header background, header ink, accent dot]
const TONE: Record<PanelTone, [string, string, string]> = {
  mint: ['var(--success-100)', 'var(--success-700)', 'var(--success-500)'],
  sky: ['var(--info-100)', 'var(--info-700)', 'var(--info-500)'],
  peach: ['var(--joy-50)', 'var(--joy-700)', 'var(--joy-500)'],
  rose: ['var(--danger-100)', 'var(--danger-700)', 'var(--danger-500)'],
  lavender: ['var(--bloom-100)', 'var(--bloom-700)', 'var(--bloom-500)'],
  yellow: ['var(--sun-100)', 'var(--sun-700)', 'var(--sun-500)'],
};

/**
 * SemanticPanel — app adapter over Free Joy <Card>.
 *
 * A titled category surface: a white FJ card whose header carries one soft FJ
 * tint. Used for the meeting-minutes output sections (decisions / action items /
 * risks / open questions / long-term memory) so each category keeps its meaning
 * through color, in Free Joy's language ("small punctuation, never large fills").
 */
export function SemanticPanel({
  tone,
  icon,
  title,
  count,
  children,
  style,
}: {
  tone: PanelTone;
  icon?: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const [soft, ink, dot] = TONE[tone];
  return (
    <Card padding="0" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 16px',
          background: soft,
          color: ink,
        }}
      >
        {icon && <span style={{ display: 'inline-flex', color: dot }}>{icon}</span>}
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 'var(--weight-semibold)',
            fontSize: 'var(--text-md)',
          }}
        >
          {title}
        </span>
        {typeof count === 'number' && (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              opacity: 0.7,
            }}
          >
            {count}
          </span>
        )}
      </header>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </Card>
  );
}
