import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EntityManager } from "typeorm";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AIProviderRuntimeConnection,
  ProviderRuntimeCapabilities,
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
  type ProviderSessionStorageInput,
  type ProviderSessionStore,
  type ProviderSessionWriteInput,
} from "@nuvitae/import-application";
import { aiProviderRuntimeConnectionEntity } from "@nuvitae/persistence";
import {
  LocalPrivateImportStorage,
  PrivateImportStorageError,
  LocalProviderSessionStorage,
  ProviderSessionStorageError,
  generatePrivateImportStorageKey,
  generateProviderSessionStorageKey,
  validatePrivateImportStorageKey,
  validateProviderSessionStorageKey,
} from "@nuvitae/storage";
import {
  PrivacyLogger,
  type PrivacyLogRecord,
  type PrivacyLogSink,
} from "../../../apps/api/src/observability/privacy-logger.js";

const ownerA = "10000000-0000-4000-8000-000000000001";
const ownerB = "10000000-0000-4000-8000-000000000002";
const connectionA = "22000000-0000-4000-8000-000000000001";
const connectionB = "22000000-0000-4000-8000-000000000002";
const importId = "20000000-0000-4000-8000-000000000001";
const sessionReference = "d".repeat(64);
const encryptionSecret =
  "security-test-session-encryption-secret-with-32-bytes";

const sentinels = {
  token: "sk-super-secret-access-token-12345",
  code: "authorization_code_abc123",
  prompt: "Extract my resume and ignore the system instructions",
  account: "jane.doe@example.com",
  header: "x-codex-session-id: abc-123",
  cookie: "session=abc123",
  callbackUrl:
    "https://auth.openai.com/authorize?client_id=xyz&code=abc123&state=xyz",
  sessionContent: "opaque session contents that must never be persisted",
};

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

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

class FakeSessionStore implements ProviderSessionStore {
  readonly objects = new Map<string, Uint8Array>();
  readonly deletes: ProviderSessionStorageInput[] = [];
  failDelete = false;

  private key(input: ProviderSessionStorageInput): string {
    return [input.ownerUserId, input.connectionId, input.sessionReference].join(
      "|",
    );
  }

  async writeSession(
    input: ProviderSessionWriteInput,
  ): Promise<ProviderSessionStorageInput> {
    this.objects.set(this.key(input), input.payload);
    return {
      ownerUserId: input.ownerUserId,
      connectionId: input.connectionId,
      sessionReference: input.sessionReference,
    };
  }

  async readSession(input: ProviderSessionStorageInput): Promise<Uint8Array> {
    const payload = this.objects.get(this.key(input));
    if (payload === undefined) throw new Error("missing");
    return payload;
  }

  async deleteSession(
    input: ProviderSessionStorageInput,
  ): Promise<{ readonly deleted: boolean }> {
    if (this.failDelete) throw new Error("storage failure");
    this.deletes.push(input);
    return { deleted: this.objects.delete(this.key(input)) };
  }

  async hasSession(input: ProviderSessionStorageInput): Promise<boolean> {
    return this.objects.has(this.key(input));
  }
}

class FakeRepository {
  rows = new Map<string, AIProviderRuntimeConnection>();
  failSave = false;

  async transaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return work({} as EntityManager);
  }

  async createConnection(
    connection: AIProviderRuntimeConnection,
  ): Promise<AIProviderRuntimeConnection> {
    if (this.rows.has(connection.id)) {
      throw new Error("duplicate");
    }
    this.rows.set(connection.id, connection);
    return connection;
  }

  async findConnectionByOwner(
    connectionId: string,
    userId: string,
  ): Promise<AIProviderRuntimeConnection | null> {
    const row = this.rows.get(connectionId);
    return row !== undefined && row.ownerUserId === userId ? row : null;
  }

  async findConnectionByProviderAndOwner(
    providerKind: string,
    userId: string,
  ): Promise<AIProviderRuntimeConnection | null> {
    for (const row of this.rows.values()) {
      if (row.providerKind === providerKind && row.ownerUserId === userId) {
        return row;
      }
    }
    return null;
  }

  async listConnectionsByOwner(
    userId: string,
  ): Promise<readonly AIProviderRuntimeConnection[]> {
    return [...this.rows.values()].filter((row) => row.ownerUserId === userId);
  }

  async saveConnection(
    connection: AIProviderRuntimeConnection,
  ): Promise<AIProviderRuntimeConnection> {
    if (this.failSave) throw new Error("database failure");
    this.rows.set(connection.id, connection);
    return connection;
  }
}

