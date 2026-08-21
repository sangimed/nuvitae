import type { AIProviderRuntimeConnection } from "@nuvitae/domain";
import { DataSource, EntityManager } from "typeorm";
import { AIProviderRuntimeConnectionEntity } from "../entities/ai-provider-runtime-connection.entity.js";
import {
  aiProviderRuntimeConnectionEntity,
  mapAIProviderRuntimeConnection,
} from "../mappers/ai-provider-runtime-connection.mapper.js";
import type { AIProviderRuntimeConnectionsRepository } from "./ai-provider-runtime-connections.repository.js";

export class TypeOrmAIProviderRuntimeConnectionsRepository implements AIProviderRuntimeConnectionsRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactionManager?: EntityManager,
  ) {}

  transaction<T>(
    work: (repository: AIProviderRuntimeConnectionsRepository) => Promise<T>,
  ): Promise<T> {
    if (this.transactionManager !== undefined) return work(this);
    return this.dataSource.transaction((manager) =>
      work(
        new TypeOrmAIProviderRuntimeConnectionsRepository(
          this.dataSource,
          manager,
        ),
      ),
    );
  }

  private manager(): EntityManager {
    return this.transactionManager ?? this.dataSource.manager;
  }

  async createConnection(
    connection: AIProviderRuntimeConnection,
  ): Promise<AIProviderRuntimeConnection> {
    const scoped = this.manager();
    await scoped.insert(
      AIProviderRuntimeConnectionEntity,
      aiProviderRuntimeConnectionEntity(connection),
    );
    return this.findConnectionByOwner(
      connection.id,
      connection.ownerUserId,
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
  ): Promise<AIProviderRuntimeConnection | null> {
    const entity = await this.manager().findOneBy(
      AIProviderRuntimeConnectionEntity,
      { id: connectionId, ownerUserId: userId },
    );
    return entity === null ? null : mapAIProviderRuntimeConnection(entity);
  }

  async findConnectionByProviderAndOwner(
    providerKind: string,
    userId: string,
  ): Promise<AIProviderRuntimeConnection | null> {
    const entity = await this.manager().findOneBy(
      AIProviderRuntimeConnectionEntity,
      { providerKind, ownerUserId: userId },
    );
    return entity === null ? null : mapAIProviderRuntimeConnection(entity);
  }

  async listConnectionsByOwner(
    userId: string,
  ): Promise<readonly AIProviderRuntimeConnection[]> {
    const entities = await this.manager().findBy(
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
  ): Promise<AIProviderRuntimeConnection> {
    const scoped = this.manager();
    await scoped.save(
      AIProviderRuntimeConnectionEntity,
      aiProviderRuntimeConnectionEntity(connection),
    );
    return this.findConnectionByOwner(
      connection.id,
      connection.ownerUserId,
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
