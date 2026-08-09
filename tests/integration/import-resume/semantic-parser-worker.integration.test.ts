import { readFile, stat } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
} from "@nuvitae/contracts";
import { resumeSemanticParserContractVersion } from "@nuvitae/contracts";
import {
  createPrivacySafeSemanticProviderError,
  validateSemanticResponse,
  type ResumeSemanticParserCapabilities,
  type ResumeSemanticParserProvider,
  type ResumeSemanticParserProviderResult,
  type SemanticProviderErrorCode,
} from "@nuvitae/import-application";
import {
  createDeterministicSemanticParserProvider,
  deterministicFixtureProfiles,
  type DeterministicFixtureProfile,
} from "@nuvitae/import-application/testing";
import {
  OoxmlDocxAdapter,
  PdfJsPdfAdapter,
  type ExtractionSourceReader,
} from "@nuvitae/extraction";
import type { ImportedDocument } from "@nuvitae/domain";
import {
  TypeOrmImportResumeRepository,
  type DataSource,
} from "@nuvitae/persistence";
import {
  SemanticImportProcessor,
  type SemanticImportLogger,
} from "../../../apps/worker/src/import-resume/semantic-import.processor.js";
import {
  createIsolatedPersistenceTestDatabase,
  type IsolatedPersistenceTestDatabase,
} from "../persistence/test-database.js";

const pdfFixturePath =
  "tests/fixtures/resumes/semantic-vertical-slice-jordan-avery.pdf";
const docxFixturePath =
  "tests/fixtures/resumes/semantic-vertical-slice-maya-chen.docx";

const ownerUserId = "20000000-0000-4000-8000-000000000201";
const now = new Date("2026-08-01T10:00:00.000Z");
const createdAt = new Date("2026-08-01T09:30:00.000Z");
const retentionExpiresAt = new Date("2026-08-08T09:30:00.000Z");

const deterministicProvider = createDeterministicSemanticParserProvider();
const baseCapabilities: ResumeSemanticParserCapabilities =
  deterministicProvider.capabilities;

const docxLimits = {
  maximumArchiveSizeBytes: 100_000,
  maximumEntryCount: 200,
  maximumEntryUncompressedSizeBytes: 5 * 1024 * 1024,
  maximumTotalUncompressedSizeBytes: 20 * 1024 * 1024,
  maximumCompressionRatio: 200,
  maximumXmlDepth: 80,
} as const;

