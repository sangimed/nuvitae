import type { ManualStructuredResumeDraft } from "@nuvitae/domain";

export interface ManualResumeDraftRepository {
  transaction<T>(
    work: (repository: ManualResumeDraftRepository) => Promise<T>,
  ): Promise<T>;
  createManualDraft(input: {
    readonly draft: ManualStructuredResumeDraft;
    readonly creationKey: string;
  }): Promise<ManualStructuredResumeDraft>;
  findManualDraftByOwner(
    draftId: string,
    userId: string,
  ): Promise<ManualStructuredResumeDraft | null>;
  findManualDraftByCreationKey(
    creationKey: string,
    userId: string,
  ): Promise<ManualStructuredResumeDraft | null>;
  saveManualDraft(
    draft: ManualStructuredResumeDraft,
  ): Promise<ManualStructuredResumeDraft>;
}
