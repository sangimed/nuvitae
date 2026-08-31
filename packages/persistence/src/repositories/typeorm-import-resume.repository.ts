import { randomUUID } from "node:crypto";
import type {
  ImportDraft,
  ImportedDocument,
  ManualStructuredResumeDraft,
  SourcedText,
  StructuredResume,
  UserCorrection,
} from "@nuvitae/domain";
import { reduceStructuredResumeSourceProvenance } from "@nuvitae/domain";
import {
  sourceReconstructingStorageKeys,
  type SourceDeletionClaim,
} from "@nuvitae/import-application";
import { DataSource, EntityManager } from "typeorm";
import {
  DeletionJobEntity,
  DerivedExtractionArtifactEntity,
  ExtractedFieldEntity,
  ImportDraftEntity,
  ImportedDocumentEntity,
  ImportWarningEntity,
  ManualStructuredResumeDraftEntity,
  StructuredResumeEntity,
  StructuredResumeItemEntity,
  StructuredResumeTextEntity,
  WorkExperienceEntity,
  WorkExperienceRoleEntity,
  WorkRoleDetailEntity,
  UserCorrectionEntity,
} from "../entities/import-resume.entities.js";
import {
  mapDeletionJob,
  mapDerivedArtifact,
  mapImportDraft,
  mapImportedDocument,
  mapManualStructuredResumeDraft,
  mapStructuredResume,
  mapUserCorrection,
} from "../mappers/import-resume.mapper.js";
import {
  ReviewCorrectionOperationIdConflictError,
  type ImportAggregate,
  type ImportResumeRepository,
  type ManualResumeDraftRepository,
  type PersistenceTransactionRunner,
} from "./import-resume.repository.js";

function importedDocumentEntity(
  value: ImportedDocument,
): ImportedDocumentEntity {
  return Object.assign(new ImportedDocumentEntity(), {
    ...value,
    sizeBytes: String(value.sizeBytes),
    renderedPageCount: value.renderedPageCount ?? null,
    detectedLanguage: value.detectedLanguage ?? null,
    storageKey: value.storageKey ?? null,
    deletedAt: value.deletedAt ?? null,
  });
}

function draftEntity(value: ImportDraft): ImportDraftEntity {
  return Object.assign(new ImportDraftEntity(), {
    id: value.id,
    importedDocumentId: value.importedDocumentId,
    ownerUserId: value.ownerUserId,
    status: value.status,
    reviewRevision: value.reviewRevision,
    createdAt: value.createdAt,
    lastReviewedAt: value.lastReviewedAt ?? null,
    retentionExpiresAt: value.retentionExpiresAt,
    confirmedAt: value.confirmedAt ?? null,
    discardedAt: value.discardedAt ?? null,
    expiredAt: value.expiredAt ?? null,
  });
}

function manualDraftEntity(
  value: ManualStructuredResumeDraft,
  creationKey?: string,
): ManualStructuredResumeDraftEntity {
  return Object.assign(new ManualStructuredResumeDraftEntity(), {
    id: value.id,
    ownerUserId: value.ownerUserId,
    source: value.source,
    status: value.status,
    ...(creationKey === undefined ? {} : { creationKey }),
    content: value.content,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    confirmedAt: value.confirmedAt ?? null,
    deletedAt: value.deletedAt ?? null,
  });
}

