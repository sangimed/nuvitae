import { describe, expect, it } from "vitest";

import {
  nuvitaeSemanticExtractionResponseSchema,
  nuvitaeSemanticExtractionResponseVersion,
  resumeSemanticParseRequestSchema,
  resumeSemanticParserContractVersion,
  type NuvitaeSemanticExtractionResponse,
  type ResumeSemanticParseRequest,
} from "./semantic-extraction.js";

const hash = "a".repeat(64);

const evidence = {
  line: 1,
  start: 0,
  end: 12,
  fragmentHash: hash,
  fragmentId: "fragment-1",
};

const value = {
  value: "Jane Example",
  normalizedValue: null,
  evidence: [evidence],
  classification: "explicit",
  confidence: "high",
};

function validResponse(): NuvitaeSemanticExtractionResponse {
  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [],
    },
    sections: {
      contact: {
        fullName: value,
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

function validRequest(
  documentFormat: ResumeSemanticParseRequest["documentFormat"],
): ResumeSemanticParseRequest {
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: null,
    correlationId: "import-correlation-1",
    documentFormat,
    languageContext: {
      detectedLanguage: "english",
      confidence: "high",
      textDirection: "ltr",
    },
    normalizedTranscript: {
      text: "Jane Example",
      sha256: hash,
      lineCount: 1,
    },
    sourceFragments: [
      {
        order: 0,
        line: 1,
        text: "Jane Example",
        hash,
        bounds: {
          lineStart: 1,
          lineEnd: 1,
          start: 0,
          end: 12,
        },
      },
    ],
    fragmentHashes: [hash],
    formatMetadata: {
      sourceFormat: documentFormat,
      extractionMode:
        documentFormat === "plain_text" ? "plain_text" : "selectable_text",
      renderedPageCount: documentFormat === "plain_text" ? null : 1,
      parserVersion: "test-parser-v1",
    },
  };
}

describe("semantic parser request contract", () => {
  it.each(["pdf", "docx", "plain_text"] as const)(
    "accepts normalized %s inputs through the same provider-neutral shape",
    (documentFormat) => {
      expect(
        resumeSemanticParseRequestSchema.safeParse(validRequest(documentFormat))
          .success,
      ).toBe(true);
    },
  );

  it("rejects unknown request fields, raw paths, and provider-shaped metadata", () => {
    expect(
      resumeSemanticParseRequestSchema.safeParse({
        ...validRequest("pdf"),
        sourceStorageKey: "private/user/import.pdf",
      }).success,
    ).toBe(false);

    expect(
      resumeSemanticParseRequestSchema.safeParse({
        ...validRequest("pdf"),
        provider: { model: "provider-native" },
      }).success,
    ).toBe(false);
  });
});

describe("versioned Nuvitae semantic extraction response schema", () => {
  it("accepts explicit null scalar fields and empty absent collections", () => {
    const parsed =
      nuvitaeSemanticExtractionResponseSchema.parse(validResponse());

    expect(parsed.sections.contact.email).toBeNull();
    expect(parsed.sections.workExperience).toEqual([]);
    expect(parsed.ambiguityDiagnostics).toEqual([]);
  });

  it("rejects unknown response fields and provider-specific payloads", () => {
    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse({
        ...validResponse(),
        rawProviderPayload: { unsafe: true },
      }).success,
    ).toBe(false);
  });

  it("rejects omitted required nullable properties", () => {
    const candidate = validResponse();
    const contactWithoutEmail: Partial<typeof candidate.sections.contact> = {
      ...candidate.sections.contact,
    };
    delete contactWithoutEmail.email;

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse({
        ...candidate,
        sections: {
          ...candidate.sections,
          contact: contactWithoutEmail,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects null collections", () => {
    const candidate = validResponse();

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse({
        ...candidate,
        sections: {
          ...candidate.sections,
          skills: null,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects model-produced physical provenance fields", () => {
    const candidate = validResponse();

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse({
        ...candidate,
        sections: {
          ...candidate.sections,
          contact: {
            ...candidate.sections.contact,
            fullName: {
              ...value,
              evidence: [{ ...evidence, page: 1 }],
            },
          },
        },
      }).success,
    ).toBe(false);
  });
});

function candidateWithRelationships(relationships: readonly unknown[]) {
  return { ...validResponse(), relationships };
}

function candidateWithFullName(fullName: unknown) {
  return {
    ...validResponse(),
    sections: {
      ...validResponse().sections,
      contact: {
        ...validResponse().sections.contact,
        fullName,
      },
    },
  };
}

describe("response versioning", () => {
  it("accepts only the pinned nuvitae semantic extraction response version", () => {
    const parsed =
      nuvitaeSemanticExtractionResponseSchema.parse(validResponse());
    expect(parsed.schemaVersion).toBe(nuvitaeSemanticExtractionResponseVersion);
  });

  it("rejects unsupported, missing, and non-version response version fields", () => {
    const withoutVersion: Record<string, unknown> = { ...validResponse() };
    delete withoutVersion.schemaVersion;

    for (const schemaVersion of [
      "nuvitae.semantic-extraction.v0",
      "nuvitae.semantic-extraction.v2",
      "2026-07-28",
    ]) {
      expect(
        nuvitaeSemanticExtractionResponseSchema.safeParse({
          ...validResponse(),
          schemaVersion,
        }).success,
      ).toBe(false);
    }
    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(withoutVersion).success,
    ).toBe(false);
  });
});

describe("candidate sections", () => {
  it("accepts populated candidate sections across the response", () => {
    const candidate = {
      ...validResponse(),
      sections: {
        ...validResponse().sections,
        headline: value,
        summary: value,
        contact: {
          ...validResponse().sections.contact,
          fullName: value,
        },
        workExperience: [
          {
            candidateId: "work-1",
            employerName: value,
            employerLocation: value,
            roles: [
              {
                candidateId: "role-1",
                title: value,
                location: value,
                startDate: value,
                endDate: null,
                isOngoing: true,
                responsibilities: [value],
                achievements: [value],
              },
            ],
          },
        ],
        education: [
          {
            candidateId: "education-1",
            institution: value,
            degree: value,
            fieldOfStudy: value,
            startDate: value,
            endDate: value,
            location: value,
            details: [value],
          },
        ],
        skills: [{ candidateId: "skill-1", name: value, category: value }],
        languages: [
          { candidateId: "language-1", name: value, proficiency: value },
        ],
        projects: [
          {
            candidateId: "project-1",
            name: value,
            description: value,
            technologies: [value],
            links: [value],
          },
        ],
        certifications: [
          {
            candidateId: "certification-1",
            name: value,
            issuer: value,
            date: value,
          },
        ],
        professionalLinks: [value],
      },
    };

    const parsed = nuvitaeSemanticExtractionResponseSchema.parse(candidate);
    expect(parsed.sections.workExperience[0]?.roles[0]?.isOngoing).toBe(true);
    expect(parsed.sections.education[0]?.details).toHaveLength(1);
    expect(parsed.sections.professionalLinks).toHaveLength(1);
  });

  it("accepts explicit education years and languages without proficiency", () => {
    const candidate = validResponse();
    candidate.sections.education = [
      {
        candidateId: "education-1",
        institution: value,
        degree: value,
        fieldOfStudy: null,
        startDate: null,
        endDate: value,
        location: null,
        details: [],
      },
    ];
    candidate.sections.languages = [
      {
        candidateId: "language-1",
        name: value,
        proficiency: null,
      },
    ];

    const parsed = nuvitaeSemanticExtractionResponseSchema.parse(candidate);

    expect(parsed.sections.education[0]?.endDate?.value).toBe("Jane Example");
    expect(parsed.sections.languages[0]?.proficiency).toBeNull();
  });

  it("rejects section entries missing required candidate identity", () => {
    const candidate = {
      ...validResponse(),
      sections: {
        ...validResponse().sections,
        workExperience: [
          {
            roles: [
              {
                candidateId: "role-1",
                title: value,
                location: null,
                startDate: null,
                endDate: null,
                isOngoing: null,
                responsibilities: [],
                achievements: [],
              },
            ],
          },
        ],
      },
    };

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
    ).toBe(false);
  });

  it("rejects provider-native fields nested inside section entries", () => {
    const candidate = {
      ...validResponse(),
      sections: {
        ...validResponse().sections,
        skills: [
          {
            candidateId: "skill-1",
            name: value,
            category: null,
            providerNote: "native metadata",
          },
        ],
      },
    };

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
    ).toBe(false);
  });

  it("rejects null entries in value collections", () => {
    const candidate = {
      ...validResponse(),
      sections: {
        ...validResponse().sections,
        professionalLinks: [null],
      },
    };

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
    ).toBe(false);
  });
});

describe("relationships", () => {
  it("accepts valid candidate relationships with evidence and confidence", () => {
    const candidate = candidateWithRelationships([
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        toCandidateId: "work-1",
        evidence: [evidence],
        confidence: "high",
      },
    ]);

    const parsed = nuvitaeSemanticExtractionResponseSchema.parse(candidate);
    expect(parsed.relationships[0]?.relationshipType).toBe(
      "role_belongs_to_employer",
    );
  });

  it("rejects unsupported relationship types", () => {
    const candidate = candidateWithRelationships([
      {
        candidateId: "relationship-1",
        relationshipType: "employer_owns_role",
        fromCandidateId: "work-1",
        toCandidateId: "role-1",
        evidence: [evidence],
        confidence: "high",
      },
    ]);

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
    ).toBe(false);
  });

  it("rejects invalid candidate references in relationships", () => {
    for (const reference of ["", "role one", "role/one", "role.one!"]) {
      const candidate = candidateWithRelationships([
        {
          candidateId: "relationship-1",
          relationshipType: "role_belongs_to_employer",
          fromCandidateId: reference,
          toCandidateId: "work-1",
          evidence: [evidence],
          confidence: "high",
        },
      ]);
      expect(
        nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
      ).toBe(false);
    }
  });

  it("rejects relationships missing required fields", () => {
    const incomplete = candidateWithRelationships([
      {
        candidateId: "relationship-1",
        relationshipType: "role_belongs_to_employer",
        fromCandidateId: "role-1",
        evidence: [evidence],
        confidence: "high",
      },
    ]);

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(incomplete).success,
    ).toBe(false);
  });
});

