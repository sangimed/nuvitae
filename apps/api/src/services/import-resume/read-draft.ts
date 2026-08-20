import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  extractedValueSchema,
  importResumeResponseSchemaVersion,
  reviewDraftReadResponseSchema,
  type GroupedReviewSection,
  type ReviewDraftReadResponse,
  type ReviewField,
  type ReviewWarning,
} from "@nuvitae/contracts";
import {
  allowedFieldActions,
  allowedWarningActions,
  findUnresolvedRequiredWarnings,
  type ExtractedField,
  type ImportDraft,
  type ImportWarning,
  type ResumeSection,
  type SourceLocation,
} from "@nuvitae/domain";
import type { ImportResumeRepository } from "@nuvitae/persistence";
import type { ImportEventEmitter } from "../../observability/import-events.js";
import { emitImportTiming } from "../../observability/import-events.js";
import { API_IMPORT_RESUME_REPOSITORY } from "../../persistence/api-persistence.module.js";
import type { ImportStatusRequestIdGenerator } from "../../import-resume/import-status.ports.js";
import {
  IMPORT_STATUS_REQUEST_ID_GENERATOR,
  START_IMPORT_CLOCK,
  START_IMPORT_PRIVACY_LOGGER,
} from "../../import-resume/start-import.tokens.js";
import type { StartImportClock } from "../../import-resume/start-import.ports.js";

const sections = [
  "personal",
  "contact",
  "headline",
  "summary",
  "work_experience",
  "education",
  "skills",
  "languages",
  "projects",
  "certifications",
  "professional_links",
] as const satisfies readonly ResumeSection[];

const labels: Record<ResumeSection, string> = {
  personal: "Personal information",
  contact: "Contact information",
  headline: "Headline",
  summary: "Summary",
  work_experience: "Work experience",
  education: "Education",
  skills: "Skills",
  languages: "Languages",
  projects: "Projects",
  certifications: "Certifications",
  professional_links: "Professional links",
};

export type ReadReviewDraftResult =
  | { readonly ok: true; readonly response: ReviewDraftReadResponse }
  | {
      readonly ok: false;
      readonly status: 404 | 409 | 410;
      readonly code: "not_found" | "not_ready" | "lifecycle_not_reviewable";
      readonly requestId: string;
      readonly message: string;
    };

@Injectable()
export class ReadImportDraftService {
  constructor(
    @Inject(API_IMPORT_RESUME_REPOSITORY)
    private readonly repository: ImportResumeRepository,
    @Inject(IMPORT_STATUS_REQUEST_ID_GENERATOR)
    private readonly requestIds: ImportStatusRequestIdGenerator,
    @Inject(START_IMPORT_PRIVACY_LOGGER)
    private readonly logger: ImportEventEmitter,
    @Optional()
    @Inject(START_IMPORT_CLOCK)
    private readonly clock: StartImportClock = { now: () => new Date() },
  ) {}

  async read(input: {
    readonly ownerUserId: string;
    readonly importId: string;
    readonly requestId?: string;
  }): Promise<ReadReviewDraftResult> {
    const requestId = input.requestId ?? this.requestIds.nextRequestId();
    const aggregate = await this.repository.findImportByOwner(
      input.importId,
      input.ownerUserId,
    );
    if (aggregate === null) {
      this.logger.emit("import.resource_not_found", {
        importId: input.importId,
        operation: "review",
      });
      return {
        ok: false,
        status: 404,
        code: "not_found",
        requestId,
        message:
          "We could not find that import. It may be unavailable or no longer accessible.",
      };
    }
    const draft = await this.repository.findReviewDraftByImportAndOwner(
      input.importId,
      input.ownerUserId,
    );
    if (draft === null) {
      return {
        ok: false,
        status: 409,
        code: "not_ready",
        requestId,
        message:
          "This import is not ready for review yet. Wait for processing to finish, then refresh.",
      };
    }
    if (
      draft.status !== "review_required" &&
      draft.status !== "ready_to_confirm"
    ) {
      return {
        ok: false,
        status: draft.status === "expired" ? 410 : 409,
        code: "lifecycle_not_reviewable",
        requestId,
        message: "This import cannot be reviewed in its current state.",
      };
    }
    const response = {
      ok: true as const,
      response: buildReviewDraftResponse({
        requestId,
        importId: input.importId,
        draft,
      }),
    };
    emitImportTiming(this.logger, {
      importId: input.importId,
      correlationId: input.importId,
      phase: "review_api_available",
      source: "api",
      at: this.clock.now(),
    });
    return response;
  }
}

