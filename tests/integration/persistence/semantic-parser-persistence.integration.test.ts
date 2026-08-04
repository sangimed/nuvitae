import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  EvidenceRecord,
  NuvitaeExtractionResponse,
  ProviderCapabilitySnapshot,
  SemanticParseAttempt,
  SemanticParseResultGraph,
  SemanticParserValidationStatus,
} from "@nuvitae/domain";
import {
  EvidenceRecordEntity,
  ImportedDocumentEntity,
  NuvitaeExtractionResponseEntity,
  ProviderCapabilitySnapshotEntity,
  SemanticParseAttemptEntity,
  SemanticParserValidationStatusEntity,
  TypeOrmSemanticParserRepository,
  evidenceRecordEntity,
  mapEvidenceRecord,
  mapNuvitaeExtractionResponse,
  mapProviderCapabilitySnapshot,
  mapSemanticParseAttempt,
  mapSemanticParserValidationStatus,
  nuvitaeExtractionResponseEntity,
  providerCapabilitySnapshotEntity,
  semanticParseAttemptEntity,
  semanticParserValidationStatusEntity,
} from "@nuvitae/persistence";
import { ids, importedDocument } from "./fixtures.js";
import { postgresErrorCode } from "./test-database.js";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import { createIsolatedPersistenceTestDatabase } from "./test-database.js";

const schemaVersion = "nuvitae.semantic-extraction.v1";
const fragmentHash = "a".repeat(64);

const semanticIds = {
  attempt: "21000000-0000-4000-8000-000000000001",
  response: "21000000-0000-4000-8000-000000000002",
  evidence: "21000000-0000-4000-8000-000000000003",
  snapshot: "21000000-0000-4000-8000-000000000004",
  validationStatus: "21000000-0000-4000-8000-000000000005",
  candidate: "candidate.contact.full-name",
} as const;

const attemptStartedAt = new Date("2026-08-01T10:00:00.000Z");
const createdAt = new Date("2026-08-01T10:00:00.000Z");
const retentionExpiresAt = new Date("2026-08-08T10:00:00.000Z");

function documentRow(ownerUserId: string = ids.ownerA) {
  const document = importedDocument({ ownerUserId });
  return Object.assign(new ImportedDocumentEntity(), {
    ...document,
    sizeBytes: String(document.sizeBytes),
    renderedPageCount: document.renderedPageCount ?? null,
    detectedLanguage: document.detectedLanguage ?? null,
    storageKey: document.storageKey ?? null,
    deletedAt: null,
  });
}

function semanticAttempt(
  overrides: Partial<SemanticParseAttempt> = {},
): SemanticParseAttempt {
  return {
    id: semanticIds.attempt,
    importedDocumentId: ids.document,
    ownerUserId: ids.ownerA,
    providerKind: "codex_direct",
    inputRepresentation: "normalized_transcript_flattened_fragments",
    status: "succeeded",
    startedAt: attemptStartedAt,
    endedAt: new Date("2026-08-01T10:00:05.000Z"),
    timeoutSeconds: 30,
    responseSchemaVersion: schemaVersion,
    groundingValidationStatus: "passed",
    noInventionValidationStatus: "passed",
    latencyMs: 5_000,
    createdAt,
    retentionExpiresAt,
    ...overrides,
  };
}

function semanticResponse(
  overrides: Partial<NuvitaeExtractionResponse> = {},
): NuvitaeExtractionResponse {
  return {
    id: semanticIds.response,
    semanticParseAttemptId: semanticIds.attempt,
    ownerUserId: ids.ownerA,
    schemaVersion,
    validationStatus: "accepted",
    createdAt,
    retentionExpiresAt,
    ...overrides,
  };
}

function evidenceRecord(
  overrides: Partial<EvidenceRecord> = {},
): EvidenceRecord {
  return {
    id: semanticIds.evidence,
    responseId: semanticIds.response,
    ownerUserId: ids.ownerA,
    candidateId: semanticIds.candidate,
    line: 1,
    start: 0,
    end: 24,
    fragmentHash,
    fragmentId: "fragment.1",
    classification: "explicit",
    confidenceStatus: "high",
    validationStatus: "valid",
    createdAt,
    retentionExpiresAt,
    ...overrides,
  };
}

