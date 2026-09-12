"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { ProviderDisclosure } from "./ProviderDisclosure";
import { ErrorSummary } from "./ErrorSummary";
import { focusErrorSummary } from "./focus-management";
import { CodexConnectionScreen } from "../codex-connection/CodexConnectionScreen";
import { Button } from "../../components/community";
import { useTranslation } from "../../i18n/LocaleProvider";
import type { MessageKey } from "../../i18n/messages";

const maximumFileSizeBytes = 10 * 1024 * 1024;
const allowedExtensions = [".pdf", ".docx"] as const;

export type UploadStepError =
  "unsupported_extension" | "empty_file" | "too_large" | "upload_failed";

export function UploadStep(props: {
  readonly selectedFile?: File;
  readonly busy: boolean;
  readonly serverError?: string | undefined;
  readonly onBack: () => void;
  readonly onFileSelected: (file: File | undefined) => void;
  readonly onSubmit: (file: File) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const guidanceId = useId();
  const errorId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [localError, setLocalError] = useState<string | undefined>();
  const [isDragging, setIsDragging] = useState(false);
  const previousErrorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const nextError = localError ?? props.serverError;
    if (nextError !== undefined && nextError !== previousErrorRef.current) {
      focusErrorSummary(summaryRef.current);
    }
    previousErrorRef.current = nextError;
  }, [localError, props.serverError]);

  function updateFile(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.currentTarget.files?.[0]);
  }

  function selectFile(file: File | undefined) {
    const error = validateLocalFile(file);
    if (error !== undefined) {
      props.onFileSelected(undefined);
      setLocalError(t(messageKeyForUploadError(error)));
      return;
    }
    setLocalError(undefined);
    props.onFileSelected(file);
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (props.busy) return;
    selectFile(event.dataTransfer.files[0]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (props.busy) return;
    const file = props.selectedFile;
    const error = validateLocalFile(file);
    if (error !== undefined || file === undefined) {
      setLocalError(t(messageKeyForUploadError(error ?? "upload_failed")));
      return;
    }
    props.onSubmit(file);
  }

  const error = localError ?? props.serverError;

  return (
    <section className="import-card" aria-labelledby="upload-title">
      <p className="eyebrow">{t("import.upload.eyebrow")}</p>
      <h1 id="upload-title">{t("import.upload.title")}</h1>
      <p className="lead">{t("import.upload.description")}</p>

      <div id={guidanceId} className="guidance-panel">
        <h2>{t("import.upload.guidanceTitle")}</h2>
        <ul>
          <li>{t("import.upload.files")}</li>
          <li>{t("import.upload.languages")}</li>
          <li>{t("import.upload.size")}</li>
          <li>{t("import.upload.pages")}</li>
          <li>{t("import.upload.selectableText")}</li>
          <li>{t("import.upload.retention")}</li>
        </ul>
      </div>

      <CodexConnectionScreen manualEntryHref="/resumes/new/manual" />
      <ProviderDisclosure />

      <form className="upload-form" onSubmit={submit} noValidate>
        <ErrorSummary
          ref={summaryRef}
          id={errorId}
          heading={t("import.upload.errorTitle")}
          errors={
            error === undefined
              ? []
              : [
                  {
                    id: "upload-error",
                    message: error,
                    targetId: inputId,
                    fieldLabel: t("import.upload.fileLabel"),
                  },
                ]
          }
        />
        <label
          className="upload-dropzone"
          data-dragging={isDragging || undefined}
          htmlFor={inputId}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!props.busy) setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={dropFile}
        >
          <span className="upload-dropzone-title">
            {t("import.upload.dropTitle")}
          </span>
          <span className="upload-dropzone-hint">
            {t("import.upload.dropHint")}
          </span>
          <input
            className="upload-file-input"
            id={inputId}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-describedby={
              error === undefined ? guidanceId : `${guidanceId} ${errorId}`
            }
            aria-invalid={error === undefined ? undefined : "true"}
            onChange={updateFile}
            disabled={props.busy}
          />
        </label>
        <p className="selected-file" aria-live="polite">
          {props.selectedFile === undefined
            ? t("import.upload.noFile")
            : `${t("import.upload.selectedFile")} ${props.selectedFile.name}`}
        </p>
        <div className="action-row">
          <Button
            type="button"
            variant="secondary"
            onClick={props.onBack}
            disabled={props.busy}
          >
            {t("import.upload.back")}
          </Button>
          <Button type="submit" disabled={props.busy} loading={props.busy}>
            {props.busy
              ? t("import.upload.uploading")
              : t("import.upload.submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}

export function validateLocalFile(
  file: File | undefined,
): UploadStepError | undefined {
  if (file === undefined) return "upload_failed";
  const lowerName = file.name.toLowerCase();
  if (!allowedExtensions.some((extension) => lowerName.endsWith(extension))) {
    return "unsupported_extension";
  }
  if (file.size === 0) return "empty_file";
  if (file.size > maximumFileSizeBytes) return "too_large";
  return undefined;
}

function messageKeyForUploadError(error: UploadStepError): MessageKey {
  switch (error) {
    case "unsupported_extension":
      return "import.upload.error.unsupportedExtension";
    case "empty_file":
      return "import.upload.error.emptyFile";
    case "too_large":
      return "import.upload.error.tooLarge";
    case "upload_failed":
      return "import.upload.error.required";
  }
}