describe("semantic parser worker integration", () => {
  let database: IsolatedPersistenceTestDatabase;
  let dataSource: DataSource;
  let importSequence = 0;

  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("t166_worker");
    dataSource = database.dataSource;
  });

  beforeEach(async () => {
    importSequence = 0;
    await truncateImportResumeTables(dataSource);
  });

  afterAll(async () => {
    if (database !== undefined) await database.cleanup();
  });

  it("runs orchestration through ResumeSemanticParserProvider with the normalized transcript and flattened fragments", async () => {
    const profile = pdfProfile();
    const importId = nextImportId();
    const requests: ResumeSemanticParseRequest[] = [];
    const harness = createHarness(dataSource, {
      provider: recordingProvider(requests, deterministicProvider),
    });
    await seedImport(harness.repository, "pdf", importId);

    await harness.processor.process({
      ownerUserId,
      importedDocumentId: importId,
    });

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request).toBeDefined();
    if (request === undefined) return;
    expect(request).toMatchObject({
      contractVersion: resumeSemanticParserContractVersion,
      importId,
      documentFormat: "pdf",
    });
    expect(request.normalizedTranscript).toEqual(profile.transcript);
    expect(request.sourceFragments).toEqual(profile.fragments);
    expect(request.fragmentHashes).toEqual(profile.fragmentHashes);
    expect(request.formatMetadata).toEqual(profile.formatMetadata);
    await expectStatus(importId, "ready_for_review");
    await expectDraftCount(importId, 1);
  });

  it("persists exactly one review draft with unconfirmed candidates from valid provider output", async () => {
    const harness = createHarness(dataSource, {
      provider: deterministicProvider,
    });
    const importId = nextImportId();
    await seedImport(harness.repository, "pdf", importId);

    await harness.processor.process({
      ownerUserId,
      importedDocumentId: importId,
    });

    await expectStatus(importId, "ready_for_review");
    await expectDraftCount(importId, 1);
    const draft = await harness.repository.findDraftByImportAndOwner(
      importId,
      ownerUserId,
    );
    expect(draft).not.toBeNull();
    if (draft === null) return;
    expect(draft.status).toBe("review_required");
    expect(draft.confirmedAt).toBeUndefined();
    expect(draft.fields.length).toBeGreaterThan(0);
    for (const field of draft.fields) {
      expect(field.reviewStatus).toBe("unreviewed");
      expect(field.inferenceStatus).toBe("not_inferred");
      expect(field.sourceStatus).toBe("explicit_source");
    }
    await expectStructuredResumeCount(importId, 0);
  });

  it("creates review-required warnings before the review draft for ambiguous provider output", async () => {
    const harness = createHarness(dataSource, {
      provider: deterministicProvider,
    });
    const importId = nextImportId();
    await seedImport(harness.repository, "docx", importId);

    await harness.processor.process({
      ownerUserId,
      importedDocumentId: importId,
    });

    await expectStatus(importId, "ready_for_review");
    await expectDraftCount(importId, 1);
    const draft = await harness.repository.findDraftByImportAndOwner(
      importId,
      ownerUserId,
    );
    expect(draft).not.toBeNull();
    if (draft === null) return;
    expect(draft.status).toBe("review_required");
    expect(draft.warnings.length).toBeGreaterThan(0);
    for (const warning of draft.warnings) {
      expect(warning.warningType).toBe("ambiguous");
      expect(warning.requiresResolution).toBe(true);
      expect(warning.reviewStatus).toBe("needs_review");
      expect(warning.severity).toBe("needs_attention");
      expect(warning.message.length).toBeGreaterThan(0);
      expect(warning.importDraftId).toBe(draft.id);
    }
    expect(
      draft.fields.every((field) => field.reviewStatus === "unreviewed"),
    ).toBe(true);
  });

  it("keeps repeated delivery idempotent with exactly one review draft", async () => {
    const harness = createHarness(dataSource, {
      provider: deterministicProvider,
    });
    const importId = nextImportId();
    await seedImport(harness.repository, "pdf", importId);

    await harness.processor.process({
      ownerUserId,
      importedDocumentId: importId,
    });
    await harness.processor.process({
      ownerUserId,
      importedDocumentId: importId,
    });

    await expectStatus(importId, "ready_for_review");
    await expectDraftCount(importId, 1);
    const drafts = await draftRows(importId);
    expect(drafts.length).toBe(1);
  });

  it.each(["provider_unavailable", "timeout"] as const)(
    "runs the bounded fallback after one %s provider failure, with privacy-safe provider-neutral logging",
    async (code) => {
      const parseCalls = { value: 0 };
      const harness = createHarness(dataSource, {
        provider: failingProvider(code, parseCalls),
      });
      const importId = nextImportId();
      await seedImport(harness.repository, "pdf", importId);

      await harness.processor.process({
        ownerUserId,
        importedDocumentId: importId,
      });

      expect(parseCalls.value).toBe(1);
      await expectStatus(importId, "ready_for_review");
      await expectDraftCount(importId, 1);
      await expectStructuredResumeCount(importId, 0);
      const serialized = JSON.stringify(harness.logs);
      expect(serialized).not.toContain("Jordan Avery");
      expect(serialized).not.toContain("jordan.avery@example.test");
      expect(serialized).not.toContain("Nova Systems");
      expect(serialized).not.toContain("TypeScript");
      expect(serialized).not.toContain("users/");
      expect(serialized).not.toContain("controlled-failing-test");
      expect(serialized).not.toContain("schemaVersion");
      expect(serialized).not.toContain("sections");
    },
  );

  it("uses the bounded fallback when no provider is configured", async () => {
    const harness = createHarness(dataSource, { provider: undefined });
    const importId = nextImportId();
    await seedImport(harness.repository, "pdf", importId);

    await harness.processor.process({
      ownerUserId,
      importedDocumentId: importId,
    });

    await expectStatus(importId, "ready_for_review");
    await expectDraftCount(importId, 1);
    await expectStructuredResumeCount(importId, 0);
  });

  it.each([
    ["malformed flattened evidence", malformedEvidenceResponse, "evidence"],
    ["ungrounded value", ungroundedResponse, "evidence"],
    ["invented value", inventedResponse, "no_invention"],
    ["inferred-only value", inferredResponse, "review"],
    ["conflicting output", conflictingResponse, "conflict"],
    ["invalid schema output", invalidSchemaResponse, "schema"],
  ] as const)(
    "creates no draft when provider output has %s",
    async (_label, buildResponse, expectedCategory) => {
      const response = buildResponse();
      const profile = pdfProfile();
      const request = buildFixtureRequest(profile);
      const validation = validateSemanticResponse({ request, response });
      expect(validation.accepted).toBe(false);
      expect(
        validation.diagnostics.some(
          (item) => item.category === expectedCategory,
        ),
      ).toBe(true);

      const harness = createHarness(dataSource, {
        provider: responseProvider(response),
      });
      const importId = nextImportId();
      await seedImport(harness.repository, "pdf", importId);

      await harness.processor.process({
        ownerUserId,
        importedDocumentId: importId,
      });

      const protocolFailure =
        expectedCategory === "schema" ||
        (_label === "malformed flattened evidence" &&
          expectedCategory === "evidence");
      await expectStatus(
        importId,
        protocolFailure ? "ready_for_review" : "semantic_validation_failed",
      );
      await expectDraftCount(importId, protocolFailure ? 1 : 0);
      await expectStructuredResumeCount(importId, 0);
    },
  );

  function nextImportId(): string {
    importSequence += 1;
    return `20000000-0000-4000-8000-${String(importSequence).padStart(12, "0")}`;
  }

  function createHarness(
    source: DataSource,
    options: {
      readonly provider?: ResumeSemanticParserProvider | undefined;
    },
  ): {
    readonly repository: TypeOrmImportResumeRepository;
    readonly processor: SemanticImportProcessor;
    readonly logs: readonly {
      readonly event: string;
      readonly metadata: Readonly<Record<string, unknown>>;
    }[];
  } {
    const repository = new TypeOrmImportResumeRepository(source);
    const logs: {
      readonly event: string;
      readonly metadata: Readonly<Record<string, unknown>>;
    }[] = [];
    const logger: SemanticImportLogger = {
      emit: (event, metadata) => {
        logs.push({ event, metadata });
      },
    };
    const fileReader: ExtractionSourceReader = {
      async readSource(input) {
        const bytes = await readFile(input.sourceStorageKey);
        return bytes.byteLength > input.maximumBytes
          ? bytes.subarray(0, input.maximumBytes + 1)
          : bytes;
      },
    };
    const pdf = new PdfJsPdfAdapter(fileReader, {
      maximumFileSizeBytes: 100_000,
      maximumPageCount: 5,
    });
    const docx = new OoxmlDocxAdapter(fileReader, docxLimits);
    const processor = new SemanticImportProcessor({
      repository,
      transactionRunner: repository,
      sourceReader: fileReader,
      pdfTextExtractor: pdf,
      docxTextExtractor: docx,
      provider: options.provider,
      clock: { now: () => now },
      logger,
    });
    return { repository, processor, logs };
  }

  async function seedImport(
    repository: TypeOrmImportResumeRepository,
    fileExtension: "pdf" | "docx",
    importId: string,
  ): Promise<void> {
    const metadata = await stat(
      fileExtension === "pdf" ? pdfFixturePath : docxFixturePath,
    );
    await repository.createImportAggregate({
      document: documentFor(fileExtension, metadata.size, importId),
      artifacts: [],
    });
  }

  async function expectStatus(
    importId: string,
    expected: string,
  ): Promise<void> {
    const rows = (await dataSource.query(
      "SELECT processing_status FROM imported_documents WHERE id = $1 AND owner_user_id = $2",
      [importId, ownerUserId],
    )) as { processing_status: string }[];
    expect(rows[0]?.processing_status).toBe(expected);
  }

  async function expectDraftCount(
    importId: string,
    expected: number,
  ): Promise<void> {
    const rows = (await dataSource.query(
      "SELECT count(*)::int AS n FROM import_drafts WHERE imported_document_id = $1 AND owner_user_id = $2",
      [importId, ownerUserId],
    )) as { n: number }[];
    expect(Number(rows[0]?.n ?? 0)).toBe(expected);
  }

  async function draftRows(importId: string): Promise<readonly unknown[]> {
    return (await dataSource.query(
      "SELECT id, status FROM import_drafts WHERE imported_document_id = $1 AND owner_user_id = $2",
      [importId, ownerUserId],
    )) as readonly unknown[];
  }

  async function expectStructuredResumeCount(
    importId: string,
    expected: number,
  ): Promise<void> {
    const rows = (await dataSource.query(
      `SELECT count(*)::int AS n
         FROM structured_resumes sr
         JOIN import_drafts d
           ON d.id = sr.source_import_draft_id
          AND d.owner_user_id = sr.owner_user_id
        WHERE d.imported_document_id = $1
          AND d.owner_user_id = $2`,
      [importId, ownerUserId],
    )) as { n: number }[];
    expect(Number(rows[0]?.n ?? 0)).toBe(expected);
  }
});