export function buildReviewDraftResponse(input: {
  readonly requestId: string;
  readonly importId: string;
  readonly draft: ImportDraft;
}): ReviewDraftReadResponse {
  const unresolvedWarningCount = findUnresolvedRequiredWarnings(
    input.draft.warnings,
  ).length;
  const activeFieldCount = input.draft.fields.filter(
    (field) => field.reviewStatus !== "excluded",
  ).length;
  return reviewDraftReadResponseSchema.parse({
    version: importResumeResponseSchemaVersion,
    requestId: input.requestId,
    status: "review_draft",
    importId: input.importId,
    draftId: input.draft.id,
    draftStatus: input.draft.status,
    reviewRevision: input.draft.reviewRevision,
    retentionExpiresAt: input.draft.retentionExpiresAt.toISOString(),
    ...(input.draft.lastReviewedAt === undefined
      ? {}
      : { lastReviewedAt: input.draft.lastReviewedAt.toISOString() }),
    sections: sections.map((section) =>
      buildSection(section, input.draft.fields, input.draft.warnings),
    ),
    activeFieldCount,
    unresolvedWarningCount,
    readyToConfirm: input.draft.status === "ready_to_confirm",
    userMessage:
      input.draft.status === "ready_to_confirm"
        ? "Review requirements are complete. Final resume creation is a separate next step."
        : "Review the imported information and address the items that need attention.",
  });
}

function buildSection(
  section: ResumeSection,
  fields: readonly ExtractedField[],
  warnings: readonly ImportWarning[],
): GroupedReviewSection {
  const sectionWarnings = warnings.filter(
    (warning) => warning.section === section,
  );
  return {
    section,
    label: labels[section],
    fields: fields
      .filter((field) => field.section === section)
      .map((field) => toReviewField(field, sectionWarnings)),
    warnings: sectionWarnings.map(toReviewWarning),
    allowedActions: ["add", "exclude"],
  };
}

function toReviewField(
  field: ExtractedField,
  warnings: readonly ImportWarning[],
): ReviewField {
  return {
    fieldId: field.id,
    fieldPath: field.fieldPath,
    // Persistence is JSONB, so validate every value again at the public read
    // boundary. This keeps malformed legacy data fail-closed while allowing
    // the canonical present/current variant to omit calendar components.
    value: extractedValueSchema.parse(field.value),
    sourceStatus: field.sourceStatus,
    confidenceStatus: field.confidenceStatus,
    inferenceStatus: field.inferenceStatus,
    reviewStatus: field.reviewStatus,
    provenance: publicProvenance(field),
    warningIds: warnings
      .filter(
        (warning) =>
          warning.id === field.warningId ||
          (warning.fieldPath !== undefined &&
            warning.fieldPath === field.fieldPath),
      )
      .map((warning) => warning.id),
    allowedActions: [...allowedFieldActions(field)],
  };
}

function toReviewWarning(warning: ImportWarning): ReviewWarning {
  return {
    warningId: warning.id,
    warningType: warning.warningType,
    section: warning.section,
    ...(warning.fieldPath === undefined
      ? {}
      : { fieldPath: warning.fieldPath }),
    message: warning.message,
    severity: warning.severity,
    reviewStatus: warning.reviewStatus,
    requiresResolution: warning.requiresResolution,
    allowedActions: [...allowedWarningActions(warning)],
  };
}

function publicProvenance(field: ExtractedField): ReviewField["provenance"] {
  if (field.sourceStatus === "user_added") return { kind: "user_added" };
  if (field.sourceStatus === "user_edited") {
    return {
      kind: "user_edited",
      ...(field.sourceLocation === undefined
        ? {}
        : { original: safeOriginalProvenance(field.sourceLocation) }),
    };
  }
  if (field.inferenceStatus === "inferred_needs_review") {
    return {
      kind: "inferred",
      needsConfirmation: true,
      ...(field.sourceLocation === undefined
        ? {}
        : { original: safeOriginalProvenance(field.sourceLocation) }),
    };
  }
  if (field.sourceLocation === undefined) {
    return { kind: "minimal", label: "imported_from_initial_resume" };
  }
  return safeOriginalProvenance(field.sourceLocation);
}

function safeOriginalProvenance(
  location: SourceLocation,
): Exclude<
  ReviewField["provenance"],
  | { readonly kind: "user_edited" }
  | { readonly kind: "user_added" }
  | { readonly kind: "inferred" }
> {
  if (location.kind === "pdf")
    return { kind: "pdf", pageNumber: location.pageNumber };
  if (location.kind === "docx") {
    return {
      kind: "docx",
      documentPart: documentPart(location.packagePart),
      paragraphNumber: location.paragraphIndex + 1,
      ...(location.tableIndex === undefined
        ? {}
        : { tableNumber: location.tableIndex + 1 }),
      ...(location.rowIndex === undefined
        ? {}
        : { rowNumber: location.rowIndex + 1 }),
      ...(location.cellIndex === undefined
        ? {}
        : { cellNumber: location.cellIndex + 1 }),
    };
  }
  if (location.kind === "semantic") {
    return {
      kind: "semantic",
      evidence: location.evidence.map((item) => ({
        fragmentId: item.fragmentId,
        fragmentHash: item.fragmentHash,
        line: item.line,
        start: item.start,
        end: item.end,
      })),
    };
  }
  return { kind: "minimal", label: "imported_from_initial_resume" };
}

function documentPart(packagePart: string) {
  if (packagePart.includes("/header")) return "header" as const;
  if (packagePart.includes("/footer")) return "footer" as const;
  if (packagePart.includes("/footnote")) return "footnote" as const;
  if (packagePart.includes("/endnote")) return "endnote" as const;
  if (packagePart.endsWith("/document.xml")) return "body" as const;
  return "other" as const;
}
