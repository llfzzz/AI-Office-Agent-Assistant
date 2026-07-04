import React from "react";

const offsets = {
  top: { left: "50%", bottom: "calc(100% + 10px)", transform: "translate(-50%, 4px)" },
  bottom: { left: "50%", top: "calc(100% + 10px)", transform: "translate(-50%, -4px)" },
  left: { right: "calc(100% + 10px)", top: "50%", transform: "translate(4px, -50%)" },
  right: { left: "calc(100% + 10px)", top: "50%", transform: "translate(-4px, -50%)" },
};

const visibleTransforms = {
  top: "translate(-50%, 0)",
  bottom: "translate(-50%, 0)",
  left: "translate(0, -50%)",
  right: "translate(0, -50%)",
};

/**
 * Free Joy — Tooltip
 * Short contextual hint for icon-only controls and dense workbench actions.
 */
export function Tooltip({
  content,
  placement = "top",
  disabled = false,
  delay = 120,
  children,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const timerRef = React.useRef(null);
  const tooltipId = React.useId();
  const side = offsets[placement] ? placement : "top";
  const show = () => {
    if (disabled || !content) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timerRef.current);
    setOpen(false);
  };

  React.useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const child =
    React.isValidElement(children) && content
      ? React.cloneElement(children, {
          "aria-describedby": open ? tooltipId : children.props["aria-describedby"],
        })
      : children;

  return (
    <span
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
      onKeyDown={(event) => {
        if (event.key === "Escape") hide();
      }}
      style={{
        position: "relative",
        display: "inline-flex",
        width: "fit-content",
        maxWidth: "100%",
        ...style,
      }}
      {...rest}
    >
      {child}
      {!disabled && content && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: "var(--z-tooltip)",
            width: "max-content",
            maxWidth: 220,
            padding: "7px 10px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(28, 28, 26, 0.94)",
            color: "var(--white)",
            boxShadow: "var(--shadow-md)",
            fontFamily: "var(--font-text)",
            fontSize: "var(--text-xs)",
            fontWeight: "var(--weight-semibold)",
            lineHeight: 1.35,
            letterSpacing: 0,
            whiteSpace: "normal",
            pointerEvents: "none",
            display: open ? "block" : "none",
            opacity: open ? 1 : 0,
            visibility: open ? "visible" : "hidden",
            transform: open ? visibleTransforms[side] : offsets[side].transform,
            transition:
              "opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out), visibility var(--dur-fast) var(--ease-out)",
            ...offsets[side],
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
