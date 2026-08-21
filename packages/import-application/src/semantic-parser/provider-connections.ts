import type {
  AIProviderRuntimeConnection,
  ProviderDeletionReason,
  ProviderRevocationReason,
  ProviderRuntimeAuthenticationStatus,
  ProviderRuntimeAvailabilityStatus,
  ProviderRuntimeCapabilities,
  ProviderRuntimeConnectionStatus,
} from "@nuvitae/domain";
import { randomUUID } from "node:crypto";
import type {
  ImportEventEmitter,
  ImportEventMetadataFor,
} from "../observability/import-events.js";

/**
 * Provider-neutral session store port consumed by provider adapters and by the
 * connection service for cleanup. Implementations live in the private
 * provider-session storage boundary and never expose session contents.
 */
export interface ProviderSessionStorageInput {
  readonly ownerUserId: string;
  readonly connectionId: string;
  readonly sessionReference: string;
}

export interface ProviderSessionWriteInput extends ProviderSessionStorageInput {
  readonly payload: Uint8Array;
}

export interface ProviderSessionStore {
  writeSession(
    input: ProviderSessionWriteInput,
  ): Promise<ProviderSessionStorageInput>;
  readSession(input: ProviderSessionStorageInput): Promise<Uint8Array>;
  deleteSession(
    input: ProviderSessionStorageInput,
  ): Promise<{ readonly deleted: boolean }>;
  hasSession(input: ProviderSessionStorageInput): Promise<boolean>;
}

/**
 * Application-owned persistence port for provider connection metadata.
 *
 * A transaction supplies a repository already scoped to the infrastructure
 * transaction. This keeps TypeORM's EntityManager out of application policy
 * while still requiring every operation in the callback to share the same
 * transaction.
 */
export interface AIProviderRuntimeConnectionsRepository {
  transaction<T>(
    work: (repository: AIProviderRuntimeConnectionsRepository) => Promise<T>,
  ): Promise<T>;
  createConnection(
    connection: AIProviderRuntimeConnection,
  ): Promise<AIProviderRuntimeConnection>;
  findConnectionByOwner(
    connectionId: string,
    userId: string,
  ): Promise<AIProviderRuntimeConnection | null>;
  findConnectionByProviderAndOwner(
    providerKind: string,
    userId: string,
  ): Promise<AIProviderRuntimeConnection | null>;
  listConnectionsByOwner(
    userId: string,
  ): Promise<readonly AIProviderRuntimeConnection[]>;
  saveConnection(
    connection: AIProviderRuntimeConnection,
  ): Promise<AIProviderRuntimeConnection>;
}

export interface ProviderRuntimeAdapterContext {
  readonly sessionStore: ProviderSessionStore;
  /** Authenticated owner scope supplied by the application, never the browser. */
  readonly ownerUserId: string;
  readonly connectionId: string;
}

export interface ProviderAdapterInspection {
  readonly connectionState: ProviderRuntimeConnectionStatus;
  readonly authenticationState: ProviderRuntimeAuthenticationStatus;
  readonly availabilityState: ProviderRuntimeAvailabilityStatus;
  readonly checkedAt: Date;
  readonly safeMessage: string | null;
}

export interface ProviderAdapterLoginResult {
  readonly loginStartedAt: Date;
  readonly safeMessage: string | null;
  readonly browserHandoff?: ProviderAdapterBrowserLoginHandoff;
}

export interface ProviderAdapterBrowserLoginHandoff {
  readonly loginReference: string;
  readonly authorizationUrl: string;
}

export interface ProviderAdapterConnectedResult {
  readonly connectedAt: Date;
  readonly expiresAt: Date | null;
  readonly sessionReference: string;
  readonly capabilities: ProviderRuntimeCapabilities;
}

/**
 * Normalized callback envelope. The API controller validates and bounds the
 * browser query before this crosses into the adapter boundary. The
 * authorization code is held only in memory until the adapter exchanges it;
 * it is never returned, persisted, or logged by the application service.
 */
export interface ProviderOAuthCallback {
  readonly state: string;
  readonly authorizationCode?: string;
  readonly providerError?:
    "access_denied" | "temporarily_unavailable" | "invalid_request" | "unknown";
}

export interface ProviderAdapterQuotaResult {
  readonly availabilityState: ProviderRuntimeAvailabilityStatus;
  readonly checkedAt: Date;
  readonly safeMessage: string | null;
}

/**
 * Provider-neutral adapter port. No adapter method may accept or return
 * credentials, authorization codes, prompts, provider-native payloads,
 * account profile data, headers, cookies, or callback query data. Production
 * provider adapters (including Codex) are implemented behind this boundary
 * only after their own decision gates; this service never assumes one.
 */