function pdfProfile(): DeterministicFixtureProfile {
  const profile = deterministicFixtureProfiles.find(
    (candidate) => candidate.profileId === "pdf-english-anonymous",
  );
  if (profile === undefined) throw new Error("Missing PDF fixture profile.");
  return profile;
}

function documentFor(
  fileExtension: "pdf" | "docx",
  sizeBytes: number,
  importId: string,
): ImportedDocument {
  return {
    id: importId,
    ownerUserId,
    visibleFilename:
      fileExtension === "pdf"
        ? "semantic-vertical-slice-jordan-avery.pdf"
        : "semantic-vertical-slice-maya-chen.docx",
    contentType:
      fileExtension === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileExtension,
    sizeBytes,
    renderedPageCount: 1,
    detectedLanguage: "english",
    storageKey: fileExtension === "pdf" ? pdfFixturePath : docxFixturePath,
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "queued",
    deletionStatus: "not_scheduled",
    createdAt,
    retentionExpiresAt,
  };
}

function buildFixtureRequest(
  profile: DeterministicFixtureProfile,
): ResumeSemanticParseRequest {
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: "20000000-0000-4000-8000-000000000099",
    correlationId: "20000000-0000-4000-8000-000000000099",
    documentFormat: profile.documentFormat,
    languageContext: {
      detectedLanguage: "english",
      confidence: null,
      textDirection: "ltr",
    },
    normalizedTranscript: profile.transcript,
    sourceFragments: [...profile.fragments],
    fragmentHashes: [...profile.fragmentHashes],
    formatMetadata: profile.formatMetadata,
  };
}