describe("evidence records", () => {
  it("accepts canonical flattened evidence with nullable fragment ids", () => {
    const candidate = candidateWithFullName({
      ...value,
      evidence: [
        {
          line: 1,
          start: 0,
          end: 12,
          fragmentHash: hash,
          fragmentId: null,
        },
      ],
    });

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
    ).toBe(true);
  });

  it("rejects invalid flattened evidence ranges, hashes, and fragment identifiers", () => {
    const invalidEvidence = [
      { ...evidence, end: 0 },
      { ...evidence, end: evidence.start },
      { ...evidence, line: 0 },
      { ...evidence, line: 1.5 },
      { ...evidence, start: -1 },
      { ...evidence, fragmentHash: "not-a-sha256" },
      { ...evidence, fragmentId: "fragment id" },
    ];

    for (const badEvidence of invalidEvidence) {
      const candidate = candidateWithFullName({
        ...value,
        evidence: [badEvidence],
      });
      expect(
        nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
        JSON.stringify(badEvidence),
      ).toBe(false);
    }
  });

  it("rejects non-null values without flattened evidence", () => {
    const candidate = candidateWithFullName({
      ...value,
      evidence: [],
    });

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
    ).toBe(false);
  });
});

describe("classification and confidence categories", () => {
  it("accepts explicit and inferred classification", () => {
    for (const classification of ["explicit", "inferred"] as const) {
      const candidate = candidateWithFullName({
        ...value,
        classification,
      });
      expect(
        nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
      ).toBe(true);
    }
  });

  it("rejects unknown classification values", () => {
    const candidate = candidateWithFullName({
      ...value,
      classification: "guessed",
    });

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
    ).toBe(false);
  });

  it("accepts every confidence category", () => {
    for (const confidence of [
      "high",
      "medium",
      "low",
      "not_applicable",
    ] as const) {
      const candidate = candidateWithFullName({
        ...value,
        confidence,
      });
      expect(
        nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
        confidence,
      ).toBe(true);
    }
  });

  it("rejects unknown confidence categories", () => {
    const candidate = candidateWithFullName({
      ...value,
      confidence: "unknown",
    });

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
    ).toBe(false);
  });
});

describe("physical coordinate and provider-native field rejection", () => {
  it.each([
    "page",
    "item",
    "physicalOffset",
    "coordinate",
    "coordinates",
    "bbox",
    "boundingBox",
    "x",
    "y",
    "width",
    "height",
    "top",
    "left",
  ] as const)("rejects physical coordinate key %s in evidence", (key) => {
    const candidate = candidateWithFullName({
      ...value,
      evidence: [{ ...evidence, [key]: 1 }],
    });

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(candidate).success,
    ).toBe(false);
  });

  it.each([
    "rawProviderPayload",
    "providerResponse",
    "model",
    "provider",
    "threadId",
    "usage",
    "prompt",
    "content",
    "metadata",
  ] as const)("rejects provider-native field %s on the response", (key) => {
    const withProviderField = {
      ...validResponse(),
      [key]: { unsafe: true },
    };

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse(withProviderField)
        .success,
    ).toBe(false);
  });
});
