import type {
  ExtractionRequest,
  ExtractionResult,
  ExtractionSourceReader,
  PageCountResult,
  PdfExtractionLimits,
  PdfPageCounter,
  PdfPageText,
  PdfSelectableTextExtractor,
  PdfSafetyReasonCode,
  PdfTextItem,
} from "../adapters.js";
import { documentExtractionSecurityLimits } from "../adapters.js";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api.js";
import {
  ExtractionOperationError,
  categoryFromUnknown,
  failed,
  succeeded,
  throwIfAborted,
} from "../extraction-failures.js";
import { inspectPdfStructuralSafety } from "./pdf-safety.js";

const maximumHttpAnnotationsPerPage = 100;
const maximumHttpAnnotationLength = 2_048;

/**
 * PDF item indexes and global reading order are zero-based. Page numbers are
 * one-based. Items retain the order returned by PDF.js.
 */
export class PdfJsPdfAdapter
  implements PdfPageCounter, PdfSelectableTextExtractor
{
  constructor(
    private readonly sourceReader: ExtractionSourceReader,
    private readonly limits: PdfExtractionLimits,
  ) {
    validateLimits(limits);
  }

  async countPages(
    request: ExtractionRequest,
  ): Promise<ExtractionResult<PageCountResult>> {
    if (request.format !== "pdf") {
      return failed("unsupported");
    }

    try {
      const data = await this.readSource(request);
      this.validateStructuralSafety(data);
      const result = await this.withDocument(
        data,
        request.abortSignal,
        async (pdf) => {
          validatePageCount(pdf.numPages, this.limits.maximumPageCount);
          return Object.freeze({ renderedPageCount: pdf.numPages });
        },
      );
      return succeeded(result);
    } catch (error) {
      const failure = mapPdfFailure(error, request.abortSignal);
      return failed(failure.category, failure.safetyReason);
    }
  }

  async extractSelectableText(
    request: ExtractionRequest,
  ): Promise<ExtractionResult<readonly PdfPageText[]>> {
    if (request.format !== "pdf") {
      return failed("unsupported");
    }

    try {
      const data = await this.readSource(request);
      this.validateStructuralSafety(data);
      const pages = await this.withDocument(
        data,
        request.abortSignal,
        async (pdf) => {
          validatePageCount(pdf.numPages, this.limits.maximumPageCount);
          const result: PdfPageText[] = [];
          let readingOrder = 0;
          let extractedCharacters = 0;

          for (
            let pageNumber = 1;
            pageNumber <= pdf.numPages;
            pageNumber += 1
          ) {
            throwIfAborted(request.abortSignal);
            const page = await pdf.getPage(pageNumber);
            try {
              const textContent = await page.getTextContent({
                disableNormalization: false,
                includeMarkedContent: false,
              });
              throwIfAborted(request.abortSignal);
              const items: PdfTextItem[] = [];

              for (const candidate of textContent.items) {
                if (!("str" in candidate)) {
                  continue;
                }
                const transform = candidate.transform;
                const itemIndex = items.length;
                extractedCharacters += candidate.str.length;
                if (
                  readingOrder + 1 > this.maximumTextItemCount() ||
                  extractedCharacters > this.maximumExtractedTextCharacters()
                ) {
                  throw new ExtractionOperationError("resource_limit");
                }
                items.push(
                  Object.freeze({
                    text: normalizePdfText(candidate.str),
                    provenance: Object.freeze({
                      kind: "pdf_text_item" as const,
                      pageNumber,
                      itemIndex,
                      readingOrder,
                      boundingBox: Object.freeze({
                        x: finiteNumber(transform[4]),
                        y: finiteNumber(transform[5]),
                        width: finiteNumber(candidate.width),
                        height: finiteNumber(candidate.height),
                        unit: "pdf_point" as const,
                      }),
                      hasEol: candidate.hasEOL,
                    }),
                  }),
                );
                readingOrder += 1;
              }

              const annotations = await page.getAnnotations({
                intent: "display",
              });
              throwIfAborted(request.abortSignal);
              const httpAnnotations = annotations
                .map((annotation) => httpAnnotation(annotation))
                .filter(
                  (annotation): annotation is HttpAnnotation =>
                    annotation !== null,
                );
              if (httpAnnotations.length > maximumHttpAnnotationsPerPage) {
                throw new ExtractionOperationError("resource_limit");
              }
              const existingText = new Set(items.map((item) => item.text));
              for (const annotation of httpAnnotations) {
                if (existingText.has(annotation.url)) continue;
                const itemIndex = items.length;
                extractedCharacters += annotation.url.length;
                if (
                  readingOrder + 1 > this.maximumTextItemCount() ||
                  extractedCharacters > this.maximumExtractedTextCharacters()
                ) {
                  throw new ExtractionOperationError("resource_limit");
                }
                items.push(
                  Object.freeze({
                    text: annotation.url,
                    provenance: Object.freeze({
                      kind: "pdf_text_item" as const,
                      pageNumber,
                      itemIndex,
                      readingOrder,
                      boundingBox: Object.freeze({
                        ...annotation.boundingBox,
                        unit: "pdf_point" as const,
                      }),
                      hasEol: true,
                    }),
                  }),
                );
                existingText.add(annotation.url);
                readingOrder += 1;
              }

              result.push(
                Object.freeze({
                  pageNumber,
                  pageReadingOrder: pageNumber - 1,
                  items: Object.freeze(items),
                }),
              );
            } finally {
              page.cleanup();
            }
          }

          if (
            !result.some((page) =>
              page.items.some((item) => item.text.trim().length > 0),
            )
          ) {
            throw new ExtractionOperationError("scanned_or_image_only");
          }

          return Object.freeze(result);
        },
      );
      return succeeded(pages);
    } catch (error) {
      const failure = mapPdfFailure(error, request.abortSignal);
      return failed(failure.category, failure.safetyReason);
    }
  }

  private validateStructuralSafety(source: Uint8Array): void {
    const inspection = inspectPdfStructuralSafety(
      source,
      this.limits.maximumObjectCount ??
        documentExtractionSecurityLimits.maximumPdfObjectCount,
    );
    if (inspection.safe) return;
    if (inspection.failure === "resource_limit") {
      throw new ExtractionOperationError("resource_limit");
    }
    if (inspection.failure === "malformed_pdf") {
      throw new ExtractionOperationError("malformed");
    }
    throw new ExtractionOperationError(
      "unsupported",
      inspection.reasonCode ?? "pdf_unclassified_action",
    );
  }

  private maximumTextItemCount(): number {
    return (
      this.limits.maximumTextItemCount ??
      documentExtractionSecurityLimits.maximumPdfTextItemCount
    );
  }

  private maximumExtractedTextCharacters(): number {
    return (
      this.limits.maximumExtractedTextCharacters ??
      documentExtractionSecurityLimits.maximumExtractedTextCharacters
    );
  }

  private async readSource(request: ExtractionRequest): Promise<Uint8Array> {
    throwIfAborted(request.abortSignal);
    const bytes = await this.sourceReader.readSource({
      sourceStorageKey: request.sourceStorageKey,
      maximumBytes: this.limits.maximumFileSizeBytes,
      ...(request.abortSignal === undefined
        ? {}
        : { abortSignal: request.abortSignal }),
    });
    throwIfAborted(request.abortSignal);
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > this.limits.maximumFileSizeBytes
    ) {
      throw new ExtractionOperationError(
        bytes.byteLength === 0 ? "malformed" : "resource_limit",
      );
    }
    return bytes;
  }

  private async withDocument<Value>(
    source: Uint8Array,
    signal: AbortSignal | undefined,
    operation: (document: PDFDocumentProxy) => Promise<Value>,
  ): Promise<Value> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    throwIfAborted(signal);
    // Copy once because PDF.js may transfer/detach its input. The reference is
    // local to this operation and becomes unreachable after cleanup.
    const data = new Uint8Array(source);
    const loadingTask = pdfjs.getDocument({
      data,
      disableAutoFetch: true,
      disableFontFace: true,
      disableRange: true,
      disableStream: true,
      useSystemFonts: false,
      useWorkerFetch: false,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
    });
    const abort = () => {
      void loadingTask.destroy();
    };
    signal?.addEventListener("abort", abort, { once: true });
    let document: PDFDocumentProxy | undefined;
    try {
      document = await loadingTask.promise;
      throwIfAborted(signal);
      return await operation(document);
    } finally {
      signal?.removeEventListener("abort", abort);
      if (document !== undefined) {
        try {
          await document.cleanup();
        } catch {
          // Cleanup errors must not replace the stable operation result.
        }
        await loadingTask.destroy().catch(() => undefined);
      } else {
        await loadingTask.destroy().catch(() => undefined);
      }
      try {
        // PDF.js may transfer and detach this buffer. Zero it only when the
        // backing store remains locally accessible.
        data.fill(0);
      } catch {
        // A detached buffer no longer retains bytes in this realm.
      }
    }
  }
}

