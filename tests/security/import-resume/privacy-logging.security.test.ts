import "reflect-metadata";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
  ExtractedField,
  ImportDraft,
  ImportedDocument,
  ImportWarning,
  ProviderRuntimeCapabilities,
} from "@nuvitae/domain";
import {
  ProcessExtractionService,
  ProviderConnectionService,
  createImportEventEmitter,
  runLimitedDeterministicPartialFallback,
  type ImportEventRecord,
  type ProviderRuntimeConnectionAdapter,
  type ProviderSessionStore,
  type ResumeSemanticParserProvider,
} from "@nuvitae/import-application";
import {
  TypeOrmImportResumeRepository,
  type DataSource,
} from "@nuvitae/persistence";
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
  API_PERSISTENCE_TRANSACTION_RUNNER,
} from "../../../apps/api/src/persistence/api-persistence.module.js";
import {
  importEventSchemas,
  type ImportEventName,
} from "../../../apps/api/src/observability/import-events.js";
import { ImportProcessingProcessor } from "../../../apps/worker/src/import-resume/import-processing.processor.js";
import { SemanticImportProcessor } from "../../../apps/worker/src/import-resume/semantic-import.processor.js";
import {
  addDocument,
  createValidationHarness,
  importedDocument,
  validateOwned,
} from "../../integration/import-resume/validation-test-harness.js";
import type { IsolatedPersistenceTestDatabase } from "../../integration/persistence/test-database.js";
import { createIsolatedPersistenceTestDatabase } from "../../integration/persistence/test-database.js";

const ownerA = "10000000-0000-4000-8000-0000000000a1";
const ownerB = "10000000-0000-4000-8000-0000000000a2";
const unknownUuid = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const docA = "20000000-0000-4000-8000-0000000000a1";
const draftA = "40000000-0000-4000-8000-0000000000a1";
const fieldA = "60000000-0000-4000-8000-0000000000a1";
const artifactA = "30000000-0000-4000-8000-0000000000a1";
const connectionA = "22000000-0000-4000-8000-0000000000a1";
const warningA = "50000000-0000-4000-8000-0000000000a1";

const now = new Date("2026-08-01T09:00:00.000Z");
const retentionA = new Date("2026-08-05T09:00:00.000Z");

/**
 * Unique sentinel corpus. Every value must be recognizable and must never
 * appear in captured logs, serialized JSON, error output, or snapshots.
 */
const sentinels = {
  fullResume: "PRIVLOG-FULLRESUME-7F3A",
  transcript: "PRIVLOG-TRANSCRIPT-9C21",
  snippet: "PRIVLOG-SNIPPET-4B8E",
  name: "PRIVLOG-NAME-D0E1",
  email: "privlog-email-5a6b@example.invalid",
  phone: "PRIVLOG-PHONE-2C3D",
  address: "PRIVLOG-ADDRESS-8E9F",
  location: "PRIVLOG-LOCATION-1A2B",
  employer: "PRIVLOG-EMPLOYER-3C4D",
  role: "PRIVLOG-ROLE-5E6F",
  education: "PRIVLOG-EDUCATION-7A8B",
  skill: "PRIVLOG-SKILL-9C0D",
  certification: "PRIVLOG-CERT-1E2F",
  language: "PRIVLOG-LANGUAGE-3A4B",
  link: "https://privlog-5c6d.example.invalid/path",
  filename: "PRIVLOG-FILENAME-7e8f.pdf",
  mime: "application/privlog-9a0b",
  storagePath: "/private/PRIVLOG-STORAGE-PATH-1c2d",
  storageKey:
    "users/PRIVLOG-OWNER-3e4f/imports/PRIVLOG-IMPORT-5g6h/source/aabbccddeeff00112233445566778899",
  objectRef: "PRIVLOG-OBJECT-REF-7i8j",
  evidenceFragment: "PRIVLOG-EVIDENCE-9k0l",
  evidenceOffset: "PRIVLOG-OFFSET-1m2n",
  rawParser: "PRIVLOG-RAW-PARSER-3o4p",
  rawProvider: "PRIVLOG-RAW-PROVIDER-5q6r",
  providerError: "PRIVLOG-PROVIDER-ERROR-7s8t",
  prompt: "PRIVLOG-PROMPT-9u0v",
  accessToken: "PRIVLOG-ACCESS-TOKEN-1w2x",
  refreshToken: "PRIVLOG-REFRESH-TOKEN-3y4z",
  authCode: "PRIVLOG-AUTH-CODE-5a6b",
  cookie: "PRIVLOG-COOKIE-7c8d",
  authHeader: "Bearer PRIVLOG-HEADER-9e0f",
  sessionRef: "PRIVLOG-SESSION-REF-1g2h",
  accountId: "PRIVLOG-ACCOUNT-3i4j",
  oauthUrl:
    "https://auth.privlog-5k6l.example.invalid/authorize?code=PRIVLOG-OAUTH-7m8n",
  modelName: "PRIVLOG-MODEL-9o0p",
  apiKey: "PRIVLOG-API-KEY-1q2r",
  dbCredential: "PRIVLOG-DB-CREDENTIAL-3s4t",
  stackTrace: "PRIVLOG-STACK-5u6v at PRIVLOG-FILE-7w8x.ts:42:42",
  requestBody: "PRIVLOG-REQUEST-BODY-9y0z",
  responseBody: "PRIVLOG-RESPONSE-BODY-1a2b",
  candidateValue: "PRIVLOG-CANDIDATE-VALUE-4d5e",
} as const;

const sentinelValues = Object.values(sentinels);

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

