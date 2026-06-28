import * as React from "react";

/**
 * Multi-line text field — label, hint/error, matches Input.
 *
 * @startingPoint section="Forms" subtitle="Multi-line text field" viewport="700x180"
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** @default 4 */
  rows?: number;
}
export declare function Textarea(props: TextareaProps): JSX.Element;
