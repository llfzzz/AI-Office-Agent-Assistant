import type { ReactNode } from 'react';
import { Badge } from '../freejoy';

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'sun' | 'bloom';

/** White stat card: big number + caption, optional delta badge (工作区概览 etc.). */
export function StatTile({
  value,
  label,
  delta,
  deltaTone = 'success',
  onClick,
}: {
  value: ReactNode;
  label: string;
  delta?: string;
  deltaTone?: BadgeTone;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="stat-tile-top">
        <strong>{value}</strong>
        {delta && <Badge tone={deltaTone}>{delta}</Badge>}
      </div>
      <span>{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="stat-tile stat-tile-button" onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className="stat-tile">{body}</div>;
}
