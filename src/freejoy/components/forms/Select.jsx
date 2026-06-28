import React from "react";

/**
 * Free Joy — Select
 * Native select styled to match Input: label, hint, error, custom chevron.
 */
export function Select({ label, hint, error, options = [], size = "md", id, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const fid = id || React.useId();
  const h = { sm: 36, md: 44, lg: 52 }[size] || 44;
  const borderColor = error ? "var(--danger-500)" : focus ? "var(--accent)" : "var(--border-strong)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && (
        <label htmlFor={fid} style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--text-muted)" }}>
          {label}
        </label>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <select
          id={fid}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            appearance: "none",
            WebkitAppearance: "none",
            width: "100%",
            height: h,
            padding: "0 38px 0 14px",
            background: "var(--surface)",
            border: `1px solid ${borderColor}`,
            borderRadius: "var(--radius-md)",
            boxShadow: focus ? "var(--ring)" : "none",
            fontFamily: "var(--font-text)",
            fontSize: "var(--text-base)",
            color: "var(--text)",
            cursor: "pointer",
            outline: "none",
            transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
          }}
          {...rest}
        >
          {options.map((o) =>
            typeof o === "string"
              ? <option key={o} value={o}>{o}</option>
              : <option key={o.value} value={o.value}>{o.label}</option>
          )}
        </select>
        <span style={{ position: "absolute", right: 13, pointerEvents: "none", color: "var(--text-subtle)", display: "inline-flex" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </div>
      {(hint || error) && (
        <span style={{ fontSize: "var(--text-xs)", color: error ? "var(--danger-700)" : "var(--text-subtle)" }}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
