import type {
  DeletionJob,
  DerivedExtractionArtifact,
  ImportDraft,
  ImportedDocument,
  ManualStructuredResumeDraft,
  StructuredResume,
  UserCorrection,
} from "@nuvitae/domain";
import type { EntityManager } from "typeorm";

export interface ImportAggregate {
  readonly document: ImportedDocument;
  readonly artifacts: readonly DerivedExtractionArtifact[];
}

export interface ImportResumeRepository {
  createImportAggregate(
    aggregate: ImportAggregate,
    manager?: EntityManager,
  ): Promise<ImportAggregate>;
  findImportByOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ImportAggregate | null>;
  saveImportLifecycle(
    document: ImportedDocument,
    manager?: EntityManager,
  ): Promise<ImportedDocument>;
  saveDraft(draft: ImportDraft, manager?: EntityManager): Promise<ImportDraft>;
  findReviewDraftByImportAndOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ImportDraft | null>;
  findReviewDraftByImportAndOwnerForUpdate(
    importId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<ImportDraft | null>;
  findConfirmationDraftByImportAndOwnerForUpdate(
    importId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<ImportDraft | null>;
  findStructuredResumeBySourceDraftAndOwner(
    draftId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<StructuredResume | null>;
  findCorrectionsByDraftAndOwner(
    draftId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly UserCorrection[]>;
  findCorrectionByOwnerAndOperation(
    operationId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<UserCorrection | null>;
  saveReviewMutation(
    input: {
      readonly draft: ImportDraft;
      readonly correction: UserCorrection;
      readonly previousReviewRevision: number;
    },
    manager: EntityManager,
  ): Promise<ImportDraft>;
  findDraftByImportAndOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ImportDraft | null>;
  findDraftByOwner(
    draftId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ImportDraft | null>;
  saveStructuredResume(
    resume: StructuredResume,
    manager?: EntityManager,
  ): Promise<StructuredResume>;
  findStructuredResumeByOwner(
    resumeId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<StructuredResume | null>;
  confirmDraftAndCreateStructuredResume(
    input: {
      readonly draft: ImportDraft;
      readonly resume: StructuredResume;
      readonly confirmedAt: Date;
    },
    manager: EntityManager,
  ): Promise<StructuredResume>;
  scheduleDeletionJob(
    job: DeletionJob,
    manager?: EntityManager,
  ): Promise<DeletionJob>;
  discardDraftAndScheduleDeletion(
    input: {
      readonly draft: ImportDraft;
      readonly job: DeletionJob;
      readonly discardedAt: Date;
    },
    manager: EntityManager,
  ): Promise<DeletionJob>;
  findDeletionJobByOwner(
    jobId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<DeletionJob | null>;
  findDiscardDeletionJobByImportAndOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<DeletionJob | null>;
}

/**
 * Raised when a review mutation attempts to persist a correction whose
 * operation id already exists under another owner. Callers map this to the
 * same opaque not-found result as missing resources so no existence oracle
 * is introduced and no cross-user row is created.
 */
export class ReviewCorrectionOperationIdConflictError extends Error {
  constructor() {
    super("review_correction_operation_id_conflict");
    this.name = "ReviewCorrectionOperationIdConflictError";
  }
}

export interface PersistenceTransactionRunner {
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
}

export interface ManualResumeDraftCreateInput {
  readonly draft: ManualStructuredResumeDraft;
  readonly creationKey: string;
}

export interface ManualResumeDraftRepository {
  createManualDraft(
    input: ManualResumeDraftCreateInput,
    manager?: EntityManager,
  ): Promise<ManualStructuredResumeDraft>;
  findManualDraftByOwner(
    draftId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ManualStructuredResumeDraft | null>;
  findManualDraftByCreationKey(
    creationKey: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ManualStructuredResumeDraft | null>;
  saveManualDraft(
    draft: ManualStructuredResumeDraft,
    manager?: EntityManager,
  ): Promise<ManualStructuredResumeDraft>;
}
