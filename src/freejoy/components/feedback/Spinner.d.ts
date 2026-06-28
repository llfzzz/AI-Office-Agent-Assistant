import * as React from "react";

/**
 * Minimal circular loading indicator.
 *
 * @startingPoint section="Feedback" subtitle="Loading spinner" viewport="700x120"
 */
export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Pixel diameter. @default 22 */
  size?: number;
  /** @default "var(--accent)" */
  color?: string;
  /** Ring stroke width. @default 2.5 */
  thickness?: number;
  /** Optional text shown beside the ring. */
  label?: string;
}
export declare function Spinner(props: SpinnerProps): JSX.Element;