function recordingProvider(
  requests: ResumeSemanticParseRequest[],
  delegate: ResumeSemanticParserProvider,
): ResumeSemanticParserProvider {
  return {
    providerKind: "recording-test",
    capabilities: delegate.capabilities,
    async inspectConnection() {
      return delegate.inspectConnection();
    },
    async parse(request, options) {
      requests.push(request);
      return delegate.parse(request, options);
    },
  };
}

function failingProvider(
  code: SemanticProviderErrorCode,
  parseCalls: { value: number } = { value: 0 },
): ResumeSemanticParserProvider {
  return {
    providerKind: "controlled-failing-test",
    capabilities: baseCapabilities,
    async inspectConnection() {
      return {
        connectionState: "connected",
        availabilityState: "unavailable",
        checkedAt: now,
        safeMessage: null,
      };
    },
    async parse() {
      parseCalls.value += 1;
      return { ok: false, error: createPrivacySafeSemanticProviderError(code) };
    },
  };
}

function responseProvider(
  response: NuvitaeSemanticExtractionResponse,
): ResumeSemanticParserProvider {
  return {
    providerKind: "controlled-response-test",
    capabilities: baseCapabilities,
    async inspectConnection() {
      return {
        connectionState: "connected",
        availabilityState: "available",
        checkedAt: now,
        safeMessage: null,
      };
    },
    async parse(): Promise<ResumeSemanticParserProviderResult> {
      return { ok: true, response };
    },
  };
}