function validateLimits(limits: PdfExtractionLimits): void {
  const optionalLimits = [
    limits.maximumObjectCount,
    limits.maximumTextItemCount,
    limits.maximumExtractedTextCharacters,
  ].filter((value): value is number => value !== undefined);
  if (
    !Number.isSafeInteger(limits.maximumFileSizeBytes) ||
    limits.maximumFileSizeBytes <= 0 ||
    !Number.isSafeInteger(limits.maximumPageCount) ||
    limits.maximumPageCount <= 0 ||
    optionalLimits.some((value) => !Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new TypeError("PDF extraction limits must be positive integers.");
  }
}

function validatePageCount(actual: number, maximum: number): void {
  if (!Number.isSafeInteger(actual) || actual <= 0) {
    throw new ExtractionOperationError("malformed");
  }
  if (actual > maximum) {
    throw new ExtractionOperationError("resource_limit");
  }
}

function normalizePdfText(value: string): string {
  return value.replaceAll("\u00a0", " ").replace(/\r\n?/g, "\n");
}

interface HttpAnnotation {
  readonly url: string;
  readonly boundingBox: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

function httpAnnotation(annotation: unknown): HttpAnnotation | null {
  if (typeof annotation !== "object" || annotation === null) return null;
  const candidate = annotation as {
    readonly url?: unknown;
    readonly rect?: unknown;
  };
  if (typeof candidate.url !== "string") return null;
  if (candidate.url.length > maximumHttpAnnotationLength) return null;
  let parsed: URL;
  try {
    parsed = new URL(candidate.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const rect =
    Array.isArray(candidate.rect) && candidate.rect.length === 4
      ? candidate.rect.map((value) => finiteNumber(value))
      : [0, 0, 0, 0];
  const x1 = rect[0] ?? 0;
  const y1 = rect[1] ?? 0;
  const x2 = rect[2] ?? x1;
  const y2 = rect[3] ?? y1;
  return Object.freeze({
    url: parsed.href,
    boundingBox: Object.freeze({
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    }),
  });
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapPdfFailure(
  error: unknown,
  signal: AbortSignal | undefined,
): {
  readonly category: ReturnType<typeof categoryFromUnknown>;
  readonly safetyReason?: PdfSafetyReasonCode;
} {
  const safetyReason =
    error instanceof ExtractionOperationError ? error.safetyReason : undefined;
  const result = (
    category: ReturnType<typeof categoryFromUnknown>,
  ): {
    readonly category: ReturnType<typeof categoryFromUnknown>;
    readonly safetyReason?: PdfSafetyReasonCode;
  } => ({
    category,
    ...(safetyReason === undefined ? {} : { safetyReason }),
  });
  if (signal?.aborted === true) {
    return result("cancelled");
  }
  const known = categoryFromUnknown(error, "unexpected");
  if (known !== "unexpected") {
    return result(known);
  }
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "PasswordException":
      return result("password_protected");
    case "InvalidPDFException":
      return result("malformed");
    case "MissingPDFException":
    case "UnexpectedResponseException":
      return result("corrupted");
    case "AbortException":
      return result("corrupted");
    default:
      return result("unexpected");
  }
}
