import type { AIProviderRuntimeConnection } from "@nuvitae/domain";
import type { EntityManager } from "typeorm";

export interface AIProviderRuntimeConnectionsRepository {
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
  createConnection(
    connection: AIProviderRuntimeConnection,
    manager?: EntityManager,
  ): Promise<AIProviderRuntimeConnection>;
  findConnectionByOwner(
    connectionId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<AIProviderRuntimeConnection | null>;
  findConnectionByProviderAndOwner(
    providerKind: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<AIProviderRuntimeConnection | null>;
  listConnectionsByOwner(
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly AIProviderRuntimeConnection[]>;
  saveConnection(
    connection: AIProviderRuntimeConnection,
    manager?: EntityManager,
  ): Promise<AIProviderRuntimeConnection>;
}
