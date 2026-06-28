import React from "react";

/**
 * Free Joy — Spinner
 * Minimal loading indicator. Inherits color; size in px.
 */
export function Spinner({ size = 22, color = "var(--accent)", thickness = 2.5, label, style, ...rest }) {
  return (
    <span
      role="status"
      aria-label={label || "Loading"}
      style={{ display: "inline-flex", alignItems: "center", gap: 9, color, ...style }}
      {...rest}
    >
      <span
        style={{
          width: size, height: size, flex: "none",
          borderRadius: "50%",
          border: `${thickness}px solid currentColor`,
          borderTopColor: "transparent",
          opacity: 0.9,
          animation: "fjSpin 0.7s linear infinite",
        }}
      />
      {label && <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{label}</span>}
      <style>{`@keyframes fjSpin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