function capabilitySnapshot(
  overrides: Partial<ProviderCapabilitySnapshot> = {},
): ProviderCapabilitySnapshot {
  return {
    id: semanticIds.snapshot,
    semanticParseAttemptId: semanticIds.attempt,
    ownerUserId: ids.ownerA,
    providerKind: "codex_direct",
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
    snapshotAt: attemptStartedAt,
    createdAt,
    retentionExpiresAt,
    ...overrides,
  };
}

function validationStatus(
  overrides: Partial<SemanticParserValidationStatus> = {},
): SemanticParserValidationStatus {
  return {
    id: semanticIds.validationStatus,
    semanticParseAttemptId: semanticIds.attempt,
    ownerUserId: ids.ownerA,
    schemaStatus: "passed",
    groundingStatus: "passed",
    absenceStatus: "passed",
    noInventionStatus: "passed",
    conflictStatus: "passed",
    acceptanceStatus: "accepted",
    createdAt,
    retentionExpiresAt,
    ...overrides,
  };
}

function resultGraph(
  overrides: {
    readonly attempt?: Partial<SemanticParseAttempt>;
    readonly response?: Partial<NuvitaeExtractionResponse>;
    readonly snapshot?: Partial<ProviderCapabilitySnapshot>;
    readonly statuses?: Partial<SemanticParserValidationStatus>;
    readonly evidence?: readonly EvidenceRecord[];
  } = {},
): SemanticParseResultGraph {
  return {
    attempt: semanticAttempt(overrides.attempt),
    response: semanticResponse(overrides.response),
    capabilitySnapshot: capabilitySnapshot(overrides.snapshot),
    validationStatuses: validationStatus(overrides.statuses),
    evidenceRecords: overrides.evidence ?? [evidenceRecord()],
  };
}

async function expectTableCount(
  database: IsolatedPersistenceTestDatabase,
  table: string,
  expected: number,
): Promise<void> {
  const rows = await database.dataSource.query<{ count: string }[]>(
    `SELECT count(*) AS count FROM "${database.schema}"."${table}"`,
  );
  expect(rows[0]?.count).toBe(String(expected));
}

