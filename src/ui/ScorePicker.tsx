import { Star } from 'lucide-react';

/**
 * ScorePicker — app adapter.
 *
 * A labeled 1–N star score built on lucide-react (the app's local icon set, so
 * no CDN dependency) + Free Joy tokens. Replaces the old numeric ScoreInput in
 * the feedback form with a friendlier, on-brand star control.
 */
export function ScorePicker({
  label,
  value,
  max = 5,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div style={{ display: 'inline-flex', gap: 4 }} role="radiogroup" aria-label={label}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const on = n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === value}
              aria-label={`${label} ${n} 分`}
              onClick={() => onChange(n)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 2,
                cursor: 'pointer',
                lineHeight: 0,
                color: on ? 'var(--sun-500)' : 'var(--ink-4)',
                transition: 'color var(--dur-fast) var(--ease-out)',
              }}
            >
              <Star size={22} strokeWidth={1.8} fill={on ? 'currentColor' : 'none'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
