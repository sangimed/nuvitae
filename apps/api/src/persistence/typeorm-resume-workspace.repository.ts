import { TypeOrmImportResumeRepository } from "@nuvitae/persistence/typeorm";
import type { DataSource, EntityManager } from "typeorm";
import type { ResumeWorkspaceRepository } from "../resume-workspace/resume-workspace.repository.js";

export class TypeOrmResumeWorkspaceRepository implements ResumeWorkspaceRepository {
  private readonly resumes: TypeOrmImportResumeRepository;

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactionManager?: EntityManager,
  ) {
    this.resumes = new TypeOrmImportResumeRepository(dataSource);
  }

  transaction<T>(
    work: (repository: ResumeWorkspaceRepository) => Promise<T>,
  ): Promise<T> {
    if (this.transactionManager !== undefined) return work(this);
    return this.dataSource.transaction((manager) =>
      work(new TypeOrmResumeWorkspaceRepository(this.dataSource, manager)),
    );
  }

  listStructuredResumesByOwner(ownerUserId: string) {
    return this.resumes.listStructuredResumesByOwner(
      ownerUserId,
      this.transactionManager,
    );
  }

  listManualDraftsByOwner(ownerUserId: string) {
    return this.resumes.listManualDraftsByOwner(
      ownerUserId,
      this.transactionManager,
    );
  }

  findStructuredResumeByOwner(resumeId: string, ownerUserId: string) {
    return this.resumes.findStructuredResumeByOwner(
      resumeId,
      ownerUserId,
      this.transactionManager,
    );
  }

  findStructuredResumeByOwnerForUpdate(resumeId: string, ownerUserId: string) {
    return this.resumes.findStructuredResumeByOwnerForUpdate(
      resumeId,
      ownerUserId,
      this.requiredManager(),
    );
  }

  replaceStructuredResume(
    resume: Parameters<ResumeWorkspaceRepository["replaceStructuredResume"]>[0],
    previousUpdatedAt: Date,
  ) {
    return this.resumes.replaceStructuredResume(
      resume,
      previousUpdatedAt,
      this.requiredManager(),
    );
  }

  private requiredManager(): EntityManager {
    if (this.transactionManager === undefined) {
      throw new Error("resume_workspace_update_requires_transaction");
    }
    return this.transactionManager;
  }
}
