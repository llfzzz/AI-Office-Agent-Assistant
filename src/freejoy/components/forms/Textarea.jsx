import React from "react";

/**
 * Free Joy — Textarea
 * Multi-line text field with label, hint, error. Matches Input styling.
 */
export function Textarea({ label, hint, error, rows = 4, id, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const fid = id || React.useId();
  const borderColor = error ? "var(--danger-500)" : focus ? "var(--accent)" : "var(--border-strong)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && (
        <label htmlFor={fid} style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--text-muted)" }}>
          {label}
        </label>
      )}
      <textarea
        id={fid}
        rows={rows}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%",
          padding: "11px 14px",
          background: "var(--surface)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          boxShadow: focus ? "var(--ring)" : "none",
          fontFamily: "var(--font-text)",
          fontSize: "var(--text-base)",
          lineHeight: "var(--leading-normal)",
          color: "var(--text)",
          outline: "none",
          resize: "vertical",
          transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        }}
        {...rest}
      />
      {(hint || error) && (
        <span style={{ fontSize: "var(--text-xs)", color: error ? "var(--danger-700)" : "var(--text-subtle)" }}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
