import type {
  DeletionJob,
  DerivedExtractionArtifact,
  ImportDraft,
  ImportedDocument,
  StructuredResume,
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
  scheduleDeletionJob(
    job: DeletionJob,
    manager?: EntityManager,
  ): Promise<DeletionJob>;
  findDeletionJobByOwner(
    jobId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<DeletionJob | null>;
}

export interface PersistenceTransactionRunner {
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
}
