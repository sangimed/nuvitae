import "reflect-metadata";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication, Provider } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { IMPORT_RESUME_JOB_NAMES } from "@nuvitae/contracts";
import type {
  AIProviderRuntimeConnection,
  EvidenceRecord,
  ExtractedField,
  ImportDraft,
  ImportedDocument,
  ImportWarning,
  NuvitaeExtractionResponse,
  ProviderCapabilitySnapshot,
  ProviderRuntimeCapabilities,
  SemanticParseAttempt,
  SemanticParseResultGraph,
  SemanticParserValidationStatus,
} from "@nuvitae/domain";
import {
  ProviderConnectionError,
  ProviderConnectionService,
  type ProviderAdapterConnectedResult,
  type ProviderAdapterInspection,
  type ProviderAdapterLoginResult,
  type ProviderAdapterQuotaResult,
  type ProviderRuntimeAdapterContext,
  type ProviderRuntimeConnectionAdapter,
  type ProviderSessionStore,
} from "@nuvitae/import-application";
import {
  DeletionJobEntity,
  TypeOrmAIProviderRuntimeConnectionsRepository,
  TypeOrmImportResumeRepository,
  TypeOrmImportWorkflowRepository,
  TypeOrmSemanticParserRepository,
  UserCorrectionEntity,
  type DataSource,
} from "@nuvitae/persistence";
import {
  LocalPrivateImportStorage,
  LocalProviderSessionStorage,
} from "@nuvitae/storage";
import { attachVerifiedPrincipal } from "../../../apps/api/src/auth/user-context.js";
import { documentedImportProcessingDefaults } from "../../../apps/api/src/config/import-processing-limits.js";
import { ImportResumeModule } from "../../../apps/api/src/import-resume/import-resume.module.js";
import {
  IMPORT_STATUS_REQUEST_ID_GENERATOR,
  START_IMPORT_CLOCK,
  START_IMPORT_ID_GENERATOR,
  START_IMPORT_LIMIT_SERVICE,
  START_IMPORT_PRIVACY_LOGGER,
  START_IMPORT_PRIVATE_STORAGE,
  START_IMPORT_PROCESSING_LIMITS,
  START_IMPORT_QUEUE_PUBLISHER,
  START_IMPORT_REQUEST_ID_GENERATOR,
} from "../../../apps/api/src/import-resume/start-import.tokens.js";
import {
  API_IMPORT_RESUME_REPOSITORY,
  API_START_IMPORT_REPOSITORY,
} from "../../../apps/api/src/persistence/api-persistence.module.js";
import { createImportEventEmitter } from "../../../apps/api/src/observability/import-events.js";
import { ImportProcessingProcessor } from "../../../apps/worker/src/import-resume/import-processing.processor.js";
import { SemanticImportProcessor } from "../../../apps/worker/src/import-resume/semantic-import.processor.js";
import type { IsolatedPersistenceTestDatabase } from "../../integration/persistence/test-database.js";
import { createIsolatedPersistenceTestDatabase } from "../../integration/persistence/test-database.js";

const ownerA = "10000000-0000-4000-8000-0000000000a1";
const ownerB = "10000000-0000-4000-8000-0000000000a2";
const unknownUuid = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const docA = "20000000-0000-4000-8000-0000000000a1";
const docB = "20000000-0000-4000-8000-0000000000a2";
const artifactA = "30000000-0000-4000-8000-0000000000a1";
const artifactB = "30000000-0000-4000-8000-0000000000a2";
const draftA = "40000000-0000-4000-8000-0000000000a1";
const draftB = "40000000-0000-4000-8000-0000000000a2";
const warningA = "50000000-0000-4000-8000-0000000000a1";
const warningB = "50000000-0000-4000-8000-0000000000a2";
const fieldA = "60000000-0000-4000-8000-0000000000a1";
const fieldB = "60000000-0000-4000-8000-0000000000a2";
const correctionOperationA = "80000000-0000-4000-8000-0000000000a1";
const deletionJobA = "81000000-0000-4000-8000-0000000000a1";
const deletionJobB = "81000000-0000-4000-8000-0000000000a2";
const connectionA = "22000000-0000-4000-8000-0000000000a1";
const connectionB = "22000000-0000-4000-8000-0000000000a2";

const semantic = {
  attempt: "21000000-0000-4000-8000-0000000000a1",
  response: "21000000-0000-4000-8000-0000000000a2",
  evidence: "21000000-0000-4000-8000-0000000000a3",
  snapshot: "21000000-0000-4000-8000-0000000000a4",
  validationStatus: "21000000-0000-4000-8000-0000000000a5",
  candidate: "candidate.contact.full-name",
} as const;

const now = new Date("2026-08-01T09:00:00.000Z");
const retentionA = new Date("2026-08-05T09:00:00.000Z");
const retentionB = new Date("2026-08-06T09:00:00.000Z");
const sessionReference = "d".repeat(64);
const storageSecret = "security-suite-storage-signing-secret-32-bytes";
const sessionSecret = "security-suite-session-encryption-secret-32bytes";

const sentinels = {
  filename: "synthetic-resume.pdf",
  content: "private candidate content",
  candidateValue: "Synthetic headline",
  addedValue: "Public speaking",
  warningMessage: "Review this synthetic field.",
  storageKey: "imports/synthetic/source",
  account: "jane.doe@example.com",
  providerIdentity: "test_provider",
  sessionContent: "opaque session contents that must never be persisted",
} as const;

const capabilities: ProviderRuntimeCapabilities = {
  supportedDocumentFormats: ["pdf", "docx"],
  supportedDocumentLanguages: ["english", "french"],
  supportsNonInteractiveParsing: true,
  supportsStructuredJson: true,
  supportsCanonicalFlattenedEvidence: true,
  acceptsNormalizedTranscript: true,
  acceptsRawStoragePaths: false,
  exposesCredentialsToDomain: false,
  predictsPhysicalCoordinates: false,
  maxRequestJsonBytes: 256_000,
  maxResponseJsonBytes: 256_000,
  maxTimeoutMs: 30_000,
};

