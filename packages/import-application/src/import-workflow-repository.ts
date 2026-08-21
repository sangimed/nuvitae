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
