import type { ReactNode } from 'react';

/** 「STEP 1 / 2」 pill + step heading row, with optional right-side actions. */
export function StepperPill({
  step,
  total,
  heading,
  actions,
}: {
  step: number;
  total: number;
  heading: string;
  actions?: ReactNode;
}) {
  return (
    <div className="stepper-row">
      <span className="stepper-pill">
        STEP {step} / {total}
      </span>
      <h2 className="stepper-heading">{heading}</h2>
      {actions && <div className="stepper-actions">{actions}</div>}
    </div>
  );
}
