import React from "react";

/**
 * Free Joy — Switch (toggle)
 */
export function Switch({ checked = false, onChange, disabled = false, label, id, style, ...rest }) {
  const fid = id || React.useId();
  return (
    <label
      htmlFor={fid}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <span
        style={{
          position: "relative",
          width: 44,
          height: 26,
          flex: "none",
          borderRadius: "var(--radius-pill)",
          background: checked ? "var(--accent)" : "var(--paper-3)",
          transition: "background var(--dur-base) var(--ease-out)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "var(--white)",
            boxShadow: "var(--shadow-sm)",
            transition: "left var(--dur-base) var(--ease-out)",
          }}
        />
      </span>
      <input
        id={fid}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.checked, e)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        {...rest}
      />
      {label && <span style={{ fontSize: "var(--text-base)", color: "var(--text)" }}>{label}</span>}
    </label>
  );
}
