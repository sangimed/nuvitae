import type {
  ExtractedField,
  ExtractedValue,
  ImportDraft,
  ImportWarning,
  ImportedDocument,
  SourceLocation,
} from "./types.js";
import {
  summarizeExtractionThreshold,
  type DraftThresholdFailureCode,
} from "./validation.js";

export type DeterministicResumeSection =
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
export interface DeterministicResumeFieldCandidate {
  readonly section: DeterministicResumeSection;
  readonly fieldPath: string;
  readonly value: ExtractedValue;
  readonly sourceLocation: unknown;
  readonly confidence: "high" | "medium" | "low" | "not_applicable";
  readonly inferenceStatus: "not_inferred" | "inferred_needs_review";
  readonly sourceOrder: number;
}
export interface DeterministicWarningCandidate {
  readonly warningType:
    | "missing"
    | "ambiguous"
    | "duplicate"
    | "conflicting"
    | "low_confidence"
    | "inferred"
    | "partial"
    | "unsupported";
  readonly section: DeterministicResumeSection;
  readonly fieldPath?: string;
  readonly message: string;
  readonly requiresResolution: boolean;
}

export interface DraftIdGenerators {
  draftId(): string;
  fieldId(): string;
  warningId(): string;
}

export interface ExtractionDraftBuildInput {
  readonly importedDocument: ImportedDocument;
  readonly fields: readonly DeterministicResumeFieldCandidate[];
  readonly warnings: readonly DeterministicWarningCandidate[];
  readonly missingOrUnprocessedSections: readonly string[];
  readonly ids: DraftIdGenerators;
  readonly now: Date;
}

export interface ExtractionDraftBuildResult {
  readonly category: "complete" | "partial" | "no_supported_field";
  readonly draft?: ImportDraft;
  /**
   * Stable reason for a closed admission gate. Consumers must keep recovery
   * provider-neutral and must not turn a detected language into eligibility.
   */
  readonly failureCode?: DraftThresholdFailureCode;
  readonly missingOrUnprocessedSections: readonly string[];
}

export function buildExtractionDraft(
  input: ExtractionDraftBuildInput,
): ExtractionDraftBuildResult {
  const activeFields = input.fields
    .filter((candidate) => candidate.inferenceStatus === "not_inferred")
    .map((candidate) => toField(candidate, input.ids.fieldId(), input.now));
  const inferredFields = input.fields
    .filter(
      (candidate) =>
        candidate.inferenceStatus === "inferred_needs_review" &&
        candidate.sourceLocation !== undefined,
    )
    .map((candidate) => toField(candidate, input.ids.fieldId(), input.now));
  const fields = [...activeFields, ...inferredFields];
  const threshold = summarizeExtractionThreshold(
    fields,
    input.missingOrUnprocessedSections,
    input.importedDocument.detectedLanguage ?? "unknown",
  );
  if (!threshold.mayCreateDraft)
    return {
      category: "no_supported_field",
      ...(threshold.failureCode === undefined
        ? {}
        : { failureCode: threshold.failureCode }),
      missingOrUnprocessedSections: threshold.missingOrUnprocessedSections,
    };
  const draftId = input.ids.draftId();
  const warnings = input.warnings.map((warning) =>
    toWarning(warning, input.ids.warningId(), input.now),
  );
  const linkedFields = fields.map((field) => ({
    ...field,
    importDraftId: draftId,
  }));
  const linkedWarnings = warnings.map((warning) => ({
    ...warning,
    importDraftId: draftId,
  }));
  const draft: ImportDraft = {
    id: draftId,
    importedDocumentId: input.importedDocument.id,
    ownerUserId: input.importedDocument.ownerUserId,
    status: "review_required",
    reviewRevision: 0,
    fields: linkedFields,
    warnings: linkedWarnings,
    createdAt: input.now,
    retentionExpiresAt: input.importedDocument.retentionExpiresAt,
  };
  return {
    category: threshold.category,
    draft,
    missingOrUnprocessedSections: threshold.missingOrUnprocessedSections,
  };
}

function toField(
  candidate: DeterministicResumeFieldCandidate,
  id: string,
  now: Date,
): ExtractedField {
  return {
    id,
    importDraftId: "pending",
    section: candidate.section,
    fieldPath: candidate.fieldPath,
    value: candidate.value,
    sourceStatus: "explicit_source",
    ...(candidate.sourceLocation === undefined
      ? {}
      : { sourceLocation: toSourceLocation(candidate.sourceLocation) }),
    confidenceStatus: candidate.confidence,
    inferenceStatus: candidate.inferenceStatus,
    reviewStatus: "unreviewed",
    createdAt: now,
    updatedAt: now,
  };
}

function toSourceLocation(value: unknown): SourceLocation {
  if (typeof value !== "object" || value === null)
    throw new TypeError("source location is required");
  const location = value as Record<string, unknown>;
  if (location.kind === "pdf_text_item") {
    return {
      kind: "pdf",
      pageNumber: location.pageNumber as number,
      textItemIndex: location.itemIndex as number,
      boundingBox: location.boundingBox as never,
    };
  }
  if (location.kind === "docx_run") {
    return {
      kind: "docx",
      packagePart: location.packagePart as string,
      paragraphIndex: location.paragraphIndex as number,
      ...(location.tableIndex === undefined
        ? {}
        : { tableIndex: location.tableIndex as number }),
      ...(location.rowIndex === undefined
        ? {}
        : { rowIndex: location.rowIndex as number }),
      ...(location.cellIndex === undefined
        ? {}
        : { cellIndex: location.cellIndex as number }),
      runIndex: location.runIndex as number,
      characterOffsetStart: location.characterOffsetStart as number,
      characterOffsetEnd: location.characterOffsetEnd as number,
    };
  }
  return value as SourceLocation;
}

function toWarning(
  candidate: DeterministicWarningCandidate,
  id: string,
  now: Date,
): ImportWarning {
  return {
    id,
    importDraftId: "pending",
    warningType: candidate.warningType,
    section: candidate.section,
    ...(candidate.fieldPath ? { fieldPath: candidate.fieldPath } : {}),
    message: candidate.message,
    severity: candidate.requiresResolution ? "needs_attention" : "info",
    reviewStatus: "needs_review",
    requiresResolution: candidate.requiresResolution,
    createdAt: now,
  };
}
