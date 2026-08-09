import type { ImportDraft, ImportedDocument } from "@nuvitae/domain";
import type {
  ImportAggregate,
  ImportResumeRepository,
} from "@nuvitae/persistence";
import { describe, expect, it, vi } from "vitest";
import type { ImportStatusQueueReader } from "./import-status.ports.js";
import { ImportStatusService } from "./import-status.service.js";

const ownerUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherOwnerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const importId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const draftId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const requestId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("ImportStatusService", () => {
  it("returns strict public processing status and ignores unknown response fields", async () => {
    const harness = createHarness({
      document: document({
        validationStatus: "accepted",
        processingStatus: "processing",
      }),
      queueProgress: {
        step: "organizing_resume_sections",
        progressKnown: true,
        progressPercent: 60,
        updatedAt: new Date("2026-07-29T10:00:00.000Z"),
      },
    });

    const response = await harness.service.readStatus({
      importId,
      ownerUserId,
      requestId,
    });

    expect(response).toEqual({
      version: "2026-07-28",
      requestId,
      importId,
      status: "processing",
      currentStep: "organizing_resume_sections",
      progressKnown: true,
      progressPercent: 60,
      allowedRecoveryActions: ["manual_entry"],
      userMessage: "Organizing the resume information into sections.",
    });
    expect(JSON.stringify(response)).not.toContain("storage");
    expect(JSON.stringify(response)).not.toContain("resume.pdf");
  });

  it("uses owner-scoped lookup and makes wrong-owner and missing indistinguishable", async () => {
    const missing = createHarness({ document: null });
    const missingResponse = await missing.service.readStatus({
      importId,
      ownerUserId,
      requestId,
    });
    const wrongOwner = createHarness({ document: null });
    const wrongOwnerResponse = await wrongOwner.service.readStatus({
      importId,
      ownerUserId: otherOwnerId,
      requestId,
    });

    expect(missing.repository.findImportByOwner).toHaveBeenCalledWith(
      importId,
      ownerUserId,
    );
    expect(wrongOwner.repository.findImportByOwner).toHaveBeenCalledWith(
      importId,
      otherOwnerId,
    );
    expect(missingResponse).toEqual(wrongOwnerResponse);
    expect(missingResponse.status).toBe("not_found");
  });

  it("ignores malformed queue progress", async () => {
    const harness = createHarness({
      document: document({
        validationStatus: "accepted",
        processingStatus: "processing",
      }),
      queueProgress: {
        step: "parser_internal",
        progressKnown: true,
        progressPercent: 99,
        updatedAt: new Date("2026-07-29T10:00:00.000Z"),
      },
    });

    await expect(
      harness.service.readStatus({ importId, ownerUserId, requestId }),
    ).resolves.toMatchObject({
      status: "processing",
      currentStep: "reading_content",
      progressKnown: false,
    });
  });

  it("never lets stale queue progress override terminal PostgreSQL state", async () => {
    const harness = createHarness({
      document: document({
        validationStatus: "accepted",
        processingStatus: "failed",
      }),
      queueProgress: {
        step: "preparing_review",
        progressKnown: true,
        progressPercent: 99,
        updatedAt: new Date("2026-07-29T10:00:00.000Z"),
      },
    });

    await expect(
      harness.service.readStatus({ importId, ownerUserId, requestId }),
    ).resolves.toMatchObject({
      status: "terminal_processing_failure",
      progressKnown: false,
      allowedRecoveryActions: ["replace_upload", "manual_entry"],
    });
  });

  it("maps provider_unavailable to a privacy-safe terminal recovery state", async () => {
    const harness = createHarness({
      document: document({
        validationStatus: "accepted",
        processingStatus: "provider_unavailable",
      }),
      queueProgress: {
        step: "preparing_review",
        progressKnown: true,
        progressPercent: 99,
        updatedAt: new Date("2026-07-29T10:00:00.000Z"),
      },
    });

    const response = await harness.service.readStatus({
      importId,
      ownerUserId,
      requestId,
    });
    expect(response).toMatchObject({
      status: "terminal_processing_failure",
      progressKnown: false,
      failure: {
        code: "provider_unavailable",
        retryable: false,
        recoveryActions: ["manual_entry"],
      },
      allowedRecoveryActions: ["manual_entry"],
    });
    expect(response.failure?.userMessage).not.toMatch(
      /provider|parser|storage/i,
    );
    expect(JSON.stringify(response)).not.toContain("resume.pdf");
    expect(JSON.stringify(response)).not.toContain("storage");
  });

  it("maps ready drafts and partial drafts without exposing source data", async () => {
    const ready = createHarness({
      document: document({ processingStatus: "ready_for_review" }),
      draft: draft({ warnings: [] }),
    });
    await expect(
      ready.service.readStatus({ importId, ownerUserId, requestId }),
    ).resolves.toMatchObject({
      status: "draft_ready",
      draftSummary: { draftId, fieldCount: 1, warningCount: 0 },
    });

    const partial = createHarness({
      document: document({ processingStatus: "ready_for_review" }),
      draft: draft({ warnings: [{}] }),
    });
    await expect(
      partial.service.readStatus({ importId, ownerUserId, requestId }),
    ).resolves.toMatchObject({
      status: "partial_extraction",
      draftSummary: { draftId, fieldCount: 1, warningCount: 1 },
    });
  });
});