describe("semantic parser persistence", () => {
  let database: IsolatedPersistenceTestDatabase;
  let repository: TypeOrmSemanticParserRepository;

  beforeEach(async () => {
    database = await createIsolatedPersistenceTestDatabase("semantic_parser");
    repository = new TypeOrmSemanticParserRepository(database.dataSource);
    await database.dataSource.manager.save(
      ImportedDocumentEntity,
      documentRow(),
    );
  });

  afterEach(async () => {
    if (database !== undefined) await database.cleanup();
  });

  it("migrates all five semantic persistence tables", async () => {
    const tables = await database.dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name IN ('semantic_parse_attempts', 'nuvitae_extraction_responses', 'evidence_records', 'provider_capability_snapshots', 'semantic_parser_validation_statuses')`,
      [database.schema],
    );
    expect(tables.map((row) => row.table_name).sort()).toEqual([
      "evidence_records",
      "nuvitae_extraction_responses",
      "provider_capability_snapshots",
      "semantic_parse_attempts",
      "semantic_parser_validation_statuses",
    ]);
  });

  it("enforces entity constraints and ownership-aware relationships", async () => {
    const graph = resultGraph();
    await expect(
      database.dataSource.manager.insert(
        SemanticParseAttemptEntity,
        Object.assign(new SemanticParseAttemptEntity(), {
          ...graph.attempt,
          status: "not_a_status",
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        SemanticParseAttemptEntity,
        Object.assign(new SemanticParseAttemptEntity(), {
          ...graph.attempt,
          retentionExpiresAt: createdAt,
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        NuvitaeExtractionResponseEntity,
        Object.assign(new NuvitaeExtractionResponseEntity(), {
          ...graph.response,
          schemaVersion: "provider-native.v0",
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        EvidenceRecordEntity,
        Object.assign(new EvidenceRecordEntity(), {
          ...graph.evidenceRecords[0],
          end: 0,
          start: 5,
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        EvidenceRecordEntity,
        Object.assign(new EvidenceRecordEntity(), {
          ...graph.evidenceRecords[0],
          fragmentHash: "not-a-hash",
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );
  });

  it("creates and reads the full result graph through the repository", async () => {
    const saved = await repository.persistParseResultGraph(resultGraph());
    expect(saved.attempt.id).toBe(semanticIds.attempt);
    expect(saved.response.schemaVersion).toBe(schemaVersion);
    expect(saved.evidenceRecords).toHaveLength(1);

    const loaded = await repository.findParseResultGraphByAttemptAndOwner(
      semanticIds.attempt,
      ids.ownerA,
    );
    expect(loaded).not.toBeNull();
    expect(loaded?.attempt).toMatchObject(semanticAttempt());
    expect(loaded?.response).toMatchObject(semanticResponse());
    expect(loaded?.capabilitySnapshot).toMatchObject(capabilitySnapshot());
    expect(loaded?.validationStatuses).toMatchObject(validationStatus());
    expect(loaded?.evidenceRecords).toMatchObject([evidenceRecord()]);

    const attempts = await repository.findAttemptsByImportAndOwner(
      ids.document,
      ids.ownerA,
    );
    expect(attempts).toHaveLength(1);
    expect(
      await repository.findResponseByAttemptAndOwner(
        semanticIds.attempt,
        ids.ownerA,
      ),
    ).toMatchObject(semanticResponse());
    expect(
      await repository.findSnapshotByAttemptAndOwner(
        semanticIds.attempt,
        ids.ownerA,
      ),
    ).toMatchObject(capabilitySnapshot());
    expect(
      await repository.findValidationStatusByAttemptAndOwner(
        semanticIds.attempt,
        ids.ownerA,
      ),
    ).toMatchObject(validationStatus());
    expect(
      await repository.findEvidenceByResponseAndOwner(
        semanticIds.response,
        ids.ownerA,
      ),
    ).toMatchObject([evidenceRecord()]);
  });

  it("isolates semantic persistence by owner", async () => {
    await repository.persistParseResultGraph(resultGraph());
    expect(
      await repository.findParseResultGraphByAttemptAndOwner(
        semanticIds.attempt,
        ids.ownerB,
      ),
    ).toBeNull();
    expect(
      await repository.findAttemptByOwner(semanticIds.attempt, ids.ownerB),
    ).toBeNull();
    expect(
      await repository.findResponseByOwner(semanticIds.response, ids.ownerB),
    ).toBeNull();

    await expect(
      repository.createAttempt(
        semanticAttempt({
          id: "21000000-0000-4000-8000-000000000022",
          ownerUserId: ids.ownerB,
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23503",
    );
  });

  it("rejects invalid foreign keys and cross-owner references", async () => {
    await expect(
      repository.createResponse(
        semanticResponse({ id: "21000000-0000-4000-8000-000000000031" }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23503",
    );

    await repository.persistParseResultGraph(resultGraph());
    await expect(
      repository.createEvidenceRecords([
        evidenceRecord({
          id: "21000000-0000-4000-8000-000000000023",
          responseId: "21000000-0000-4000-8000-000000000099",
        }),
      ]),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23503",
    );
  });

  it("rejects duplicate and idempotent-write violations", async () => {
    await repository.persistParseResultGraph(resultGraph());
    await expect(
      repository.persistParseResultGraph(resultGraph()),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23505",
    );

    await expect(
      repository.createResponse(
        semanticResponse({ id: "21000000-0000-4000-8000-000000000021" }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23505",
    );

    await expect(
      repository.createEvidenceRecords([
        evidenceRecord({ id: "21000000-0000-4000-8000-000000000022" }),
      ]),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23505",
    );
  });

  it("rolls back the whole result graph when a transaction fails", async () => {
    await expect(
      repository.transaction(async (manager) => {
        await repository.persistParseResultGraph(resultGraph(), manager);
        throw new Error("simulated_persistence_failure");
      }),
    ).rejects.toThrow("simulated_persistence_failure");

    await expectTableCount(database, "semantic_parse_attempts", 0);
    await expectTableCount(database, "nuvitae_extraction_responses", 0);
    await expectTableCount(database, "evidence_records", 0);
    await expectTableCount(database, "provider_capability_snapshots", 0);
    await expectTableCount(database, "semantic_parser_validation_statuses", 0);
  });

  it("cascades retention and deletion from the imported document", async () => {
    await repository.persistParseResultGraph(resultGraph());
    await database.dataSource.manager.delete(ImportedDocumentEntity, {
      id: ids.document,
      ownerUserId: ids.ownerA,
    });

    await expectTableCount(database, "semantic_parse_attempts", 0);
    await expectTableCount(database, "nuvitae_extraction_responses", 0);
    await expectTableCount(database, "evidence_records", 0);
    await expectTableCount(database, "provider_capability_snapshots", 0);
    await expectTableCount(database, "semantic_parser_validation_statuses", 0);
  });

  it("persists schema version, capability snapshots, and validation statuses", async () => {
    await repository.persistParseResultGraph(resultGraph());
    const response = await database.dataSource.manager.findOneByOrFail(
      NuvitaeExtractionResponseEntity,
      { id: semanticIds.response, ownerUserId: ids.ownerA },
    );
    expect(response.schemaVersion).toBe(schemaVersion);

    await expect(
      database.dataSource.manager.insert(
        ProviderCapabilitySnapshotEntity,
        Object.assign(new ProviderCapabilitySnapshotEntity(), {
          ...capabilitySnapshot(),
          id: "21000000-0000-4000-8000-000000000011",
          exposesCredentialsToDomain: true,
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        ProviderCapabilitySnapshotEntity,
        Object.assign(new ProviderCapabilitySnapshotEntity(), {
          ...capabilitySnapshot(),
          id: "21000000-0000-4000-8000-000000000012",
          predictsPhysicalCoordinates: true,
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        SemanticParserValidationStatusEntity,
        Object.assign(new SemanticParserValidationStatusEntity(), {
          ...validationStatus(),
          id: "21000000-0000-4000-8000-000000000013",
          schemaStatus: "unknown",
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );
  });

  it("persists canonical flattened evidence without transcript text or coordinates", async () => {
    await repository.persistParseResultGraph(resultGraph());
    const columns = await database.dataSource.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'evidence_records'
       AND column_name IN ('source_text', 'transcript', 'page', 'item', 'x', 'y', 'raw_payload')`,
      [database.schema],
    );
    expect(columns).toHaveLength(0);

    const row = await database.dataSource.manager.findOneByOrFail(
      EvidenceRecordEntity,
      { id: semanticIds.evidence, ownerUserId: ids.ownerA },
    );
    expect(row).toMatchObject({
      line: 1,
      start: 0,
      end: 24,
      fragmentHash,
      fragmentId: "fragment.1",
      classification: "explicit",
      confidenceStatus: "high",
      validationStatus: "valid",
    });
  });

  it("keeps domain serialization privacy-safe and rejects inconsistent graphs", async () => {
    const serialized = JSON.stringify(resultGraph());
    expect(serialized).not.toContain("normalizedTranscript");
    expect(serialized).not.toContain("sourceText");
    expect(serialized).not.toContain("rawPayload");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("prompt");

    await expect(
      repository.persistParseResultGraph(
        resultGraph({
          response: { semanticParseAttemptId: "another-attempt" },
        }),
      ),
    ).rejects.toThrow("semantic_result_graph_attempt_mismatch");

    await expect(
      repository.persistParseResultGraph(
        resultGraph({
          evidence: [evidenceRecord({ ownerUserId: ids.ownerB })],
        }),
      ),
    ).rejects.toThrow("semantic_result_graph_owner_mismatch");
  });
});

