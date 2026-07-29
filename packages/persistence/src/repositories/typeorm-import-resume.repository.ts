import { randomUUID } from "node:crypto";
import type {
  ImportDraft,
  ImportedDocument,
  SourcedText,
  StructuredResume,
} from "@nuvitae/domain";
import { DataSource, EntityManager } from "typeorm";
import {
  DeletionJobEntity,
  DerivedExtractionArtifactEntity,
  ExtractedFieldEntity,
  ImportDraftEntity,
  ImportedDocumentEntity,
  ImportWarningEntity,
  StructuredResumeEntity,
  StructuredResumeItemEntity,
  StructuredResumeTextEntity,
  WorkExperienceEntity,
  WorkExperienceRoleEntity,
  WorkRoleDetailEntity,
} from "../entities/import-resume.entities.js";
import {
  mapDeletionJob,
  mapDerivedArtifact,
  mapImportDraft,
  mapImportedDocument,
  mapStructuredResume,
} from "../mappers/import-resume.mapper.js";
import type {
  ImportAggregate,
  ImportResumeRepository,
  PersistenceTransactionRunner,
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
    createdAt: value.createdAt,
    lastReviewedAt: value.lastReviewedAt ?? null,
    retentionExpiresAt: value.retentionExpiresAt,
    confirmedAt: value.confirmedAt ?? null,
    discardedAt: value.discardedAt ?? null,
    expiredAt: value.expiredAt ?? null,
  });
}

export class TypeOrmImportResumeRepository
  implements ImportResumeRepository, PersistenceTransactionRunner
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
}
