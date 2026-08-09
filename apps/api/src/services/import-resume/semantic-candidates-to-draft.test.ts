import { describe, expect, it } from "vitest";
import type {
  NuvitaeSemanticExtractionResponse,
  SemanticEvidence,
  SemanticValue,
} from "@nuvitae/contracts";
import { buildExtractionDraft, type ImportedDocument } from "@nuvitae/domain";
import { mapSemanticCandidates } from "./semantic-candidates-to-draft.js";

const ownerUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const importId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = new Date("2026-08-01T09:30:00.000Z");
const fragmentHash = "a".repeat(64);

function document(): ImportedDocument {
  return {
    id: importId,
    ownerUserId,
    visibleFilename: "resume.pdf",
    contentType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes: 42,
    storageKey: "users/a/imports/b/source/c",
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "queued",
    deletionStatus: "not_scheduled",
    createdAt: now,
    retentionExpiresAt: new Date("2026-08-08T09:30:00.000Z"),
    detectedLanguage: "english",
  };
}

function evidence(overrides: Partial<SemanticEvidence> = {}): SemanticEvidence {
  return {
    line: 1,
    start: 0,
    end: 12,
    fragmentHash,
    fragmentId: "fragment-1",
    ...overrides,
  };
}

function value(
  text: string,
  overrides: Partial<SemanticValue> = {},
): SemanticValue {
  return {
    value: text,
    normalizedValue: null,
    evidence: [evidence({ end: text.length })],
    classification: "explicit",
    confidence: "high",
    ...overrides,
  };
}

