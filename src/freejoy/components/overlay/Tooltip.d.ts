import * as React from "react";

/**
 * Short contextual hint for icon-only controls.
 *
 * @startingPoint section="Overlay" subtitle="Hover/focus hint for dense controls" viewport="700x180"
 */
export interface TooltipProps {
  content?: React.ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
  delay?: number;
  children: React.ReactElement;
  style?: React.CSSProperties;
}
export declare function Tooltip(props: TooltipProps): JSX.Element;
