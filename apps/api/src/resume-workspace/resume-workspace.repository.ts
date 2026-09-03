import type {
  ManualStructuredResumeDraft,
  StructuredResume,
} from "@nuvitae/domain";

export interface ResumeWorkspaceRepository {
  transaction<T>(
    work: (repository: ResumeWorkspaceRepository) => Promise<T>,
  ): Promise<T>;
  listStructuredResumesByOwner(
    ownerUserId: string,
  ): Promise<readonly StructuredResume[]>;
  listManualDraftsByOwner(
    ownerUserId: string,
  ): Promise<readonly ManualStructuredResumeDraft[]>;
  findStructuredResumeByOwner(
    resumeId: string,
    ownerUserId: string,
  ): Promise<StructuredResume | null>;
  findStructuredResumeByOwnerForUpdate(
    resumeId: string,
    ownerUserId: string,
  ): Promise<StructuredResume | null>;
  replaceStructuredResume(
    resume: StructuredResume,
    previousUpdatedAt: Date,
  ): Promise<StructuredResume>;
}