export class TypeOrmImportResumeRepository
  implements
    ImportResumeRepository,
    ManualResumeDraftRepository,
    PersistenceTransactionRunner
{
  constructor(private readonly dataSource: DataSource) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }

  private manager(manager?: EntityManager): EntityManager {
    return manager ?? this.dataSource.manager;
  }

  async createImportAggregate(
    aggregate: ImportAggregate,
    manager?: EntityManager,
  ): Promise<ImportAggregate> {
    const scoped = this.manager(manager);
    const document = await scoped.save(
      ImportedDocumentEntity,
      importedDocumentEntity(aggregate.document),
    );
    const artifacts = await scoped.save(
      DerivedExtractionArtifactEntity,
      aggregate.artifacts.map((artifact) =>
        Object.assign(new DerivedExtractionArtifactEntity(), {
          ...artifact,
          deletedAt: artifact.deletedAt ?? null,
        }),
      ),
    );
    return {
      document: mapImportedDocument(document),
      artifacts: artifacts.map(mapDerivedArtifact),
    };
  }

  async findImportByOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ImportAggregate | null> {
    const scoped = this.manager(manager);
    const document = await scoped.findOneBy(ImportedDocumentEntity, {
      id: importId,
      ownerUserId: userId,
    });
    if (document === null) return null;
    const artifacts = await scoped.findBy(DerivedExtractionArtifactEntity, {
      importedDocumentId: importId,
      ownerUserId: userId,
    });
    return {
      document: mapImportedDocument(document),
      artifacts: artifacts.map(mapDerivedArtifact),
    };
  }

  async saveImportLifecycle(
    document: ImportedDocument,
    manager?: EntityManager,
  ): Promise<ImportedDocument> {
    const scoped = this.manager(manager);
    const result = await scoped.update(
      ImportedDocumentEntity,
      { id: document.id, ownerUserId: document.ownerUserId },
      importedDocumentEntity(document),
    );
    if (result.affected !== 1)
      return Promise.reject(new Error("import_not_found"));
    const saved = await scoped.findOneByOrFail(ImportedDocumentEntity, {
      id: document.id,
      ownerUserId: document.ownerUserId,
    });
    return mapImportedDocument(saved);
  }

  async saveDraft(
    draft: ImportDraft,
    manager?: EntityManager,
  ): Promise<ImportDraft> {
    const scoped = this.manager(manager);
    const savedDraft = await scoped.save(ImportDraftEntity, draftEntity(draft));
    const warnings = await scoped.save(
      ImportWarningEntity,
      draft.warnings.map((warning) =>
        Object.assign(new ImportWarningEntity(), {
          ...warning,
          ownerUserId: draft.ownerUserId,
          fieldPath: warning.fieldPath ?? null,
          resolvedAt: warning.resolvedAt ?? null,
        }),
      ),
    );
    const fields = await scoped.save(
      ExtractedFieldEntity,
      draft.fields.map((field, position) =>
        Object.assign(new ExtractedFieldEntity(), {
          ...field,
          ownerUserId: draft.ownerUserId,
          position,
          normalizedValue: field.normalizedValue ?? null,
          sourceLocation: field.sourceLocation ?? null,
          warningId: field.warningId ?? null,
        }),
      ),
    );
    return mapImportDraft(savedDraft, fields, warnings);
  }

  async findDraftByOwner(
    draftId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ImportDraft | null> {
    const scoped = this.manager(manager);
    const draft = await scoped.findOneBy(ImportDraftEntity, {
      id: draftId,
      ownerUserId: userId,
    });
    if (draft === null) return null;
    const [fields, warnings] = await Promise.all([
      scoped.findBy(ExtractedFieldEntity, {
        importDraftId: draftId,
        ownerUserId: userId,
      }),
      scoped.findBy(ImportWarningEntity, {
        importDraftId: draftId,
        ownerUserId: userId,
      }),
    ]);
    return mapImportDraft(draft, fields, warnings);
  }

  async findDraftByImportAndOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ImportDraft | null> {
    const scoped = this.manager(manager);
    const draft = await scoped.findOneBy(ImportDraftEntity, {
      importedDocumentId: importId,
      ownerUserId: userId,
    });
    if (draft === null) return null;
    const [fields, warnings] = await Promise.all([
      scoped.findBy(ExtractedFieldEntity, {
        importDraftId: draft.id,
        ownerUserId: userId,
      }),
      scoped.findBy(ImportWarningEntity, {
        importDraftId: draft.id,
        ownerUserId: userId,
      }),
    ]);
    return mapImportDraft(draft, fields, warnings);
  }

  async findReviewDraftByImportAndOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ImportDraft | null> {
    return this.findDraftByImportAndOwner(importId, userId, manager);
  }

  async findReviewDraftByImportAndOwnerForUpdate(
    importId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<ImportDraft | null> {
    const draft = await manager
      .createQueryBuilder(ImportDraftEntity, "draft")
      .setLock("pessimistic_write")
      .where("draft.imported_document_id = :importId", { importId })
      .andWhere("draft.owner_user_id = :userId", { userId })
      .getOne();
    if (draft === null) return null;
    const [fields, warnings] = await Promise.all([
      manager.findBy(ExtractedFieldEntity, {
        importDraftId: draft.id,
        ownerUserId: userId,
      }),
      manager.findBy(ImportWarningEntity, {
        importDraftId: draft.id,
        ownerUserId: userId,
      }),
    ]);
    return mapImportDraft(draft, fields, warnings);
  }

  async findConfirmationDraftByImportAndOwnerForUpdate(
    importId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<ImportDraft | null> {
    return this.findReviewDraftByImportAndOwnerForUpdate(
      importId,
      userId,
      manager,
    );
  }

  async findStructuredResumeBySourceDraftAndOwner(
    draftId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<StructuredResume | null> {
    const scoped = this.manager(manager);
    const resume = await scoped.findOneBy(StructuredResumeEntity, {
      sourceImportDraftId: draftId,
      ownerUserId: userId,
    });
    if (resume === null) return null;
    return this.findStructuredResumeByOwner(resume.id, userId, scoped);
  }

  async findCorrectionsByDraftAndOwner(
    draftId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly UserCorrection[]> {
    const entities = await this.manager(manager).findBy(UserCorrectionEntity, {
      importDraftId: draftId,
      createdByUserId: userId,
    });
    return entities
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .map(mapUserCorrection);
  }

  async findCorrectionByOwnerAndOperation(
    operationId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<UserCorrection | null> {
    const entity = await this.manager(manager).findOneBy(UserCorrectionEntity, {
      id: operationId,
      createdByUserId: userId,
    });
    return entity === null ? null : mapUserCorrection(entity);
  }

  async saveReviewMutation(
    input: {
      readonly draft: ImportDraft;
      readonly correction: UserCorrection;
      readonly previousReviewRevision: number;
    },
    manager: EntityManager,
  ): Promise<ImportDraft> {
    const nextRevision = input.previousReviewRevision + 1;
    const result = await manager.update(
      ImportDraftEntity,
      {
        id: input.draft.id,
        ownerUserId: input.draft.ownerUserId,
        reviewRevision: input.previousReviewRevision,
      },
      {
        status: input.draft.status,
        lastReviewedAt: input.draft.lastReviewedAt ?? null,
        reviewRevision: nextRevision,
      },
    );
    if (result.affected !== 1) {
      return Promise.reject(new Error("stale_review_revision"));
    }
    await manager.save(
      ImportWarningEntity,
      input.draft.warnings.map((warning) =>
        Object.assign(new ImportWarningEntity(), {
          ...warning,
          ownerUserId: input.draft.ownerUserId,
          fieldPath: warning.fieldPath ?? null,
          resolvedAt: warning.resolvedAt ?? null,
        }),
      ),
    );
    await manager.save(
      ExtractedFieldEntity,
      input.draft.fields.map((field, position) =>
        Object.assign(new ExtractedFieldEntity(), {
          ...field,
          ownerUserId: input.draft.ownerUserId,
          position,
          normalizedValue: field.normalizedValue ?? null,
          sourceLocation: field.sourceLocation ?? null,
          warningId: field.warningId ?? null,
        }),
      ),
    );
    try {
      await manager.insert(
        UserCorrectionEntity,
        Object.assign(new UserCorrectionEntity(), {
          ...input.correction,
          previousValue: input.correction.previousValue ?? null,
          newValue: input.correction.newValue ?? null,
        }),
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ReviewCorrectionOperationIdConflictError();
      }
      throw error;
    }
    const saved = await this.findDraftByOwner(
      input.draft.id,
      input.draft.ownerUserId,
      manager,
    );
    if (saved === null)
      return Promise.reject(new Error("review_draft_not_found"));
    return saved;
  }

  async saveStructuredResume(
    resume: StructuredResume,
    manager?: EntityManager,
  ): Promise<StructuredResume> {
    const scoped = this.manager(manager);
    const root = await scoped.save(
      StructuredResumeEntity,
      Object.assign(new StructuredResumeEntity(), {
        ...resume,
        sourceImportDraftId: resume.sourceImportDraftId ?? null,
        sectionOrder: resume.content.sectionOrder ?? null,
        deletedAt: resume.deletedAt ?? null,
      }),
    );
    await this.saveStructuredContent(resume, scoped);
    return (await this.findStructuredResumeByOwner(
      root.id,
      root.ownerUserId,
      scoped,
    ))!;
  }

  async confirmDraftAndCreateStructuredResume(
    input: {
      readonly draft: ImportDraft;
      readonly resume: StructuredResume;
      readonly confirmedAt: Date;
    },
    manager: EntityManager,
  ): Promise<StructuredResume> {
    const saved = await this.saveStructuredResume(input.resume, manager);
    const result = await manager.update(
      ImportDraftEntity,
      {
        id: input.draft.id,
        ownerUserId: input.draft.ownerUserId,
        reviewRevision: input.draft.reviewRevision,
      },
      {
        status: "confirmed",
        confirmedAt: input.confirmedAt,
      },
    );
    if (result.affected !== 1) {
      return Promise.reject(new Error("stale_review_revision"));
    }
    return saved;
  }

  private async saveStructuredContent(
    resume: StructuredResume,
    manager: EntityManager,
  ): Promise<void> {
    const textRows: StructuredResumeTextEntity[] = [];
    const addTexts = (
      section: string,
      values: readonly SourcedText[],
    ): void => {
      values.forEach((value, position) => {
        textRows.push(
          Object.assign(new StructuredResumeTextEntity(), {
            id: randomUUID(),
            structuredResumeId: resume.id,
            ownerUserId: resume.ownerUserId,
            section,
            position,
            ...value,
            sourceLocation: value.sourceLocation ?? null,
          }),
        );
      });
    };
    addTexts("personal", resume.content.personal);
    addTexts("contact", resume.content.contact);
    if (resume.content.headline)
      addTexts("headline", [resume.content.headline]);
    if (resume.content.summary) addTexts("summary", [resume.content.summary]);
    await manager.save(StructuredResumeTextEntity, textRows);

    for (const [
      position,
      experience,
    ] of resume.content.workExperiences.entries()) {
      await manager.save(
        WorkExperienceEntity,
        Object.assign(new WorkExperienceEntity(), {
          ...experience,
          structuredResumeId: resume.id,
          ownerUserId: resume.ownerUserId,
          position,
          employerLocation: experience.employerLocation ?? null,
        }),
      );
      for (const [rolePosition, role] of experience.roles.entries()) {
        await manager.save(
          WorkExperienceRoleEntity,
          Object.assign(new WorkExperienceRoleEntity(), {
            ...role,
            workExperienceId: experience.id,
            structuredResumeId: resume.id,
            position: rolePosition,
            location: role.location ?? null,
            startDate: role.startDate ?? null,
            endDate: role.endDate ?? null,
          }),
        );
        const details = [
          ...role.responsibilities.map((value, detailPosition) => ({
            value,
            kind: "responsibility" as const,
            detailPosition,
          })),
          ...role.achievements.map((value, detailPosition) => ({
            value,
            kind: "achievement" as const,
            detailPosition,
          })),
        ];
        await manager.save(
          WorkRoleDetailEntity,
          details.map(({ value, kind, detailPosition }) =>
            Object.assign(new WorkRoleDetailEntity(), {
              id: randomUUID(),
              workRoleId: role.id,
              structuredResumeId: resume.id,
              kind,
              position: detailPosition,
              ...value,
              sourceLocation: value.sourceLocation ?? null,
            }),
          ),
        );
      }
    }
    await this.saveSectionItems(resume, manager);
  }

  private async saveSectionItems(
    resume: StructuredResume,
    manager: EntityManager,
  ): Promise<void> {
    const rows: StructuredResumeItemEntity[] = [];
    const base = (
      id: string,
      section: StructuredResumeItemEntity["section"],
      position: number,
      value: SourcedText,
      reviewStatus: string,
    ) => ({
      id,
      structuredResumeId: resume.id,
      ownerUserId: resume.ownerUserId,
      parentItemId: null,
      section,
      position,
      primaryValue: value.value,
      secondaryValue: null,
      tertiaryValue: null,
      locationValue: null,
      url: null,
      startDate: null,
      endDate: null,
      reviewStatus,
      sourceStatus: value.sourceStatus,
      sourceLocation: value.sourceLocation ?? null,
      confidenceStatus: value.confidenceStatus,
      inferenceStatus: value.inferenceStatus,
    });
    resume.content.education.forEach((item, position) =>
      rows.push(
        Object.assign(
          new StructuredResumeItemEntity(),
          base(
            item.id,
            "education",
            position,
            item.institution,
            item.reviewStatus,
          ),
          {
            secondaryValue: item.credential?.value ?? null,
            tertiaryValue: item.fieldOfStudy?.value ?? null,
            locationValue: item.location?.value ?? null,
            startDate: item.startDate ?? null,
            endDate: item.endDate ?? null,
          },
        ),
      ),
    );
    resume.content.skills.forEach((item, position) =>
      rows.push(
        Object.assign(
          new StructuredResumeItemEntity(),
          base(item.id, "skill", position, item.name, item.reviewStatus),
          { secondaryValue: item.category ?? null },
        ),
      ),
    );
    resume.content.languages.forEach((item, position) =>
      rows.push(
        Object.assign(
          new StructuredResumeItemEntity(),
          base(item.id, "language", position, item.name, item.reviewStatus),
          { secondaryValue: item.proficiency?.value ?? null },
        ),
      ),
    );
    resume.content.projects.forEach((item, position) => {
      rows.push(
        Object.assign(
          new StructuredResumeItemEntity(),
          base(item.id, "project", position, item.name, item.reviewStatus),
          { secondaryValue: item.description?.value ?? null },
        ),
      );
      item.links.forEach((link, linkPosition) =>
        rows.push(
          Object.assign(
            new StructuredResumeItemEntity(),
            base(
              link.id,
              "project_link",
              linkPosition,
              link.url,
              link.reviewStatus,
            ),
            {
              parentItemId: item.id,
              primaryValue: link.label ?? "",
              url: link.url.value,
            },
          ),
        ),
      );
    });
    resume.content.certifications.forEach((item, position) =>
      rows.push(
        Object.assign(
          new StructuredResumeItemEntity(),
          base(
            item.id,
            "certification",
            position,
            item.name,
            item.reviewStatus,
          ),
          {
            secondaryValue: item.issuer?.value ?? null,
            startDate: item.issuedAt ?? null,
            endDate: item.expiresAt ?? null,
          },
        ),
      ),
    );
    resume.content.professionalLinks.forEach((item, position) =>
      rows.push(
        Object.assign(
          new StructuredResumeItemEntity(),
          base(
            item.id,
            "professional_link",
            position,
            item.url,
            item.reviewStatus,
          ),
          { primaryValue: item.label ?? "", url: item.url.value },
        ),
      ),
    );
    await manager.save(StructuredResumeItemEntity, rows);
  }

  async findStructuredResumeByOwner(
    resumeId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<StructuredResume | null> {
    const scoped = this.manager(manager);
    const resume = await scoped.findOneBy(StructuredResumeEntity, {
      id: resumeId,
      ownerUserId: userId,
    });
    if (resume === null) return null;
    const [texts, workExperiences, roles, roleDetails, items] =
      await Promise.all([
        scoped.findBy(StructuredResumeTextEntity, {
          structuredResumeId: resumeId,
          ownerUserId: userId,
        }),
        scoped.findBy(WorkExperienceEntity, {
          structuredResumeId: resumeId,
          ownerUserId: userId,
        }),
        scoped.findBy(WorkExperienceRoleEntity, {
          structuredResumeId: resumeId,
        }),
        scoped.findBy(WorkRoleDetailEntity, {
          structuredResumeId: resumeId,
        }),
        scoped.findBy(StructuredResumeItemEntity, {
          structuredResumeId: resumeId,
          ownerUserId: userId,
        }),
      ]);
    return mapStructuredResume({
      resume,
      texts,
      workExperiences,
      roles,
      roleDetails,
      items,
    });
  }

  async findStructuredResumeByOwnerForUpdate(
    resumeId: string,
    userId: string,
    manager: EntityManager,
  ): Promise<StructuredResume | null> {
    const root = await manager
      .createQueryBuilder(StructuredResumeEntity, "resume")
      .setLock("pessimistic_write")
      .where("resume.id = :resumeId", { resumeId })
      .andWhere("resume.ownerUserId = :userId", { userId })
      .andWhere("resume.deletedAt IS NULL")
      .getOne();
    if (root === null) return null;
    return this.findStructuredResumeByOwner(resumeId, userId, manager);
  }

  async listStructuredResumesByOwner(
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly StructuredResume[]> {
    const scoped = this.manager(manager);
    const roots = await scoped.find(StructuredResumeEntity, {
      where: { ownerUserId: userId },
      order: { updatedAt: "DESC" },
    });
    const resumes = await Promise.all(
      roots
        .filter((root) => root.deletedAt === null)
        .map((root) =>
          this.findStructuredResumeByOwner(root.id, userId, scoped),
        ),
    );
    return resumes.filter(
      (resume): resume is StructuredResume => resume !== null,
    );
  }

  async replaceStructuredResume(
    resume: StructuredResume,
    previousUpdatedAt: Date,
    manager: EntityManager,
  ): Promise<StructuredResume> {
    const result = await manager.update(
      StructuredResumeEntity,
      {
        id: resume.id,
        ownerUserId: resume.ownerUserId,
        updatedAt: previousUpdatedAt,
      },
      {
        updatedAt: resume.updatedAt,
        sectionOrder: resume.content.sectionOrder ?? null,
      },
    );
    if (result.affected !== 1) {
      return Promise.reject(new Error("stale_structured_resume"));
    }
    await manager.delete(StructuredResumeTextEntity, {
      structuredResumeId: resume.id,
      ownerUserId: resume.ownerUserId,
    });
    await manager.delete(StructuredResumeItemEntity, {
      structuredResumeId: resume.id,
      ownerUserId: resume.ownerUserId,
    });
    await manager.delete(WorkRoleDetailEntity, {
      structuredResumeId: resume.id,
    });
    await manager.delete(WorkExperienceRoleEntity, {
      structuredResumeId: resume.id,
    });
    await manager.delete(WorkExperienceEntity, {
      structuredResumeId: resume.id,
      ownerUserId: resume.ownerUserId,
    });
    await this.saveStructuredContent(resume, manager);
    const saved = await this.findStructuredResumeByOwner(
      resume.id,
      resume.ownerUserId,
      manager,
    );
    if (saved === null) {
      return Promise.reject(new Error("structured_resume_not_found"));
    }
    return saved;
  }

  async scheduleDeletionJob(
    job: Parameters<ImportResumeRepository["scheduleDeletionJob"]>[0],
    manager?: EntityManager,
  ) {
    const entity = await this.manager(manager).save(
      DeletionJobEntity,
      Object.assign(new DeletionJobEntity(), {
        ...job,
        completedAt: job.completedAt ?? null,
        verificationSummary: job.verificationSummary ?? null,
      }),
    );
    return mapDeletionJob(entity);
  }

  async discardDraftAndScheduleDeletion(
    input: {
      readonly draft: ImportDraft;
      readonly job: Parameters<
        ImportResumeRepository["scheduleDeletionJob"]
      >[0];
      readonly discardedAt: Date;
    },
    manager: EntityManager,
  ) {
    const result = await manager.update(
      ImportDraftEntity,
      {
        id: input.draft.id,
        ownerUserId: input.draft.ownerUserId,
        reviewRevision: input.draft.reviewRevision,
      },
      {
        status: "discarded",
        discardedAt: input.discardedAt,
      },
    );
    if (result.affected !== 1) {
      return Promise.reject(new Error("stale_review_revision"));
    }
    const existing = await this.findDiscardDeletionJobByImportAndOwner(
      input.draft.importedDocumentId,
      input.draft.ownerUserId,
      manager,
    );
    if (existing !== null) return existing;
    return this.scheduleDeletionJob(input.job, manager);
  }

  async findDeletionJobByOwner(
    jobId: string,
    userId: string,
    manager?: EntityManager,
  ) {
    const entity = await this.manager(manager).findOneBy(DeletionJobEntity, {
      id: jobId,
      ownerUserId: userId,
    });
    return entity === null ? null : mapDeletionJob(entity);
  }

  async findDiscardDeletionJobByImportAndOwner(
    importId: string,
    userId: string,
    manager?: EntityManager,
  ) {
    const entity = await this.manager(manager).findOneBy(DeletionJobEntity, {
      importedDocumentId: importId,
      ownerUserId: userId,
      reason: "user_discarded_import",
    });
    return entity === null ? null : mapDeletionJob(entity);
  }

  async claimSourceDeletion(
    importId: string,
    ownerUserId: string,
    manager: EntityManager,
  ): Promise<SourceDeletionClaim> {
    const document = await manager
      .createQueryBuilder(ImportedDocumentEntity, "document")
      .setLock("pessimistic_write")
      .where("document.id = :importId", { importId })
      .andWhere("document.owner_user_id = :ownerUserId", { ownerUserId })
      .getOne();
    if (document === null) return { kind: "not_found" };
    if (document.deletionStatus === "deleted" && document.deletedAt !== null) {
      return { kind: "already_deleted", deletedAt: document.deletedAt };
    }

    const artifacts = await manager.findBy(DerivedExtractionArtifactEntity, {
      importedDocumentId: importId,
      ownerUserId,
    });
    await manager.update(
      ImportedDocumentEntity,
      { id: importId, ownerUserId },
      { deletionStatus: "deleting" },
    );
    await manager
      .createQueryBuilder()
      .update(DerivedExtractionArtifactEntity)
      .set({ deletionStatus: "deleting" })
      .where("imported_document_id = :importId", { importId })
      .andWhere("owner_user_id = :ownerUserId", { ownerUserId })
      .andWhere("contains_source_reconstructing_data = true")
      .andWhere("deletion_status <> 'deleted'")
      .execute();

    return {
      kind: "claimed",
      storageKeys: sourceReconstructingStorageKeys(
        document.storageKey ?? undefined,
        artifacts.map(mapDerivedArtifact),
      ),
    };
  }

  async completeSourceDeletion(
    importId: string,
    ownerUserId: string,
    deletedAt: Date,
    manager: EntityManager,
  ): Promise<void> {
    const documentResult = await manager.update(
      ImportedDocumentEntity,
      { id: importId, ownerUserId },
      {
        storageKey: null,
        deletionStatus: "deleted",
        deletedAt,
      },
    );
    if (documentResult.affected !== 1) throw new Error("import_not_found");

    await manager
      .createQueryBuilder()
      .update(DerivedExtractionArtifactEntity)
      .set({ deletionStatus: "deleted", deletedAt })
      .where("imported_document_id = :importId", { importId })
      .andWhere("owner_user_id = :ownerUserId", { ownerUserId })
      .andWhere("contains_source_reconstructing_data = true")
      .execute();

    const draft = await manager.findOneBy(ImportDraftEntity, {
      importedDocumentId: importId,
      ownerUserId,
    });
    if (draft !== null) {
      const minimal = {
        kind: "minimal",
        label: "imported_from_initial_resume",
        confirmedByUser: true,
        sourceDeletedAt: deletedAt.toISOString(),
      };
      await manager.query(
        `UPDATE extracted_fields
         SET source_location = $1::jsonb,
             source_status = CASE WHEN source_status = 'explicit_source'
               THEN 'source_deleted_minimal_provenance' ELSE source_status END
         WHERE import_draft_id = $2 AND owner_user_id = $3
           AND (source_status = 'explicit_source'
             OR source_location->>'kind' IN ('pdf', 'docx', 'semantic'))`,
        [JSON.stringify(minimal), draft.id, ownerUserId],
      );

      const resume = await this.findStructuredResumeBySourceDraftAndOwner(
        draft.id,
        ownerUserId,
        manager,
      );
      if (resume !== null) {
        await this.replaceStructuredResume(
          {
            ...reduceStructuredResumeSourceProvenance(resume, deletedAt),
            updatedAt: deletedAt,
          },
          resume.updatedAt,
          manager,
        );
      }
    }

    await manager.update(
      DeletionJobEntity,
      { importedDocumentId: importId, ownerUserId },
      {
        status: "completed",
        completedAt: deletedAt,
        verificationStatus: "verified",
      },
    );
  }

  async failSourceDeletion(
    importId: string,
    ownerUserId: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.update(
      ImportedDocumentEntity,
      { id: importId, ownerUserId },
      { deletionStatus: "failed" },
    );
    await manager
      .createQueryBuilder()
      .update(DerivedExtractionArtifactEntity)
      .set({ deletionStatus: "failed" })
      .where("imported_document_id = :importId", { importId })
      .andWhere("owner_user_id = :ownerUserId", { ownerUserId })
      .andWhere("contains_source_reconstructing_data = true")
      .andWhere("deletion_status <> 'deleted'")
      .execute();
    await manager.update(
      DeletionJobEntity,
      { importedDocumentId: importId, ownerUserId },
      { status: "failed", verificationStatus: "failed" },
    );
  }

  async findImportIdByStructuredResumeAndOwner(
    structuredResumeId: string,
    ownerUserId: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const row = await this.manager(manager)
      .createQueryBuilder(StructuredResumeEntity, "resume")
      .innerJoin(
        ImportDraftEntity,
        "draft",
        "draft.id = resume.source_import_draft_id",
      )
      .select("draft.imported_document_id", "importId")
      .where("resume.id = :structuredResumeId", { structuredResumeId })
      .andWhere("resume.owner_user_id = :ownerUserId", { ownerUserId })
      .andWhere("draft.owner_user_id = :ownerUserId", { ownerUserId })
      .getRawOne<{ readonly importId: string }>();
    return row?.importId ?? null;
  }

  async createManualDraft(
    input: Parameters<ManualResumeDraftRepository["createManualDraft"]>[0],
    manager?: EntityManager,
  ): Promise<ManualStructuredResumeDraft> {
    const entity = await this.manager(manager).save(
      ManualStructuredResumeDraftEntity,
      manualDraftEntity(input.draft, input.creationKey),
    );
    return mapManualStructuredResumeDraft(entity);
  }

  async findManualDraftByOwner(
    draftId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ManualStructuredResumeDraft | null> {
    const entity = await this.manager(manager).findOneBy(
      ManualStructuredResumeDraftEntity,
      { id: draftId, ownerUserId: userId },
    );
    return entity === null ? null : mapManualStructuredResumeDraft(entity);
  }

  async findManualDraftByCreationKey(
    creationKey: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ManualStructuredResumeDraft | null> {
    const entity = await this.manager(manager).findOneBy(
      ManualStructuredResumeDraftEntity,
      { creationKey, ownerUserId: userId },
    );
    return entity === null ? null : mapManualStructuredResumeDraft(entity);
  }

  async listManualDraftsByOwner(
    userId: string,
    manager?: EntityManager,
  ): Promise<readonly ManualStructuredResumeDraft[]> {
    const entities = await this.manager(manager).find(
      ManualStructuredResumeDraftEntity,
      { where: { ownerUserId: userId }, order: { updatedAt: "DESC" } },
    );
    return entities
      .filter(
        (entity) => entity.deletedAt === null && entity.status === "editing",
      )
      .map(mapManualStructuredResumeDraft);
  }

  async saveManualDraft(
    draft: ManualStructuredResumeDraft,
    manager?: EntityManager,
  ): Promise<ManualStructuredResumeDraft> {
    const scoped = this.manager(manager);
    const result = await scoped.update(
      ManualStructuredResumeDraftEntity,
      { id: draft.id, ownerUserId: draft.ownerUserId },
      {
        source: draft.source,
        status: draft.status,
        content: draft.content,
        updatedAt: draft.updatedAt,
        confirmedAt: draft.confirmedAt ?? null,
        deletedAt: draft.deletedAt ?? null,
      },
    );
    if (result.affected !== 1) {
      return Promise.reject(new Error("manual_draft_not_found"));
    }
    const entity = await scoped.findOneByOrFail(
      ManualStructuredResumeDraftEntity,
      { id: draft.id, ownerUserId: draft.ownerUserId },
    );
    return mapManualStructuredResumeDraft(entity);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const driverError = (error as { driverError?: { code?: unknown } })
    .driverError;
  return driverError?.code === "23505";
}
