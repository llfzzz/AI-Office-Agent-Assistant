import React from "react";

/**
 * Free Joy — Modal (Dialog)
 * Centered dialog over a dimmed backdrop. Controlled via open + onClose.
 */
export function Modal({ open, onClose, title, footer, width = 460, glass = false, style, children }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape" && onClose) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const panelBg = glass
    ? { background: "var(--glass-bg-strong)", backdropFilter: "blur(var(--glass-blur-lg)) saturate(180%)", WebkitBackdropFilter: "blur(var(--glass-blur-lg)) saturate(180%)", border: "1px solid var(--glass-border)" }
    : { background: "var(--surface)", border: "1px solid var(--border)" };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(20,20,22,.38)",
        backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        animation: "fjModalIn .18s var(--ease-out) both",
      }}
    >
      <div
        role="dialog" aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(100%, " + width + "px)",
          ...panelBg,
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          animation: "fjModalPanel .2s var(--ease-out) both",
          ...style,
        }}
      >
        {(title || onClose) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 20px 0" }}>
            {title && <h3 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: "var(--weight-semibold)", color: "var(--text)" }}>{title}</h3>}
            {onClose && (
              <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-subtle)", padding: 4, display: "inline-flex", marginLeft: "auto" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div style={{ padding: "14px 20px 20px", color: "var(--text-muted)", fontSize: "var(--text-base)", lineHeight: "var(--leading-normal)" }}>
          {children}
        </div>
        {footer && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "0 20px 20px" }}>
            {footer}
          </div>
        )}
      </div>
      <style>{`
        @keyframes fjModalIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fjModalPanel { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}
