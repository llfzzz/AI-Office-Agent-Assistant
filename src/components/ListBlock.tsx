import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { SemanticPanel } from '../ui';

type ListTone = 'mint' | 'sky' | 'peach' | 'rose' | 'lavender';

export function ListBlock<T>({
  title,
  icon,
  tone,
  items,
  render,
}: {
  title: string;
  icon: ReactNode;
  tone: ListTone;
  items: T[];
  render: (item: T) => ReactNode;
}) {
  return (
    <SemanticPanel tone={tone} icon={icon} title={title} count={items.length}>
      {items.length === 0 ? (
        <p className="list-empty">未提及</p>
      ) : (
        <ul className="semantic-list">
          {items.map((item, index) => (
            <li key={index}>{render(item)}</li>
          ))}
        </ul>
      )}
    </SemanticPanel>
  );
}

export function SimpleListBlock({
  title,
  tone,
  items,
}: {
  title: string;
  tone: ListTone;
  items: string[];
}) {
  return (
    <SemanticPanel tone={tone} icon={<CheckCircle2 size={18} />} title={title} count={items.length}>
      {items.length === 0 ? (
        <p className="list-empty">未提及</p>
      ) : (
        <ul className="semantic-list">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <strong>{item}</strong>
            </li>
          ))}
        </ul>
      )}
    </SemanticPanel>
  );
}