describe("semantic parser persistence mappers", () => {
  it("round-trips the semantic parse attempt", () => {
    const mapped = mapSemanticParseAttempt(
      semanticParseAttemptEntity(semanticAttempt()),
    );
    expect(mapped).toMatchObject(semanticAttempt());
    expect(mapped).not.toHaveProperty("deletedAt");
    expect(mapped).not.toHaveProperty("providerRuntimeConnectionId");
    expect(mapped).not.toHaveProperty("failureReason");
  });

  it("round-trips the extraction response", () => {
    const mapped = mapNuvitaeExtractionResponse(
      nuvitaeExtractionResponseEntity(semanticResponse()),
    );
    expect(mapped).toEqual(semanticResponse());
  });

  it("round-trips the evidence record", () => {
    const mapped = mapEvidenceRecord(evidenceRecordEntity(evidenceRecord()));
    expect(mapped).toEqual(evidenceRecord());
  });

  it("round-trips the provider capability snapshot", () => {
    const mapped = mapProviderCapabilitySnapshot(
      providerCapabilitySnapshotEntity(capabilitySnapshot()),
    );
    expect(mapped).toEqual(capabilitySnapshot());
  });

  it("round-trips the semantic parser validation status", () => {
    const mapped = mapSemanticParserValidationStatus(
      semanticParserValidationStatusEntity(validationStatus()),
    );
    expect(mapped).toEqual(validationStatus());
  });
});
