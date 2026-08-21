import type { AIProviderRuntimeConnection } from "@nuvitae/domain";

/**
 * Persistence package compatibility surface for the provider-connection port.
 * Application code owns and imports the equivalent port from
 * `@nuvitae/import-application`; this structural contract remains exported for
 * persistence consumers while keeping TypeORM transaction types private.
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
