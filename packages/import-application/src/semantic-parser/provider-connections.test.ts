import { describe, expect, it } from "vitest";
import type {
  AIProviderRuntimeConnection,
  ProviderRuntimeCapabilities,
} from "@nuvitae/domain";
import type { AIProviderRuntimeConnectionsRepository } from "@nuvitae/persistence";
import type { EntityManager } from "typeorm";
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
} from "./provider-connections.js";

const ownerA = "10000000-0000-4000-8000-000000000001";
const ownerB = "10000000-0000-4000-8000-000000000002";
const connectionA = "22000000-0000-4000-8000-000000000001";
const connectionB = "22000000-0000-4000-8000-000000000002";
const sessionReference = "c".repeat(64);

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

class FakeSessionStore implements ProviderSessionStore {
  readonly objects = new Map<string, Uint8Array>();
  readonly writes: ProviderSessionWriteInput[] = [];
  readonly deletes: ProviderSessionStorageInput[] = [];

  private key(input: ProviderSessionStorageInput): string {
    return [input.ownerUserId, input.connectionId, input.sessionReference].join(
      "|",
    );
  }

  async writeSession(
    input: ProviderSessionWriteInput,
  ): Promise<ProviderSessionStorageInput> {
    this.writes.push(input);
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
    this.deletes.push(input);
    return { deleted: this.objects.delete(this.key(input)) };
  }

  async hasSession(input: ProviderSessionStorageInput): Promise<boolean> {
    return this.objects.has(this.key(input));
  }
}

