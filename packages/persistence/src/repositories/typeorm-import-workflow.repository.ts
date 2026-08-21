import type { ImportDraft, ImportedDocument } from "@nuvitae/domain";
import {
  ReviewCorrectionOperationIdConflictError,
  type ImportReviewMutationRepository,
} from "@nuvitae/import-application";
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
  findReviewDraftByImportAndOwnerForUpdate(
    importId: string,
    userId: string,
  ): ReturnType<
    TypeOrmImportResumeRepository["findReviewDraftByImportAndOwnerForUpdate"]
  >;
  findCorrectionByOwnerAndOperation(
    operationId: string,
    userId: string,
  ): ReturnType<
    TypeOrmImportResumeRepository["findCorrectionByOwnerAndOperation"]
  >;
  saveReviewMutation(
    input: Parameters<ImportReviewMutationRepository["saveReviewMutation"]>[0],
  ): ReturnType<TypeOrmImportResumeRepository["saveReviewMutation"]>;
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

  findReviewDraftByImportAndOwnerForUpdate(importId: string, userId: string) {
    return this.imports.findReviewDraftByImportAndOwnerForUpdate(
      importId,
      userId,
      this.requiredTransactionManager(),
    );
  }

  findCorrectionByOwnerAndOperation(operationId: string, userId: string) {
    return this.imports.findCorrectionByOwnerAndOperation(
      operationId,
      userId,
      this.transactionManager,
    );
  }

  async saveReviewMutation(
    input: Parameters<ImportReviewMutationRepository["saveReviewMutation"]>[0],
  ) {
    try {
      return await this.imports.saveReviewMutation(
        input,
        this.requiredTransactionManager(),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ReviewCorrectionOperationIdConflictError"
      ) {
        throw new ReviewCorrectionOperationIdConflictError();
      }
      throw error;
    }
  }

  private requiredTransactionManager(): EntityManager {
    if (this.transactionManager === undefined) {
      throw new Error("import_review_operation_requires_transaction");
    }
    return this.transactionManager;
  }
}
