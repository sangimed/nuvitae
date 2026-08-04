"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { ProviderDisclosure } from "./ProviderDisclosure";
import { ErrorSummary } from "./ErrorSummary";
import { focusErrorSummary } from "./focus-management";

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
  const previousErrorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const nextError = localError ?? props.serverError;
    if (nextError !== undefined && nextError !== previousErrorRef.current) {
      focusErrorSummary(summaryRef.current);
    }
    previousErrorRef.current = nextError;
  }, [localError, props.serverError]);

  function updateFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    const error = validateLocalFile(file);
    if (error !== undefined) {
      props.onFileSelected(undefined);
      setLocalError(messageForUploadError(error));
      return;
    }
    setLocalError(undefined);
    props.onFileSelected(file);
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
        Your uploaded file is used only to prepare information for your review.
        You will review the extracted information before structured resume
        creation.
      </p>

      <div id={guidanceId} className="guidance-panel">
        <h2>Before you upload</h2>
        <ul>
          <li>PDF and DOCX files only.</li>
          <li>French, English, or bilingual French-English resumes.</li>
          <li>10 MB maximum file size.</li>
          <li>5 rendered pages maximum.</li>
          <li>Selectable text is required.</li>
          <li>Scanned or image-only documents are not supported.</li>
          <li>
            Uploaded sources and source-reconstructing artifacts are retained
            for no more than seven days from upload.
          </li>
        </ul>
      </div>

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
        <label className="file-label" htmlFor={inputId}>
          Resume file
        </label>
        <input
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
        <p className="selected-file" aria-live="polite">
          {props.selectedFile === undefined
            ? "No file selected."
            : `Selected file: ${props.selectedFile.name}`}
        </p>
        <div className="action-row">
          <button
            type="button"
            className="secondary-button"
            onClick={props.onBack}
            disabled={props.busy}
          >
            Back
          </button>
          <button
            type="submit"
            className="primary-action"
            disabled={props.busy}
          >
            {props.busy ? "Uploading…" : "Upload and start import"}
          </button>
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
