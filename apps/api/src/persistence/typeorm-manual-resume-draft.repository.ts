import type { ManualStructuredResumeDraft } from "@nuvitae/domain";
import { TypeOrmImportResumeRepository } from "@nuvitae/persistence";
import type { DataSource, EntityManager } from "typeorm";
import type { ManualResumeDraftRepository } from "../manual-resume/manual-resume.repository.js";

export class TypeOrmManualResumeDraftRepository implements ManualResumeDraftRepository {
  private readonly drafts: TypeOrmImportResumeRepository;

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactionManager?: EntityManager,
  ) {
    this.drafts = new TypeOrmImportResumeRepository(dataSource);
  }

  transaction<T>(
    work: (repository: ManualResumeDraftRepository) => Promise<T>,
  ): Promise<T> {
    if (this.transactionManager !== undefined) return work(this);
    return this.dataSource.transaction((manager) =>
      work(new TypeOrmManualResumeDraftRepository(this.dataSource, manager)),
    );
  }

  createManualDraft(input: {
    readonly draft: ManualStructuredResumeDraft;
    readonly creationKey: string;
  }) {
    return this.drafts.createManualDraft(input, this.transactionManager);
  }

  findManualDraftByOwner(draftId: string, userId: string) {
    return this.drafts.findManualDraftByOwner(
      draftId,
      userId,
      this.transactionManager,
    );
  }

  findManualDraftByCreationKey(creationKey: string, userId: string) {
    return this.drafts.findManualDraftByCreationKey(
      creationKey,
      userId,
      this.transactionManager,
    );
  }

  saveManualDraft(draft: ManualStructuredResumeDraft) {
    return this.drafts.saveManualDraft(draft, this.transactionManager);
  }
}