describe("authorization isolation across the resume-import lifecycle", () => {
  let database: IsolatedPersistenceTestDatabase;
  let repository: TypeOrmImportResumeRepository;
  let semanticRepository: TypeOrmSemanticParserRepository;
  let connectionRepository: TypeOrmAIProviderRuntimeConnectionsRepository;
  let app: INestApplication;
  let baseUrl: string;
  let storageRoot: string;
  let sessionRoot: string;
  let logs: unknown[];
  let queuePublisher: { addBulk: ReturnType<typeof vi.fn> };
  let serverId: number;
  let requestId: number;

  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("security_authz");
    repository = new TypeOrmImportResumeRepository(database.dataSource);
    semanticRepository = new TypeOrmSemanticParserRepository(
      database.dataSource,
    );
    connectionRepository = new TypeOrmAIProviderRuntimeConnectionsRepository(
      database.dataSource,
    );
    storageRoot = await mkdtemp(join(tmpdir(), "nuvitae-authz-storage-"));
    sessionRoot = await mkdtemp(join(tmpdir(), "nuvitae-authz-sessions-"));
    const harness = await createHttpHarness();
    app = harness.app;
    baseUrl = harness.baseUrl;
    queuePublisher = harness.queuePublisher;
    logs = harness.logs;
  }, 120_000);

  beforeEach(async () => {
    serverId = 1;
    requestId = 1;
    logs.splice(0);
    queuePublisher.addBulk.mockClear();
    await truncateAll(database.dataSource);
  });

  afterAll(async () => {
    if (app !== undefined) await app.close();
    if (database !== undefined) await database.cleanup();
    await Promise.all(
      [storageRoot, sessionRoot]
        .filter((root) => root !== undefined)
        .map((root) => rm(root, { recursive: true, force: true })),
    );
  }, 120_000);

  async function createHttpHarness(): Promise<{
    readonly app: INestApplication;
    readonly baseUrl: string;
    readonly queuePublisher: { addBulk: ReturnType<typeof vi.fn> };
    readonly logs: unknown[];
  }> {
    const logsCapture: unknown[] = [];
    const queue = { addBulk: vi.fn(async () => undefined) };
    const storage = await LocalPrivateImportStorage.create({
      root: storageRoot,
      signingSecret: storageSecret,
      maxSignedReferenceTtlSeconds: 60,
    });
    const providers: Provider[] = [
      {
        provide: API_IMPORT_RESUME_REPOSITORY,
        useValue: repository,
      },
      {
        provide: API_START_IMPORT_REPOSITORY,
        useValue: new TypeOrmImportWorkflowRepository(database.dataSource),
      },
      { provide: START_IMPORT_PRIVATE_STORAGE, useValue: storage },
      {
        provide: START_IMPORT_LIMIT_SERVICE,
        useValue: {
          reserveAttempt: vi.fn(async (ownerUserId: string) => ({
            allowed: true as const,
            reservation: {
              id: "reservation-1",
              ownerUserId,
              attemptedAt: now,
              importId: null,
              state: "reserved" as const,
            },
          })),
          admitToQueue: vi.fn(async () => ({ kind: "allowed" as const })),
          releaseReservation: vi.fn(async () => undefined),
          rollbackReservation: vi.fn(async () => undefined),
        },
      },
      {
        provide: START_IMPORT_PROCESSING_LIMITS,
        useValue: documentedImportProcessingDefaults,
      },
      { provide: START_IMPORT_CLOCK, useValue: { now: () => now } },
      {
        provide: START_IMPORT_ID_GENERATOR,
        useValue: { nextId: () => nextUuid(serverId, "70000000") },
      },
      {
        provide: START_IMPORT_REQUEST_ID_GENERATOR,
        useValue: { nextRequestId: () => nextUuid(requestId, "90000000") },
      },
      {
        provide: IMPORT_STATUS_REQUEST_ID_GENERATOR,
        useValue: { nextRequestId: () => nextUuid(requestId, "90000000") },
      },
      {
        provide: START_IMPORT_PRIVACY_LOGGER,
        useValue: createImportEventEmitter({
          write: (record) => logsCapture.push(record),
        }),
      },
      { provide: START_IMPORT_QUEUE_PUBLISHER, useValue: queue },
    ];
    const moduleRef = await Test.createTestingModule({
      imports: [ImportResumeModule.register({ providers })],
    }).compile();
    const createdApp = moduleRef.createNestApplication();
    createdApp.use(
      new TestPrincipalMiddleware().use.bind(new TestPrincipalMiddleware()),
    );
    await createdApp.listen(0, "127.0.0.1");
    const address = createdApp.getHttpServer().address() as {
      readonly port: number;
    };
    return {
      app: createdApp,
      baseUrl: `http://127.0.0.1:${address.port}`,
      queuePublisher: queue,
      logs: logsCapture,
    };
  }

  describe("HTTP ownership isolation", () => {
    it("keeps status opaque and identical for wrong-owner and unknown imports", async () => {
      await seedImport(repository, ownerA, docA, artifactA, {
        visibleFilename: sentinels.filename,
        storageKey: sentinels.storageKey,
      });
      await seedDraft(repository, draftA, docA, ownerA, {
        status: "ready_to_confirm",
        reviewRevision: 4,
        warnings: [],
        fields: [confirmedField(ownerA, draftA, fieldA)],
      });

      const owner = await http(
        "GET",
        `/import-resume/${docA}/status`,
        "owner-a",
      );
      const wrongOwner = await http(
        "GET",
        `/import-resume/${docA}/status`,
        "owner-b",
      );
      const unknown = await http(
        "GET",
        `/import-resume/${unknownUuid}/status`,
        "owner-b",
      );

      expect(owner.status).toBe(200);
      expect(owner.body.status).toBe("draft_ready");
      expect(wrongOwner.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(normalizeEchoedId(wrongOwner.body)).toEqual(
        normalizeEchoedId(unknown.body),
      );
      expect(wrongOwner.body.status).toBe("not_found");
      expect(wrongOwner.body.importId).toBe(docA);
      expect(unknown.body.importId).toBe(unknownUuid);
      expect(serialize(wrongOwner.body, logs)).not.toContain(
        sentinels.filename,
      );
      expect(serialize(wrongOwner.body, logs)).not.toContain(
        sentinels.storageKey,
      );
      expect(serialize(wrongOwner.body, logs)).not.toContain(
        sentinels.candidateValue,
      );
      expect(serialize(wrongOwner.body, logs)).not.toContain(
        retentionA.toISOString(),
      );
    });

    it("never reveals review content to wrong-owner or unknown principals", async () => {
      await seedImport(repository, ownerA, docA, artifactA, {
        visibleFilename: sentinels.filename,
        storageKey: sentinels.storageKey,
      });
      await seedDraft(repository, draftA, docA, ownerA);

      const owner = await http(
        "GET",
        `/import-resume/${docA}/review`,
        "owner-a",
      );
      const wrongOwner = await http(
        "GET",
        `/import-resume/${docA}/review`,
        "owner-b",
      );
      const unknown = await http(
        "GET",
        `/import-resume/${unknownUuid}/review`,
        "owner-b",
      );

      expect(owner.status).toBe(200);
      expect(serialize(owner.body)).toContain(sentinels.candidateValue);
      expect(wrongOwner.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(wrongOwner.body).toEqual(unknown.body);
      expect(wrongOwner.body.code).toBe("not_found");
      const publicAndLogs = serialize(wrongOwner.body, logs);
      expect(publicAndLogs).not.toContain(sentinels.candidateValue);
      expect(publicAndLogs).not.toContain(sentinels.warningMessage);
      expect(publicAndLogs).not.toContain(sentinels.filename);
      expect(publicAndLogs).not.toContain(sentinels.storageKey);
    });

    it("rejects wrong-owner review mutations without side effects", async () => {
      await seedImport(repository, ownerA, docA, artifactA);
      await seedDraft(repository, draftA, docA, ownerA);

      const body = reviewAddBody("70000000-0000-4000-8000-0000000000f1", 0);
      const owner = await http(
        "PATCH",
        `/import-resume/${docA}/review`,
        "owner-a",
        body,
      );
      expect(owner.status).toBe(200);

      const before = await repository.findDraftByOwner(draftA, ownerA);
      const wrongOwner = await http(
        "PATCH",
        `/import-resume/${docA}/review`,
        "owner-b",
        reviewAddBody(
          "70000000-0000-4000-8000-0000000000f2",
          before!.reviewRevision,
        ),
      );
      expect(wrongOwner.status).toBe(404);
      expect(wrongOwner.body.code).toBe("not_found");

      const after = await repository.findDraftByOwner(draftA, ownerA);
      expect(after!.reviewRevision).toBe(before!.reviewRevision);
      expect(
        await ownedCount("user_corrections", "created_by_user_id", ownerB),
      ).toBe(0);
      expect(
        await ownedCount("extracted_fields", "owner_user_id", ownerB),
      ).toBe(0);
    });

    it("treats a foreign correction operation id on an own import as an opaque not-found without an existence oracle", async () => {
      await seedImport(repository, ownerA, docA, artifactA);
      await seedDraft(repository, draftA, docA, ownerA);
      await seedCorrection(correctionOperationA, draftA, ownerA, fieldA);
      await seedImport(repository, ownerB, docB, artifactB);
      await seedDraft(repository, draftB, docB, ownerB);

      const before = await repository.findDraftByOwner(draftB, ownerB);
      const response = await http(
        "PATCH",
        `/import-resume/${docB}/review`,
        "owner-b",
        reviewAddBody(correctionOperationA, before!.reviewRevision),
      );
      expect(response.status).toBe(404);
      expect(response.body.code).toBe("not_found");

      const after = await repository.findDraftByOwner(draftB, ownerB);
      expect(after!.reviewRevision).toBe(before!.reviewRevision);
      expect(
        await ownedCount("user_corrections", "created_by_user_id", ownerB),
      ).toBe(0);
      const corrections = await database.dataSource.manager.find(
        UserCorrectionEntity,
        {
          where: { id: correctionOperationA },
        },
      );
      expect(corrections).toHaveLength(1);
      expect(corrections[0]!.createdByUserId).toBe(ownerA);
      expect(serialize(response.body)).not.toContain("duplicate");
      expect(serialize(response.body)).not.toContain("23505");
    });

    it("blocks wrong-owner confirmation and never creates foreign structured resumes", async () => {
      await seedReadyDraft(repository, ownerA, docA, artifactA, draftA, fieldA);

      const owner = await http(
        "POST",
        `/import-resume/${docA}/confirm`,
        "owner-a",
        {
          operationId: "70000000-0000-4000-8000-0000000000e1",
          expectedReviewRevision: 4,
          explicitConfirmation: true,
        },
      );
      expect(owner.status).toBe(201);
      expect(owner.body.status).toBe("structured_resume_confirmed");
      const resumeId = owner.body.structuredResumeId as string;

      const wrongOwner = await http(
        "POST",
        `/import-resume/${docA}/confirm`,
        "owner-b",
        {
          operationId: "70000000-0000-4000-8000-0000000000e2",
          expectedReviewRevision: 4,
          explicitConfirmation: true,
        },
      );
      const unknown = await http(
        "POST",
        `/import-resume/${unknownUuid}/confirm`,
        "owner-b",
        {
          operationId: "70000000-0000-4000-8000-0000000000e3",
          expectedReviewRevision: 4,
          explicitConfirmation: true,
        },
      );

      expect(wrongOwner.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(wrongOwner.body).toEqual(unknown.body);
      expect(wrongOwner.body.code).toBe("not_found");
      expect(
        await ownedCount("structured_resumes", "owner_user_id", ownerB),
      ).toBe(0);
      const stored = await repository.findStructuredResumeByOwner(
        resumeId,
        ownerA,
      );
      expect(stored?.id).toBe(resumeId);
      expect(stored?.sourceImportDraftId).toBe(draftA);
      expect(
        await ownedCount("structured_resumes", "owner_user_id", ownerA),
      ).toBe(1);
    });

    it("isolates discard: wrong-owner attempts schedule nothing and foreign job ids cannot reparent rows", async () => {
      await seedReadyDraft(repository, ownerA, docA, artifactA, draftA, fieldA);
      await seedReadyDraft(repository, ownerB, docB, artifactB, draftB, fieldB);
      await seedDeletionJob(repository, deletionJobB, docB, ownerB);

      const owner = await http(
        "POST",
        `/import-resume/${docA}/discard`,
        "owner-a",
        {
          operationId: "70000000-0000-4000-8000-0000000000d1",
          expectedReviewRevision: 4,
          explicitDiscard: true,
        },
      );
      expect(owner.status).toBe(201);
      const ownerJobId = owner.body.deletionJobId as string;

      const wrongOwner = await http(
        "POST",
        `/import-resume/${docA}/discard`,
        "owner-b",
        {
          operationId: "70000000-0000-4000-8000-0000000000d2",
          expectedReviewRevision: 4,
          explicitDiscard: true,
        },
      );
      const unknown = await http(
        "POST",
        `/import-resume/${unknownUuid}/discard`,
        "owner-b",
        {
          operationId: "70000000-0000-4000-8000-0000000000d3",
          expectedReviewRevision: 4,
          explicitDiscard: true,
        },
      );

      expect(wrongOwner.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(wrongOwner.body).toEqual(unknown.body);
      expect(
        await repository.findDeletionJobByOwner(ownerJobId, ownerA),
      ).not.toBeNull();
      expect(
        await repository.findDeletionJobByOwner(deletionJobB, ownerB),
      ).not.toBeNull();
      expect(
        await repository.findDiscardDeletionJobByImportAndOwner(docA, ownerB),
      ).toBeNull();

      // Substituting another user's deletion job id as the discard operation id
      // must create a fresh server-owned job and must never mutate the foreign row.
      const replayed = await http(
        "POST",
        `/import-resume/${docA}/discard`,
        "owner-a",
        {
          operationId: deletionJobB,
          expectedReviewRevision: 4,
          explicitDiscard: true,
        },
      );
      expect(replayed.status).toBe(201);
      expect(replayed.body.deletionJobId).toBe(ownerJobId);
      const foreignRow = await database.dataSource.manager.findOneByOrFail(
        DeletionJobEntity,
        { id: deletionJobB },
      );
      expect(foreignRow.ownerUserId).toBe(ownerB);
      expect(foreignRow.importedDocumentId).toBe(docB);
      expect(foreignRow.reason).toBe("user_discarded_import");
      expect(foreignRow.status).toBe("scheduled");
      expect(foreignRow.scheduledAt).toEqual(now);
    });

    it("keeps confirmed structured resumes inaccessible to non-owners", async () => {
      await seedReadyDraft(repository, ownerA, docA, artifactA, draftA, fieldA);
      const confirmed = await http(
        "POST",
        `/import-resume/${docA}/confirm`,
        "owner-a",
        {
          operationId: "70000000-0000-4000-8000-0000000000c1",
          expectedReviewRevision: 4,
          explicitConfirmation: true,
        },
      );
      expect(confirmed.status).toBe(201);
      const resumeId = confirmed.body.structuredResumeId as string;

      const owner = await http(
        "GET",
        `/structured-resumes/${resumeId}`,
        "owner-a",
      );
      const wrongOwner = await http(
        "GET",
        `/structured-resumes/${resumeId}`,
        "owner-b",
      );
      const unknown = await http(
        "GET",
        `/structured-resumes/${unknownUuid}`,
        "owner-b",
      );

      expect(owner.status).toBe(200);
      expect(owner.body.structuredResumeId).toBe(resumeId);
      expect(wrongOwner.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(wrongOwner.body).toEqual(unknown.body);
      expect(serialize(wrongOwner.body, logs)).not.toContain(
        sentinels.candidateValue,
      );
    });

    it(
      "keeps wrong-owner responses non-disclosing across every lifecycle state",
      { timeout: 120_000 },
      async () => {
        const states: readonly ImportedDocument["processingStatus"][] = [
          "processing",
          "timeout_partial",
          "failed",
          "cancelled",
          "expired",
          "ready_for_review",
        ];
        for (const processingStatus of states) {
          await truncateAll(database.dataSource);
          await seedImport(repository, ownerA, docA, artifactA, {
            processingStatus,
            validationStatus:
              processingStatus === "processing" ? "accepted" : "accepted",
          });
          if (processingStatus === "ready_for_review") {
            await seedDraft(repository, draftA, docA, ownerA);
          }

          const wrongStatus = await http(
            "GET",
            `/import-resume/${docA}/status`,
            "owner-b",
          );
          const unknownStatus = await http(
            "GET",
            `/import-resume/${unknownUuid}/status`,
            "owner-b",
          );
          const wrongReview = await http(
            "GET",
            `/import-resume/${docA}/review`,
            "owner-b",
          );
          const wrongDiscard = await http(
            "POST",
            `/import-resume/${docA}/discard`,
            "owner-b",
            {
              operationId: "70000000-0000-4000-8000-0000000000b1",
              expectedReviewRevision: 0,
              explicitDiscard: true,
            },
          );

          expect(wrongStatus.status).toBe(200);
          expect(normalizeEchoedId(wrongStatus.body)).toEqual(
            normalizeEchoedId(unknownStatus.body),
          );
          expect(wrongStatus.body.status).toBe("not_found");
          expect(wrongReview.status).toBe(404);
          expect(wrongDiscard.status).toBe(404);
          expect(
            serialize(
              wrongStatus.body,
              wrongReview.body,
              wrongDiscard.body,
              logs,
            ),
          ).not.toContain(processingStatus);
          expect(
            serialize(
              wrongStatus.body,
              wrongReview.body,
              wrongDiscard.body,
              logs,
            ),
          ).not.toContain(retentionA.toISOString());
        }

        const deleted = await http(
          "GET",
          `/import-resume/${docA}/status`,
          "owner-b",
        );
        expect(deleted.status).toBe(200);
        expect(deleted.body.status).toBe("not_found");

        await truncateAll(database.dataSource);
        await seedImport(repository, ownerA, docA, artifactA, {
          deletionStatus: "deleted",
          deletedAt: now,
        });
        const deletedImport = await http(
          "GET",
          `/import-resume/${docA}/status`,
          "owner-b",
        );
        expect(deletedImport.status).toBe(200);
        expect(deletedImport.body.status).toBe("not_found");
        expect(serialize(deletedImport.body)).not.toContain("deleted");
      },
    );

    it("exposes no import recovery routes that bypass ownership", async () => {
      await seedImport(repository, ownerA, docA, artifactA);
      const routes = [
        "retry",
        "cancel",
        "replace",
        "delete-source",
        "temporary-contact-preview",
      ] as const;
      for (const route of routes) {
        const asOwner = await http(
          "POST",
          `/import-resume/${docA}/${route}`,
          "owner-a",
          {},
        );
        const asOther = await http(
          "POST",
          `/import-resume/${docA}/${route}`,
          "owner-b",
          {},
        );
        const anonymous = await http(
          "POST",
          `/import-resume/${docA}/${route}`,
          undefined,
          {},
        );
        expect(asOwner.status).toBe(404);
        expect(asOther.status).toBe(404);
        expect(anonymous.status).toBe(404);
      }
      expect(await ownedCount("deletion_jobs", "owner_user_id", ownerB)).toBe(
        0,
      );
      expect(await ownedCount("import_drafts", "owner_user_id", ownerB)).toBe(
        0,
      );
    });

    it("keeps concurrent and repeated wrong-owner attempts isolated", async () => {
      await seedReadyDraft(repository, ownerA, docA, artifactA, draftA, fieldA);
      const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
          http("GET", `/import-resume/${docA}/status`, "owner-b"),
        ),
      );
      for (const attempt of attempts) {
        expect(attempt.status).toBe(200);
        expect(attempt.body.status).toBe("not_found");
      }
      expect(attempts.map((attempt) => attempt.body)).toEqual(
        Array.from({ length: 5 }, () => attempts[0]!.body),
      );

      const [foreignConfirm, foreignDiscard, foreignReview, ownerDiscard] =
        await Promise.all([
          http("POST", `/import-resume/${docA}/confirm`, "owner-b", {
            operationId: "70000000-0000-4000-8000-0000000000a1",
            expectedReviewRevision: 4,
            explicitConfirmation: true,
          }),
          http("POST", `/import-resume/${docA}/discard`, "owner-b", {
            operationId: "70000000-0000-4000-8000-0000000000a2",
            expectedReviewRevision: 4,
            explicitDiscard: true,
          }),
          http("PATCH", `/import-resume/${docA}/review`, "owner-b", {
            operationId: "70000000-0000-4000-8000-0000000000a3",
            expectedReviewRevision: 4,
            action: {
              type: "exclude_section",
              section: "summary",
            },
          }),
          http("POST", `/import-resume/${docA}/discard`, "owner-a", {
            operationId: "70000000-0000-4000-8000-0000000000a4",
            expectedReviewRevision: 4,
            explicitDiscard: true,
          }),
        ]);

      expect(foreignConfirm.status).toBe(404);
      expect(foreignDiscard.status).toBe(404);
      expect(foreignReview.status).toBe(404);
      expect(ownerDiscard.status).toBe(201);
      expect(await ownedCount("deletion_jobs", "owner_user_id", ownerA)).toBe(
        1,
      );
      expect(await ownedCount("deletion_jobs", "owner_user_id", ownerB)).toBe(
        0,
      );
      expect(
        await ownedCount("structured_resumes", "owner_user_id", ownerB),
      ).toBe(0);
    });

    it("requires an authenticated verified principal on every import route", async () => {
      await seedImport(repository, ownerA, docA, artifactA);
      const anonymous = await http(
        "GET",
        `/import-resume/${docA}/status`,
        undefined,
      );
      const malformed = await http(
        "GET",
        `/import-resume/${docA}/status`,
        "malformed",
      );
      expect(anonymous.status).toBe(401);
      expect(malformed.status).toBe(401);
      expect(anonymous.body).toEqual(malformed.body);
      expect(anonymous.body.code).toBe("authentication_required");
    });

    it("creates imports only for the authenticated principal with no cross-user data", async () => {
      const form = new FormData();
      form.append(
        "file",
        new Blob([new TextEncoder().encode(sentinels.content)], {
          type: "application/pdf",
        }),
        sentinels.filename,
      );
      const response = await fetch(`${baseUrl}/import-resume`, {
        method: "POST",
        headers: { "x-test-principal": "owner-a" },
        body: form,
      });
      const body = (await response.json()) as Record<string, unknown>;
      expect(response.status).toBe(201);
      expect(body.importId).toBe("70000000-0000-4000-8000-000000000001");
      expect(queuePublisher.addBulk).toHaveBeenCalled();
      const job = queuePublisher.addBulk.mock.calls[0]?.[0]?.[0] as
        { data?: { owner?: { ownerUserId?: string } } } | undefined;
      expect(job?.data?.owner?.ownerUserId).toBe(ownerA);
      expect(serialize(body, logs)).not.toContain(sentinels.content);
      const files = await listFiles(storageRoot);
      expect(
        files.some((entry) =>
          entry.includes("users/10000000-0000-4000-8000-0000000000a1/imports/"),
        ),
      ).toBe(true);
      expect(
        files.some((entry) =>
          entry.includes("10000000-0000-4000-8000-0000000000a2"),
        ),
      ).toBe(false);
      expect(serialize(files)).not.toContain(sentinels.content);
    });
  });

  describe("provider connection isolation", () => {
    let connectionService: ProviderConnectionService;
    let sessionStore: ProviderSessionStore;
    let adapter: FakeAdapter;

    beforeEach(async () => {
      adapter = new FakeAdapter(ownerA, connectionA);
      sessionStore = await LocalProviderSessionStorage.create({
        root: sessionRoot,
        encryptionSecret: sessionSecret,
        maxSessionBytes: 4096,
      });
      connectionService = new ProviderConnectionService({
        repository: connectionRepository,
        sessionStore,
        adapter,
      });
      await connectionRepository.createConnection(
        connectedConnection(ownerA, connectionA),
      );
      await connectionRepository.createConnection(
        connectedConnection(ownerB, connectionB),
      );
    });

    it("denies every connection operation to a wrong owner without side effects", async () => {
      const before = structuredClone(
        (await connectionRepository.findConnectionByOwner(
          connectionA,
          ownerA,
        ))!,
      );
      const probes = [
        () => connectionService.status(ownerB, connectionA),
        () => connectionService.connect(ownerB, connectionA),
        () => connectionService.completeLogin(ownerB, connectionA),
        () => connectionService.cancelLogin(ownerB, connectionA),
        () => connectionService.reconnect(ownerB, connectionA),
        () => connectionService.disconnect(ownerB, connectionA),
        () => connectionService.revoke(ownerB, connectionA),
        () => connectionService.refreshCapabilities(ownerB, connectionA),
        () => connectionService.refreshQuotaState(ownerB, connectionA),
      ] as const;
      for (const operation of probes) {
        await expect(operation()).rejects.toThrowError(
          expect.objectContaining({
            code: "provider_connection_not_found",
          }),
        );
      }
      const deleteView = await connectionService.deleteConnection(
        ownerB,
        connectionA,
      );
      expect(deleteView.providerKind).toBe("unknown");
      expect(deleteView.connectionStatus).toBe("not_configured");

      expect(adapter.inspectCalls).toBe(0);
      expect(adapter.disconnectCalls).toBe(0);
      expect(adapter.revokeCalls).toBe(0);
      expect(adapter.deleteCalls).toBe(0);
      expect(adapter.loginCalls).toBe(0);
      const after = structuredClone(
        (await connectionRepository.findConnectionByOwner(
          connectionA,
          ownerA,
        ))!,
      );
      expect(after).toEqual(before);
      const listed = await connectionService.list(ownerB);
      expect(listed.map((connection) => connection.connectionId)).toEqual([
        connectionB,
      ]);
    });

    it("never links a foreign connection to an import through any surface", async () => {
      const importResponse = await http(
        "GET",
        `/import-resume/${docA}/status`,
        "owner-b",
      );
      expect(importResponse.status).toBe(200);
      expect(serialize(importResponse.body)).not.toContain(connectionA);
      expect(serialize(importResponse.body)).not.toContain(
        sentinels.providerIdentity,
      );
      expect(serialize(importResponse.body)).not.toContain(sessionReference);

      const connectionError = await probeError(() =>
        connectionService.status(ownerB, connectionA),
      );
      expect(connectionError).toBeInstanceOf(ProviderConnectionError);
      expect(JSON.stringify(connectionError)).not.toContain(connectionA);
      expect(JSON.stringify(connectionError)).not.toContain(ownerA);
      expect(JSON.stringify(connectionError)).not.toContain(
        sentinels.providerIdentity,
      );
      expect(JSON.stringify(connectionError)).not.toContain(sessionReference);
      expect(JSON.stringify(connectionError)).not.toContain(
        sentinels.sessionContent,
      );
      expect(JSON.stringify(connectionError)).not.toContain(sentinels.account);
    });
  });

  describe("worker and internal operation isolation", () => {
    it("ignores forged validation, extraction, and timeout job payloads with the wrong owner", async () => {
      await seedImport(repository, ownerA, docA, artifactA, {
        processingStatus: "queued",
      });
      const validation = { validate: vi.fn(async () => ({ accepted: true })) };
      const extraction = { process: vi.fn(async () => undefined) };
      const queue = { add: vi.fn(async () => undefined) };
      const processor = new ImportProcessingProcessor(
        new TypeOrmImportWorkflowRepository(database.dataSource),
        validation,
        extraction,
        queue as never,
      );

      await processor.process(
        job(
          IMPORT_RESUME_JOB_NAMES.validation,
          validationPayload(docA, ownerB),
        ),
      );
      await processor.process(
        job(
          IMPORT_RESUME_JOB_NAMES.extraction,
          extractionPayload(docA, ownerB),
        ),
      );
      await processor.process(
        job(
          IMPORT_RESUME_JOB_NAMES.foregroundTimeout,
          timeoutPayload(docA, ownerB),
        ),
      );

      expect(validation.validate).not.toHaveBeenCalled();
      expect(extraction.process).not.toHaveBeenCalled();
      const document = await repository.findImportByOwner(docA, ownerA);
      expect(document?.document.processingStatus).toBe("queued");
      expect(document?.document.validationStatus).toBe("accepted");
    });

    it("does not transition or invoke the provider for a semantic import with the wrong owner", async () => {
      await seedImport(repository, ownerA, docA, artifactA, {
        processingStatus: "semantic_parsing_running",
      });
      const provider = { parse: vi.fn(async () => undefined) };
      const processor = new SemanticImportProcessor({
        repository,
        transactionRunner: repository,
        sourceReader: {} as never,
        pdfTextExtractor: {} as never,
        docxTextExtractor: {} as never,
        provider: provider as never,
        clock: { now: () => now },
        logger: {
          emit: vi.fn(),
        },
      });

      await processor.process({
        ownerUserId: ownerB,
        importedDocumentId: docA,
      });
      await processor.process({
        ownerUserId: ownerA,
        importedDocumentId: unknownUuid,
      });

      expect(provider.parse).not.toHaveBeenCalled();
      const document = await repository.findImportByOwner(docA, ownerA);
      expect(document?.document.processingStatus).toBe(
        "semantic_parsing_running",
      );
    });
  });

  describe("repository isolation", () => {
    it("keeps semantic parse artifacts, evidence, and deletion jobs owner-scoped", async () => {
      await seedImport(repository, ownerA, docA, artifactA);
      await seedDraft(repository, draftA, docA, ownerA);
      await seedCorrection(correctionOperationA, draftA, ownerA, fieldA);
      await semanticRepository.persistParseResultGraph(
        semanticGraph(ownerA, docA),
      );
      await seedDeletionJob(repository, deletionJobA, docA, ownerA);

      expect(
        await semanticRepository.findParseResultGraphByAttemptAndOwner(
          semantic.attempt,
          ownerB,
        ),
      ).toBeNull();
      expect(
        await semanticRepository.findAttemptByOwner(semantic.attempt, ownerB),
      ).toBeNull();
      expect(
        await semanticRepository.findResponseByOwner(semantic.response, ownerB),
      ).toBeNull();
      expect(
        await semanticRepository.findEvidenceByResponseAndOwner(
          semantic.response,
          ownerB,
        ),
      ).toEqual([]);
      expect(
        await semanticRepository.findSnapshotByAttemptAndOwner(
          semantic.attempt,
          ownerB,
        ),
      ).toBeNull();
      expect(
        await semanticRepository.findValidationStatusByAttemptAndOwner(
          semantic.attempt,
          ownerB,
        ),
      ).toBeNull();
      expect(
        await repository.findDeletionJobByOwner(deletionJobA, ownerB),
      ).toBeNull();
      expect(
        await repository.findCorrectionByOwnerAndOperation(
          correctionOperationA,
          ownerB,
        ),
      ).toBeNull();
    });
  });

  async function seedImport(
    importRepository: TypeOrmImportResumeRepository,
    ownerUserId: string,
    importId: string,
    artifactId: string,
    overrides: Partial<ImportedDocument> = {},
  ): Promise<void> {
    const document = importedDocumentRow(ownerUserId, importId, overrides);
    await importRepository.createImportAggregate(
      {
        document,
        artifacts: [
          {
            id: artifactId,
            importedDocumentId: importId,
            ownerUserId,
            artifactType: "page_reference",
            storageKey: `imports/${ownerUserId}/${importId}/page-reference`,
            containsSourceReconstructingData: true,
            deletionStatus: "not_scheduled",
            createdAt: now,
            retentionExpiresAt:
              ownerUserId === ownerA ? retentionA : retentionB,
          },
        ],
      },
      undefined,
    );
  }

  async function seedDraft(
    importRepository: TypeOrmImportResumeRepository,
    draftId: string,
    importId: string,
    ownerUserId: string,
    overrides: Partial<ImportDraft> = {},
  ): Promise<ImportDraft> {
    const draft = importDraftRow(draftId, importId, ownerUserId, overrides);
    return importRepository.saveDraft(draft);
  }

  async function seedReadyDraft(
    importRepository: TypeOrmImportResumeRepository,
    ownerUserId: string,
    importId: string,
    artifactId: string,
    draftId: string,
    fieldId: string,
  ): Promise<void> {
    await seedImport(importRepository, ownerUserId, importId, artifactId);
    await seedDraft(importRepository, draftId, importId, ownerUserId, {
      status: "ready_to_confirm",
      reviewRevision: 4,
      warnings: [],
      fields: [confirmedField(ownerUserId, draftId, fieldId)],
      retentionExpiresAt: ownerUserId === ownerA ? retentionA : retentionB,
    });
  }

  async function seedDeletionJob(
    importRepository: TypeOrmImportResumeRepository,
    jobId: string,
    importId: string,
    ownerUserId: string,
  ): Promise<void> {
    await importRepository.scheduleDeletionJob({
      id: jobId,
      importedDocumentId: importId,
      ownerUserId,
      reason: "user_discarded_import",
      status: "scheduled",
      scheduledAt: now,
      verificationStatus: "not_started",
    });
  }

  async function seedCorrection(
    operationId: string,
    draftId: string,
    ownerUserId: string,
    fieldId: string,
  ): Promise<void> {
    await database.dataSource.manager.insert(
      UserCorrectionEntity,
      Object.assign(new UserCorrectionEntity(), {
        id: operationId,
        importDraftId: draftId,
        createdByUserId: ownerUserId,
        targetType: "extracted_field",
        targetId: fieldId,
        action: "confirm",
        previousValue: null,
        newValue: null,
        createdAt: now,
      }),
    );
  }

  async function ownedCount(
    table: string,
    column: string,
    ownerUserId: string,
  ): Promise<number> {
    const rows = await database.dataSource.query<{ count: string }[]>(
      `SELECT count(*) AS count FROM "${database.schema}"."${table}" WHERE "${column}" = $1`,
      [ownerUserId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async function http(
    method: "GET" | "POST" | "PATCH",
    path: string,
    principal: "owner-a" | "owner-b" | "malformed" | undefined,
    body?: unknown,
  ): Promise<{
    readonly status: number;
    readonly body: Record<string, unknown>;
  }> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (principal !== undefined) {
      headers["x-test-principal"] = principal;
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body:
        text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
    };
  }
});

class TestPrincipalMiddleware {
  use(request: object, _response: unknown, next: () => void): void {
    const headers = (request as { headers?: Record<string, unknown> }).headers;
    const raw = headers?.["x-test-principal"];
    const principal = Array.isArray(raw) ? raw[0] : raw;
    if (principal === "owner-a") {
      attachVerifiedPrincipal(request, {
        verification: "verified",
        userId: ownerA,
      });
    } else if (principal === "owner-b") {
      attachVerifiedPrincipal(request, {
        verification: "verified",
        userId: ownerB,
      });
    } else if (principal === "malformed") {
      attachVerifiedPrincipal(request, {
        verification: "verified",
        userId: "malformed-user",
      } as never);
    }
    next();
  }
}

class FakeAdapter implements ProviderRuntimeConnectionAdapter {
  readonly providerKind = "test_provider";
  inspectCalls = 0;
  loginCalls = 0;
  disconnectCalls = 0;
  revokeCalls = 0;
  deleteCalls = 0;

  constructor(
    private readonly ownerUserId: string,
    private readonly connectionId: string,
  ) {}

  private inspection(): ProviderAdapterInspection {
    return {
      connectionState: "connected",
      authenticationState: "authenticated",
      availabilityState: "available",
      checkedAt: now,
      safeMessage: null,
    };
  }

  private connected(): ProviderAdapterConnectedResult {
    return {
      connectedAt: now,
      expiresAt: new Date("2026-08-01T10:00:00.000Z"),
      sessionReference,
      capabilities,
    };
  }

  private login(): ProviderAdapterLoginResult {
    return { loginStartedAt: now, safeMessage: null };
  }

  private quota(): ProviderAdapterQuotaResult {
    return {
      availabilityState: "available",
      checkedAt: now,
      safeMessage: null,
    };
  }

  async inspect(): Promise<ProviderAdapterInspection> {
    this.inspectCalls += 1;
    return this.inspection();
  }

  async startLogin(): Promise<ProviderAdapterLoginResult> {
    this.loginCalls += 1;
    return this.login();
  }

  async completeLogin(
    context: ProviderRuntimeAdapterContext,
  ): Promise<ProviderAdapterConnectedResult> {
    await context.sessionStore.writeSession({
      ownerUserId: this.ownerUserId,
      connectionId: this.connectionId,
      sessionReference,
      payload: new TextEncoder().encode(sentinels.sessionContent),
    });
    return this.connected();
  }

  async cancelLogin(): Promise<ProviderAdapterLoginResult> {
    this.loginCalls += 1;
    return this.login();
  }

  async reconnect(): Promise<ProviderAdapterConnectedResult> {
    this.loginCalls += 1;
    return this.connected();
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }

  async revoke(): Promise<void> {
    this.revokeCalls += 1;
  }

  async deleteLocalState(): Promise<void> {
    this.deleteCalls += 1;
  }

  async capabilities(): Promise<ProviderRuntimeCapabilities> {
    return capabilities;
  }

  async quotaState(): Promise<ProviderAdapterQuotaResult> {
    return this.quota();
  }
}

function connectedConnection(
  ownerUserId: string,
  connectionId: string,
): AIProviderRuntimeConnection {
  return {
    id: connectionId,
    ownerUserId,
    providerKind: "test_provider",
    displayName: null,
    connectionStatus: "connected",
    authenticationStatus: "authenticated",
    availabilityStatus: "available",
    capabilities,
    capabilitySnapshotAt: now,
    sessionReference,
    lastCheckedAt: now,
    loginStartedAt: now,
    connectedAt: now,
    refreshedAt: now,
    expiresAt: new Date("2026-08-01T10:00:00.000Z"),
    disconnectedAt: null,
    revokedAt: null,
    revocationReason: null,
    createdAt: now,
    deletedAt: null,
    deletionReason: null,
  };
}

function importedDocumentRow(
  ownerUserId: string,
  importId: string,
  overrides: Partial<ImportedDocument> = {},
): ImportedDocument {
  return {
    id: importId,
    ownerUserId,
    visibleFilename: sentinels.filename,
    contentType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes: 1024,
    renderedPageCount: 1,
    detectedLanguage: "english",
    storageKey: sentinels.storageKey,
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "ready_for_review",
    deletionStatus: "not_scheduled",
    createdAt: now,
    retentionExpiresAt: ownerUserId === ownerA ? retentionA : retentionB,
    ...overrides,
  };
}

function importDraftRow(
  draftId: string,
  importId: string,
  ownerUserId: string,
  overrides: Partial<ImportDraft> = {},
): ImportDraft {
  return {
    id: draftId,
    importedDocumentId: importId,
    ownerUserId,
    status: "review_required",
    reviewRevision: 0,
    fields: [
      unconfirmedField(
        ownerUserId,
        draftId,
        ownerUserId === ownerA ? fieldA : fieldB,
      ),
    ],
    warnings: [warningRow(draftId, ownerUserId)],
    createdAt: now,
    retentionExpiresAt: ownerUserId === ownerA ? retentionA : retentionB,
    ...overrides,
  };
}

function unconfirmedField(
  ownerUserId: string,
  draftId: string,
  fieldId: string,
): ExtractedField {
  return {
    id: fieldId,
    importDraftId: draftId,
    section: "headline",
    fieldPath: "headline",
    value: { kind: "text", value: sentinels.candidateValue },
    sourceStatus: "explicit_source",
    sourceLocation: {
      kind: "pdf",
      pageNumber: 1,
      textItemIndex: 0,
      boundingBox: { x: 1, y: 2, width: 3, height: 4, unit: "pdf_point" },
    },
    confidenceStatus: "low",
    inferenceStatus: "not_inferred",
    reviewStatus: "unreviewed",
    warningId: ownerUserId === ownerA ? warningA : warningB,
    createdAt: now,
    updatedAt: now,
  };
}

function confirmedField(
  ownerUserId: string,
  draftId: string,
  fieldId: string,
): ExtractedField {
  const field = unconfirmedField(ownerUserId, draftId, fieldId);
  return {
    id: field.id,
    importDraftId: field.importDraftId,
    section: field.section,
    fieldPath: field.fieldPath,
    value: field.value,
    sourceStatus: field.sourceStatus,
    sourceLocation: field.sourceLocation!,
    confidenceStatus: "high",
    inferenceStatus: field.inferenceStatus,
    reviewStatus: "confirmed",
    createdAt: field.createdAt,
    updatedAt: field.updatedAt,
  };
}

function warningRow(draftId: string, ownerUserId: string): ImportWarning {
  return {
    id: ownerUserId === ownerA ? warningA : warningB,
    importDraftId: draftId,
    warningType: "low_confidence",
    section: "headline",
    fieldPath: "headline",
    message: sentinels.warningMessage,
    severity: "needs_attention",
    reviewStatus: "needs_review",
    requiresResolution: true,
    createdAt: now,
  };
}

function reviewAddBody(operationId: string, expectedReviewRevision: number) {
  return {
    operationId,
    expectedReviewRevision,
    action: {
      type: "add_field",
      section: "skills",
      fieldPath: "skills",
      value: { kind: "text", value: sentinels.addedValue },
    },
  };
}

function semanticGraph(
  ownerUserId: string,
  importId: string,
): SemanticParseResultGraph {
  return {
    attempt: semanticAttempt(ownerUserId, importId),
    response: semanticResponse(ownerUserId),
    capabilitySnapshot: capabilitySnapshot(ownerUserId),
    validationStatuses: validationStatus(ownerUserId),
    evidenceRecords: [evidenceRecord(ownerUserId)],
  };
}

function semanticAttempt(
  ownerUserId: string,
  importId: string,
): SemanticParseAttempt {
  return {
    id: semantic.attempt,
    importedDocumentId: importId,
    ownerUserId,
    providerKind: "test_provider",
    inputRepresentation: "normalized_transcript_flattened_fragments",
    status: "succeeded",
    startedAt: now,
    endedAt: new Date("2026-08-01T09:00:05.000Z"),
    timeoutSeconds: 30,
    responseSchemaVersion: "nuvitae.semantic-extraction.v1",
    groundingValidationStatus: "passed",
    noInventionValidationStatus: "passed",
    latencyMs: 5_000,
    createdAt: now,
    retentionExpiresAt: retentionA,
  };
}

function semanticResponse(ownerUserId: string): NuvitaeExtractionResponse {
  return {
    id: semantic.response,
    semanticParseAttemptId: semantic.attempt,
    ownerUserId,
    schemaVersion: "nuvitae.semantic-extraction.v1",
    validationStatus: "accepted",
    createdAt: now,
    retentionExpiresAt: retentionA,
  };
}

function capabilitySnapshot(ownerUserId: string): ProviderCapabilitySnapshot {
  return {
    id: semantic.snapshot,
    semanticParseAttemptId: semantic.attempt,
    ownerUserId,
    providerKind: "test_provider",
    supportedDocumentFormats: ["pdf", "docx"],
    supportedDocumentLanguages: ["english", "french"],
    supportsNonInteractiveParsing: true,
    supportsStructuredJson: true,
    supportsCanonicalFlattenedEvidence: true,
    acceptsNormalizedTranscript: true,
    acceptsRawStoragePaths: false,
    exposesCredentialsToDomain: false,
    predictsPhysicalCoordinates: false,
    maxRequestJsonBytes: 256_000,
    maxResponseJsonBytes: 256_000,
    maxTimeoutMs: 30_000,
    snapshotAt: now,
    createdAt: now,
    retentionExpiresAt: retentionA,
  };
}

function validationStatus(ownerUserId: string): SemanticParserValidationStatus {
  return {
    id: semantic.validationStatus,
    semanticParseAttemptId: semantic.attempt,
    ownerUserId,
    schemaStatus: "passed",
    groundingStatus: "passed",
    absenceStatus: "passed",
    noInventionStatus: "passed",
    conflictStatus: "passed",
    acceptanceStatus: "accepted",
    createdAt: now,
    retentionExpiresAt: retentionA,
  };
}

function evidenceRecord(ownerUserId: string): EvidenceRecord {
  return {
    id: semantic.evidence,
    responseId: semantic.response,
    ownerUserId,
    candidateId: semantic.candidate,
    line: 1,
    start: 0,
    end: 24,
    fragmentHash: "a".repeat(64),
    fragmentId: "fragment.1",
    classification: "explicit",
    confidenceStatus: "high",
    validationStatus: "valid",
    createdAt: now,
    retentionExpiresAt: retentionA,
  };
}

function validationPayload(importId: string, ownerUserId: string) {
  return {
    schemaVersion: "2026-07-28",
    jobType: "document_validation",
    importId,
    owner: { ownerUserId },
    correlationId: importId,
    idempotencyKey: `import-${importId}-validation-v1`,
    requestedAt: now.toISOString(),
    documentFormat: "pdf",
    sourceStorageKey: sentinels.storageKey,
    uploadedAt: now.toISOString(),
    foregroundDeadline: new Date(now.getTime() + 180_000).toISOString(),
    sizeBytes: 1024,
  };
}

function extractionPayload(importId: string, ownerUserId: string) {
  return {
    schemaVersion: "2026-07-28",
    jobType: "deterministic_extraction",
    importId,
    owner: { ownerUserId },
    correlationId: importId,
    idempotencyKey: `import-${importId}-extraction-v1`,
    requestedAt: now.toISOString(),
    documentFormat: "pdf",
    sourceStorageKey: sentinels.storageKey,
    validationCompletedAt: now.toISOString(),
    foregroundDeadline: new Date(now.getTime() + 180_000).toISOString(),
  };
}

function timeoutPayload(importId: string, ownerUserId: string) {
  return {
    schemaVersion: "2026-07-28",
    jobType: "foreground_timeout",
    importId,
    owner: { ownerUserId },
    correlationId: importId,
    idempotencyKey: `import-${importId}-timeout-v1`,
    requestedAt: now.toISOString(),
    foregroundDeadline: new Date(now.getTime() - 1).toISOString(),
  };
}

function job(name: string, data: unknown) {
  return {
    name,
    data,
    updateProgress: vi.fn(async () => undefined),
  } as never;
}

function nextUuid(seed: number, prefix: string): string {
  return `${prefix}-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function normalizeEchoedId(body: Record<string, unknown>): unknown {
  return { ...body, importId: "normalized" };
}

function serialize(...values: readonly unknown[]): string {
  return values.map((value) => JSON.stringify(value ?? null)).join("\n");
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries.map((entry) => String(entry));
}

async function probeError(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
}

async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(
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
      imported_documents,
      semantic_parser_validation_statuses,
      provider_capability_snapshots,
      evidence_records,
      nuvitae_extraction_responses,
      semantic_parse_attempts,
      ai_provider_runtime_connections,
      temporary_contact_fields,
      temporary_contact_previews,
      manual_structured_resume_drafts
    CASCADE`,
  );
}