class FakeRepository implements AIProviderRuntimeConnectionsRepository {
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
    return [...this.rows.values()]
      .filter((row) => row.ownerUserId === userId)
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );
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
    browserHandoff: {
      loginReference: "login-reference-123456",
      authorizationUrl:
        "https://auth.openai.com/oauth/authorize?state=server-state",
    },
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
  completeLoginCalls = 0;

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
    previousReference: string | null,
  ): Promise<ProviderAdapterConnectedResult> {
    this.throwIfConfigured();
    this.completeLoginCalls += 1;
    await context.sessionStore.writeSession({
      ownerUserId: ownerA,
      connectionId: connectionA,
      sessionReference: this.connected.sessionReference,
      payload: new TextEncoder().encode(
        "encrypted broker session material placeholder",
      ),
    });
    void previousReference;
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

function harness(
  overrides: {
    readonly repository?: FakeRepository;
    readonly sessionStore?: FakeSessionStore;
    readonly adapter?: FakeAdapter;
  } = {},
) {
  const repository = overrides.repository ?? new FakeRepository();
  const sessionStore = overrides.sessionStore ?? new FakeSessionStore();
  const adapter = overrides.adapter ?? new FakeAdapter();
  const service = new ProviderConnectionService({
    repository,
    sessionStore,
    adapter,
  });
  return { repository, sessionStore, adapter, service };
}

describe("provider connection service", () => {
  it("connects a fresh provider connection through login_pending", async () => {
    const { service, repository, adapter } = harness();
    const started = await service.connect(ownerA, connectionA);
    expect(started.connectionStatus).toBe("login_pending");
    expect(started.authenticationStatus).toBe("pending");
    expect(started.sessionReference).toBeUndefined();
    expect(JSON.stringify(started)).not.toContain(sessionReference);

    const completed = await service.completeLogin(ownerA, connectionA);
    expect(completed.connectionStatus).toBe("connected");
    expect(completed.connectedAt).toEqual(adapter.connected.connectedAt);
    expect(completed.capabilities).toMatchObject(capabilities);
    expect(completed.sessionReference).toBeUndefined();

    const stored = repository.rows.get(connectionA);
    expect(stored?.sessionReference).toBe(sessionReference);
    expect(stored?.expiresAt).toEqual(adapter.connected.expiresAt);
  });

  it("begins an owner-scoped browser handoff without exposing session material", async () => {
    const { service, repository, adapter } = harness();
    const first = await service.beginBrowserLogin(ownerA);
    const repeated = await service.beginBrowserLogin(ownerA);
    const otherOwner = await service.beginBrowserLogin(ownerB);

    expect(first.status.connectionStatus).toBe("login_pending");
    expect(first.browserHandoff).toEqual(repeated.browserHandoff);
    expect(otherOwner.status.connectionId).not.toBe(first.status.connectionId);
    expect(repository.rows.get(connectionA)).toBeUndefined();
    const ownerConnection = [...repository.rows.values()].find(
      (row) => row.ownerUserId === ownerA,
    );
    expect(ownerConnection?.providerKind).toBe(adapter.providerKind);
    expect(JSON.stringify(first)).not.toContain(sessionReference);
    expect(JSON.stringify(first)).not.toContain("token");
  });

  it("fails closed when the owner already has a connected provider", async () => {
    const { service, repository } = harness();
    await service.connect(ownerA, connectionA);
    const connected = repository.rows.get(connectionA)!;
    repository.rows.set(connectionA, {
      ...connected,
      connectionStatus: "connected",
      authenticationStatus: "authenticated",
    });
    await expect(service.beginBrowserLogin(ownerA)).rejects.toMatchObject({
      code: "provider_connection_already_connected",
    });
  });

  it("is idempotent for connect and rejects invalid transitions fail-closed", async () => {
    const { service, repository } = harness();
    await service.connect(ownerA, connectionA);
    const again = await service.connect(ownerA, connectionA);
    expect(again.connectionStatus).toBe("login_pending");

    await service.completeLogin(ownerA, connectionA);
    const connected = await service.connect(ownerA, connectionA);
    expect(connected.connectionStatus).toBe("connected");

    await expect(
      service.completeLogin(ownerA, connectionA),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "provider_connection_state_conflict",
      }),
    );
    await expect(service.reconnect(ownerA, connectionA)).resolves.toMatchObject(
      {
        connectionStatus: "connected",
      },
    );

    await service.disconnect(ownerA, connectionA);
    await expect(service.reconnect(ownerA, connectionA)).resolves.toMatchObject(
      {
        connectionStatus: "connected",
      },
    );
    expect(repository.rows.get(connectionA)?.connectionStatus).toBe(
      "connected",
    );
  });

  it("cleans up orphaned encrypted sessions when persistence fails after connect", async () => {
    const repository = new FakeRepository();
    const { service, sessionStore } = harness({ repository });
    await service.connect(ownerA, connectionA);
    repository.failSave = true;
    await expect(
      service.completeLogin(ownerA, connectionA),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "provider_connection_persistence_failed",
      }),
    );
    expect(sessionStore.objects.size).toBe(0);
    expect(
      sessionStore.deletes.some(
        (entry) => entry.sessionReference === sessionReference,
      ),
    ).toBe(true);
  });

  it("disconnects by destroying session material and clears the reference idempotently", async () => {
    const { service, repository, sessionStore, adapter } = harness();
    await service.connect(ownerA, connectionA);
    await service.completeLogin(ownerA, connectionA);
    const disconnectedAt = new Date("2026-08-01T11:00:00.000Z");

    const view = await service.disconnect(ownerA, connectionA, disconnectedAt);
    expect(view.connectionStatus).toBe("disconnected");
    expect(view.disconnectedAt).toEqual(disconnectedAt);
    expect(repository.rows.get(connectionA)?.sessionReference).toBeNull();
    expect(sessionStore.objects.size).toBe(0);
    expect(adapter.disconnectCalls).toBe(1);

    const again = await service.disconnect(ownerA, connectionA);
    expect(again.connectionStatus).toBe("disconnected");
    expect(adapter.disconnectCalls).toBe(1);
  });

  it("revokes by destroying session material and recording revocation metadata", async () => {
    const { service, repository, sessionStore, adapter } = harness();
    await service.connect(ownerA, connectionA);
    await service.completeLogin(ownerA, connectionA);
    const revokedAt = new Date("2026-08-01T11:30:00.000Z");

    const view = await service.revoke(
      ownerA,
      connectionA,
      "user_revoked",
      revokedAt,
    );
    expect(view.connectionStatus).toBe("authentication_revoked");
    expect(view.revokedAt).toEqual(revokedAt);
    expect(repository.rows.get(connectionA)?.revocationReason).toBe(
      "user_revoked",
    );
    expect(repository.rows.get(connectionA)?.sessionReference).toBeNull();
    expect(sessionStore.objects.size).toBe(0);
    expect(adapter.revokeCalls).toBe(1);

    const again = await service.revoke(ownerA, connectionA);
    expect(again.connectionStatus).toBe("authentication_revoked");
    expect(adapter.revokeCalls).toBe(1);
  });

  it("deletes connections idempotently with deletion metadata and no leftover material", async () => {
    const { service, repository, sessionStore, adapter } = harness();
    await service.connect(ownerA, connectionA);
    await service.completeLogin(ownerA, connectionA);
    const deletedAt = new Date("2026-08-01T12:00:00.000Z");

    const view = await service.deleteConnection(
      ownerA,
      connectionA,
      "user_deleted",
      deletedAt,
    );
    expect(view.deletedAt).toEqual(deletedAt);
    const row = repository.rows.get(connectionA);
    expect(row?.deletionReason).toBe("user_deleted");
    expect(row?.sessionReference).toBeNull();
    expect(sessionStore.objects.size).toBe(0);
    expect(adapter.deleteCalls).toBe(1);

    const again = await service.deleteConnection(ownerA, connectionA);
    expect(again.deletedAt).toEqual(deletedAt);
    expect(adapter.deleteCalls).toBe(1);

    const missing = await service.deleteConnection(ownerA, connectionB);
    expect(missing.deletedAt).not.toBeNull();
  });

  it("detects expired sessions and transitions them to authentication_expired", async () => {
    const { service, repository } = harness();
    await service.connect(ownerA, connectionA);
    await service.completeLogin(ownerA, connectionA);
    const now = new Date("2026-08-01T11:00:00.000Z");

    const expired = await service.detectExpiredConnections(ownerA, now);
    expect(expired).toHaveLength(1);
    expect(expired[0]?.connectionStatus).toBe("authentication_expired");
    expect(repository.rows.get(connectionA)?.connectionStatus).toBe(
      "authentication_expired",
    );

    const noMore = await service.detectExpiredConnections(
      ownerA,
      new Date("2026-08-01T12:00:00.000Z"),
    );
    expect(noMore).toHaveLength(0);
  });

  it("refreshes capability snapshots and quota/subscription state", async () => {
    const { service, repository } = harness();
    await service.connect(ownerA, connectionA);
    await service.completeLogin(ownerA, connectionA);

    const capabilitiesView = await service.refreshCapabilities(
      ownerA,
      connectionA,
    );
    expect(capabilitiesView.capabilities).toMatchObject(capabilities);

    const quotaView = await service.refreshQuotaState(ownerA, connectionA);
    expect(quotaView.availabilityStatus).toBe("available");
    expect(repository.rows.get(connectionA)?.availabilityStatus).toBe(
      "available",
    );
  });

  it("enforces ownership on every operation without adapter side effects", async () => {
    const { service, repository, adapter } = harness();
    await service.connect(ownerA, connectionA);
    await service.completeLogin(ownerA, connectionA);
    const before = repository.rows.get(connectionA);

    for (const operation of [
      () => service.status(ownerB, connectionA),
      () => service.connect(ownerB, connectionA),
      () => service.completeLogin(ownerB, connectionA),
      () => service.reconnect(ownerB, connectionA),
      () => service.disconnect(ownerB, connectionA),
      () => service.revoke(ownerB, connectionA),
      () => service.refreshCapabilities(ownerB, connectionA),
      () => service.refreshQuotaState(ownerB, connectionA),
    ] as const) {
      await expect(operation()).rejects.toThrowError(
        expect.objectContaining({ code: "provider_connection_not_found" }),
      );
    }
    const deleteView = await service.deleteConnection(ownerB, connectionA);
    expect(deleteView.deletedAt).not.toBeNull();
    expect(repository.rows.get(connectionA)).toEqual(before);
    expect(adapter.disconnectCalls).toBe(0);
    expect(adapter.revokeCalls).toBe(0);
    expect(adapter.deleteCalls).toBe(0);
    expect(adapter.completeLoginCalls).toBe(1);
  });

  it("exposes only provider-neutral status and privacy-safe errors", async () => {
    const { service, repository, sessionStore, adapter } = harness();
    await service.connect(ownerA, connectionA);
    await service.completeLogin(ownerA, connectionA);

    adapter.inspection = {
      connectionState: "connected",
      authenticationState: "authenticated",
      availabilityState: "rate_limited",
      checkedAt: new Date("2026-08-01T10:00:00.000Z"),
      safeMessage: "The provider is temporarily rate limited.",
    };
    const view = await service.status(ownerA, connectionA);
    expect(view.availabilityStatus).toBe("rate_limited");
    expect(view.sessionReference).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(sessionReference);

    adapter.failWith = new Error("raw provider details with token=secret");
    try {
      await service.status(ownerA, connectionA);
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderConnectionError);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("token");
      expect(serialized).toContain("provider_adapter_failed");
    }

    adapter.failWith = null;
    adapter.inspection = {
      connectionState: "connected",
      authenticationState: "authenticated",
      availabilityState: "available",
      checkedAt: new Date("2026-08-01T10:01:00.000Z"),
      safeMessage: null,
    };
    await expect(service.status(ownerA, connectionA)).resolves.toMatchObject({
      availabilityStatus: "available",
    });
    expect(sessionStore.objects.size).toBe(1);
    expect(repository.rows.get(connectionA)?.sessionReference).toBe(
      sessionReference,
    );
  });
});
