"use client";

import { useRef, useState } from "react";
import { AccessibleDialog } from "../../components/AccessibleDialog";
import { deleteConfirmedResumeSource } from "./client";

export function DeleteSourceControl(props: {
  readonly resumeId: string;
  readonly disabled: boolean;
  readonly onDeleted: (message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const confirmRef = useRef<HTMLButtonElement>(null);

  async function deleteSource() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    const outcome = await deleteConfirmedResumeSource({
      resumeId: props.resumeId,
    });
    if (!outcome.ok) {
      setPending(false);
      setError(outcome.message);
      return;
    }
    await props.onDeleted(outcome.response.userMessage);
    setPending(false);
    setOpen(false);
  }

  return (
    <div className="source-deletion-control">
      <h3>Uploaded source file</h3>
      <p>
        Your uploaded file is temporary and separate from your structured
        resume. Deleting it keeps this resume and all edits.
      </p>
      <button
        type="button"
        className="secondary-button danger-action"
        disabled={props.disabled || pending}
        onClick={() => setOpen(true)}
      >
        Delete uploaded source file
      </button>
      <AccessibleDialog
        open={open}
        label="Delete uploaded source file"
        describedBy="delete-source-description"
        closeOnEscape
        closeOnBackdropClick={false}
        destructive
        initialFocus={confirmRef}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
      >
        <h3>Delete uploaded source file?</h3>
        <p id="delete-source-description">
          This permanently deletes the uploaded file and source-only artifacts.
          It does not delete your structured resume or your edits.
        </p>
        {error === undefined ? null : <p role="alert">{error}</p>}
        <div className="action-row">
          <button
            ref={confirmRef}
            type="button"
            className="secondary-button danger-action"
            disabled={pending}
            onClick={() => void deleteSource()}
          >
            {pending ? "Deleting source" : "Delete source only"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Keep source
          </button>
        </div>
      </AccessibleDialog>
    </div>
  );
}
