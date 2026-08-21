import type {
  DerivedExtractionArtifact,
  ImportDraft,
  ImportedDocument,
  UserCorrection,
} from "@nuvitae/domain";

export interface ImportWorkflowAggregate {
  readonly document: ImportedDocument;
  readonly artifacts: readonly DerivedExtractionArtifact[];
}

/** Persistence port owned by document validation and extraction workflows. */
export interface ImportWorkflowReader {
  findImportByOwner(
    importId: string,
    userId: string,
  ): Promise<ImportWorkflowAggregate | null>;
  findDraftByImportAndOwner(
    importId: string,
    userId: string,
  ): Promise<ImportDraft | null>;
}

/** Persistence port owned by document validation and extraction workflows. */
export interface ImportWorkflowRepository extends ImportWorkflowReader {
  transaction<T>(
    work: (repository: ImportWorkflowRepository) => Promise<T>,
  ): Promise<T>;
  saveImportLifecycle(document: ImportedDocument): Promise<ImportedDocument>;
  saveDraft(draft: ImportDraft): Promise<ImportDraft>;
}

export interface ImportReviewMutationRepository {
  transaction<T>(
    work: (repository: ImportReviewMutationRepository) => Promise<T>,
  ): Promise<T>;
  findReviewDraftByImportAndOwnerForUpdate(
    importId: string,
    userId: string,
  ): Promise<ImportDraft | null>;
  findCorrectionByOwnerAndOperation(
    operationId: string,
    userId: string,
  ): Promise<UserCorrection | null>;
  saveReviewMutation(input: {
    readonly draft: ImportDraft;
    readonly correction: UserCorrection;
    readonly previousReviewRevision: number;
  }): Promise<ImportDraft>;
}

export class ReviewCorrectionOperationIdConflictError extends Error {
  constructor() {
    super("review_correction_operation_id_conflict");
    this.name = "ReviewCorrectionOperationIdConflictError";
  }
}