function createHarness(options: {
  readonly document: ImportedDocument | null;
  readonly draft?: ImportDraft | null;
  readonly queueProgress?: unknown;
}) {
  const aggregate: ImportAggregate | null =
    options.document === null
      ? null
      : { document: options.document, artifacts: [] };
  const repository = {
    findImportByOwner: vi.fn(async () => aggregate),
    findDraftByImportAndOwner: vi.fn(async () => options.draft ?? null),
  } as unknown as ImportResumeRepository & {
    findImportByOwner: ReturnType<typeof vi.fn>;
  };
  const queueReader: ImportStatusQueueReader = {
    readProgress: vi.fn(async () => options.queueProgress ?? null),
  };
  const service = new ImportStatusService(
    repository,
    { nextRequestId: () => requestId },
    { emit: () => undefined },
    queueReader,
  );
  return { service, repository, queueReader };
}

function document(overrides: Partial<ImportedDocument> = {}): ImportedDocument {
  return {
    id: importId,
    ownerUserId,
    visibleFilename: "resume.pdf",
    contentType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes: 100,
    storageKey: "users/private/source",
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "processing",
    deletionStatus: "not_scheduled",
    createdAt: new Date("2026-07-29T09:30:00.000Z"),
    retentionExpiresAt: new Date("2026-08-05T09:30:00.000Z"),
    ...overrides,
  };
}

function draft(
  overrides: { readonly warnings?: readonly object[] } = {},
): ImportDraft {
  return {
    id: draftId,
    importedDocumentId: importId,
    ownerUserId,
    status: "review_required",
    reviewRevision: 0,
    fields: [
      {
        id: "field-1",
        importDraftId: draftId,
        section: "summary",
        fieldPath: "summary",
        value: { kind: "text", value: "Private content" },
        sourceStatus: "explicit_source",
        confidenceStatus: "high",
        inferenceStatus: "not_inferred",
        reviewStatus: "unreviewed",
        createdAt: new Date("2026-07-29T09:31:00.000Z"),
        updatedAt: new Date("2026-07-29T09:31:00.000Z"),
      },
    ],
    warnings: (overrides.warnings ?? []).map((_, index) => ({
      id: `warning-${index}`,
      importDraftId: draftId,
      warningType: "partial",
      section: "summary",
      message: "Review this section.",
      severity: "needs_attention",
      reviewStatus: "needs_review",
      requiresResolution: true,
      createdAt: new Date("2026-07-29T09:31:00.000Z"),
    })),
    createdAt: new Date("2026-07-29T09:31:00.000Z"),
    retentionExpiresAt: new Date("2026-08-05T09:30:00.000Z"),
  };
}
