import * as React from "react";

/** On/off toggle switch with optional inline label. */
export interface SwitchProps {
  /** Controlled checked state. */
  checked?: boolean;
  /** Called with (nextChecked, event). */
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Inline label to the right of the track. */
  label?: string;
  disabled?: boolean;
  id?: string;
}
export declare function Switch(props: SwitchProps): JSX.Element;
