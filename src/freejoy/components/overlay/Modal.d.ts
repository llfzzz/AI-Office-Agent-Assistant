import * as React from "react";

/**
 * Centered dialog over a dimmed backdrop. Controlled via open + onClose.
 *
 * @startingPoint section="Overlay" subtitle="Dialog with header, body & footer" viewport="700x420"
 */
export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  /** Footer actions, usually Buttons. */
  footer?: React.ReactNode;
  /** Max width in px. @default 460 */
  width?: number;
  /** Frosted glass panel instead of solid surface. @default false */
  glass?: boolean;
  children?: React.ReactNode;
}
export declare function Modal(props: ModalProps): JSX.Element;
