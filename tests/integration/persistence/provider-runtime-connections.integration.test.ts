import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AIProviderRuntimeConnection,
  ProviderRuntimeCapabilities,
} from "@nuvitae/domain";
import {
  AIProviderRuntimeConnectionEntity,
  ImportedDocumentEntity,
  SemanticParseAttemptEntity,
  TypeOrmAIProviderRuntimeConnectionsRepository,
  aiProviderRuntimeConnectionEntity,
  mapAIProviderRuntimeConnection,
} from "@nuvitae/persistence";
import { ids, importedDocument } from "./fixtures.js";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import { createIsolatedPersistenceTestDatabase } from "./test-database.js";
import { postgresErrorCode } from "./test-database.js";

const connectionIds = {
  connectionA: "22000000-0000-4000-8000-000000000001",
  connectionB: "22000000-0000-4000-8000-000000000002",
  attempt: "21000000-0000-4000-8000-000000000010",
} as const;

const createdAt = new Date("2026-08-01T09:00:00.000Z");
const loginStartedAt = new Date("2026-08-01T09:01:00.000Z");
const connectedAt = new Date("2026-08-01T09:02:00.000Z");
const expiresAt = new Date("2026-08-01T10:02:00.000Z");
const sessionReference = "b".repeat(64);

function capabilities(
  overrides: Partial<ProviderRuntimeCapabilities> = {},
): ProviderRuntimeCapabilities {
  return {
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
    ...overrides,
  };
}

function connection(
  overrides: Partial<AIProviderRuntimeConnection> = {},
): AIProviderRuntimeConnection {
  return {
    id: connectionIds.connectionA,
    ownerUserId: ids.ownerA,
    providerKind: "test_provider",
    displayName: "Synthetic provider",
    connectionStatus: "connected",
    authenticationStatus: "authenticated",
    availabilityStatus: "available",
    capabilities: capabilities(),
    capabilitySnapshotAt: connectedAt,
    sessionReference,
    lastCheckedAt: connectedAt,
    loginStartedAt,
    connectedAt,
    refreshedAt: connectedAt,
    expiresAt,
    disconnectedAt: null,
    revokedAt: null,
    revocationReason: null,
    createdAt,
    deletedAt: null,
    deletionReason: null,
    ...overrides,
  };
}

async function expectTableRows(
  database: IsolatedPersistenceTestDatabase,
  table: string,
  expected: number,
): Promise<void> {
  const rows = await database.dataSource.query<{ count: string }[]>(
    `SELECT count(*) AS count FROM "${database.schema}"."${table}"`,
  );
  expect(rows[0]?.count).toBe(String(expected));
}

