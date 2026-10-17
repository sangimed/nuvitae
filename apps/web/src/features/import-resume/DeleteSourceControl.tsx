"use client";

import { useRef, useState } from "react";
import { AccessibleDialog } from "../../components/AccessibleDialog";
import { useTranslation } from "../../i18n/LocaleProvider";
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
  const { t } = useTranslation();

  async function deleteSource() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    const outcome = await deleteConfirmedResumeSource({
      resumeId: props.resumeId,
    });
    if (!outcome.ok) {
      setPending(false);
      setError(t("import.sourceDeletion.error"));
      return;
    }
    await props.onDeleted(outcome.response.userMessage);
    setPending(false);
    setOpen(false);
  }

  return (
    <div className="source-deletion-control">
      <h3>{t("import.sourceDeletion.heading")}</h3>
      <p>{t("import.sourceDeletion.summary")}</p>
      <button
        type="button"
        className="secondary-button danger-action"
        disabled={props.disabled || pending}
        onClick={() => setOpen(true)}
      >
        {t("import.sourceDeletion.action")}
      </button>
      <AccessibleDialog
        open={open}
        label={t("import.sourceDeletion.action")}
        describedBy="delete-source-description"
        closeOnEscape
        closeOnBackdropClick={false}
        destructive
        destructiveLabel={t("import.sourceDeletion.destructiveMarker")}
        initialFocus={confirmRef}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
      >
        <h3>{t("import.sourceDeletion.dialogTitle")}</h3>
        <p id="delete-source-description">
          {t("import.sourceDeletion.dialogDescription")}
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
            {pending
              ? t("import.sourceDeletion.pending")
              : t("import.sourceDeletion.confirm")}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            {t("import.sourceDeletion.cancel")}
          </button>
        </div>
      </AccessibleDialog>
    </div>
  );
}