function cloneResponse(): NuvitaeSemanticExtractionResponse {
  return structuredClone(pdfProfile().response);
}

function malformedEvidenceResponse(): NuvitaeSemanticExtractionResponse {
  const response = cloneResponse();
  const fragment = pdfProfile().fragments[0];
  if (response.sections.contact.fullName === null || fragment === undefined)
    throw new Error("PDF profile must have a grounded full name.");
  response.sections.contact.fullName = {
    ...response.sections.contact.fullName,
    evidence: [
      {
        line: 1,
        start: fragment.text.length + 10,
        end: fragment.text.length + 20,
        fragmentHash: fragment.hash,
        fragmentId: "fragment-1",
      },
    ],
  };
  return response;
}

function ungroundedResponse(): NuvitaeSemanticExtractionResponse {
  const response = cloneResponse();
  if (response.sections.contact.fullName === null)
    throw new Error("PDF profile must have a grounded full name.");
  response.sections.contact.fullName = {
    ...response.sections.contact.fullName,
    evidence: response.sections.contact.fullName.evidence.map((item) => ({
      ...item,
      fragmentHash: "0".repeat(64),
    })),
  };
  return response;
}

function inventedResponse(): NuvitaeSemanticExtractionResponse {
  const response = cloneResponse();
  if (response.sections.contact.fullName === null)
    throw new Error("PDF profile must have a grounded full name.");
  response.sections.contact.fullName = {
    ...response.sections.contact.fullName,
    value: "Bruce Wayne",
  };
  return response;
}

function inferredResponse(): NuvitaeSemanticExtractionResponse {
  const response = cloneResponse();
  if (response.sections.contact.fullName === null)
    throw new Error("PDF profile must have a grounded full name.");
  response.sections.contact.fullName = {
    ...response.sections.contact.fullName,
    classification: "inferred",
  };
  return response;
}

function conflictingResponse(): NuvitaeSemanticExtractionResponse {
  const response = cloneResponse();
  const firstRole = response.sections.workExperience[0]?.roles[0];
  const evidence = firstRole?.startDate?.evidence;
  if (evidence === undefined || evidence.length === 0)
    throw new Error("PDF profile must have grounded role dates.");
  response.conflictDiagnostics = [
    {
      code: "conflicting_dates",
      message: "Conflicting employment dates require review.",
      severity: "warning",
      evidence,
      safeDetail: "The role dates conflict with another record.",
    },
  ];
  return response;
}

function invalidSchemaResponse(): NuvitaeSemanticExtractionResponse {
  const response = cloneResponse();
  Reflect.deleteProperty(response.sections.contact, "email");
  return response;
}

async function truncateImportResumeTables(source: DataSource): Promise<void> {
  await source.query(
    `TRUNCATE
      deletion_jobs,
      structured_resume_items,
      work_role_details,
      work_experience_roles,
      work_experiences,
      structured_resume_texts,
      structured_resumes,
      user_corrections,
      extracted_fields,
      import_warnings,
      import_drafts,
      derived_extraction_artifacts,
      imported_documents
    RESTART IDENTITY CASCADE`,
  );
}