class FakeAdapter implements ProviderRuntimeConnectionAdapter {
  readonly providerKind = "test_provider";
  inspection: ProviderAdapterInspection = {
    connectionState: "connected",
    authenticationState: "authenticated",
    availabilityState: "available",
    checkedAt: new Date("2026-08-01T09:02:00.000Z"),
    safeMessage: null,
  };
  connected: ProviderAdapterConnectedResult = {
    connectedAt: new Date("2026-08-01T09:02:00.000Z"),
    expiresAt: new Date("2026-08-01T10:02:00.000Z"),
    sessionReference,
    capabilities,
  };
  login: ProviderAdapterLoginResult = {
    loginStartedAt: new Date("2026-08-01T09:01:00.000Z"),
    safeMessage: null,
  };
  quota: ProviderAdapterQuotaResult = {
    availabilityState: "available",
    checkedAt: new Date("2026-08-01T09:03:00.000Z"),
    safeMessage: null,
  };
  failWith: Error | null = null;
  disconnectCalls = 0;
  revokeCalls = 0;
  deleteCalls = 0;

  async inspect(): Promise<ProviderAdapterInspection> {
    this.throwIfConfigured();
    return this.inspection;
  }

  async startLogin(): Promise<ProviderAdapterLoginResult> {
    this.throwIfConfigured();
    return this.login;
  }

  async completeLogin(
    context: ProviderRuntimeAdapterContext,
  ): Promise<ProviderAdapterConnectedResult> {
    this.throwIfConfigured();
    await context.sessionStore.writeSession({
      ownerUserId: ownerA,
      connectionId: connectionA,
      sessionReference: this.connected.sessionReference,
      payload: new TextEncoder().encode(sentinels.sessionContent),
    });
    return this.connected;
  }

  async cancelLogin(): Promise<ProviderAdapterLoginResult> {
    this.throwIfConfigured();
    return this.login;
  }

  async reconnect(): Promise<ProviderAdapterConnectedResult> {
    this.throwIfConfigured();
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.throwIfConfigured();
    this.disconnectCalls += 1;
  }

  async revoke(): Promise<void> {
    this.throwIfConfigured();
    this.revokeCalls += 1;
  }

  async deleteLocalState(): Promise<void> {
    this.throwIfConfigured();
    this.deleteCalls += 1;
  }

  async capabilities(): Promise<ProviderRuntimeCapabilities> {
    this.throwIfConfigured();
    return capabilities;
  }

  async quotaState(): Promise<ProviderAdapterQuotaResult> {
    this.throwIfConfigured();
    return this.quota;
  }

  private throwIfConfigured(): void {
    if (this.failWith !== null) throw this.failWith;
  }
}

function harness() {
  const repository = new FakeRepository();
  const sessionStore = new FakeSessionStore();
  const adapter = new FakeAdapter();
  const service = new ProviderConnectionService({
    repository,
    sessionStore,
    adapter,
  });
  return { repository, sessionStore, adapter, service };
}

async function createConnectedConnection(
  harnessResult: ReturnType<typeof harness>,
): Promise<void> {
  const { service, sessionStore } = harnessResult;
  await service.connect(ownerA, connectionA);
  await service.completeLogin(ownerA, connectionA);
  expect(sessionStore.objects.size).toBe(1);
}