function baseResponse(): NuvitaeSemanticExtractionResponse {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v1",
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [evidence()],
    },
    sections: {
      contact: {
        fullName: null,
        email: null,
        phone: null,
        location: null,
        website: null,
      },
      headline: null,
      summary: null,
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

function fullResponse(): NuvitaeSemanticExtractionResponse {
  const response = baseResponse();
  response.sections.contact = {
    fullName: value("Ada Lovelace"),
    email: value("ada@example.test"),
    phone: null,
    location: null,
    website: null,
  };
  response.sections.headline = value("Analytical Engineer");
  response.sections.summary = value("Engineer with a focus on computation.");
  response.sections.workExperience = [
    {
      candidateId: "work-1",
      employerName: value("Acme Studio"),
      employerLocation: null,
      roles: [
        {
          candidateId: "role-1",
          title: value("Product Designer"),
          location: null,
          startDate: value("2019"),
          endDate: value("2022"),
          isOngoing: false,
          responsibilities: [value("Led design reviews")],
          achievements: [],
        },
      ],
    },
  ];
  response.sections.education = [
    {
      candidateId: "edu-1",
      institution: value("Example University"),
      degree: value("BSc"),
      fieldOfStudy: null,
      startDate: null,
      endDate: null,
      location: null,
      details: [],
    },
  ];
  response.sections.skills = [
    { candidateId: "skill-1", name: value("TypeScript"), category: null },
  ];
  response.sections.languages = [
    {
      candidateId: "language-1",
      name: value("English"),
      proficiency: value("Native"),
    },
  ];
  response.sections.projects = [
    {
      candidateId: "project-1",
      name: value("Resume Parser"),
      description: null,
      technologies: [],
      links: [],
    },
  ];
  response.sections.certifications = [
    {
      candidateId: "cert-1",
      name: value("AWS Certified"),
      issuer: null,
      date: null,
    },
  ];
  response.sections.professionalLinks = [value("https://example.test")];
  response.relationships = [
    {
      candidateId: "relationship-1",
      relationshipType: "role_belongs_to_employer",
      fromCandidateId: "role-1",
      toCandidateId: "work-1",
      evidence: [evidence()],
      confidence: "high",
    },
  ];
  return response;
}

describe("mapSemanticCandidates (T172)", () => {
  it("generates deterministic application IDs when the provider omits candidate IDs", () => {
    const response = baseResponse();
    response.sections.education = [
      {
        institution: value("Example University"),
        degree: value("BSc"),
        fieldOfStudy: null,
        startDate: null,
        endDate: null,
        location: null,
        details: [],
      },
    ];
    response.sections.skills = [
      { name: value("TypeScript"), category: null },
      { name: value("PostgreSQL"), category: null },
    ];
    response.sections.languages = [
      { name: value("French"), proficiency: null },
    ];

    const result = mapSemanticCandidates({
      response,
      document: document(),
    });

    expect(result.candidateIdentities).toEqual({
      "education.0.institution": `candidate-${importId}-education-0`,
      "education.0.credential": `candidate-${importId}-education-0`,
      "skills.0.name": `candidate-${importId}-skills-0`,
      "skills.1.name": `candidate-${importId}-skills-1`,
      "languages.0.name": `candidate-${importId}-languages-0`,
    });
    expect(
      result.evidence
        .filter((item) => item.candidateId !== undefined)
        .map((item) => item.candidateId),
    ).toEqual([
      `candidate-${importId}-education-0`,
      `candidate-${importId}-education-0`,
      `candidate-${importId}-skills-0`,
      `candidate-${importId}-skills-1`,
      `candidate-${importId}-languages-0`,
    ]);
    expect(
      new Set(
        result.evidence
          .map((item) => item.candidateId)
          .filter((item): item is string => item !== undefined),
      ).size,
    ).toBe(4);
  });

  it("does not let provider-supplied IDs influence generated application identity", () => {
    const first = baseResponse();
    first.sections.skills = [
      {
        candidateId: "provider-one",
        name: value("TypeScript"),
        category: null,
      },
    ];
    const second = structuredClone(first);
    second.sections.skills[0]!.candidateId = "attacker-controlled";

    const firstResult = mapSemanticCandidates({
      response: first,
      document: document(),
    });
    const secondResult = mapSemanticCandidates({
      response: second,
      document: document(),
    });

    expect(firstResult.candidateIdentities).toEqual(
      secondResult.candidateIdentities,
    );
    expect(firstResult.candidateIdentities["skills.0.name"]).toBe(
      `candidate-${importId}-skills-0`,
    );
  });

  it("maps supported basics, work, education, skills, languages, certifications, projects, links, and relationships into unconfirmed candidates", () => {
    const result = mapSemanticCandidates({
      response: fullResponse(),
      document: document(),
    });
    const paths = result.fields.map((field) => field.fieldPath);
    expect(paths).toEqual([
      "contact.full_name",
      "contact.email",
      "headline",
      "summary",
      "work_experience.0.roles.0.employer",
      "work_experience.0.roles.0.title",
      "work_experience.0.roles.0.date_range",
      "work_experience.0.roles.0.responsibility",
      "education.0.institution",
      "education.0.credential",
      "skills.0.name",
      "languages.0.name",
      "projects.0.name",
      "certifications.0.name",
      "professional_links.url",
    ]);
    for (const field of result.fields) {
      expect(field.inferenceStatus).toBe("not_inferred");
      expect(field.confidence).toBe("high");
      expect(field.sourceLocation).toMatchObject({
        kind: "minimal",
        label: "imported_from_initial_resume",
        documentId: importId,
      });
    }
    expect(result.fields.map((field) => field.sourceOrder)).toEqual(
      result.fields.map((_, index) => index),
    );
    expect(
      result.fields.find(
        (field) => field.fieldPath === "work_experience.0.roles.0.date_range",
      )?.value,
    ).toEqual({
      kind: "date_range",
      startDate: { year: 2019, precision: "year" },
      endDate: { year: 2022, precision: "year" },
      isOngoing: false,
    });
    expect(
      result.fields.find((field) => field.fieldPath === "languages.0.name")
        ?.value,
    ).toEqual({
      kind: "language",
      name: "English",
      proficiency: "Native",
    });
    expect(result.relationships).toEqual([
      expect.objectContaining({
        candidateId: `candidate-${importId}-relationships-0`,
        fromCandidateId: `candidate-${importId}-work_experience-0-roles-0`,
        toCandidateId: `candidate-${importId}-work_experience-0`,
        state: "valid",
      }),
    ]);
    expect(result.duplicateSuppressed).toBe(0);
    expect(result.rejected).toEqual([]);
    expect(result.candidateIdentities["skills.0.name"]).toBe(
      `candidate-${importId}-skills-0`,
    );
    expect(result.candidateIdentities["work_experience.0.roles.0.title"]).toBe(
      `candidate-${importId}-work_experience-0-roles-0`,
    );
  });

  it("marks inferred and low-confidence values as review-required without auto-confirming", () => {
    const response = baseResponse();
    response.sections.skills = [
      {
        candidateId: "skill-1",
        name: value("Leadership", { classification: "inferred" }),
        category: null,
      },
      {
        candidateId: "skill-2",
        name: value("Excel", { confidence: "low" }),
        category: null,
      },
    ];
    const result = mapSemanticCandidates({
      response,
      document: document(),
    });
    const inferred = result.fields.find(
      (field) => field.fieldPath === "skills.0.name",
    );
    const lowConfidence = result.fields.find(
      (field) => field.fieldPath === "skills.1.name",
    );
    expect(inferred?.inferenceStatus).toBe("inferred_needs_review");
    expect(lowConfidence?.confidence).toBe("low");
    expect(result.reviewRequired).toEqual([
      {
        section: "skills",
        fieldPath: "skills.0.name",
        reasons: ["inferred"],
      },
      {
        section: "skills",
        fieldPath: "skills.1.name",
        reasons: ["low_confidence"],
      },
    ]);

    const draft = buildExtractionDraft({
      importedDocument: document(),
      fields: result.fields,
      warnings: [],
      missingOrUnprocessedSections: [],
      ids: {
        draftId: () => "draft-1",
        fieldId: () => "field-1",
        warningId: () => "warning-1",
      },
      now,
    });
    expect(draft.draft).toBeDefined();
    expect(draft.draft?.fields).toHaveLength(1);
    expect(draft.draft?.fields[0]?.reviewStatus).toBe("unreviewed");
    expect(draft.draft?.fields[0]?.fieldPath).toBe("skills.1.name");
  });

  it("rejects evidence-free candidates as unusable", () => {
    const response = baseResponse();
    response.sections.contact.fullName = value("Ada Lovelace", {
      evidence: [],
    });
    const result = mapSemanticCandidates({
      response,
      document: document(),
    });
    expect(result.fields).toEqual([]);
    expect(result.rejected).toEqual([
      {
        section: "contact",
        fieldPath: "contact.full_name",
        reason: "missing_evidence",
      },
    ]);
  });

  it("preserves supported education dates and rejects only unsupported details", () => {
    const response = baseResponse();
    response.sections.education = [
      {
        candidateId: "edu-1",
        institution: value("Example University"),
        degree: null,
        fieldOfStudy: null,
        startDate: null,
        endDate: value("2020"),
        location: value("Paris"),
        details: [value("Dean's list")],
      },
    ];
    response.sections.projects = [
      {
        candidateId: "project-1",
        name: value("Parser"),
        description: null,
        technologies: [value("TypeScript")],
        links: [value("https://example.test")],
      },
    ];
    response.sections.certifications = [
      {
        candidateId: "cert-1",
        name: value("AWS"),
        issuer: null,
        date: value("2021"),
      },
    ];
    const result = mapSemanticCandidates({
      response,
      document: document(),
    });
    expect(result.fields.map((field) => field.fieldPath)).toEqual([
      "education.0.institution",
      "education.0.end_date",
      "education.0.location",
      "projects.0.name",
      "certifications.0.name",
    ]);
    expect(result.rejected).toEqual([
      {
        section: "education",
        fieldPath: "education.0.details",
        reason: "unsupported_field",
      },
      {
        section: "projects",
        fieldPath: "projects.0.technologies",
        reason: "unsupported_field",
      },
      {
        section: "projects",
        fieldPath: "projects.0.links",
        reason: "unsupported_field",
      },
      {
        section: "certifications",
        fieldPath: "certifications.0.date",
        reason: "unsupported_field",
      },
    ]);
  });

  it("rejects invalid relationships and preserves valid ones", () => {
    const response = baseResponse();
    response.sections.workExperience = [
      {
        candidateId: "work-1",
        employerName: value("Acme"),
        employerLocation: null,
        roles: [
          {
            candidateId: "role-1",
            title: value("Designer"),
            location: null,
            startDate: null,
            endDate: null,
            isOngoing: true,
            responsibilities: [],
            achievements: [],
          },
        ],
      },
    ];
    response.relationships = [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [evidence()],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "ghost-role",
        toCandidateId: "work-1",
        evidence: [evidence()],
        confidence: "high",
      },
      {
        candidateId: "relationship-3",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "ghost-work",
        evidence: [evidence()],
        confidence: "high",
      },
    ];
    const result = mapSemanticCandidates({
      response,
      document: document(),
    });
    expect(result.relationships.map((item) => item.state)).toEqual([
      "valid",
      "invalid",
      "invalid",
    ]);
    expect(result.relationships[1]).toMatchObject({
      reason: "unknown_candidate",
    });
    expect(result.relationships[2]).toMatchObject({
      reason: "unknown_candidate",
    });
  });

  it("rejects relationship type mismatches deterministically", () => {
    const response = baseResponse();
    response.sections.workExperience = [
      {
        candidateId: "work-1",
        employerName: value("Acme"),
        employerLocation: null,
        roles: [
          {
            candidateId: "role-1",
            title: value("Designer"),
            location: null,
            startDate: null,
            endDate: null,
            isOngoing: true,
            responsibilities: [],
            achievements: [],
          },
        ],
      },
    ];
    response.sections.skills = [
      { candidateId: "skill-1", name: value("TypeScript"), category: null },
    ];
    response.relationships = [
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "skill-1",
        toCandidateId: "work-1",
        evidence: [evidence()],
        confidence: "high",
      },
      {
        candidateId: "relationship-2",
        relationshipType: "link_belongs_to_project",
        fromCandidateId: "skill-1",
        toCandidateId: "work-1",
        evidence: [evidence()],
        confidence: "high",
      },
    ];
    const result = mapSemanticCandidates({
      response,
      document: document(),
    });
    expect(result.relationships).toEqual([
      expect.objectContaining({
        candidateId: `candidate-${importId}-relationships-0`,
        state: "invalid",
        reason: "relationship_type_mismatch",
      }),
      expect.objectContaining({
        candidateId: `candidate-${importId}-relationships-1`,
        state: "invalid",
        reason: "relationship_type_mismatch",
      }),
    ]);
  });

  it("deduplicates exact duplicate leaf candidates deterministically", () => {
    const response = baseResponse();
    response.sections.skills = [
      { candidateId: "skill-1", name: value("TypeScript"), category: null },
      { candidateId: "skill-2", name: value("TypeScript"), category: null },
      { candidateId: "skill-3", name: value("Python"), category: null },
    ];
    const first = mapSemanticCandidates({
      response,
      document: document(),
    });
    const second = mapSemanticCandidates({
      response,
      document: document(),
    });
    expect(first.duplicateSuppressed).toBe(1);
    expect(first.duplicates).toEqual([
      {
        section: "skills",
        keptFieldPath: "skills.0.name",
        duplicateFieldPath: "skills.1.name",
        value: { kind: "text", value: "TypeScript" },
      },
    ]);
    expect(first.fields.map((field) => field.fieldPath)).toEqual([
      "skills.0.name",
      "skills.2.name",
    ]);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("preserves source provenance through canonical evidence references", () => {
    const response = baseResponse();
    const skillValue = value("TypeScript", {
      evidence: [
        evidence({ line: 3, start: 10, end: 20, fragmentId: "fragment-2" }),
      ],
    });
    response.sections.skills = [
      { candidateId: "skill-1", name: skillValue, category: null },
    ];
    const result = mapSemanticCandidates({
      response,
      document: document(),
    });
    expect(result.evidence).toEqual([
      {
        fieldPath: "skills.0.name",
        candidateId: `candidate-${importId}-skills-0`,
        line: 3,
        start: 10,
        end: 20,
        fragmentHash,
        fragmentId: "fragment-2",
        classification: "explicit",
        confidence: "high",
      },
    ]);
  });

  it("omits explicitly absent null values and empty collections", () => {
    const result = mapSemanticCandidates({
      response: baseResponse(),
      document: document(),
    });
    expect(result.fields).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("handles optional-detail variants without downgrading explicit facts", () => {
    const response = baseResponse();
    response.sections.headline = value("Platform Architect");
    response.sections.education = [
      {
        candidateId: "education-year-only",
        institution: value("Northbridge Institute"),
        degree: value("MSc Systems Engineering"),
        fieldOfStudy: null,
        startDate: null,
        endDate: value("2024"),
        location: null,
        details: [],
      },
    ];
    response.sections.skills = [
      {
        candidateId: "skill-one",
        name: value("Rust"),
        category: null,
      },
      {
        candidateId: "skill-two",
        name: value("SQLite"),
        category: null,
      },
    ];
    response.sections.languages = [
      {
        candidateId: "language-one",
        name: value("German"),
        proficiency: null,
      },
    ];

    const result = mapSemanticCandidates({
      response,
      document: document(),
    });

    expect(result.fields.map((field) => field.fieldPath)).toEqual([
      "headline",
      "education.0.institution",
      "education.0.credential",
      "education.0.end_date",
      "skills.0.name",
      "skills.1.name",
      "languages.0.name",
    ]);
    expect(
      result.fields.find((field) => field.fieldPath === "languages.0.name")
        ?.value,
    ).toEqual({ kind: "language", name: "German" });
    expect(result.rejected).toEqual([]);
    expect(result.reviewRequired).toEqual([]);
  });

  it("produces deterministic ordering across repeated mapping runs", () => {
    const response = fullResponse();
    const first = mapSemanticCandidates({ response, document: document() });
    const second = mapSemanticCandidates({ response, document: document() });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