export interface ProviderRuntimeConnectionAdapter {
  readonly providerKind: string;
  inspect(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<ProviderAdapterInspection>;
  startLogin(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<ProviderAdapterLoginResult>;
  completeLogin(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
    callback?: ProviderOAuthCallback,
  ): Promise<ProviderAdapterConnectedResult>;
  cancelLogin(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<ProviderAdapterLoginResult>;
  reconnect(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<ProviderAdapterConnectedResult>;
  disconnect(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<void>;
  revoke(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<void>;
  deleteLocalState(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<void>;
  capabilities(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<ProviderRuntimeCapabilities>;
  quotaState(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<ProviderAdapterQuotaResult>;
}

export type ProviderConnectionErrorCode =
  | "provider_connection_not_found"
  | "provider_connection_deleted"
  | "provider_connection_state_conflict"
  | "provider_adapter_failed"
  | "provider_connection_persistence_failed"
  | "provider_session_storage_unavailable"
  | "provider_unavailable"
  | "provider_rate_limited"
  | "provider_quota_exceeded"
  | "provider_connection_already_connected"
  | "provider_connection_login_expired"
  | "provider_connection_login_invalid_state"
  | "provider_connection_login_cancelled"
  | "provider_connection_handoff_unavailable";

/**
 * Privacy-safe service error. It never embeds identifiers, session material,
 * credentials, prompts, URLs, or provider payloads.
 */
export class ProviderConnectionError extends Error {
  constructor(
    readonly code: ProviderConnectionErrorCode,
    message = "The provider connection could not be processed.",
  ) {
    super(message);
    this.name = "ProviderConnectionError";
  }
}

export interface ProviderConnectionStatusView {
  readonly connectionId: string;
  readonly providerKind: string;
  readonly displayName: string | null;
  readonly connectionStatus: ProviderRuntimeConnectionStatus;
  readonly authenticationStatus: ProviderRuntimeAuthenticationStatus;
  readonly availabilityStatus: ProviderRuntimeAvailabilityStatus;
  readonly capabilities: ProviderRuntimeCapabilities | null;
  readonly capabilitySnapshotAt: Date | null;
  readonly lastCheckedAt: Date | null;
  readonly loginStartedAt: Date | null;
  readonly connectedAt: Date | null;
  readonly refreshedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly disconnectedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly deletedAt: Date | null;
  readonly safeMessage: string | null;
  /** True only after a persisted, owner-bound, usable session is inspected. */
  readonly ready: boolean;
}

export interface ProviderConnectionServicePorts {
  readonly repository: AIProviderRuntimeConnectionsRepository;
  readonly sessionStore: ProviderSessionStore;
  readonly adapter: ProviderRuntimeConnectionAdapter;
  readonly logger?: ImportEventEmitter;
}

type ProviderConnectionLookupOperation =
  ImportEventMetadataFor<"provider_connection.lookup_failed">["operation"];
type ProviderConnectionLookupCategory =
  ImportEventMetadataFor<"provider_connection.lookup_failed">["errorCategory"];

const activeSessionStatuses: readonly ProviderRuntimeConnectionStatus[] = [
  "connected",
];

const connectableStatuses: readonly ProviderRuntimeConnectionStatus[] = [
  "not_configured",
  "login_cancelled",
  "disconnected",
  "authentication_expired",
  "authentication_revoked",
];

const reconnectableStatuses: readonly ProviderRuntimeConnectionStatus[] = [
  "disconnected",
  "authentication_expired",
  "authentication_revoked",
  "login_cancelled",
];

const disconnectableStatuses: readonly ProviderRuntimeConnectionStatus[] = [
  "connected",
  "authentication_expired",
];

/**
 * Provider-neutral runtime connection service. Every operation is owner-
 * scoped, explicit about state transitions, and fail-closed on unknown or
 * inconsistent states. Credentials never cross this boundary; only opaque
 * session references and provider-neutral metadata are persisted.
 */
export class ProviderConnectionService {
  constructor(private readonly ports: ProviderConnectionServicePorts) {}

  async status(
    ownerUserId: string,
    connectionId: string,
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.requireActiveByOwner(
      ownerUserId,
      connectionId,
      "status",
    );
    if (
      connection.connectionStatus === "login_pending" &&
      isPendingLoginFresh(connection.loginStartedAt)
    ) {
      return toStatusView(connection, null);
    }
    let inspection: ProviderAdapterInspection;
    try {
      inspection = await this.ports.adapter.inspect(
        this.context(ownerUserId, connectionId),
        connection.sessionReference,
      );
    } catch (error) {
      throw mapAdapterError(error);
    }
    const updated = await this.persistInspection(connection, inspection);
    return toStatusView(updated, inspection.safeMessage);
  }

  async list(
    ownerUserId: string,
  ): Promise<readonly ProviderConnectionStatusView[]> {
    const connections =
      await this.ports.repository.listConnectionsByOwner(ownerUserId);
    return connections
      .filter((connection) => connection.deletedAt === null)
      .map((connection) => toStatusView(connection, null));
  }

  async statusForProvider(
    ownerUserId: string,
    providerKind = this.ports.adapter.providerKind,
  ): Promise<ProviderConnectionStatusView | null> {
    const connection =
      await this.ports.repository.findConnectionByProviderAndOwner(
        providerKind,
        ownerUserId,
      );
    if (connection === null || connection.deletedAt !== null) return null;
    return this.status(ownerUserId, connection.id);
  }

  /**
   * Starts a login. Idempotent when the connection is already pending login;
   * returns the current status when already connected.
   */
  async connect(
    ownerUserId: string,
    connectionId: string,
    options: { readonly displayName?: string } = {},
  ): Promise<ProviderConnectionStatusView> {
    const existing = await this.findByOwner(ownerUserId, connectionId);
    let connection = existing;
    if (connection === null) {
      try {
        connection = await this.createConnection(
          ownerUserId,
          connectionId,
          options,
        );
      } catch {
        // The id may already exist under another owner or the insert raced.
        // Re-check without disclosing anything; a still-missing row fails
        // closed as not found.
        const raced = await this.findByOwner(ownerUserId, connectionId);
        if (raced !== null) {
          connection = raced;
        } else {
          this.emitLookupFailure(connectionId, "connect", "not_found", false);
          throw new ProviderConnectionError("provider_connection_not_found");
        }
      }
    }
    this.assertNotDeleted(connection, "connect");
    if (connection.connectionStatus === "connected") {
      return toStatusView(connection, null);
    }
    if (connection.connectionStatus === "login_pending") {
      return toStatusView(connection, null);
    }
    assertStatus(connection, "connect", connectableStatuses);

    let login: ProviderAdapterLoginResult;
    try {
      login = await this.ports.adapter.startLogin(
        this.context(ownerUserId, connectionId),
        connection.sessionReference,
      );
    } catch (error) {
      throw mapAdapterError(error);
    }

    const next: AIProviderRuntimeConnection = {
      ...connection,
      connectionStatus: "login_pending",
      authenticationStatus: "pending",
      availabilityStatus: "unknown",
      loginStartedAt: login.loginStartedAt,
      lastCheckedAt: login.loginStartedAt,
    };
    return toStatusView(
      await this.saveSafely(connection, next),
      login.safeMessage,
    );
  }

  /**
   * T213: begin the browser handoff without accepting a connection id from
   * the browser. An active pending login is resumed by the adapter boundary;
   * a stale pending login is replaced once and remains bounded by the broker.
   */
  async beginBrowserLogin(
    ownerUserId: string,
    options: { readonly displayName?: string } = {},
  ): Promise<{
    readonly status: ProviderConnectionStatusView;
    readonly browserHandoff: ProviderAdapterBrowserLoginHandoff;
  }> {
    let connection =
      await this.ports.repository.findConnectionByProviderAndOwner(
        this.ports.adapter.providerKind,
        ownerUserId,
      );
    if (connection === null) {
      connection = await this.createConnection(
        ownerUserId,
        randomUUID(),
        options,
      );
    }
    this.assertNotDeleted(connection, "connect");
    if (connection.connectionStatus === "connected") {
      throw new ProviderConnectionError(
        "provider_connection_already_connected",
      );
    }
    if (
      connection.connectionStatus === "login_pending" &&
      !isPendingLoginFresh(connection.loginStartedAt)
    ) {
      connection = await this.saveSafely(connection, {
        ...connection,
        connectionStatus: "login_cancelled",
        authenticationStatus: "unauthenticated",
        lastCheckedAt: new Date(),
      });
    }
    if (
      connection.connectionStatus !== "login_pending" &&
      !connectableStatuses.includes(connection.connectionStatus)
    ) {
      throw new ProviderConnectionError("provider_connection_state_conflict");
    }

    // Reconnect is a replacement operation. Delete any old unusable session
    // before starting the existing T213 browser handoff so a cancelled or
    // failed replacement cannot leave stale credential material attached.
    if (
      connection.connectionStatus !== "not_configured" &&
      connection.connectionStatus !== "login_pending" &&
      connection.sessionReference !== null
    ) {
      await this.deleteSessionMaterial(
        ownerUserId,
        connection.id,
        connection.sessionReference,
      );
      connection = await this.saveSafely(connection, {
        ...connection,
        sessionReference: null,
        capabilities: null,
        capabilitySnapshotAt: null,
        lastCheckedAt: new Date(),
      });
    }

    let login: ProviderAdapterLoginResult;
    try {
      login = await this.ports.adapter.startLogin(
        this.context(ownerUserId, connection.id),
        null,
      );
    } catch (error) {
      throw mapAdapterError(error);
    }
    if (login.browserHandoff === undefined) {
      throw new ProviderConnectionError(
        "provider_connection_handoff_unavailable",
      );
    }

    const next: AIProviderRuntimeConnection = {
      ...connection,
      connectionStatus: "login_pending",
      authenticationStatus: "pending",
      availabilityStatus: "unknown",
      loginStartedAt: login.loginStartedAt,
      lastCheckedAt: login.loginStartedAt,
    };
    return {
      status: toStatusView(
        await this.saveSafely(connection, next),
        login.safeMessage,
      ),
      browserHandoff: login.browserHandoff,
    };
  }

  /**
   * Completes a pending login with the adapter-provided opaque session
   * reference. The adapter persists encrypted session material through the
   * session store; the service persists only the opaque reference.
   */
  async completeLogin(
    ownerUserId: string,
    connectionId: string,
    callback?: ProviderOAuthCallback,
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.requireActiveByOwner(
      ownerUserId,
      connectionId,
      "complete_login",
    );
    if (connection.connectionStatus !== "login_pending") {
      throw new ProviderConnectionError("provider_connection_state_conflict");
    }

    let connected: ProviderAdapterConnectedResult;
    try {
      connected = await this.ports.adapter.completeLogin(
        this.context(ownerUserId, connectionId),
        connection.sessionReference,
        callback,
      );
    } catch (error) {
      const mapped = mapAdapterError(error);
      if (
        mapped.code === "provider_connection_login_cancelled" ||
        mapped.code === "provider_adapter_failed" ||
        mapped.code === "provider_session_storage_unavailable"
      ) {
        await this.saveSafely(connection, {
          ...connection,
          connectionStatus: "login_cancelled",
          authenticationStatus: "unauthenticated",
          availabilityStatus: "unknown",
          lastCheckedAt: new Date(),
        }).catch(() => undefined);
      }
      throw mapped;
    }
    try {
      assertOpaqueSessionReference(connected.sessionReference);
      const next: AIProviderRuntimeConnection = {
        ...connection,
        connectionStatus: "connected",
        authenticationStatus: "authenticated",
        availabilityStatus: "available",
        sessionReference: connected.sessionReference,
        capabilities: connected.capabilities,
        capabilitySnapshotAt: connected.connectedAt,
        connectedAt: connected.connectedAt,
        refreshedAt: connected.connectedAt,
        expiresAt: connected.expiresAt,
        disconnectedAt: null,
        revokedAt: null,
        revocationReason: null,
        lastCheckedAt: connected.connectedAt,
      };
      return toStatusView(await this.saveSafely(connection, next), null);
    } catch (error) {
      // Persistence failed after the adapter wrote encrypted session material:
      // destroy the orphan session so no usable material survives without a
      // database row.
      await this.deleteSessionMaterial(
        ownerUserId,
        connectionId,
        connected.sessionReference,
      ).catch(() => undefined);
      throw error;
    }
  }

  async cancelLogin(
    ownerUserId: string,
    connectionId: string,
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.requireActiveByOwner(
      ownerUserId,
      connectionId,
      "cancel_login",
    );
    if (connection.connectionStatus === "login_cancelled") {
      return toStatusView(connection, null);
    }
    if (connection.connectionStatus !== "login_pending") {
      throw new ProviderConnectionError("provider_connection_state_conflict");
    }
    let cancelled: ProviderAdapterLoginResult;
    try {
      cancelled = await this.ports.adapter.cancelLogin(
        this.context(ownerUserId, connectionId),
        connection.sessionReference,
      );
    } catch (error) {
      throw mapAdapterError(error);
    }
    const next: AIProviderRuntimeConnection = {
      ...connection,
      connectionStatus: "login_cancelled",
      authenticationStatus: "unauthenticated",
      availabilityStatus: "unknown",
      lastCheckedAt: cancelled.loginStartedAt,
    };
    return toStatusView(await this.saveSafely(connection, next), null);
  }

  async reconnect(
    ownerUserId: string,
    connectionId: string,
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.requireActiveByOwner(
      ownerUserId,
      connectionId,
      "reconnect",
    );
    if (connection.connectionStatus === "connected") {
      return toStatusView(connection, null);
    }
    if (connection.connectionStatus === "login_pending") {
      throw new ProviderConnectionError("provider_connection_state_conflict");
    }
    assertStatus(connection, "reconnect", reconnectableStatuses);
    // Reconnect deliberately reuses the same browser handoff and callback
    // path as initial connection. It returns pending until T214 callback
    // completion persists a replacement encrypted session.
    const result = await this.beginBrowserLogin(ownerUserId, {
      ...(connection.displayName === null
        ? {}
        : { displayName: connection.displayName }),
    });
    return result.status;
  }

  /**
   * Records a temporary provider outage without deleting a valid session or
   * changing authentication state. This is a projection only; it never
   * retries semantic parsing.
   */
  async markProviderUnavailable(
    ownerUserId: string,
    connectionId: string,
    now = new Date(),
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.requireActiveByOwner(
      ownerUserId,
      connectionId,
      "status",
    );
    if (
      connection.connectionStatus !== "connected" ||
      connection.authenticationStatus !== "authenticated" ||
      connection.sessionReference === null
    ) {
      throw new ProviderConnectionError("provider_connection_state_conflict");
    }
    const next: AIProviderRuntimeConnection = {
      ...connection,
      availabilityStatus: "unavailable",
      lastCheckedAt: now,
    };
    return toStatusView(
      await this.saveSafely(connection, next),
      "Codex is temporarily unavailable. Your connection and resume data are still here.",
    );
  }

  /** Explicit recovery from a persisted temporary-unavailable projection. */
  async markProviderAvailable(
    ownerUserId: string,
    connectionId: string,
    now = new Date(),
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.requireActiveByOwner(
      ownerUserId,
      connectionId,
      "status",
    );
    if (connection.connectionStatus !== "connected") {
      throw new ProviderConnectionError("provider_connection_state_conflict");
    }
    const next: AIProviderRuntimeConnection = {
      ...connection,
      availabilityStatus: "available",
      lastCheckedAt: now,
    };
    return toStatusView(await this.saveSafely(connection, next), null);
  }

  /** Owner-scoped lookup for the authenticated disconnect endpoint. */
  async disconnectForProvider(
    ownerUserId: string,
    providerKind = this.ports.adapter.providerKind,
    now = new Date(),
  ): Promise<ProviderConnectionStatusView | null> {
    const connection =
      await this.ports.repository.findConnectionByProviderAndOwner(
        providerKind,
        ownerUserId,
      );
    if (connection === null || connection.deletedAt !== null) return null;
    return this.disconnect(ownerUserId, connection.id, now);
  }

  /**
   * Disconnects: the adapter removes session usability, encrypted session
   * material is destroyed, and the row records the disconnect. Idempotent.
   */
  async disconnect(
    ownerUserId: string,
    connectionId: string,
    now = new Date(),
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.findByOwner(ownerUserId, connectionId);
    if (connection === null || connection.deletedAt !== null) {
      this.emitLookupFailure(connectionId, "disconnect", "not_found", false);
      throw new ProviderConnectionError("provider_connection_not_found");
    }
    if (
      connection.connectionStatus === "disconnected" ||
      connection.connectionStatus === "authentication_revoked" ||
      connection.connectionStatus === "not_configured" ||
      connection.connectionStatus === "login_cancelled"
    ) {
      return toStatusView(connection, null);
    }
    if (!disconnectableStatuses.includes(connection.connectionStatus)) {
      throw new ProviderConnectionError("provider_connection_state_conflict");
    }

    await this.destroySession(ownerUserId, connectionId, connection);
    try {
      await this.ports.adapter.disconnect(
        this.context(ownerUserId, connectionId),
        connection.sessionReference,
      );
    } catch (error) {
      throw mapAdapterError(error);
    }
    const next: AIProviderRuntimeConnection = {
      ...connection,
      connectionStatus: "disconnected",
      authenticationStatus: "unauthenticated",
      availabilityStatus: "unknown",
      sessionReference: null,
      disconnectedAt: now,
      lastCheckedAt: now,
    };
    return toStatusView(await this.saveSafely(connection, next), null);
  }

  /**
   * Revokes: destroys session material (idempotent) and records revocation
   * metadata while preserving the provider-neutral row. Idempotent.
   */
  async revoke(
    ownerUserId: string,
    connectionId: string,
    reason: ProviderRevocationReason = "user_revoked",
    now = new Date(),
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.findByOwner(ownerUserId, connectionId);
    if (connection === null || connection.deletedAt !== null) {
      this.emitLookupFailure(connectionId, "revoke", "not_found", false);
      throw new ProviderConnectionError("provider_connection_not_found");
    }
    if (connection.connectionStatus === "authentication_revoked") {
      return toStatusView(connection, null);
    }
    if (connection.connectionStatus === "not_configured") {
      throw new ProviderConnectionError("provider_connection_state_conflict");
    }

    await this.destroySession(ownerUserId, connectionId, connection);
    try {
      await this.ports.adapter.revoke(
        this.context(ownerUserId, connectionId),
        connection.sessionReference,
      );
    } catch (error) {
      throw mapAdapterError(error);
    }
    const next: AIProviderRuntimeConnection = {
      ...connection,
      connectionStatus: "authentication_revoked",
      authenticationStatus: "revoked",
      availabilityStatus: "unknown",
      sessionReference: null,
      revokedAt: now,
      revocationReason: reason,
      lastCheckedAt: now,
    };
    return toStatusView(await this.saveSafely(connection, next), null);
  }

  /**
   * Deletes the provider connection row (soft delete with metadata) after
   * adapter local state and encrypted session material are destroyed.
   * Repeated deletion is idempotent and safe.
   */
  async deleteConnection(
    ownerUserId: string,
    connectionId: string,
    reason: ProviderDeletionReason = "user_deleted",
    now = new Date(),
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.findByOwner(ownerUserId, connectionId);
    if (connection === null) {
      this.emitLookupFailure(connectionId, "delete", "not_found", false);
      return {
        connectionId,
        providerKind: "unknown",
        displayName: null,
        connectionStatus: "not_configured",
        authenticationStatus: "unauthenticated",
        availabilityStatus: "unknown",
        capabilities: null,
        capabilitySnapshotAt: null,
        lastCheckedAt: null,
        loginStartedAt: null,
        connectedAt: null,
        refreshedAt: null,
        expiresAt: null,
        disconnectedAt: null,
        revokedAt: null,
        deletedAt: now,
        safeMessage: null,
        ready: false,
      };
    }
    if (connection.deletedAt !== null) {
      return toStatusView(connection, null);
    }

    await this.destroySession(ownerUserId, connectionId, connection);
    try {
      await this.ports.adapter.deleteLocalState(
        this.context(ownerUserId, connectionId),
        connection.sessionReference,
      );
    } catch (error) {
      throw mapAdapterError(error);
    }
    const next: AIProviderRuntimeConnection = {
      ...connection,
      connectionStatus: "not_configured",
      authenticationStatus: "unauthenticated",
      availabilityStatus: "unknown",
      sessionReference: null,
      deletedAt: now,
      deletionReason: reason,
      lastCheckedAt: now,
    };
    return toStatusView(await this.saveSafely(connection, next), null);
  }

  /**
   * Detects expired sessions and transitions them to
   * `authentication_expired` so consumers fail closed instead of using stale
   * session material.
   */
  async detectExpiredConnections(
    ownerUserId: string,
    now = new Date(),
  ): Promise<readonly AIProviderRuntimeConnection[]> {
    const connections =
      await this.ports.repository.listConnectionsByOwner(ownerUserId);
    const expired: AIProviderRuntimeConnection[] = [];
    await this.ports.repository.transaction(async (repository) => {
      for (const connection of connections) {
        if (
          connection.deletedAt !== null ||
          connection.expiresAt === null ||
          connection.expiresAt.getTime() > now.getTime() ||
          !activeSessionStatuses.includes(connection.connectionStatus)
        ) {
          continue;
        }
        const next: AIProviderRuntimeConnection = {
          ...connection,
          connectionStatus: "authentication_expired",
          authenticationStatus: "expired",
          availabilityStatus: "unknown",
          lastCheckedAt: now,
        };
        expired.push(await repository.saveConnection(next));
      }
    });
    return expired;
  }

  /**
   * Refreshes the provider-neutral capability snapshot from the adapter.
   */
  async refreshCapabilities(
    ownerUserId: string,
    connectionId: string,
    now = new Date(),
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.requireActiveByOwner(
      ownerUserId,
      connectionId,
      "refresh_capabilities",
    );
    let capabilities: ProviderRuntimeCapabilities;
    try {
      capabilities = await this.ports.adapter.capabilities(
        this.context(ownerUserId, connectionId),
        connection.sessionReference,
      );
    } catch (error) {
      throw mapAdapterError(error);
    }
    const next: AIProviderRuntimeConnection = {
      ...connection,
      capabilities,
      capabilitySnapshotAt: now,
      lastCheckedAt: now,
    };
    return toStatusView(await this.saveSafely(connection, next), null);
  }

  /**
   * Refreshes quota/subscription availability state from the adapter.
   */
  async refreshQuotaState(
    ownerUserId: string,
    connectionId: string,
  ): Promise<ProviderConnectionStatusView> {
    const connection = await this.requireActiveByOwner(
      ownerUserId,
      connectionId,
      "refresh_quota",
    );
    let quota: ProviderAdapterQuotaResult;
    try {
      quota = await this.ports.adapter.quotaState(
        this.context(ownerUserId, connectionId),
        connection.sessionReference,
      );
    } catch (error) {
      throw mapAdapterError(error);
    }
    const next: AIProviderRuntimeConnection = {
      ...connection,
      availabilityStatus: quota.availabilityState,
      lastCheckedAt: quota.checkedAt,
    };
    return toStatusView(
      await this.saveSafely(connection, next),
      quota.safeMessage,
    );
  }

  private context(
    ownerUserId: string,
    connectionId: string,
  ): ProviderRuntimeAdapterContext {
    return { sessionStore: this.ports.sessionStore, ownerUserId, connectionId };
  }

  private async findByOwner(
    ownerUserId: string,
    connectionId: string,
  ): Promise<AIProviderRuntimeConnection | null> {
    return this.ports.repository.findConnectionByOwner(
      connectionId,
      ownerUserId,
    );
  }

  private async requireActiveByOwner(
    ownerUserId: string,
    connectionId: string,
    operation: ProviderConnectionLookupOperation,
  ): Promise<AIProviderRuntimeConnection> {
    const connection = await this.findByOwner(ownerUserId, connectionId);
    if (connection === null) {
      this.emitLookupFailure(connectionId, operation, "not_found", false);
      throw new ProviderConnectionError("provider_connection_not_found");
    }
    this.assertNotDeleted(connection, operation);
    return connection;
  }

  private assertNotDeleted(
    connection: AIProviderRuntimeConnection,
    operation: ProviderConnectionLookupOperation,
  ): void {
    if (connection.deletedAt !== null) {
      this.emitLookupFailure(connection.id, operation, "deleted", false);
      throw new ProviderConnectionError("provider_connection_deleted");
    }
  }

  private emitLookupFailure(
    connectionId: string,
    operation: ProviderConnectionLookupOperation,
    errorCategory: ProviderConnectionLookupCategory,
    retryable: boolean,
  ): void {
    this.ports.logger?.emit("provider_connection.lookup_failed", {
      connectionId,
      operation,
      errorCategory,
      retryable,
    });
  }

  private async createConnection(
    ownerUserId: string,
    connectionId: string,
    options: { readonly displayName?: string },
  ): Promise<AIProviderRuntimeConnection> {
    const now = new Date();
    const connection: AIProviderRuntimeConnection = {
      id: connectionId,
      ownerUserId,
      providerKind: this.ports.adapter.providerKind,
      displayName: options.displayName ?? null,
      connectionStatus: "not_configured",
      authenticationStatus: "unauthenticated",
      availabilityStatus: "unknown",
      capabilities: null,
      capabilitySnapshotAt: null,
      sessionReference: null,
      lastCheckedAt: null,
      loginStartedAt: null,
      connectedAt: null,
      refreshedAt: null,
      expiresAt: null,
      disconnectedAt: null,
      revokedAt: null,
      revocationReason: null,
      createdAt: now,
      deletedAt: null,
      deletionReason: null,
    };
    return this.ports.repository.createConnection(connection);
  }

  private async persistInspection(
    connection: AIProviderRuntimeConnection,
    inspection: ProviderAdapterInspection,
  ): Promise<AIProviderRuntimeConnection> {
    if (
      connection.connectionStatus === inspection.connectionState &&
      connection.authenticationStatus === inspection.authenticationState &&
      connection.availabilityStatus === inspection.availabilityState &&
      (connection.lastCheckedAt?.getTime() ?? -1) ===
        inspection.checkedAt.getTime()
    ) {
      return connection;
    }
    const next: AIProviderRuntimeConnection = {
      ...connection,
      connectionStatus: inspection.connectionState,
      authenticationStatus: inspection.authenticationState,
      // Local session inspection cannot prove that a remote provider has
      // recovered. Keep an explicit temporary-unavailable projection until
      // an explicit provider availability check clears it.
      availabilityStatus:
        connection.availabilityStatus !== "available" &&
        inspection.availabilityState === "available"
          ? connection.availabilityStatus
          : inspection.availabilityState,
      lastCheckedAt: inspection.checkedAt,
    };
    return this.saveSafely(connection, next);
  }

  private async saveSafely(
    connection: AIProviderRuntimeConnection,
    next: AIProviderRuntimeConnection,
  ): Promise<AIProviderRuntimeConnection> {
    try {
      return await this.ports.repository.transaction((repository) =>
        repository.saveConnection(next),
      );
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  private async destroySession(
    ownerUserId: string,
    connectionId: string,
    connection: AIProviderRuntimeConnection,
  ): Promise<void> {
    if (connection.sessionReference === null) return;
    await this.deleteSessionMaterial(
      ownerUserId,
      connectionId,
      connection.sessionReference,
    );
  }

  private async deleteSessionMaterial(
    ownerUserId: string,
    connectionId: string,
    sessionReference: string,
  ): Promise<void> {
    try {
      await this.ports.sessionStore.deleteSession({
        ownerUserId,
        connectionId,
        sessionReference,
      });
    } catch {
      throw new ProviderConnectionError("provider_session_storage_unavailable");
    }
  }
}

function assertStatus(
  connection: AIProviderRuntimeConnection,
  operation: "connect" | "reconnect",
  allowed: readonly ProviderRuntimeConnectionStatus[],
): void {
  if (!allowed.includes(connection.connectionStatus)) {
    throw new ProviderConnectionError(
      "provider_connection_state_conflict",
      `The provider connection cannot be ${operation === "connect" ? "connected" : "reconnected"} in its current state.`,
    );
  }
}

const opaqueSessionReferencePattern = /^[a-f0-9]{64}$/;
const pendingLoginTtlMs = 10 * 60 * 1000;

function isPendingLoginFresh(loginStartedAt: Date | null): boolean {
  return (
    loginStartedAt !== null &&
    Date.now() - loginStartedAt.getTime() >= 0 &&
    Date.now() - loginStartedAt.getTime() < pendingLoginTtlMs
  );
}

function assertOpaqueSessionReference(sessionReference: string): void {
  if (!opaqueSessionReferencePattern.test(sessionReference)) {
    throw new ProviderConnectionError("provider_adapter_failed");
  }
}

function toStatusView(
  connection: AIProviderRuntimeConnection,
  safeMessage: string | null,
): ProviderConnectionStatusView {
  return {
    connectionId: connection.id,
    providerKind: connection.providerKind,
    displayName: connection.displayName,
    connectionStatus: connection.connectionStatus,
    authenticationStatus: connection.authenticationStatus,
    availabilityStatus: connection.availabilityStatus,
    capabilities: connection.capabilities,
    capabilitySnapshotAt: connection.capabilitySnapshotAt,
    lastCheckedAt: connection.lastCheckedAt,
    loginStartedAt: connection.loginStartedAt,
    connectedAt: connection.connectedAt,
    refreshedAt: connection.refreshedAt,
    expiresAt: connection.expiresAt,
    disconnectedAt: connection.disconnectedAt,
    revokedAt: connection.revokedAt,
    deletedAt: connection.deletedAt,
    safeMessage,
    ready: isProviderConnectionReady(connection),
  };
}

/**
 * The sole readiness predicate used by the API projection and UI contract.
 * A pending row, handoff, callback visit, or capability snapshot alone can
 * never make a connection ready: the encrypted session reference and the
 * persisted authenticated/available state must all be present.
 */
export function isProviderConnectionReady(
  connection: Pick<
    AIProviderRuntimeConnection,
    | "connectionStatus"
    | "authenticationStatus"
    | "availabilityStatus"
    | "sessionReference"
    | "capabilities"
    | "connectedAt"
  >,
): boolean {
  return (
    connection.connectionStatus === "connected" &&
    connection.authenticationStatus === "authenticated" &&
    connection.availabilityStatus === "available" &&
    connection.sessionReference !== null &&
    connection.capabilities !== null &&
    connection.connectedAt !== null
  );
}

function mapAdapterError(error: unknown): ProviderConnectionError {
  if (error instanceof ProviderConnectionError) return error;
  if (isSafeProviderError(error)) {
    return new ProviderConnectionError(error.code);
  }
  return new ProviderConnectionError("provider_adapter_failed");
}

function mapPersistenceError(error: unknown): ProviderConnectionError {
  if (error instanceof ProviderConnectionError) return error;
  return new ProviderConnectionError("provider_connection_persistence_failed");
}

function isSafeProviderError(
  error: unknown,
): error is { readonly code: ProviderConnectionErrorCode } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    providerConnectionErrorCodes.includes(
      error.code as ProviderConnectionErrorCode,
    )
  );
}

export const providerConnectionErrorCodes = [
  "provider_connection_not_found",
  "provider_connection_deleted",
  "provider_connection_state_conflict",
  "provider_adapter_failed",
  "provider_connection_persistence_failed",
  "provider_session_storage_unavailable",
  "provider_unavailable",
  "provider_rate_limited",
  "provider_quota_exceeded",
  "provider_connection_already_connected",
  "provider_connection_login_expired",
  "provider_connection_login_invalid_state",
  "provider_connection_login_cancelled",
  "provider_connection_handoff_unavailable",
] as const satisfies readonly ProviderConnectionErrorCode[];
