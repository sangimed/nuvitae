import type {
  DerivedExtractionArtifact,
  ImportDraft,
  ImportedDocument,
} from "@nuvitae/domain";

export interface ImportWorkflowAggregate {
  readonly document: ImportedDocument;
  readonly artifacts: readonly DerivedExtractionArtifact[];
}

/** Persistence port owned by document validation and extraction workflows. */
export interface ImportWorkflowRepository {
  transaction<T>(
    work: (repository: ImportWorkflowRepository) => Promise<T>,
  ): Promise<T>;
  findImportByOwner(
    importId: string,
    userId: string,
  ): Promise<ImportWorkflowAggregate | null>;
  saveImportLifecycle(document: ImportedDocument): Promise<ImportedDocument>;
  findDraftByImportAndOwner(
    importId: string,
    userId: string,
  ): Promise<ImportDraft | null>;
  saveDraft(draft: ImportDraft): Promise<ImportDraft>;
}
