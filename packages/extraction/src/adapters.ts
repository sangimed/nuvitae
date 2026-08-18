export type ExtractionDocumentFormat = "pdf" | "docx";
export type ExtractionLanguage =
  "english" | "french" | "bilingual_french_english" | "unsupported" | "unknown";

export type ExtractionFailureCategory =
  | "malformed"
  | "corrupted"
  | "encrypted"
  | "password_protected"
  | "scanned_or_image_only"
  | "unsupported"
  | "resource_limit"
  | "cancelled"
  | "unexpected";

export const pdfSafetyReasonCodes = [
  "pdf_javascript_action",
  "pdf_launch_action",
  "pdf_embedded_file",
  "pdf_rich_media",
  "pdf_unsupported_active_content",
  "pdf_unclassified_action",
  "pdf_malformed_active_content",
] as const;

export type PdfSafetyReasonCode = (typeof pdfSafetyReasonCodes)[number];

export interface ExtractionFailure {
  readonly category: ExtractionFailureCategory;
  readonly retryable: boolean;
  readonly message: string;
  readonly safetyReason?: PdfSafetyReasonCode;
}

export type ExtractionResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: ExtractionFailure };

export interface ExtractionRequest {
  readonly importId: string;
  readonly ownerUserId: string;
  readonly sourceStorageKey: string;
  readonly format: ExtractionDocumentFormat;
  readonly abortSignal?: AbortSignal;
}

/**
 * Provider-independent byte source. `sourceStorageKey` is an opaque reference;
 * implementations resolve it inside their own trusted storage boundary.
 */
export interface ExtractionSourceReader {
  readSource(input: {
    readonly sourceStorageKey: string;
    readonly maximumBytes: number;
    readonly abortSignal?: AbortSignal;
  }): Promise<Uint8Array>;
}

export interface PdfExtractionLimits {
  readonly maximumFileSizeBytes: number;
  readonly maximumPageCount: number;
}

export interface DocxExtractionLimits {
  readonly maximumArchiveSizeBytes: number;
  readonly maximumEntryCount: number;
  readonly maximumEntryUncompressedSizeBytes: number;
  readonly maximumTotalUncompressedSizeBytes: number;
  readonly maximumCompressionRatio: number;
  readonly maximumXmlDepth: number;
}

export interface PdfBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly unit: "pdf_point";
}

export interface PdfTextItemProvenance {
  readonly kind: "pdf_text_item";
  readonly pageNumber: number;
  readonly itemIndex: number;
  readonly readingOrder: number;
  readonly boundingBox: PdfBoundingBox;
  readonly hasEol?: boolean;
}

export interface PdfTextItem {
  readonly text: string;
  readonly provenance: PdfTextItemProvenance;
}

export interface PdfPageText {
  readonly pageNumber: number;
  readonly pageReadingOrder: number;
  readonly items: readonly PdfTextItem[];
}

export interface DocxRunProvenance {
  readonly kind: "docx_run";
  readonly packagePart: string;
  readonly paragraphIndex: number;
  readonly tableIndex?: number;
  readonly rowIndex?: number;
  readonly cellIndex?: number;
  readonly runIndex: number;
  readonly characterOffsetStart: number;
  readonly characterOffsetEnd: number;
  readonly readingOrder: number;
}

export interface DocxTextRun {
  readonly text: string;
  readonly provenance: DocxRunProvenance;
}

export interface DocxParagraph {
  readonly packagePart: string;
  readonly paragraphIndex: number;
  readonly readingOrder: number;
  readonly runs: readonly DocxTextRun[];
}

export interface DocxTableCell {
  readonly tableIndex: number;
  readonly rowIndex: number;
  readonly cellIndex: number;
  readonly readingOrder: number;
  readonly paragraphs: readonly DocxParagraph[];
}

export interface PageCountResult {
  readonly renderedPageCount: number;
}

export interface SelectableTextAssessment {
  readonly hasSelectableText: boolean;
  readonly textItemCount: number;
  readonly selectablePageCount: number;
  readonly imageOnlyPageCount: number;
  readonly mixedTextAndImage: boolean;
}

export interface LanguageDetectionResult {
  readonly language: ExtractionLanguage;
  readonly confidence: "high" | "medium" | "low" | "not_applicable";
}

export type DeterministicSourceLocation =
  PdfTextItemProvenance | DocxRunProvenance;

export interface DeterministicExtractedFact {
  readonly id: string;
  readonly section:
    | "personal"
    | "contact"
    | "headline"
    | "summary"
    | "work_experience"
    | "education"
    | "skills"
    | "languages"
    | "projects"
    | "certifications"
    | "professional_links";
  readonly fieldPath: string;
  readonly text: string;
  readonly sourceLocation: DeterministicSourceLocation;
  readonly confidence: "high" | "medium" | "low" | "not_applicable";
  readonly readingOrder: number;
}

export interface DeterministicExtractionOutput {
  readonly importId: string;
  readonly documentFormat: ExtractionDocumentFormat;
  readonly language: ExtractionLanguage;
  readonly facts: readonly DeterministicExtractedFact[];
  readonly warnings: readonly DeterministicExtractionWarning[];
}

export interface DeterministicExtractionWarning {
  readonly code:
    | "missing"
    | "ambiguous"
    | "conflicting"
    | "duplicate"
    | "low_confidence"
    | "unsafe"
    | "partial"
    | "mixed_content"
    | "hidden_instruction";
  readonly message: string;
  readonly relatedFactIds: readonly string[];
}

export interface PdfPageCounter {
  countPages(
    request: ExtractionRequest,
  ): Promise<ExtractionResult<PageCountResult>>;
}

export interface PdfSelectableTextExtractor {
  extractSelectableText(
    request: ExtractionRequest,
  ): Promise<ExtractionResult<readonly PdfPageText[]>>;
}

export interface DocxDeterministicTextExtractor {
  extractText(
    request: ExtractionRequest,
  ): Promise<ExtractionResult<readonly DocxParagraph[]>>;
}

export interface DocxRenderedPageCounter {
  countRenderedPages(
    request: ExtractionRequest,
  ): Promise<ExtractionResult<PageCountResult>>;
}

export interface SelectableTextAssessor {
  assessSelectableText(
    request: ExtractionRequest,
    extractedText: readonly PdfPageText[] | readonly DocxParagraph[],
  ): Promise<ExtractionResult<SelectableTextAssessment>>;
}

export interface LanguageDetector {
  detectLanguage(
    request: ExtractionRequest,
    extractedText: readonly PdfPageText[] | readonly DocxParagraph[],
  ): Promise<ExtractionResult<LanguageDetectionResult>>;
}

export interface DeterministicResumeExtractor {
  extractDeterministicFacts(
    request: ExtractionRequest,
    extractedText: readonly PdfPageText[] | readonly DocxParagraph[],
    language: LanguageDetectionResult,
  ): Promise<ExtractionResult<DeterministicExtractionOutput>>;
}
