import type {
  Certification,
  DeletionJob,
  DerivedExtractionArtifact,
  Education,
  ExtractedField,
  FieldReviewStatus,
  FieldSourceStatus,
  ImportDraft,
  ImportedDocument,
  ImportWarning,
  InferenceStatus,
  LanguageSkill,
  ManualStructuredResumeDraft,
  ProfessionalLink,
  Project,
  Skill,
  SourcedText,
  StructuredResume,
  StructuredResumeContent,
  UserCorrection,
  WorkExperience,
  WorkExperienceRole,
} from "@nuvitae/domain";
import { validateManualContent } from "@nuvitae/domain";
import { structuredResumeContentSchema } from "@nuvitae/contracts";
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
  TemporaryContactFieldEntity,
  TemporaryContactPreviewEntity,
  UserCorrectionEntity,
  WorkExperienceEntity,
  WorkExperienceRoleEntity,
  WorkRoleDetailEntity,
} from "../entities/import-resume.entities.js";

export type PersistenceMapperErrorCode =
  | "invalid_numeric_value"
  | "missing_structured_parent"
  | "invalid_structured_section"
  | "invalid_manual_draft_content";

export class PersistenceMapperError extends Error {
  readonly code: PersistenceMapperErrorCode;
  readonly recordId: string;

  constructor(code: PersistenceMapperErrorCode, recordId: string) {
    super(`Persistence mapping failed (${code}) for record ${recordId}.`);
    this.name = "PersistenceMapperError";
    this.code = code;
    this.recordId = recordId;
  }
}

export interface TemporaryContactPreviewRecord {
  readonly id: string;
  readonly importedDocumentId: string;
  readonly ownerUserId: string;
  readonly status: string;
  readonly contactFields: readonly {
    readonly id: string;
    readonly fieldPath: string;
    readonly value: TemporaryContactFieldEntity["value"];
    readonly sourceLocation: TemporaryContactFieldEntity["sourceLocation"];
    readonly confidenceStatus: string;
    readonly reviewStatus: string;
  }[];
  readonly warning: {
    readonly type: string;
    readonly message: string;
    readonly severity: string;
    readonly reviewStatus: string;
  };
  readonly createdAt: Date;
  readonly retentionExpiresAt: Date;
  readonly confirmedForManualTransferAt?: Date;
  readonly deletedAt?: Date;
}

function optional<T>(key: string, value: T | null | undefined) {
  return value === null || value === undefined ? {} : { [key]: value };
}

export function mapManualStructuredResumeDraft(
  entity: ManualStructuredResumeDraftEntity,
): ManualStructuredResumeDraft {
  const parsed = structuredResumeContentSchema.safeParse(entity.content);
  if (!parsed.success) {
    throw new PersistenceMapperError("invalid_manual_draft_content", entity.id);
  }
  const validated = validateManualContent(
    parsed.data as StructuredResumeContent,
  );
  if (!validated.ok) {
    throw new PersistenceMapperError("invalid_manual_draft_content", entity.id);
  }

  return {
    id: entity.id,
    ownerUserId: entity.ownerUserId,
    source: entity.source as ManualStructuredResumeDraft["source"],
    status: entity.status as ManualStructuredResumeDraft["status"],
    content: validated.content,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    ...optional("confirmedAt", entity.confirmedAt),
    ...optional("deletedAt", entity.deletedAt),
  };
}

export function mapImportedDocument(
  entity: ImportedDocumentEntity,
): ImportedDocument {
  const sizeBytes = Number(entity.sizeBytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new PersistenceMapperError("invalid_numeric_value", entity.id);
  }

  return {
    id: entity.id,
    ownerUserId: entity.ownerUserId,
    visibleFilename: entity.visibleFilename,
    contentType: entity.contentType,
    fileExtension: entity.fileExtension as ImportedDocument["fileExtension"],
    sizeBytes,
    ...optional("renderedPageCount", entity.renderedPageCount),
    ...optional(
      "detectedLanguage",
      entity.detectedLanguage as ImportedDocument["detectedLanguage"],
    ),
    ...optional("storageKey", entity.storageKey),
    uploadStatus: entity.uploadStatus as ImportedDocument["uploadStatus"],
    validationStatus:
      entity.validationStatus as ImportedDocument["validationStatus"],
    processingStatus:
      entity.processingStatus as ImportedDocument["processingStatus"],
    deletionStatus: entity.deletionStatus as ImportedDocument["deletionStatus"],
    createdAt: entity.createdAt,
    retentionExpiresAt: entity.retentionExpiresAt,
    ...optional("deletedAt", entity.deletedAt),
  };
}