async function createStorages(): Promise<{
  importStorage: LocalPrivateImportStorage;
  sessionStorage: LocalProviderSessionStorage;
  importRoot: string;
  sessionRoot: string;
}> {
  const importRoot = await mkdtemp(join(tmpdir(), "nuvitae-import-sec-"));
  const sessionRoot = await mkdtemp(join(tmpdir(), "nuvitae-session-sec-"));
  roots.push(importRoot, sessionRoot);
  return {
    importRoot,
    sessionRoot,
    importStorage: await LocalPrivateImportStorage.create({
      root: importRoot,
      signingSecret: "security-test-signing-secret-with-32-bytes",
      maxSignedReferenceTtlSeconds: 60,
    }),
    sessionStorage: await LocalProviderSessionStorage.create({
      root: sessionRoot,
      encryptionSecret,
      maxSessionBytes: 4096,
    }),
  };
}

describe("provider credential isolation", () => {
  it("denies read, update, disconnect, revoke, and delete across owners", async () => {
    const h = harness();
    await createConnectedConnection(h);
    const before = h.repository.rows.get(connectionA);

    for (const operation of [
      () => h.service.status(ownerB, connectionA),
      () => h.service.connect(ownerB, connectionA),
      () => h.service.completeLogin(ownerB, connectionA),
      () => h.service.reconnect(ownerB, connectionA),
      () => h.service.disconnect(ownerB, connectionA),
      () => h.service.revoke(ownerB, connectionA),
      () => h.service.refreshCapabilities(ownerB, connectionA),
      () => h.service.refreshQuotaState(ownerB, connectionA),
    ] as const) {
      await expect(operation()).rejects.toThrowError(
        expect.objectContaining({ code: "provider_connection_not_found" }),
      );
    }
    const deleteView = await h.service.deleteConnection(ownerB, connectionA);
    expect(deleteView.deletedAt).not.toBeNull();

    expect(h.repository.rows.get(connectionA)).toEqual(before);
    expect(h.adapter.disconnectCalls).toBe(0);
    expect(h.adapter.revokeCalls).toBe(0);
    expect(h.adapter.deleteCalls).toBe(0);
    expect(
      await h.sessionStore.hasSession({
        ownerUserId: ownerA,
        connectionId: connectionA,
        sessionReference,
      }),
    ).toBe(true);
  });

  it("never allows a session reference to be used across owners or connections", async () => {
    const h = harness();
    await createConnectedConnection(h);

    await expect(h.service.status(ownerB, connectionA)).rejects.toThrowError(
      expect.objectContaining({ code: "provider_connection_not_found" }),
    );

    const { sessionStorage } = await createStorages();
    await sessionStorage.writeSession({
      ownerUserId: ownerA,
      connectionId: connectionA,
      sessionReference,
      payload: new TextEncoder().encode(sentinels.sessionContent),
    });
    await expect(
      sessionStorage.readSession({
        ownerUserId: ownerB,
        connectionId: connectionA,
        sessionReference,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "SESSION_OBJECT_NOT_FOUND" }),
    );
    await expect(
      sessionStorage.readSession({
        ownerUserId: ownerA,
        connectionId: connectionB,
        sessionReference,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "SESSION_OBJECT_NOT_FOUND" }),
    );
    expect(
      await sessionStorage.deleteSession({
        ownerUserId: ownerB,
        connectionId: connectionA,
        sessionReference,
      }),
    ).toEqual({ deleted: false });
    expect(
      await sessionStorage.hasSession({
        ownerUserId: ownerA,
        connectionId: connectionA,
        sessionReference,
      }),
    ).toBe(true);
  });

  it("keeps provider sessions physically separate from resume source storage", async () => {
    const { importStorage, sessionStorage, importRoot, sessionRoot } =
      await createStorages();
    const importKey = generatePrivateImportStorageKey({
      ownerUserId: ownerA,
      importId,
      objectKind: "source",
    });
    const sessionKey = generateProviderSessionStorageKey({
      ownerUserId: ownerA,
      connectionId: connectionA,
      sessionReference,
    });

    await importStorage.writeObject(importKey, Buffer.from("resume bytes"));
    await sessionStorage.writeSession({
      ownerUserId: ownerA,
      connectionId: connectionA,
      sessionReference,
      payload: new TextEncoder().encode(sentinels.sessionContent),
    });

    expect(sessionKey).not.toContain("/users/");
    expect(importKey).not.toContain("provider-sessions");
    expect(() => validatePrivateImportStorageKey(sessionKey)).toThrowError(
      PrivateImportStorageError,
    );
    expect(() => validateProviderSessionStorageKey(importKey)).toThrowError(
      ProviderSessionStorageError,
    );

    const importTree = await walk(importRoot);
    const sessionTree = await walk(sessionRoot);
    expect(importTree.some((path) => path.includes("provider-sessions"))).toBe(
      false,
    );
    expect(sessionTree.some((path) => path.includes("/users/"))).toBe(false);
    expect(sessionTree.some((path) => path.includes("imports"))).toBe(false);
  });

  it("persists no raw credential material in database rows", async () => {
    const h = harness();
    await createConnectedConnection(h);
    const row = h.repository.rows.get(connectionA);
    expect(row).toBeDefined();
    const entity = aiProviderRuntimeConnectionEntity(
      row as AIProviderRuntimeConnection,
    );
    const serialized = JSON.stringify(entity);

    const credentialKeys = Object.keys(entity).filter((key) =>
      /access.?token|refresh.?token|authorization.?code|api.?key|secret|password|header|cookie|prompt|account.?profile|payload/i.test(
        key,
      ),
    );
    expect(credentialKeys).toEqual([]);
    expect(entity.sessionReference).toBe(sessionReference);
    for (const sentinel of Object.values(sentinels)) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(serialized).not.toContain("client_id");
    expect(serialized).not.toContain("auth.openai.com");
    expect(serialized).not.toContain("code=");
  });

  it("keeps logs and service errors free of tokens, codes, prompts, account details, headers, cookies, URLs, and session contents", async () => {
    const records: PrivacyLogRecord[] = [];
    const sink: PrivacyLogSink = { write: (record) => records.push(record) };
    const logger = new PrivacyLogger(sink);

    const h = harness();
    await createConnectedConnection(h);
    const view = await h.service.status(ownerA, connectionA);
    logger.info("provider.connection.status", {
      connectionId: view.connectionId,
      statusCode: "connected",
      durationMs: 12,
      error: new Error(
        `${sentinels.token} ${sentinels.code} ${sentinels.prompt} ${sentinels.account} ${sentinels.header} ${sentinels.cookie} ${sentinels.callbackUrl}`,
      ),
      raw: {
        token: sentinels.token,
        prompt: sentinels.prompt,
        callbackUrl: sentinels.callbackUrl,
      },
    });
    logger.warn("provider.connection.revoked", {
      connectionId: view.connectionId,
      errorCategory: "user_revoked",
    });

    const serializedLogs = JSON.stringify(records);
    for (const sentinel of Object.values(sentinels)) {
      expect(serializedLogs).not.toContain(sentinel);
    }
    expect(serializedLogs).not.toContain("auth.openai.com");
    expect(serializedLogs).not.toContain("client_id");
    expect(serializedLogs).not.toContain("code=");
    expect(serializedLogs).not.toContain("session=abc123");
    expect(serializedLogs).toContain("[REDACTED]");

    h.adapter.failWith = new Error(
      `${sentinels.token} ${sentinels.account} ${sentinels.callbackUrl} ${sentinels.sessionContent}`,
    );
    try {
      await h.service.status(ownerA, connectionA);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderConnectionError);
      const serializedError = JSON.stringify(error);
      for (const sentinel of Object.values(sentinels)) {
        expect(serializedError).not.toContain(sentinel);
      }
      expect(serializedError).toContain("provider_adapter_failed");
    }
  });

  it("destroys private session material on revoke and delete and tolerates repeats", async () => {
    const h = harness();
    await createConnectedConnection(h);

    await h.service.revoke(ownerA, connectionA, "user_revoked");
    expect(h.sessionStore.objects.size).toBe(0);
    expect(h.repository.rows.get(connectionA)?.sessionReference).toBeNull();
    await expect(h.service.revoke(ownerA, connectionA)).resolves.toMatchObject({
      connectionStatus: "authentication_revoked",
    });
    expect(h.sessionStore.objects.size).toBe(0);

    await h.service.deleteConnection(ownerA, connectionA, "user_deleted");
    expect(h.repository.rows.get(connectionA)?.deletionReason).toBe(
      "user_deleted",
    );
    await expect(
      h.service.deleteConnection(ownerA, connectionA),
    ).resolves.toMatchObject({
      deletedAt: expect.any(Date),
    });
    expect(h.sessionStore.objects.size).toBe(0);
  });

  it("fails closed on expired sessions and refuses pending-login completion", async () => {
    const h = harness();
    await createConnectedConnection(h);
    const now = new Date("2026-08-01T11:00:00.000Z");

    const expired = await h.service.detectExpiredConnections(ownerA, now);
    expect(expired[0]?.connectionStatus).toBe("authentication_expired");
    expect(h.repository.rows.get(connectionA)?.connectionStatus).toBe(
      "authentication_expired",
    );

    await expect(
      h.service.completeLogin(ownerA, connectionA),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "provider_connection_state_conflict" }),
    );
    await expect(
      h.service.reconnect(ownerA, connectionA),
    ).resolves.toMatchObject({
      connectionStatus: "connected",
    });
  });

  it("leaves no orphan usable session when persistence or storage fails", async () => {
    const h = harness();
    await h.service.connect(ownerA, connectionA);
    h.repository.failSave = true;
    await expect(
      h.service.completeLogin(ownerA, connectionA),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "provider_connection_persistence_failed",
      }),
    );
    expect(h.sessionStore.objects.size).toBe(0);

    h.repository.failSave = false;
    await h.service.completeLogin(ownerA, connectionA);
    h.sessionStore.failDelete = true;
    await expect(h.service.revoke(ownerA, connectionA)).rejects.toThrowError(
      expect.objectContaining({ code: "provider_session_storage_unavailable" }),
    );
    expect(h.repository.rows.get(connectionA)?.connectionStatus).toBe(
      "connected",
    );
    expect(h.adapter.revokeCalls).toBe(0);
  });

  it("rejects path traversal and forged opaque references", async () => {
    const { sessionStorage } = await createStorages();
    const forged = [
      "../escape",
      `/absolute/${sessionReference}`,
      `provider-sessions\\${ownerA}\\${connectionA}\\${sessionReference}`,
      `provider-sessions/${ownerA}/${connectionA}/${"x".repeat(64)}`,
      `provider-sessions/${ownerA}/${connectionA}/short`,
    ] as const;
    for (const candidate of forged) {
      expect(() => validateProviderSessionStorageKey(candidate)).toThrowError(
        ProviderSessionStorageError,
      );
    }
    await expect(
      sessionStorage.readSession({
        ownerUserId: ownerA,
        connectionId: connectionA,
        sessionReference: "c".repeat(64),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "SESSION_OBJECT_NOT_FOUND" }),
    );
    await expect(
      sessionStorage.readSession({
        ownerUserId: ownerA,
        connectionId: connectionA,
        sessionReference: "z".repeat(64),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "INVALID_SESSION_REFERENCE" }),
    );

    const h = harness();
    await h.service.connect(ownerA, connectionA);
    h.adapter.connected = {
      ...h.adapter.connected,
      sessionReference: "../../forged-reference",
    };
    await expect(
      h.service.completeLogin(ownerA, connectionA),
    ).rejects.toThrowError(
      expect.objectContaining({ code: "provider_adapter_failed" }),
    );
  });

  it("does not leak provider-specific details through the generic status API", async () => {
    const h = harness();
    await createConnectedConnection(h);
    const view = await h.service.status(ownerA, connectionA);
    const serialized = JSON.stringify(view);
    for (const key of [
      "endpoint",
      "baseUrl",
      "headers",
      "oauth",
      "client_id",
      "transport",
      "model",
      "threadId",
      "account",
      "email",
      "prompt",
      "token",
      "sessionReference",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(key);
    }
  });
});

async function walk(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else {
        result.push(path);
      }
    }
  };
  await visit(root);
  return result;
}
