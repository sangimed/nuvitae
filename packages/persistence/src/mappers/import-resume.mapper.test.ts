import { describe, expect, it } from "vitest";
import {
  ExtractedFieldEntity,
  ImportedDocumentEntity,
  WorkExperienceEntity,
  WorkExperienceRoleEntity,
} from "../entities/import-resume.entities.js";
import {
  mapExtractedField,
  mapImportedDocument,
  mapStructuredResume,
  PersistenceMapperError,
} from "./import-resume.mapper.js";
import { StructuredResumeEntity } from "../entities/import-resume.entities.js";

describe("import resume persistence mappers", () => {
  it("preserves optional imported-document values without entity leakage", () => {
    const entity = Object.assign(new ImportedDocumentEntity(), {
      id: "00000000-0000-4000-8000-000000000001",
      ownerUserId: "00000000-0000-4000-8000-000000000002",
      visibleFilename: "resume.pdf",
      contentType: "application/pdf",
      fileExtension: "pdf",
      sizeBytes: "128",
      renderedPageCount: null,
      detectedLanguage: null,
      storageKey: null,
      uploadStatus: "uploaded",
      validationStatus: "accepted",
      processingStatus: "ready_for_review",
      deletionStatus: "not_scheduled",
      createdAt: new Date("2026-07-28T00:00:00Z"),
      retentionExpiresAt: new Date("2026-08-04T00:00:00Z"),
      deletedAt: null,
    });

    const mapped = mapImportedDocument(entity);
    expect(mapped).not.toBeInstanceOf(ImportedDocumentEntity);
    expect(mapped).not.toHaveProperty("storageKey");
    expect(mapped.sizeBytes).toBe(128);
  });

  it("keeps an ongoing role distinct and does not invent an end date", () => {
    const resume = Object.assign(new StructuredResumeEntity(), {
      id: "00000000-0000-4000-8000-000000000010",
      ownerUserId: "00000000-0000-4000-8000-000000000002",
      sourceImportDraftId: null,
      provenanceLabel: "manual_entry",
      confirmationStatus: "confirmed",
      createdAt: new Date("2026-07-28T00:00:00Z"),
      updatedAt: new Date("2026-07-28T00:00:00Z"),
      deletedAt: null,
    });
    const role = Object.assign(new WorkExperienceRoleEntity(), {
      id: "00000000-0000-4000-8000-000000000012",
      workExperienceId: "00000000-0000-4000-8000-000000000011",
      structuredResumeId: resume.id,
      position: 0,
      title: "Engineer",
      location: null,
      startDate: { year: 2024, precision: "year" },
      endDate: null,
      isOngoing: true,
      sourceStatus: "explicit_source",
      reviewStatus: "confirmed",
      inferenceStatus: "not_inferred",
    });
    const mapped = mapStructuredResume({
      resume,
      texts: [],
      workExperiences: [
        Object.assign(new WorkExperienceEntity(), {
          id: role.workExperienceId,
          structuredResumeId: resume.id,
          ownerUserId: resume.ownerUserId,
          position: 0,
          employerName: "Synthetic Employer",
          employerLocation: null,
          reviewStatus: "confirmed",
          inferenceStatus: "not_inferred",
        }),
      ],
      roles: [role],
      roleDetails: [],
      items: [],
    });
    expect(mapped.content.workExperiences[0]?.roles[0]).toMatchObject({
      isOngoing: true,
    });
    expect(mapped.content.workExperiences[0]?.roles[0]).not.toHaveProperty(
      "endDate",
    );
  });

  it("raises a typed privacy-safe error for invalid numeric persistence data", () => {
    expect(() =>
      mapImportedDocument(
        Object.assign(new ImportedDocumentEntity(), {
          id: "record-id",
          sizeBytes: "NaN",
        }),
      ),
    ).toThrow(PersistenceMapperError);
  });

  it("preserves PDF and DOCX provenance shapes", () => {
    const base = {
      id: "60000000-0000-4000-8000-000000000001",
      importDraftId: "40000000-0000-4000-8000-000000000001",
      ownerUserId: "10000000-0000-4000-8000-000000000001",
      position: 0,
      section: "headline",
      fieldPath: "headline",
      value: { kind: "text", value: "Synthetic" },
      normalizedValue: null,
      sourceStatus: "explicit_source",
      confidenceStatus: "high",
      inferenceStatus: "not_inferred",
      reviewStatus: "confirmed",
      warningId: null,
      createdAt: new Date("2026-07-28T00:00:00Z"),
      updatedAt: new Date("2026-07-28T00:00:00Z"),
    } as const;
    const pdf = Object.assign(new ExtractedFieldEntity(), {
      ...base,
      sourceLocation: {
        kind: "pdf",
        pageNumber: 1,
        textItemIndex: 0,
        boundingBox: { x: 1, y: 2, width: 3, height: 4, unit: "pdf_point" },
      },
    });
    const docx = Object.assign(new ExtractedFieldEntity(), {
      ...base,
      id: "60000000-0000-4000-8000-000000000002",
      sourceLocation: {
        kind: "docx",
        packagePart: "word/document.xml",
        paragraphIndex: 0,
        runIndex: 1,
        characterOffsetStart: 2,
        characterOffsetEnd: 8,
      },
    });
    expect(mapExtractedField(pdf).sourceLocation?.kind).toBe("pdf");
    expect(mapExtractedField(docx).sourceLocation?.kind).toBe("docx");
  });
});
