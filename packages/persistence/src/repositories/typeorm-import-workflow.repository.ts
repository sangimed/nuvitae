import type { ImportDraft, ImportedDocument } from "@nuvitae/domain";
import type { DataSource, EntityManager } from "typeorm";
import { TypeOrmImportResumeRepository } from "./typeorm-import-resume.repository.js";

interface TransactionScopedImportWorkflowRepository {
  transaction<T>(
    work: (repository: TransactionScopedImportWorkflowRepository) => Promise<T>,
  ): Promise<T>;
  findImportByOwner(
    importId: string,
    userId: string,
  ): ReturnType<TypeOrmImportResumeRepository["findImportByOwner"]>;
  saveImportLifecycle(document: ImportedDocument): Promise<ImportedDocument>;
  findDraftByImportAndOwner(
    importId: string,
    userId: string,
  ): ReturnType<TypeOrmImportResumeRepository["findDraftByImportAndOwner"]>;
  saveDraft(draft: ImportDraft): Promise<ImportDraft>;
}

/** TypeORM adapter for the application-owned validation/extraction port. */
export class TypeOrmImportWorkflowRepository implements TransactionScopedImportWorkflowRepository {
  private readonly imports: TypeOrmImportResumeRepository;

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactionManager?: EntityManager,
  ) {
    this.imports = new TypeOrmImportResumeRepository(dataSource);
  }

  transaction<T>(
    work: (repository: TransactionScopedImportWorkflowRepository) => Promise<T>,
  ): Promise<T> {
    if (this.transactionManager !== undefined) return work(this);
    return this.dataSource.transaction((manager) =>
      work(new TypeOrmImportWorkflowRepository(this.dataSource, manager)),
    );
  }

  findImportByOwner(importId: string, userId: string) {
    return this.imports.findImportByOwner(
      importId,
      userId,
      this.transactionManager,
    );
  }

  saveImportLifecycle(document: ImportedDocument) {
    return this.imports.saveImportLifecycle(document, this.transactionManager);
  }

  findDraftByImportAndOwner(importId: string, userId: string) {
    return this.imports.findDraftByImportAndOwner(
      importId,
      userId,
      this.transactionManager,
    );
  }

  saveDraft(draft: ImportDraft) {
    return this.imports.saveDraft(draft, this.transactionManager);
  }
}