function assertPrivacy(records: readonly ImportEventRecord[]): void {
  const output = JSON.stringify(records);
  for (const sentinel of sentinelValues) {
    expect(output).not.toContain(sentinel);
  }
  for (const record of records) {
    const schema = importEventSchemas[record.event as ImportEventName];
    expect(schema, `closed vocabulary for ${record.event}`).toBeDefined();
    for (const key of Object.keys(record.metadata)) {
      expect(
        schema.fields,
        `metadata key ${key} for ${record.event}`,
      ).toHaveProperty(key);
    }
  }
}

function serialized(...values: readonly unknown[]): string {
  return values.map((value) => JSON.stringify(value ?? null)).join("\n");
}

describe("privacy-safe import logging (T068)", () => {
  let database: IsolatedPersistenceTestDatabase;
  let repository: TypeOrmImportResumeRepository;
  let app: INestApplication;
  let baseUrl: string;
  let logs: ImportEventRecord[];
  let queuePublisher: { addBulk: ReturnType<typeof vi.fn> };
  let storageFailures: { write: boolean; delete: boolean };
  let denyNextAttempt: boolean;
  let serverId: number;
  let requestId: number;

  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("security_privlog");
    repository = new TypeOrmImportResumeRepository(database.dataSource);
    const harness = await createHttpHarness();
    app = harness.app;
    baseUrl = harness.baseUrl;
    logs = harness.logs;
    queuePublisher = harness.queuePublisher;
  }, 120_000);

  beforeEach(async () => {
    serverId = 1;
    requestId = 1;
    logs.splice(0);
    queuePublisher.addBulk.mockClear();
    storageFailures = { write: false, delete: false };
    denyNextAttempt = false;
    await truncateAll(database.dataSource);
  });

  afterAll(async () => {
    if (app !== undefined) await app.close();
    if (database !== undefined) await database.cleanup();
  }, 120_000);

  async function createHttpHarness(): Promise<{
    readonly app: INestApplication;
    readonly baseUrl: string;
    readonly queuePublisher: { addBulk: ReturnType<typeof vi.fn> };
    readonly logs: ImportEventRecord[];
  }> {
    const logsCapture: ImportEventRecord[] = [];
    const queue = { addBulk: vi.fn(async () => undefined) };
    const storage = {
      writeObject: vi.fn(async () => {
        if (storageFailures.write) {
          throw new Error(`write failed: ${sentinels.storagePath}`);
        }
      }),
      deleteObject: vi.fn(async () => {
        if (storageFailures.delete) {
          throw new Error(`delete failed: ${sentinels.storagePath}`);
        }
        return { deleted: true };
      }),
    };
    const providers: Provider[] = [
      { provide: API_IMPORT_RESUME_REPOSITORY, useValue: repository },
      { provide: API_PERSISTENCE_TRANSACTION_RUNNER, useValue: repository },
      { provide: START_IMPORT_PRIVATE_STORAGE, useValue: storage },
      {
        provide: START_IMPORT_LIMIT_SERVICE,
        useValue: {
          reserveAttempt: vi.fn(async (ownerUserId: string) =>
            denyNextAttempt
              ? {
                  allowed: false as const,
                  outcome: {
                    kind: "denied" as const,
                    code: "upload_attempt_limit" as const,
                    messageCategory: "upload_attempts" as const,
                    retryable: true,
                    retryAfterSeconds: 47,
                  },
                }
              : {
                  allowed: true as const,
                  reservation: {
                    id: "reservation-1",
                    ownerUserId,
                    attemptedAt: now,
                    importId: null,
                    state: "reserved" as const,
                  },
                },
          ),
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

  describe("API import boundary", () => {
    it("logs import creation and upload acceptance with only closed operational metadata", async () => {
      const form = new FormData();
      form.append(
        "file",
        new Blob([new TextEncoder().encode(sentinels.fullResume)], {
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
      const created = logs.find((record) => record.event === "import.created");
      expect(created).toBeDefined();
      expect(created?.metadata).toEqual({
        importId: "70000000-0000-4000-8000-000000000001",
        statusCode: 201,
        fileSizeBucket: "under_1_mib",
      });
      expect(serialized(body, logs)).not.toContain(sentinels.fullResume);
      expect(serialized(body, logs)).not.toContain(sentinels.filename);
      assertPrivacy(logs);
    });

    it("logs upload validation failures as sanitized categories", async () => {
      const form = new FormData();
      form.append(
        "file",
        new Blob([new TextEncoder().encode(sentinels.snippet)], {
          type: "text/plain",
        }),
        sentinels.filename,
      );
      const response = await fetch(`${baseUrl}/import-resume`, {
        method: "POST",
        headers: { "x-test-principal": "owner-a" },
        body: form,
      });
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(415);
      expect(body.code).toBe("unsupported_format");
      const rejected = logs.find(
        (record) => record.event === "import.upload_rejected",
      );
      expect(rejected).toBeDefined();
      expect(rejected?.metadata).toEqual({
        errorCategory: "unsupported_format",
      });
      expect(serialized(body, logs)).not.toContain(sentinels.snippet);
      expect(serialized(body, logs)).not.toContain(sentinels.filename);
      assertPrivacy(logs);
    });

    it("logs rate limiting without echoing internal state", async () => {
      denyNextAttempt = true;
      const form = new FormData();
      form.append(
        "file",
        new Blob([new TextEncoder().encode(sentinels.fullResume)], {
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

      expect(response.status).toBe(429);
      expect(body.code).toBe("rate_limited");
      const rateLimited = logs.find(
        (record) => record.event === "import.rate_limited",
      );
      expect(rateLimited?.metadata).toEqual({ retryAfterSeconds: 47 });
      assertPrivacy(logs);
    });

    it("logs private storage write failures without paths or content", async () => {
      storageFailures.write = true;
      const form = new FormData();
      form.append(
        "file",
        new Blob([new TextEncoder().encode(sentinels.fullResume)], {
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

      expect(response.status).toBe(503);
      expect(body.code).toBe("storage_unavailable");
      const failed = logs.find(
        (record) => record.event === "import.storage_write_failed",
      );
      expect(failed?.metadata).toEqual({
        importId: "70000000-0000-4000-8000-000000000001",
        retryable: true,
      });
      expect(serialized(body, logs)).not.toContain(sentinels.storagePath);
      assertPrivacy(logs);
    });

    it("logs storage deletion compensation failures without paths or content", async () => {
      const persistenceFailure = new Error(
        `database failed ${sentinels.dbCredential}`,
      );
      vi.spyOn(repository, "createImportAggregate").mockRejectedValueOnce(
        persistenceFailure,
      );
      storageFailures.delete = true;
      const form = new FormData();
      form.append(
        "file",
        new Blob([new TextEncoder().encode(sentinels.fullResume)], {
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

      expect(response.status).toBe(500);
      const failed = logs.find(
        (record) => record.event === "import.storage_delete_failed",
      );
      expect(failed?.metadata).toEqual({
        importId: "70000000-0000-4000-8000-000000000001",
        retryable: true,
      });
      expect(serialized(body, logs)).not.toContain(sentinels.dbCredential);
      expect(serialized(body, logs)).not.toContain(sentinels.storagePath);
      assertPrivacy(logs);
    });

    it("logs ownership failures and unknown resources as identical non-disclosing events", async () => {
      await seedImport(repository, ownerA, docA, artifactA);

      await http("GET", `/import-resume/${docA}/status`, "owner-b");
      await http("GET", `/import-resume/${unknownUuid}/status`, "owner-b");

      const events = logs.filter(
        (record) => record.event === "import.resource_not_found",
      );
      expect(events).toHaveLength(2);
      const wrongOwner = events[0]!;
      const unknown = events[1]!;
      expect(wrongOwner.metadata).toEqual({
        importId: docA,
        operation: "status",
      });
      expect(unknown.metadata).toEqual({
        importId: unknownUuid,
        operation: "status",
      });
      // Identical shape apart from the requested opaque identifier.
      expect(Object.keys(wrongOwner.metadata)).toEqual(
        Object.keys(unknown.metadata),
      );
      expect(serialized(logs)).not.toContain(sentinels.filename);
      expect(serialized(logs)).not.toContain(sentinels.storageKey);
      assertPrivacy(logs);
    });

    it("logs review corrections with only operation metadata", async () => {
      await seedImport(repository, ownerA, docA, artifactA);
      await seedDraft(repository, draftA, docA, ownerA);

      const body = reviewAddBody("80000000-0000-4000-8000-0000000000f1", 0);
      const response = await http(
        "PATCH",
        `/import-resume/${docA}/review`,
        "owner-a",
        body,
      );
      expect(response.status).toBe(200);

      const corrected = logs.find(
        (record) => record.event === "review.corrected",
      );
      expect(corrected).toBeDefined();
      expect(corrected?.metadata).toMatchObject({
        importId: docA,
        operationType: "add_field",
        reviewRevision: 1,
      });
      expect(serialized(logs)).not.toContain(sentinels.skill);
      assertPrivacy(logs);
    });

    it("logs confirmation completion without candidate or evidence content", async () => {
      await seedReadyDraft(repository, ownerA, docA, artifactA, draftA, fieldA);

      const response = await http(
        "POST",
        `/import-resume/${docA}/confirm`,
        "owner-a",
        {
          operationId: "80000000-0000-4000-8000-0000000000e1",
          expectedReviewRevision: 4,
          explicitConfirmation: true,
        },
      );
      expect(response.status).toBe(201);

      const confirmed = logs.find(
        (record) => record.event === "confirm.completed",
      );
      expect(confirmed).toBeDefined();
      expect(confirmed?.metadata).toMatchObject({ importId: docA });
      expect(serialized(logs)).not.toContain(sentinels.candidateValue);
      assertPrivacy(logs);
    });

    it("logs discard completion with only opaque identifiers", async () => {
      await seedReadyDraft(repository, ownerA, docA, artifactA, draftA, fieldA);

      const response = await http(
        "POST",
        `/import-resume/${docA}/discard`,
        "owner-a",
        {
          operationId: "80000000-0000-4000-8000-0000000000d1",
          expectedReviewRevision: 4,
          explicitDiscard: true,
        },
      );
      expect(response.status).toBe(201);

      const discarded = logs.find(
        (record) => record.event === "import.discarded",
      );
      expect(discarded).toBeDefined();
      expect(discarded?.metadata).toMatchObject({
        importId: docA,
        deletionJobId: expect.any(String) as unknown as string,
      });
      assertPrivacy(logs);
    });

    it("logs confirm and discard on unknown resources without disclosure", async () => {
      const confirm = await http(
        "POST",
        `/import-resume/${unknownUuid}/confirm`,
        "owner-b",
        {
          operationId: "80000000-0000-4000-8000-0000000000e9",
          expectedReviewRevision: 0,
          explicitConfirmation: true,
        },
      );
      const discard = await http(
        "POST",
        `/import-resume/${unknownUuid}/discard`,
        "owner-b",
        {
          operationId: "80000000-0000-4000-8000-0000000000d9",
          expectedReviewRevision: 0,
          explicitDiscard: true,
        },
      );
      expect(confirm.status).toBe(404);
      expect(discard.status).toBe(404);

      const events = logs.filter(
        (record) => record.event === "import.resource_not_found",
      );
      expect(events).toHaveLength(2);
      expect(events[0]?.metadata).toEqual({
        importId: unknownUuid,
        operation: "confirm",
      });
      expect(events[1]?.metadata).toEqual({
        importId: unknownUuid,
        operation: "discard",
      });
      assertPrivacy(logs);
    });
  });

  describe("provider connection boundary", () => {
    it("keeps lookup and wrong-owner failures identical and non-disclosing", async () => {
      const harness = providerConnectionHarness();
      harness.connections.set(
        connectionA,
        connectedConnection(ownerA, connectionA),
      );

      // Unknown connection for owner B.
      await expect(
        harness.service.status(ownerB, unknownUuid),
      ).rejects.toMatchObject({ code: "provider_connection_not_found" });
      // Wrong owner for a connection that exists under owner A.
      await expect(
        harness.service.status(ownerB, connectionA),
      ).rejects.toMatchObject({ code: "provider_connection_not_found" });

      const events = harness.logs.filter(
        (record) => record.event === "provider_connection.lookup_failed",
      );
      expect(events).toHaveLength(2);
      expect(events[0]?.metadata).toEqual({
        connectionId: unknownUuid,
        operation: "status",
        errorCategory: "not_found",
        retryable: false,
      });
      expect(events[1]?.metadata).toEqual({
        connectionId: connectionA,
        operation: "status",
        errorCategory: "not_found",
        retryable: false,
      });
      expect(Object.keys(events[0]!.metadata)).toEqual(
        Object.keys(events[1]!.metadata),
      );
      expect(serialized(harness.logs)).not.toContain(sentinels.sessionRef);
      expect(serialized(harness.logs)).not.toContain(sentinels.accessToken);
      assertPrivacy(harness.logs);
    });
  });

  describe("worker and application service boundaries", () => {
    it("logs semantic provider outcomes provider-neutrally", async () => {
      for (const code of [
        "provider_unavailable",
        "authentication_expired",
        "rate_limited",
        "quota_exceeded",
        "timeout",
        "invalid_provider_response",
        "not_configured",
        "unsupported_capability",
      ] as const) {
        const harness = semanticHarness(
          failingProvider(code, true),
          sentinels.transcript,
        );
        await harness.processor.process({
          ownerUserId: ownerA,
          importedDocumentId: docA,
        });
        const outcome = harness.logs.find(
          (record) => record.event === "semantic.outcome",
        );
        expect(outcome?.metadata).toMatchObject({
          importId: docA,
          outcome: code,
          retryable: true,
        });
        assertPrivacy(harness.logs);
      }
    });

    it("logs malformed output, schema, evidence, grounding, and invention diagnostics without content", async () => {
      const cases: {
        readonly label: string;
        readonly response: unknown;
        readonly expectedCategory: string;
      }[] = [
        {
          label: "malformed provider output",
          response: { provider: { name: sentinels.modelName } },
          expectedCategory: "schema",
        },
        {
          label: "invalid schema",
          response: { sections: null },
          expectedCategory: "schema",
        },
        {
          label: "invalid evidence",
          response: invalidEvidenceResponse(sentinels.transcript),
          expectedCategory: "evidence",
        },
        {
          label: "ungrounded output",
          response: ungroundedResponse(sentinels.transcript),
          expectedCategory: "evidence",
        },
        {
          label: "invented output",
          response: inventedResponse(sentinels.transcript),
          expectedCategory: "no_invention",
        },
      ];
      for (const entry of cases) {
        const harness = semanticHarness(
          okProvider(entry.response),
          sentinels.transcript,
        );
        await harness.processor.process({
          ownerUserId: ownerA,
          importedDocumentId: docA,
        });
        const diagnostics = harness.logs.filter(
          (record) => record.event === "semantic.validation_diagnostics",
        );
        expect(
          diagnostics.some(
            (record) => record.metadata.category === entry.expectedCategory,
          ),
          entry.label,
        ).toBe(true);
        const outcome = harness.logs.find(
          (record) => record.event === "semantic.outcome",
        );
        expect(outcome?.metadata).toMatchObject({
          outcome: "invalid_provider_response",
        });
        expect(serialized(harness.logs)).not.toContain(sentinels.modelName);
        assertPrivacy(harness.logs);
      }
    });

    it("logs transcript normalization and provider invocation start without content", async () => {
      const harness = semanticHarness(
        okProvider(validResponse(sentinels.transcript)),
        sentinels.transcript,
      );
      await harness.processor.process({
        ownerUserId: ownerA,
        importedDocumentId: docA,
      });

      const normalized = harness.logs.find(
        (record) => record.event === "extraction.transcript_normalized",
      );
      const started = harness.logs.find(
        (record) => record.event === "semantic.provider_invocation_started",
      );
      expect(normalized?.metadata).toEqual({
        importId: docA,
        documentFormat: "pdf",
        fragmentCountBucket: "0-4",
        lineCountBucket: "0-4",
      });
      expect(started?.metadata).toEqual({
        importId: docA,
        contractVersion: "nuvitae.resume-semantic-parser.v1",
        requestContractVersion: "nuvitae.resume-semantic-parser.v1",
        responseContractVersion: "nuvitae.semantic-extraction.v2",
        correlationId: docA,
      });
      expect(serialized(harness.logs)).not.toContain(sentinels.transcript);
      assertPrivacy(harness.logs);
    });

    it("logs review draft creation with only opaque identifiers and counts", async () => {
      const harness = semanticHarness(
        okProvider(validResponse(sentinels.transcript)),
        sentinels.transcript,
      );
      await harness.processor.process({
        ownerUserId: ownerA,
        importedDocumentId: docA,
      });

      const created = harness.logs.find(
        (record) => record.event === "review.draft_created",
      );
      expect(created).toBeDefined();
      expect(created?.metadata).toMatchObject({
        importId: docA,
        status: "review_required",
      });
      expect(Object.keys(created!.metadata).sort()).toEqual([
        "draftId",
        "fieldCountBucket",
        "importId",
        "status",
        "warningCountBucket",
      ]);
      expect(serialized(harness.logs)).not.toContain(sentinels.transcript);
      assertPrivacy(harness.logs);
    });

    it("maps unexpected worker exceptions to a sanitized failure event", async () => {
      const harness = semanticHarness(
        {
          parse: vi.fn(async () => {
            throw new Error(
              `${sentinels.providerError} ${sentinels.stackTrace}`,
            );
          }),
        } as unknown as ResumeSemanticParserProvider,
        sentinels.transcript,
      );
      await harness.processor.process({
        ownerUserId: ownerA,
        importedDocumentId: docA,
      });

      const failed = harness.logs.find(
        (record) => record.event === "import.unexpected_failure",
      );
      expect(failed?.metadata).toEqual({
        importId: docA,
        errorCategory: "unexpected_failure",
        retryable: true,
      });
      expect(serialized(harness.logs)).not.toContain(sentinels.providerError);
      expect(serialized(harness.logs)).not.toContain(sentinels.stackTrace);
      assertPrivacy(harness.logs);
    });

    it("logs deterministic extraction start, completion, failure, and transcript counts", async () => {
      const success = extractionHarness();
      await success.service.process({
        ownerUserId: ownerA,
        importedDocumentId: docA,
      });
      expect(
        success.logs.some((record) => record.event === "extraction.started"),
      ).toBe(true);
      const completed = success.logs.find(
        (record) => record.event === "extraction.completed",
      );
      expect(completed?.metadata).toMatchObject({
        importId: docA,
        extractionCategory: "no_supported_field",
      });
      expect(
        success.logs.some(
          (record) => record.event === "extraction.transcript_normalized",
        ),
      ).toBe(true);
      assertPrivacy(success.logs);

      const failure = extractionHarness({ cancelled: true });
      await failure.service.process({
        ownerUserId: ownerA,
        importedDocumentId: docA,
      });
      const failed = failure.logs.find(
        (record) => record.event === "extraction.failed",
      );
      expect(failed?.metadata).toMatchObject({
        importId: docA,
        extractionCategory: "cancelled",
        retryable: false,
      });
      assertPrivacy(failure.logs);
    });

    it("logs worker job failures without provider or internal diagnostics", async () => {
      const harness = workerFailureHarness();
      await expect(
        harness.processor.process(
          job(
            IMPORT_RESUME_JOB_NAMES.validation,
            validationPayload(docA, ownerA),
          ),
        ),
      ).rejects.toThrow();

      const failed = harness.logs.find(
        (record) => record.event === "import.worker_failed",
      );
      expect(failed?.metadata).toEqual({
        importId: docA,
        jobType: "validation",
        errorCategory: "unexpected_failure",
        retryable: true,
      });
      expect(serialized(harness.logs)).not.toContain(sentinels.providerError);
      expect(serialized(harness.logs)).not.toContain(sentinels.stackTrace);
      assertPrivacy(harness.logs);
    });

    it("logs validation completion and storage read failures without content", async () => {
      const accepted = createValidationHarness();
      const source = await readFile(
        "tests/fixtures/resumes/anonymous-selectable-resume.pdf",
      );
      const document = importedDocument({
        id: "00000000-0000-4000-8000-000000000201",
        source,
        format: "pdf",
      });
      addDocument(accepted, document, source);
      await validateOwned(accepted, document.id);
      const completed = accepted.logs.find(
        (record) => record.event === "validation.completed",
      );
      expect(completed?.metadata).toMatchObject({
        importId: document.id,
        errorCategory: "accepted",
      });
      assertPrivacy(accepted.logs as unknown as ImportEventRecord[]);

      const malformed = createValidationHarness();
      const malformedSource = new TextEncoder().encode(sentinels.fullResume);
      const malformedDocument = importedDocument({
        id: "00000000-0000-4000-8000-000000000202",
        source: malformedSource,
        format: "pdf",
      });
      addDocument(malformed, malformedDocument, malformedSource);
      await validateOwned(malformed, malformedDocument.id);
      const rejected = malformed.logs.find(
        (record) => record.event === "validation.completed",
      );
      expect(rejected?.metadata).toMatchObject({
        importId: malformedDocument.id,
        errorCategory: "malformed_or_corrupted",
      });
      expect(serialized(malformed.logs)).not.toContain(sentinels.fullResume);
      assertPrivacy(malformed.logs as unknown as ImportEventRecord[]);

      const noSource = createValidationHarness();
      const missingDocument = importedDocument({
        id: "00000000-0000-4000-8000-000000000203",
        source: new Uint8Array(0),
        format: "pdf",
      });
      noSource.repository.documents.set(missingDocument.id, missingDocument);
      await validateOwned(noSource, missingDocument.id);
      const readFailed = noSource.logs.find(
        (record) => record.event === "import.storage_read_failed",
      );
      expect(readFailed?.metadata).toEqual({
        importId: missingDocument.id,
        retryable: true,
      });
      assertPrivacy(noSource.logs as unknown as ImportEventRecord[]);
    });

    it("keeps limited deterministic partial fallback provider-neutral and sanitized", async () => {
      const logsCapture: ImportEventRecord[] = [];
      const emitter = createImportEventEmitter({
        write: (record) => logsCapture.push(record),
      });
      const text = `Headline: ${sentinels.name}`;
      const sha256 = hashValue(text);
      const outcome = runLimitedDeterministicPartialFallback({
        normalizedTranscript: {
          text,
          sha256,
          lineCount: 1,
        },
        sourceFragments: [
          {
            order: 0,
            line: 1,
            text,
            hash: hashValue(text),
            bounds: { lineStart: 1, lineEnd: 1, start: 0, end: text.length },
          },
        ],
        trigger: "provider_unavailable",
        alternativeProviderAvailable: false,
      });
      emitter.emit("semantic.outcome", {
        importId: docA,
        outcome: "partial_deterministic_fallback",
        retryable: false,
        valueCountBucket: "0-4",
        diagnosticCountBucket: "0-4",
        durationBucket: "under_100ms",
      });

      expect(JSON.stringify(outcome)).not.toContain(sentinels.name);
      expect(serialized(logsCapture)).not.toContain(sentinels.name);
      assertPrivacy(logsCapture);
    });

    it("never invokes hostile getters or serialization hooks through the real emit boundary", () => {
      const logsCapture: ImportEventRecord[] = [];
      const emitter = createImportEventEmitter({
        write: (record) => logsCapture.push(record),
      });
      const getter = vi.fn(() => sentinels.accessToken);
      const toJSON = vi.fn(() => ({ leaked: sentinels.rawProvider }));
      const hostile: Record<string, unknown> = {
        importId: docA,
        statusCode: 201,
        fileSizeBucket: "under_1_mib",
      };
      Object.defineProperty(hostile, "importId", {
        enumerable: true,
        get: getter,
      });
      hostile.circular = hostile;
      Object.defineProperty(hostile, Symbol("private"), {
        value: sentinels.sessionRef,
        enumerable: true,
      });
      (hostile as unknown as { toJSON: unknown }).toJSON = toJSON;

      expect(() =>
        emitter.emit("import.created", hostile as never),
      ).not.toThrow();
      expect(getter).not.toHaveBeenCalled();
      expect(toJSON).not.toHaveBeenCalled();
      assertPrivacy(logsCapture);
    });
  });

  async function http(
    method: "GET" | "POST" | "PATCH",
    path: string,
    principal: "owner-a" | "owner-b" | undefined,
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

  async function seedImport(
    importRepository: TypeOrmImportResumeRepository,
    ownerUserId: string,
    importId: string,
    artifactId: string,
  ): Promise<void> {
    await importRepository.createImportAggregate(
      {
        document: importedDocumentRow(ownerUserId, importId),
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
            retentionExpiresAt: retentionA,
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
  ): Promise<void> {
    await importRepository.saveDraft(
      importDraftRow(draftId, importId, ownerUserId),
    );
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
    await importRepository.saveDraft(
      importDraftRow(draftId, importId, ownerUserId, {
        status: "ready_to_confirm",
        reviewRevision: 4,
        warnings: [],
        fields: [confirmedField(ownerUserId, draftId, fieldId)],
      }),
    );
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
    }
    next();
  }
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
    retentionExpiresAt: retentionA,
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
    fields: [unconfirmedField(ownerUserId, draftId, fieldA)],
    warnings: [warningRow(draftId, ownerUserId)],
    createdAt: now,
    retentionExpiresAt: retentionA,
    ...overrides,
  };
}

function unconfirmedField(
  _ownerUserId: string,
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
    warningId: warningA,
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

function warningRow(draftId: string, _ownerUserId: string): ImportWarning {
  return {
    id: warningA,
    importDraftId: draftId,
    warningType: "low_confidence",
    section: "headline",
    fieldPath: "headline",
    message: sentinels.candidateValue,
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
      value: { kind: "text", value: sentinels.skill },
    },
  };
}

function nextUuid(seed: number, prefix: string): string {
  return `${prefix}-0000-4000-8000-${String(seed).padStart(12, "0")}`;
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

function semanticHarness(
  provider: ResumeSemanticParserProvider | undefined,
  fragmentText: string,
): {
  readonly processor: SemanticImportProcessor;
  readonly logs: ImportEventRecord[];
} {
  const logs: ImportEventRecord[] = [];
  const emitter = createImportEventEmitter({
    write: (record) => logs.push(record),
  });
  const document = documentForWorker(ownerA, docA);
  const repository = {
    findImportByOwner: vi.fn(async () => ({
      document,
      artifacts: [],
    })),
    findDraftByImportAndOwner: vi.fn(async () => null),
    saveImportLifecycle: vi.fn(async (value: ImportedDocument) => value),
    saveDraft: vi.fn(async (value: unknown) => value),
  };
  const transactionRunner = {
    transaction: vi.fn(async (work: (manager: object) => Promise<unknown>) =>
      work({}),
    ),
  };
  const textExtractor = {
    extractSelectableText: vi.fn(async () => ({
      ok: true as const,
      value: [
        {
          pageNumber: 1,
          pageReadingOrder: 0,
          items: [
            {
              text: fragmentText,
              provenance: {
                kind: "pdf_text_item" as const,
                pageNumber: 1,
                itemIndex: 0,
                readingOrder: 0,
                boundingBox: {
                  x: 0,
                  y: 0,
                  width: 10,
                  height: 10,
                  unit: "pdf_point" as const,
                },
              },
            },
          ],
        },
      ],
    })),
  };
  const processor = new SemanticImportProcessor({
    repository: repository as never,
    transactionRunner: transactionRunner as never,
    sourceReader: {} as never,
    pdfTextExtractor: textExtractor as never,
    docxTextExtractor: {} as never,
    provider,
    clock: { now: () => now },
    logger: emitter,
  });
  return { processor, logs };
}

function documentForWorker(
  ownerUserId: string,
  importId: string,
): ImportedDocument {
  return {
    id: importId,
    ownerUserId,
    visibleFilename: "resume.pdf",
    contentType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes: 42,
    storageKey: `users/${ownerUserId}/imports/${importId}/source/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "queued",
    deletionStatus: "not_scheduled",
    createdAt: now,
    retentionExpiresAt: new Date("2026-08-08T09:00:00.000Z"),
    detectedLanguage: "english",
  };
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function evidenceFor(text: string) {
  const normalized = text.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return {
    line: 1,
    start: 0,
    end: normalized.length,
    fragmentHash: hashValue(normalized),
    fragmentId: null,
  };
}

function valueFor(text: string) {
  const normalized = text.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const evidence = evidenceFor(text);
  return {
    value: normalized,
    normalizedValue: null,
    evidence: [evidence],
    classification: "explicit" as const,
    confidence: "high" as const,
  };
}

function validResponse(text: string) {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v1" as const,
    documentLanguage: {
      value: "english" as const,
      confidence: "high" as const,
      evidence: [evidenceFor(text)],
    },
    sections: {
      contact: {
        fullName: valueFor(text),
        email: null,
        phone: null,
        location: null,
        website: null,
      },
      headline: null,
      summary: null,
      workExperience: [],
      education: [],
      skills: [
        { candidateId: "skill-1", name: valueFor(text), category: null },
      ],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

function invalidEvidenceResponse(text: string) {
  const response = validResponse(text);
  const evidence = {
    line: 1,
    start: 0,
    end: 4,
    fragmentHash: "d".repeat(64),
    fragmentId: sentinels.evidenceFragment,
  };
  return {
    ...response,
    sections: {
      ...response.sections,
      contact: {
        ...response.sections.contact,
        fullName: {
          ...valueFor(text),
          evidence: [evidence],
        },
      },
    },
  };
}

function ungroundedResponse(text: string) {
  const response = validResponse(text);
  const evidence = {
    line: 99,
    start: 0,
    end: 4,
    fragmentHash: hashValue("no such fragment"),
    fragmentId: null,
  };
  return {
    ...response,
    sections: {
      ...response.sections,
      contact: {
        ...response.sections.contact,
        fullName: {
          ...valueFor(text),
          evidence: [evidence],
        },
      },
    },
  };
}

function inventedResponse(text: string) {
  const response = validResponse(text);
  return {
    ...response,
    sections: {
      ...response.sections,
      contact: {
        ...response.sections.contact,
        fullName: {
          ...valueFor(text),
          value: sentinels.name,
        },
      },
    },
  };
}

function failingProvider(
  code: string,
  retryable: boolean,
): ResumeSemanticParserProvider {
  return {
    providerKind: "test-provider",
    capabilities,
    inspectConnection: vi.fn(),
    parse: vi.fn(async () => ({
      ok: false as const,
      error: {
        code,
        retryable,
        recoveryActions: [],
        diagnostic: code,
        validationIssues: [],
      },
    })),
  } as unknown as ResumeSemanticParserProvider;
}

function okProvider(response: unknown): ResumeSemanticParserProvider {
  return {
    providerKind: "test-provider",
    capabilities,
    inspectConnection: vi.fn(),
    parse: vi.fn(async () => ({ ok: true as const, response })),
  } as unknown as ResumeSemanticParserProvider;
}

function extractionHarness(options: { cancelled?: boolean } = {}): {
  readonly service: ProcessExtractionService;
  readonly logs: ImportEventRecord[];
} {
  const logs: ImportEventRecord[] = [];
  const emitter = createImportEventEmitter({
    write: (record) => logs.push(record),
  });
  const document = documentForWorker(ownerA, docA);
  const repository = {
    transaction: vi.fn(
      async (work: (repository: unknown) => Promise<unknown>) =>
        work(repository),
    ),
    findImportByOwner: vi.fn(async () => ({
      document,
      artifacts: [],
    })),
    findDraftByImportAndOwner: vi.fn(async () => null),
    saveImportLifecycle: vi.fn(async (value: ImportedDocument) => value),
    saveDraft: vi.fn(async (value: unknown) => value),
  };
  const pdfTextExtractor = {
    extractSelectableText: vi.fn(async () =>
      options.cancelled === true
        ? {
            ok: false as const,
            error: {
              category: "cancelled" as const,
              retryable: false,
              message: sentinels.providerError,
            },
          }
        : {
            ok: true as const,
            value: [
              {
                pageNumber: 1,
                pageReadingOrder: 0,
                items: [
                  {
                    text: sentinels.transcript,
                    provenance: {
                      kind: "pdf_text_item" as const,
                      pageNumber: 1,
                      itemIndex: 0,
                      readingOrder: 0,
                      boundingBox: {
                        x: 0,
                        y: 0,
                        width: 10,
                        height: 10,
                        unit: "pdf_point" as const,
                      },
                    },
                  },
                ],
              },
            ],
          },
    ),
  };
  const fieldExtractor = {
    extract: vi.fn(() => ({
      ok: true as const,
      fields: [],
      warnings: [],
      missingOrUnprocessedSections: [],
    })),
  };
  const service = new ProcessExtractionService({
    repository: repository as never,
    sourceReader: {} as never,
    pdfTextExtractor: pdfTextExtractor as never,
    docxTextExtractor: {} as never,
    fieldExtractor: fieldExtractor as never,
    clock: { now: () => now },
    ids: {
      draftId: () => "40000000-0000-4000-8000-0000000000a1",
      fieldId: () => "60000000-0000-4000-8000-0000000000a1",
      warningId: () => "50000000-0000-4000-8000-0000000000a1",
      requestId: () => "90000000-0000-4000-8000-000000000001",
    },
    logger: emitter,
  });
  return { service, logs };
}

function workerFailureHarness(): {
  readonly processor: ImportProcessingProcessor;
  readonly logs: ImportEventRecord[];
} {
  const logs: ImportEventRecord[] = [];
  const emitter = createImportEventEmitter({
    write: (record) => logs.push(record),
  });
  const document = {
    ...documentForWorker(ownerA, docA),
    validationStatus: "not_started" as const,
  };
  const repository = {
    findImportByOwner: vi.fn(async () => ({
      document,
      artifacts: [],
    })),
  };
  const transactionRunner = {
    transaction: vi.fn(async (work: (manager: object) => Promise<unknown>) =>
      work({}),
    ),
  };
  const validation = {
    validate: vi.fn(async () => {
      throw new Error(`${sentinels.providerError} ${sentinels.stackTrace}`);
    }),
  };
  const extraction = { process: vi.fn(async () => undefined) };
  const queue = { add: vi.fn(async () => undefined) };
  const processor = new ImportProcessingProcessor(
    repository as never,
    transactionRunner as never,
    validation,
    extraction,
    queue as never,
    emitter,
  );
  return { processor, logs };
}

function providerConnectionHarness(): {
  readonly service: ProviderConnectionService;
  readonly logs: ImportEventRecord[];
  readonly connections: Map<string, AIProviderRuntimeConnection>;
} {
  const logs: ImportEventRecord[] = [];
  const emitter = createImportEventEmitter({
    write: (record) => logs.push(record),
  });
  const connections = new Map<string, AIProviderRuntimeConnection>();
  const repository = {
    findConnectionByOwner: vi.fn(
      async (connectionId: string, ownerUserId: string) => {
        const connection = connections.get(connectionId);
        return connection !== undefined &&
          connection.ownerUserId === ownerUserId
          ? connection
          : null;
      },
    ),
    listConnectionsByOwner: vi.fn(async () => []),
    createConnection: vi.fn(async (connection: AIProviderRuntimeConnection) => {
      connections.set(connection.id, connection);
      return connection;
    }),
    saveConnection: vi.fn(async (connection: AIProviderRuntimeConnection) => {
      connections.set(connection.id, connection);
      return connection;
    }),
    transaction: vi.fn(async (work: (manager: object) => Promise<unknown>) =>
      work({}),
    ),
  };
  const sessionStore: ProviderSessionStore = {
    writeSession: vi.fn(async (input) => input),
    readSession: vi.fn(async () => new Uint8Array()),
    deleteSession: vi.fn(async () => ({ deleted: true })),
    hasSession: vi.fn(async () => false),
  };
  const adapter: ProviderRuntimeConnectionAdapter = {
    providerKind: "test-provider",
    inspect: vi.fn(async () => ({
      connectionState: "connected" as const,
      authenticationState: "authenticated" as const,
      availabilityState: "available" as const,
      checkedAt: now,
      safeMessage: null,
    })),
    startLogin: vi.fn(async () => ({ loginStartedAt: now, safeMessage: null })),
    completeLogin: vi.fn(async () => ({
      connectedAt: now,
      expiresAt: null,
      sessionReference: "d".repeat(64),
      capabilities,
    })),
    cancelLogin: vi.fn(async () => ({
      loginStartedAt: now,
      safeMessage: null,
    })),
    reconnect: vi.fn(async () => ({
      connectedAt: now,
      expiresAt: null,
      sessionReference: "d".repeat(64),
      capabilities,
    })),
    disconnect: vi.fn(async () => undefined),
    revoke: vi.fn(async () => undefined),
    deleteLocalState: vi.fn(async () => undefined),
    capabilities: vi.fn(async () => capabilities),
    quotaState: vi.fn(async () => ({
      availabilityState: "available" as const,
      checkedAt: now,
      safeMessage: null,
    })),
  };
  const service = new ProviderConnectionService({
    repository: repository as never,
    sessionStore,
    adapter,
    logger: emitter,
  });
  return { service, logs, connections };
}

function connectedConnection(
  ownerUserId: string,
  connectionId: string,
): AIProviderRuntimeConnection {
  return {
    id: connectionId,
    ownerUserId,
    providerKind: "test-provider",
    displayName: null,
    connectionStatus: "connected",
    authenticationStatus: "authenticated",
    availabilityStatus: "available",
    capabilities,
    capabilitySnapshotAt: now,
    sessionReference: "d".repeat(64),
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
    sourceStorageKey: `users/${ownerUserId}/${importId}/source`,
    uploadedAt: now.toISOString(),
    foregroundDeadline: new Date(now.getTime() + 180_000).toISOString(),
    sizeBytes: 1024,
  };
}

function job(name: string, data: unknown) {
  return {
    name,
    data,
    updateProgress: vi.fn(async () => undefined),
  } as never;
}
