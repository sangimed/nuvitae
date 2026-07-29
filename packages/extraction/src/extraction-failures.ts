import type {
  ExtractionFailure,
  ExtractionFailureCategory,
  ExtractionResult,
} from "./adapters.js";

const publicMessages: Record<ExtractionFailureCategory, string> = {
  malformed: "The document structure is invalid.",
  corrupted: "The document is corrupted or incomplete.",
  encrypted: "Encrypted documents are not supported.",
  password_protected: "Password-protected documents are not supported.",
  scanned_or_image_only:
    "The document does not contain selectable text. OCR is not supported.",
  unsupported: "The document contains an unsupported feature.",
  resource_limit: "The document exceeded a processing limit.",
  cancelled: "Document processing was cancelled.",
  unexpected: "The document could not be processed safely.",
};

export function extractionFailure(
  category: ExtractionFailureCategory,
): ExtractionFailure {
  return Object.freeze({
    category,
    retryable:
      category === "cancelled" ||
      category === "resource_limit" ||
      category === "unexpected",
    message: publicMessages[category],
  });
}

export function failed<Value>(
  category: ExtractionFailureCategory,
): ExtractionResult<Value> {
  return { ok: false, error: extractionFailure(category) };
}

export function succeeded<Value>(value: Value): ExtractionResult<Value> {
  return { ok: true, value };
}

export function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (isAborted(signal)) {
    throw new ExtractionOperationError("cancelled");
  }
}

export class ExtractionOperationError extends Error {
  constructor(readonly category: ExtractionFailureCategory) {
    super(publicMessages[category]);
    this.name = "ExtractionOperationError";
  }
}

export function categoryFromUnknown(
  error: unknown,
  fallback: ExtractionFailureCategory = "unexpected",
): ExtractionFailureCategory {
  return error instanceof ExtractionOperationError ? error.category : fallback;
}
