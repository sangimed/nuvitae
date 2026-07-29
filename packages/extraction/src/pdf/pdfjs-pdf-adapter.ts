import type {
  ExtractionRequest,
  ExtractionResult,
  ExtractionSourceReader,
  PageCountResult,
  PdfExtractionLimits,
  PdfPageCounter,
  PdfPageText,
  PdfSelectableTextExtractor,
  PdfTextItem,
} from "../adapters.js";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api.js";
import {
  ExtractionOperationError,
  categoryFromUnknown,
  failed,
  succeeded,
  throwIfAborted,
} from "../extraction-failures.js";

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
      return failed(mapPdfFailure(error, request.abortSignal));
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
      const pages = await this.withDocument(
        data,
        request.abortSignal,
        async (pdf) => {
          validatePageCount(pdf.numPages, this.limits.maximumPageCount);
          const result: PdfPageText[] = [];
          let readingOrder = 0;

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
                    }),
                  }),
                );
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
      return failed(mapPdfFailure(error, request.abortSignal));
    }
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
      isEvalSupported: false,
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
        await document.destroy().catch(() => undefined);
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
  if (
    !Number.isSafeInteger(limits.maximumFileSizeBytes) ||
    limits.maximumFileSizeBytes <= 0 ||
    !Number.isSafeInteger(limits.maximumPageCount) ||
    limits.maximumPageCount <= 0
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

function finiteNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapPdfFailure(
  error: unknown,
  signal: AbortSignal | undefined,
): ReturnType<typeof categoryFromUnknown> {
  if (signal?.aborted === true) {
    return "cancelled";
  }
  const known = categoryFromUnknown(error, "unexpected");
  if (known !== "unexpected") {
    return known;
  }
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "PasswordException":
      return "password_protected";
    case "InvalidPDFException":
      return "malformed";
    case "MissingPDFException":
    case "UnexpectedResponseException":
      return "corrupted";
    case "AbortException":
      return "corrupted";
    default:
      return "unexpected";
  }
}
