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
      setLocalError(messageForUploadError(error));
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
      setLocalError(messageForUploadError(error ?? "upload_failed"));
      return;
    }
    props.onSubmit(file);
  }

  const error = localError ?? props.serverError;

  return (
    <section className="import-card" aria-labelledby="upload-title">
      <p className="eyebrow">Resume import</p>
      <h1 id="upload-title">Choose the resume file to import</h1>
      <p className="lead">
        Your file is used only to prepare a draft. You will review every detail
        before it is saved as a resume.
      </p>

      <div id={guidanceId} className="guidance-panel">
        <h2>Before you upload</h2>
        <ul>
          <li>PDF and DOCX files only.</li>
          <li>French, English, or bilingual French-English resumes.</li>
          <li>10 MB maximum file size.</li>
          <li>Up to 5 pages.</li>
          <li>The text must be selectable, not a scan or photo.</li>
          <li>
            Your uploaded file and temporary working copies are removed within
            seven days.
          </li>
        </ul>
      </div>

      <CodexConnectionScreen manualEntryHref="/resumes/new/manual" />
      <ProviderDisclosure />

      <form className="upload-form" onSubmit={submit} noValidate>
        <ErrorSummary
          ref={summaryRef}
          id={errorId}
          heading="The file could not be uploaded"
          errors={
            error === undefined
              ? []
              : [
                  {
                    id: "upload-error",
                    message: error,
                    targetId: inputId,
                    fieldLabel: "Resume file",
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
          <span className="upload-dropzone-title">Drop your resume here</span>
          <span className="upload-dropzone-hint">
            or choose a PDF or DOCX file from your device
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
            ? "No file selected."
            : `Selected file: ${props.selectedFile.name}`}
        </p>
        <div className="action-row">
          <Button
            type="button"
            variant="secondary"
            onClick={props.onBack}
            disabled={props.busy}
          >
            Back
          </Button>
          <Button type="submit" disabled={props.busy} loading={props.busy}>
            {props.busy ? "Uploading…" : "Upload and start import"}
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

function messageForUploadError(error: UploadStepError): string {
  switch (error) {
    case "unsupported_extension":
      return "Choose a PDF or DOCX resume file.";
    case "empty_file":
      return "Choose a resume file that is not empty.";
    case "too_large":
      return "Choose a resume file that is 10 MB or smaller.";
    case "upload_failed":
      return "Choose a resume file before starting the import.";
  }
}
