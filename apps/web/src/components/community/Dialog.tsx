"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { AccessibleDialog } from "../AccessibleDialog";
import type { AccessibleDialogProps } from "../AccessibleDialog";

export interface DialogProps extends Pick<
  AccessibleDialogProps,
  | "open"
  | "onClose"
  | "closeOnEscape"
  | "closeOnBackdropClick"
  | "initialFocus"
  | "restoreFocus"
  | "destructive"
> {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
}

export function Dialog({
  title,
  description,
  children,
  actions,
  ...dialogProps
}: DialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId =
    description === undefined ? undefined : `${id}-description`;

  return (
    <AccessibleDialog
      {...dialogProps}
      labelledBy={titleId}
      {...(descriptionId === undefined ? {} : { describedBy: descriptionId })}
    >
      <div className="community-dialog-header">
        <h2 id={titleId}>{title}</h2>
        {description === undefined ? null : (
          <p id={descriptionId}>{description}</p>
        )}
      </div>
      <div className="community-dialog-content">{children}</div>
      {actions === undefined ? null : (
        <div className="community-dialog-actions">{actions}</div>
      )}
    </AccessibleDialog>
  );
}
