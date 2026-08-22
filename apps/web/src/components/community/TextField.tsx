"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id"
> {
  readonly id?: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
}

export function TextField({
  id: suppliedId,
  label,
  hint,
  error,
  className,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [props["aria-describedby"], hintId, errorId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="community-field">
      <label htmlFor={id}>{label}</label>
      {hint === undefined ? null : (
        <span className="community-field-hint" id={hintId}>
          {hint}
        </span>
      )}
      <input
        {...props}
        id={id}
        className={["community-input", className].filter(Boolean).join(" ")}
        aria-describedby={describedBy || undefined}
        aria-invalid={error === undefined ? props["aria-invalid"] : true}
      />
      {error === undefined ? null : (
        <span className="community-field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
