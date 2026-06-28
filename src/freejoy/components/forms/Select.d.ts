import * as React from "react";

/**
 * Dropdown select styled to match Input — label, hint/error, custom chevron.
 *
 * @startingPoint section="Forms" subtitle="Native select with Free Joy styling" viewport="700x160"
 */
export interface SelectOption { label: string; value: string; }
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Options as plain strings or {label, value} objects. */
  options?: Array<string | SelectOption>;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
}
export declare function Select(props: SelectProps): JSX.Element;