describe("AI provider runtime connection persistence", () => {
  let database: IsolatedPersistenceTestDatabase;
  let repository: TypeOrmAIProviderRuntimeConnectionsRepository;

  beforeEach(async () => {
    database = await createIsolatedPersistenceTestDatabase(
      "provider_runtime_connections",
    );
    repository = new TypeOrmAIProviderRuntimeConnectionsRepository(
      database.dataSource,
    );
    await database.dataSource.manager.save(
      ImportedDocumentEntity,
      Object.assign(new ImportedDocumentEntity(), {
        ...importedDocument(),
        sizeBytes: String(importedDocument().sizeBytes),
        storageKey: importedDocument().storageKey ?? null,
        deletedAt: null,
      }),
    );
  });

  afterEach(async () => {
    if (database !== undefined) await database.cleanup();
  });

  it("migrates the provider connection table and its owner-scoped foreign key", async () => {
    const tables = await database.dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'ai_provider_runtime_connections'`,
      [database.schema],
    );
    expect(tables).toHaveLength(1);

    const foreignKeys = await database.dataSource.query<
      {
        constraint_name: string;
      }[]
    >(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = $1 AND table_name = 'semantic_parse_attempts'
         AND constraint_type = 'FOREIGN KEY'
         AND constraint_name = 'fk_semantic_parse_attempts_owner_connection'`,
      [database.schema],
    );
    expect(foreignKeys).toHaveLength(1);

    const uniqueIndexes = await database.dataSource.query<
      {
        indexname: string;
      }[]
    >(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = $1 AND tablename = 'ai_provider_runtime_connections'
         AND indexname = 'uq_ai_provider_runtime_connections_active_provider'`,
      [database.schema],
    );
    expect(uniqueIndexes).toHaveLength(1);
  });

  it("creates, reads, lists, and saves connections through the repository", async () => {
    const saved = await repository.createConnection(connection());
    expect(saved.id).toBe(connectionIds.connectionA);
    expect(saved.sessionReference).toBe(sessionReference);
    expect(saved.capabilities).toMatchObject(capabilities());

    const loaded = await repository.findConnectionByOwner(
      connectionIds.connectionA,
      ids.ownerA,
    );
    expect(loaded).toMatchObject(connection());

    const list = await repository.listConnectionsByOwner(ids.ownerA);
    expect(list).toHaveLength(1);

    const disconnectedAt = new Date("2026-08-01T11:00:00.000Z");
    const updated = await repository.saveConnection({
      ...connection(),
      connectionStatus: "disconnected",
      authenticationStatus: "unauthenticated",
      availabilityStatus: "unknown",
      sessionReference: null,
      disconnectedAt,
      lastCheckedAt: disconnectedAt,
    });
    expect(updated.connectionStatus).toBe("disconnected");
    expect(updated.sessionReference).toBeNull();
  });

  it("enforces status, session-reference, capability, metadata, and timestamp checks", async () => {
    await expect(
      database.dataSource.manager.insert(
        AIProviderRuntimeConnectionEntity,
        aiProviderRuntimeConnectionEntity({
          ...connection(),
          connectionStatus:
            "not_a_status" as AIProviderRuntimeConnection["connectionStatus"],
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        AIProviderRuntimeConnectionEntity,
        aiProviderRuntimeConnectionEntity({
          ...connection(),
          sessionReference: "not-an-opaque-reference",
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        AIProviderRuntimeConnectionEntity,
        aiProviderRuntimeConnectionEntity({
          ...connection(),
          capabilities: null,
          capabilitySnapshotAt: connectedAt,
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        AIProviderRuntimeConnectionEntity,
        aiProviderRuntimeConnectionEntity({
          ...connection(),
          revokedAt: new Date("2026-08-01T11:00:00.000Z"),
          revocationReason: null,
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        AIProviderRuntimeConnectionEntity,
        aiProviderRuntimeConnectionEntity({
          ...connection(),
          disconnectedAt: new Date("2026-07-01T09:00:00.000Z"),
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.insert(
        AIProviderRuntimeConnectionEntity,
        aiProviderRuntimeConnectionEntity({
          ...connection(),
          capabilities: capabilities({ exposesCredentialsToDomain: true }),
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );
  });

  it("enforces one active connection per provider per owner with safe re-creation after delete", async () => {
    await repository.createConnection(connection());
    await expect(
      repository.createConnection(
        connection({ id: connectionIds.connectionB }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23505",
    );

    await repository.saveConnection({
      ...connection(),
      connectionStatus: "not_configured",
      authenticationStatus: "unauthenticated",
      availabilityStatus: "unknown",
      sessionReference: null,
      deletedAt: new Date("2026-08-01T12:00:00.000Z"),
      deletionReason: "user_deleted",
    });
    const recreated = await repository.createConnection(
      connection({ id: connectionIds.connectionB }),
    );
    expect(recreated.id).toBe(connectionIds.connectionB);
    await expectTableRows(database, "ai_provider_runtime_connections", 2);
  });

  it("isolates connections by owner through the repository", async () => {
    await repository.createConnection(connection());
    expect(
      await repository.findConnectionByOwner(
        connectionIds.connectionA,
        ids.ownerB,
      ),
    ).toBeNull();
    expect(await repository.listConnectionsByOwner(ids.ownerB)).toEqual([]);
  });

  it("binds semantic parse attempts to connections owned by the same user", async () => {
    await repository.createConnection(connection());
    const attemptRow = () =>
      Object.assign(new SemanticParseAttemptEntity(), {
        id: connectionIds.attempt,
        importedDocumentId: ids.document,
        ownerUserId: ids.ownerA,
        providerRuntimeConnectionId: connectionIds.connectionA,
        providerKind: "test_provider",
        inputRepresentation: "normalized_transcript_flattened_fragments",
        status: "queued",
        startedAt: new Date("2026-08-01T09:03:00.000Z"),
        timeoutSeconds: 30,
        createdAt,
        retentionExpiresAt: new Date("2026-08-08T09:00:00.000Z"),
        deletedAt: null,
      });

    await database.dataSource.manager.insert(
      SemanticParseAttemptEntity,
      attemptRow(),
    );

    await expect(
      database.dataSource.manager.insert(
        SemanticParseAttemptEntity,
        attemptRow(),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23505",
    );
  });

  it("rejects attempt rows whose connection belongs to another owner", async () => {
    await repository.createConnection(connection());
    await repository.createConnection(
      connection({
        id: connectionIds.connectionB,
        ownerUserId: ids.ownerB,
      }),
    );
    await expect(
      database.dataSource.manager.insert(
        SemanticParseAttemptEntity,
        Object.assign(new SemanticParseAttemptEntity(), {
          id: connectionIds.attempt,
          importedDocumentId: ids.document,
          ownerUserId: ids.ownerA,
          providerRuntimeConnectionId: connectionIds.connectionB,
          providerKind: "test_provider",
          inputRepresentation: "normalized_transcript_flattened_fragments",
          status: "queued",
          startedAt: new Date("2026-08-01T09:03:00.000Z"),
          timeoutSeconds: 30,
          createdAt,
          retentionExpiresAt: new Date("2026-08-08T09:00:00.000Z"),
          deletedAt: null,
        }),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23503",
    );
  });

  it("maps entities without leaking persistence-only fields", () => {
    const entity = aiProviderRuntimeConnectionEntity(connection());
    expect(entity.sessionReference).toBe(sessionReference);
    const mapped = mapAIProviderRuntimeConnection(entity);
    expect(mapped.ownerUserId).toBe(ids.ownerA);
    expect(mapped.sessionReference).toBe(sessionReference);
    expect(mapped.capabilities).toMatchObject(capabilities());
    expect(mapped.capabilitySnapshotAt).toEqual(connectedAt);
  });
});
