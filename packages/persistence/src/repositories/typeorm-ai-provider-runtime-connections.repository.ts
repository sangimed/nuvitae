import type { AIProviderRuntimeConnection } from "@nuvitae/domain";
import { DataSource, EntityManager } from "typeorm";
import { AIProviderRuntimeConnectionEntity } from "../entities/ai-provider-runtime-connection.entity.js";
import {
  aiProviderRuntimeConnectionEntity,
  mapAIProviderRuntimeConnection,
} from "../mappers/ai-provider-runtime-connection.mapper.js";
import type { AIProviderRuntimeConnectionsRepository } from "./ai-provider-runtime-connections.repository.js";

export class TypeOrmAIProviderRuntimeConnectionsRepository implements AIProviderRuntimeConnectionsRepository {
  constructor(private readonly dataSource: DataSource) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }

  private manager(manager?: EntityManager): EntityManager {
    return manager ?? this.dataSource.manager;
  }

  async createConnection(
    connection: AIProviderRuntimeConnection,
    manager?: EntityManager,
  ): Promise<AIProviderRuntimeConnection> {
    const scoped = this.manager(manager);
    await scoped.insert(
      AIProviderRuntimeConnectionEntity,
      aiProviderRuntimeConnectionEntity(connection),
    );
    return this.findConnectionByOwner(
      connection.id,
      connection.ownerUserId,
      scoped,
    ).then((saved) => {
      if (saved === null) {
        return Promise.reject(
          new Error("ai_provider_runtime_connection_not_found"),
        );
      }
      return saved;
    });
  }

  async findConnectionByOwner(
    connectionId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<AIProviderRuntimeConnection | null> {
    const entity = await this.manager(manager).findOneBy(
      AIProviderRuntimeConnectionEntity,
      { id: connectionId, ownerUserId: userId },
    );
    return entity === null ? null : mapAIProviderRuntimeConnection(entity);
  }

  async findConnectionByProviderAndOwner(
    providerKind: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<AIProviderRuntimeConnection | null> {
    const entity = await this.manager(manager).findOneBy(
      AIProviderRuntimeConnectionEntity,
      { providerKind, ownerUserId: userId },
    );
    return entity === null ? null : mapAIProviderRuntimeConnection(entity);
  }

  async listConnectionsByOwner(
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly AIProviderRuntimeConnection[]> {
    const entities = await this.manager(manager).findBy(
      AIProviderRuntimeConnectionEntity,
      { ownerUserId: userId },
    );
    return entities
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .map(mapAIProviderRuntimeConnection);
  }

  async saveConnection(
    connection: AIProviderRuntimeConnection,
    manager?: EntityManager,
  ): Promise<AIProviderRuntimeConnection> {
    const scoped = this.manager(manager);
    await scoped.save(
      AIProviderRuntimeConnectionEntity,
      aiProviderRuntimeConnectionEntity(connection),
    );
    return this.findConnectionByOwner(
      connection.id,
      connection.ownerUserId,
      scoped,
    ).then((saved) => {
      if (saved === null) {
        return Promise.reject(
          new Error("ai_provider_runtime_connection_not_found"),
        );
      }
      return saved;
    });
  }
}
