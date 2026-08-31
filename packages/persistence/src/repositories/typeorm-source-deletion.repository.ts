import type { SourceDeletionRepository } from "@nuvitae/import-application";
import type { DataSource, EntityManager } from "typeorm";
import { TypeOrmImportResumeRepository } from "./typeorm-import-resume.repository.js";

/** TypeORM adapter for the source-deletion lifecycle's narrow persistence port. */
export class TypeOrmSourceDeletionRepository implements SourceDeletionRepository {
  private readonly imports: TypeOrmImportResumeRepository;

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactionManager?: EntityManager,
  ) {
    this.imports = new TypeOrmImportResumeRepository(dataSource);
  }

  transaction<T>(
    work: (repository: SourceDeletionRepository) => Promise<T>,
  ): Promise<T> {
    if (this.transactionManager !== undefined) return work(this);
    return this.dataSource.transaction((manager) =>
      work(new TypeOrmSourceDeletionRepository(this.dataSource, manager)),
    );
  }

  claimSourceDeletion(importId: string, ownerUserId: string) {
    return this.imports.claimSourceDeletion(
      importId,
      ownerUserId,
      this.requiredTransactionManager(),
    );
  }

  completeSourceDeletion(
    importId: string,
    ownerUserId: string,
    deletedAt: Date,
  ) {
    return this.imports.completeSourceDeletion(
      importId,
      ownerUserId,
      deletedAt,
      this.requiredTransactionManager(),
    );
  }

  failSourceDeletion(importId: string, ownerUserId: string) {
    return this.imports.failSourceDeletion(
      importId,
      ownerUserId,
      this.requiredTransactionManager(),
    );
  }

  findImportIdByStructuredResumeAndOwner(
    structuredResumeId: string,
    ownerUserId: string,
  ) {
    return this.imports.findImportIdByStructuredResumeAndOwner(
      structuredResumeId,
      ownerUserId,
      this.transactionManager,
    );
  }

  private requiredTransactionManager(): EntityManager {
    if (this.transactionManager === undefined) {
      throw new Error("source_deletion_operation_requires_transaction");
    }
    return this.transactionManager;
  }
}
