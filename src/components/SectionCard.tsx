import type { ReactNode } from 'react';

/**
 * White page card — the redesign's base surface. Optional header row
 * (title + caption on the left, actions on the right) and footer bar.
 */
export function SectionCard({
  title,
  caption,
  eyebrow,
  actions,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  caption?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `page-card ${className}` : 'page-card'}>
      {(title || actions) && (
        <header className="page-card-head">
          <div className="page-card-heading">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h2>{title}</h2>}
            {caption && <p>{caption}</p>}
          </div>
          {actions && <div className="page-card-actions">{actions}</div>}
        </header>
      )}
      <div className="page-card-body">{children}</div>
      {footer && <footer className="page-card-foot">{footer}</footer>}
    </section>
  );
}