export function mapDerivedArtifact(
  entity: DerivedExtractionArtifactEntity,
): DerivedExtractionArtifact {
  return {
    id: entity.id,
    importedDocumentId: entity.importedDocumentId,
    ownerUserId: entity.ownerUserId,
    artifactType:
      entity.artifactType as DerivedExtractionArtifact["artifactType"],
    storageKey: entity.storageKey,
    containsSourceReconstructingData: entity.containsSourceReconstructingData,
    deletionStatus:
      entity.deletionStatus as DerivedExtractionArtifact["deletionStatus"],
    createdAt: entity.createdAt,
    retentionExpiresAt: entity.retentionExpiresAt,
    ...optional("deletedAt", entity.deletedAt),
  };
}

export function mapExtractedField(
  entity: ExtractedFieldEntity,
): ExtractedField {
  return {
    id: entity.id,
    importDraftId: entity.importDraftId,
    section: entity.section as ExtractedField["section"],
    fieldPath: entity.fieldPath,
    value: entity.value,
    ...optional("normalizedValue", entity.normalizedValue),
    sourceStatus: entity.sourceStatus as ExtractedField["sourceStatus"],
    ...optional("sourceLocation", entity.sourceLocation),
    confidenceStatus:
      entity.confidenceStatus as ExtractedField["confidenceStatus"],
    inferenceStatus:
      entity.inferenceStatus as ExtractedField["inferenceStatus"],
    reviewStatus: entity.reviewStatus as ExtractedField["reviewStatus"],
    ...optional("warningId", entity.warningId),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export function mapImportWarning(entity: ImportWarningEntity): ImportWarning {
  return {
    id: entity.id,
    importDraftId: entity.importDraftId,
    warningType: entity.warningType as ImportWarning["warningType"],
    section: entity.section as ImportWarning["section"],
    ...optional("fieldPath", entity.fieldPath),
    message: entity.message,
    severity: entity.severity as ImportWarning["severity"],
    reviewStatus: entity.reviewStatus as ImportWarning["reviewStatus"],
    requiresResolution: entity.requiresResolution,
    createdAt: entity.createdAt,
    ...optional("resolvedAt", entity.resolvedAt),
  };
}

export function mapImportDraft(
  entity: ImportDraftEntity,
  fields: readonly ExtractedFieldEntity[],
  warnings: readonly ImportWarningEntity[],
): ImportDraft {
  return {
    id: entity.id,
    importedDocumentId: entity.importedDocumentId,
    ownerUserId: entity.ownerUserId,
    status: entity.status as ImportDraft["status"],
    reviewRevision: entity.reviewRevision,
    fields: [...fields]
      .sort((left, right) => left.position - right.position)
      .map(mapExtractedField),
    warnings: warnings.map(mapImportWarning),
    createdAt: entity.createdAt,
    ...optional("lastReviewedAt", entity.lastReviewedAt),
    retentionExpiresAt: entity.retentionExpiresAt,
    ...optional("confirmedAt", entity.confirmedAt),
    ...optional("discardedAt", entity.discardedAt),
    ...optional("expiredAt", entity.expiredAt),
  };
}

function mapSourcedText(
  value: string,
  sourceStatus: string,
  sourceLocation: SourcedText["sourceLocation"] | null,
  confidenceStatus: string,
  inferenceStatus: string,
): SourcedText {
  return {
    value,
    sourceStatus: sourceStatus as FieldSourceStatus,
    ...optional("sourceLocation", sourceLocation),
    confidenceStatus: confidenceStatus as SourcedText["confidenceStatus"],
    inferenceStatus: inferenceStatus as InferenceStatus,
  };
}

export interface StructuredResumeRows {
  readonly resume: StructuredResumeEntity;
  readonly texts: readonly StructuredResumeTextEntity[];
  readonly workExperiences: readonly WorkExperienceEntity[];
  readonly roles: readonly WorkExperienceRoleEntity[];
  readonly roleDetails: readonly WorkRoleDetailEntity[];
  readonly items: readonly StructuredResumeItemEntity[];
}

function mapWorkExperience(
  entity: WorkExperienceEntity,
  rows: StructuredResumeRows,
): WorkExperience {
  const roles = rows.roles
    .filter((role) => role.workExperienceId === entity.id)
    .sort((left, right) => left.position - right.position)
    .map((role): WorkExperienceRole => {
      const details = rows.roleDetails.filter(
        (detail) => detail.workRoleId === role.id,
      );
      const mapDetail = (detail: WorkRoleDetailEntity) =>
        mapSourcedText(
          detail.value,
          detail.sourceStatus,
          detail.sourceLocation,
          detail.confidenceStatus,
          detail.inferenceStatus,
        );
      return {
        id: role.id,
        title: role.title,
        ...optional("location", role.location),
        ...optional("startDate", role.startDate),
        ...optional("endDate", role.endDate),
        isOngoing: role.isOngoing,
        responsibilities: details
          .filter((detail) => detail.kind === "responsibility")
          .sort((left, right) => left.position - right.position)
          .map(mapDetail),
        achievements: details
          .filter((detail) => detail.kind === "achievement")
          .sort((left, right) => left.position - right.position)
          .map(mapDetail),
        sourceStatus: role.sourceStatus as FieldSourceStatus,
        reviewStatus: role.reviewStatus as FieldReviewStatus,
        inferenceStatus: role.inferenceStatus as InferenceStatus,
      };
    });

  return {
    id: entity.id,
    employerName: entity.employerName,
    ...optional("employerLocation", entity.employerLocation),
    roles,
    reviewStatus: entity.reviewStatus as FieldReviewStatus,
    inferenceStatus: entity.inferenceStatus as InferenceStatus,
  };
}

function itemText(item: StructuredResumeItemEntity): SourcedText {
  return mapSourcedText(
    item.primaryValue,
    item.sourceStatus,
    item.sourceLocation,
    item.confidenceStatus,
    item.inferenceStatus,
  );
}

function mapItems(items: readonly StructuredResumeItemEntity[]) {
  const ordered = [...items].sort(
    (left, right) => left.position - right.position,
  );
  const education: Education[] = [];
  const skills: Skill[] = [];
  const languages: LanguageSkill[] = [];
  const projects: Project[] = [];
  const certifications: Certification[] = [];
  const professionalLinks: ProfessionalLink[] = [];

  for (const item of ordered) {
    const reviewStatus = item.reviewStatus as FieldReviewStatus;
    switch (item.section) {
      case "education":
        education.push({
          id: item.id,
          institution: itemText(item),
          ...optional(
            "credential",
            item.secondaryValue === null
              ? null
              : mapSourcedText(
                  item.secondaryValue,
                  item.sourceStatus,
                  item.sourceLocation,
                  item.confidenceStatus,
                  item.inferenceStatus,
                ),
          ),
          ...optional(
            "fieldOfStudy",
            item.tertiaryValue === null
              ? null
              : mapSourcedText(
                  item.tertiaryValue,
                  item.sourceStatus,
                  item.sourceLocation,
                  item.confidenceStatus,
                  item.inferenceStatus,
                ),
          ),
          ...optional("startDate", item.startDate),
          ...optional("endDate", item.endDate),
          reviewStatus,
        });
        break;
      case "skill":
        skills.push({
          id: item.id,
          name: itemText(item),
          ...optional("category", item.secondaryValue),
          reviewStatus,
        });
        break;
      case "language":
        languages.push({
          id: item.id,
          name: itemText(item),
          ...optional(
            "proficiency",
            item.secondaryValue === null
              ? null
              : mapSourcedText(
                  item.secondaryValue,
                  item.sourceStatus,
                  item.sourceLocation,
                  item.confidenceStatus,
                  item.inferenceStatus,
                ),
          ),
          reviewStatus,
        });
        break;
      case "project": {
        const links = ordered
          .filter(
            (candidate) =>
              candidate.section === "project_link" &&
              candidate.parentItemId === item.id,
          )
          .map(mapProfessionalLink);
        projects.push({
          id: item.id,
          name: itemText(item),
          ...optional(
            "description",
            item.secondaryValue === null
              ? null
              : mapSourcedText(
                  item.secondaryValue,
                  item.sourceStatus,
                  item.sourceLocation,
                  item.confidenceStatus,
                  item.inferenceStatus,
                ),
          ),
          links,
          reviewStatus,
        });
        break;
      }
      case "certification":
        certifications.push({
          id: item.id,
          name: itemText(item),
          ...optional(
            "issuer",
            item.secondaryValue === null
              ? null
              : mapSourcedText(
                  item.secondaryValue,
                  item.sourceStatus,
                  item.sourceLocation,
                  item.confidenceStatus,
                  item.inferenceStatus,
                ),
          ),
          ...optional("issuedAt", item.startDate),
          ...optional("expiresAt", item.endDate),
          reviewStatus,
        });
        break;
      case "professional_link":
        professionalLinks.push(mapProfessionalLink(item));
        break;
      case "project_link":
        break;
      default:
        throw new PersistenceMapperError("invalid_structured_section", item.id);
    }
  }
  return {
    education,
    skills,
    languages,
    projects,
    certifications,
    professionalLinks,
  };
}

function mapProfessionalLink(
  item: StructuredResumeItemEntity,
): ProfessionalLink {
  if (item.url === null) {
    throw new PersistenceMapperError("missing_structured_parent", item.id);
  }
  return {
    id: item.id,
    ...optional("label", item.primaryValue),
    url: mapSourcedText(
      item.url,
      item.sourceStatus,
      item.sourceLocation,
      item.confidenceStatus,
      item.inferenceStatus,
    ),
    reviewStatus: item.reviewStatus as FieldReviewStatus,
  };
}

export function mapStructuredResume(
  rows: StructuredResumeRows,
): StructuredResume {
  const bySection = (section: string) =>
    rows.texts
      .filter((text) => text.section === section)
      .sort((left, right) => left.position - right.position)
      .map((text) =>
        mapSourcedText(
          text.value,
          text.sourceStatus,
          text.sourceLocation,
          text.confidenceStatus,
          text.inferenceStatus,
        ),
      );
  const headline = bySection("headline")[0];
  const summary = bySection("summary")[0];
  const sectionItems = mapItems(rows.items);
  const content: StructuredResumeContent = {
    personal: bySection("personal"),
    contact: bySection("contact"),
    ...optional("headline", headline),
    ...optional("summary", summary),
    workExperiences: [...rows.workExperiences]
      .sort((left, right) => left.position - right.position)
      .map((experience) => mapWorkExperience(experience, rows)),
    ...sectionItems,
  };

  return {
    id: rows.resume.id,
    ownerUserId: rows.resume.ownerUserId,
    ...optional("sourceImportDraftId", rows.resume.sourceImportDraftId),
    provenanceLabel: rows.resume
      .provenanceLabel as StructuredResume["provenanceLabel"],
    confirmationStatus: "confirmed",
    content,
    createdAt: rows.resume.createdAt,
    updatedAt: rows.resume.updatedAt,
    ...optional("deletedAt", rows.resume.deletedAt),
  };
}

export function mapDeletionJob(entity: DeletionJobEntity): DeletionJob {
  return {
    id: entity.id,
    importedDocumentId: entity.importedDocumentId,
    ownerUserId: entity.ownerUserId,
    reason: entity.reason as DeletionJob["reason"],
    status: entity.status as DeletionJob["status"],
    scheduledAt: entity.scheduledAt,
    ...optional("completedAt", entity.completedAt),
    verificationStatus:
      entity.verificationStatus as DeletionJob["verificationStatus"],
    ...optional("verificationSummary", entity.verificationSummary),
  };
}

export function mapTemporaryContactPreview(
  entity: TemporaryContactPreviewEntity,
  fields: readonly TemporaryContactFieldEntity[],
): TemporaryContactPreviewRecord {
  return {
    id: entity.id,
    importedDocumentId: entity.importedDocumentId,
    ownerUserId: entity.ownerUserId,
    status: entity.status,
    contactFields: [...fields]
      .sort((left, right) => left.position - right.position)
      .map((field) => ({
        id: field.id,
        fieldPath: field.fieldPath,
        value: field.value,
        sourceLocation: field.sourceLocation,
        confidenceStatus: field.confidenceStatus,
        reviewStatus: field.reviewStatus,
      })),
    warning: {
      type: entity.warningType,
      message: entity.warningMessage,
      severity: entity.warningSeverity,
      reviewStatus: entity.warningReviewStatus,
    },
    createdAt: entity.createdAt,
    retentionExpiresAt: entity.retentionExpiresAt,
    ...optional(
      "confirmedForManualTransferAt",
      entity.confirmedForManualTransferAt,
    ),
    ...optional("deletedAt", entity.deletedAt),
  };
}

export function mapUserCorrection(
  entity: UserCorrectionEntity,
): UserCorrection {
  return {
    id: entity.id,
    importDraftId: entity.importDraftId,
    targetType: entity.targetType as UserCorrection["targetType"],
    targetId: entity.targetId,
    action: entity.action as UserCorrection["action"],
    ...optional("previousValue", entity.previousValue),
    ...optional("newValue", entity.newValue),
    createdAt: entity.createdAt,
    createdByUserId: entity.createdByUserId,
  };
}
