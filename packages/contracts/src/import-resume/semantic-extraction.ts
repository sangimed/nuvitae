import { z } from "zod";

export const resumeSemanticParserContractVersion =
  "nuvitae.resume-semantic-parser.v1" as const;
export const nuvitaeSemanticExtractionResponseVersion =
  "nuvitae.semantic-extraction.v1" as const;

export const maxSemanticParserRequestJsonBytes = 256_000;
export const maxSemanticExtractionResponseJsonBytes = 256_000;

const safeIdentifierSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const boundedTextSchema = z.string().min(1).max(2_000);
const shortTextSchema = z.string().min(1).max(240);
const valueTextSchema = z.string().min(1).max(1_000);

export const semanticDocumentLanguageSchema = z.enum([
  "english",
  "french",
  "bilingual_french_english",
  "unsupported",
  "unknown",
]);

export const semanticDocumentFormatSchema = z.enum([
  "pdf",
  "docx",
  "plain_text",
]);

export const semanticConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "not_applicable",
]);

export const semanticClassificationSchema = z.enum(["explicit", "inferred"]);

export const semanticEvidenceSchema = z
  .object({
    line: z.number().int().min(1).max(5_000),
    start: z.number().int().min(0).max(20_000),
    end: z.number().int().min(1).max(20_000),
    fragmentHash: sha256Schema,
    fragmentId: safeIdentifierSchema.nullable(),
  })
  .strict()
  .refine((value) => value.end > value.start, {
    message: "end must be greater than start",
    path: ["end"],
  });

export const semanticValueSchema = z
  .object({
    value: valueTextSchema,
    normalizedValue: z.string().min(1).max(1_000).nullable(),
    evidence: z.array(semanticEvidenceSchema).min(1).max(8),
    classification: semanticClassificationSchema,
    confidence: semanticConfidenceSchema,
  })
  .strict();

const semanticDiagnosticEvidenceSchema = z.array(semanticEvidenceSchema).max(8);

export const semanticAmbiguityCodeSchema = z.enum([
  "ambiguous_section",
  "ambiguous_date",
  "ambiguous_grouping",
  "ambiguous_language",
  "ambiguous_contact",
  "ambiguous_role_association",
]);

export const semanticConflictCodeSchema = z.enum([
  "conflicting_dates",
  "conflicting_contact_value",
  "conflicting_role_grouping",
  "conflicting_education_value",
  "duplicate_candidate",
  "explicit_absence_conflict",
]);

export const semanticPrivacyWarningCodeSchema = z.enum([
  "unsafe_prompt_like_content_ignored",
  "source_contains_sensitive_personal_data",
  "provider_output_redacted",
  "source_fragment_reference_only",
]);

const diagnosticSeveritySchema = z.enum(["info", "warning", "error"]);

const semanticDiagnosticBaseSchema = z
  .object({
    message: shortTextSchema,
    severity: diagnosticSeveritySchema,
    evidence: semanticDiagnosticEvidenceSchema,
    safeDetail: z.string().min(1).max(240).nullable(),
  })
  .strict();

export const semanticAmbiguityDiagnosticSchema =
  semanticDiagnosticBaseSchema.extend({
    code: semanticAmbiguityCodeSchema,
  });

export const semanticConflictDiagnosticSchema = semanticDiagnosticBaseSchema
  .extend({
    code: semanticConflictCodeSchema,
  })
  .strict();

export const semanticPrivacyWarningSchema = semanticDiagnosticBaseSchema
  .extend({
    code: semanticPrivacyWarningCodeSchema,
  })
  .strict();

const contactSectionSchema = z
  .object({
    fullName: semanticValueSchema.nullable(),
    email: semanticValueSchema.nullable(),
    phone: semanticValueSchema.nullable(),
    location: semanticValueSchema.nullable(),
    website: semanticValueSchema.nullable(),
  })
  .strict();

const workRoleSchema = z
  .object({
    candidateId: safeIdentifierSchema,
    title: semanticValueSchema.nullable(),
    location: semanticValueSchema.nullable(),
    startDate: semanticValueSchema.nullable(),
    endDate: semanticValueSchema.nullable(),
    isOngoing: z.boolean().nullable(),
    responsibilities: z.array(semanticValueSchema).max(20),
    achievements: z.array(semanticValueSchema).max(20),
  })
  .strict();

const workExperienceSchema = z
  .object({
    candidateId: safeIdentifierSchema,
    employerName: semanticValueSchema.nullable(),
    employerLocation: semanticValueSchema.nullable(),
    roles: z.array(workRoleSchema).max(12),
  })
  .strict();

const educationSchema = z
  .object({
    candidateId: safeIdentifierSchema,
    institution: semanticValueSchema.nullable(),
    degree: semanticValueSchema.nullable(),
    fieldOfStudy: semanticValueSchema.nullable(),
    startDate: semanticValueSchema.nullable(),
    endDate: semanticValueSchema.nullable(),
    location: semanticValueSchema.nullable(),
    details: z.array(semanticValueSchema).max(12),
  })
  .strict();

const skillSchema = z
  .object({
    candidateId: safeIdentifierSchema,
    name: semanticValueSchema,
    category: semanticValueSchema.nullable(),
  })
  .strict();

const languageSchema = z
  .object({
    candidateId: safeIdentifierSchema,
    name: semanticValueSchema,
    proficiency: semanticValueSchema.nullable(),
  })
  .strict();

const projectSchema = z
  .object({
    candidateId: safeIdentifierSchema,
    name: semanticValueSchema.nullable(),
    description: semanticValueSchema.nullable(),
    technologies: z.array(semanticValueSchema).max(20),
    links: z.array(semanticValueSchema).max(8),
  })
  .strict();

const certificationSchema = z
  .object({
    candidateId: safeIdentifierSchema,
    name: semanticValueSchema.nullable(),
    issuer: semanticValueSchema.nullable(),
    date: semanticValueSchema.nullable(),
  })
  .strict();

const relationshipSchema = z
  .object({
    candidateId: safeIdentifierSchema,
    relationshipType: z.enum([
      "role_belongs_to_employer",
      "achievement_belongs_to_role",
      "skill_belongs_to_category",
      "link_belongs_to_project",
    ]),
    fromCandidateId: safeIdentifierSchema,
    toCandidateId: safeIdentifierSchema,
    evidence: z.array(semanticEvidenceSchema).max(8),
    confidence: semanticConfidenceSchema,
  })
  .strict();

const documentLanguageClassificationSchema = z
  .object({
    value: semanticDocumentLanguageSchema,
    confidence: semanticConfidenceSchema,
    evidence: semanticDiagnosticEvidenceSchema,
  })
  .strict();

export const nuvitaeSemanticExtractionResponseSchema = z
  .object({
    schemaVersion: z.literal(nuvitaeSemanticExtractionResponseVersion),
    documentLanguage: documentLanguageClassificationSchema,
    sections: z
      .object({
        contact: contactSectionSchema,
        headline: semanticValueSchema.nullable(),
        summary: semanticValueSchema.nullable(),
        workExperience: z.array(workExperienceSchema).max(25),
        education: z.array(educationSchema).max(20),
        skills: z.array(skillSchema).max(120),
        languages: z.array(languageSchema).max(20),
        projects: z.array(projectSchema).max(30),
        certifications: z.array(certificationSchema).max(30),
        professionalLinks: z.array(semanticValueSchema).max(30),
      })
      .strict(),
    relationships: z.array(relationshipSchema).max(120),
    ambiguityDiagnostics: z.array(semanticAmbiguityDiagnosticSchema).max(50),
    conflictDiagnostics: z.array(semanticConflictDiagnosticSchema).max(50),
    privacyWarnings: z.array(semanticPrivacyWarningSchema).max(50),
  })
  .strict();

const languageContextSchema = z
  .object({
    detectedLanguage: semanticDocumentLanguageSchema.nullable(),
    confidence: semanticConfidenceSchema.nullable(),
    textDirection: z.enum(["ltr"]).nullable(),
  })
  .strict();

const sourceFragmentBoundsSchema = z
  .object({
    lineStart: z.number().int().min(1).max(5_000),
    lineEnd: z.number().int().min(1).max(5_000),
    start: z.number().int().min(0).max(20_000),
    end: z.number().int().min(1).max(20_000),
  })
  .strict()
  .refine((value) => value.lineEnd >= value.lineStart, {
    message: "lineEnd must be greater than or equal to lineStart",
    path: ["lineEnd"],
  })
  .refine((value) => value.end > value.start, {
    message: "end must be greater than start",
    path: ["end"],
  });

export const semanticSourceFragmentSchema = z
  .object({
    order: z.number().int().min(0).max(10_000),
    line: z.number().int().min(1).max(5_000),
    text: boundedTextSchema,
    hash: sha256Schema,
    bounds: sourceFragmentBoundsSchema,
  })
  .strict();

const normalizedTranscriptSchema = z
  .object({
    text: z.string().min(1).max(120_000),
    sha256: sha256Schema,
    lineCount: z.number().int().min(1).max(5_000),
  })
  .strict();

const semanticFormatMetadataSchema = z
  .object({
    sourceFormat: semanticDocumentFormatSchema,
    extractionMode: z.enum(["selectable_text", "plain_text"]),
    renderedPageCount: z.number().int().min(1).max(5).nullable(),
    parserVersion: z.string().min(1).max(80).nullable(),
  })
  .strict();

export const resumeSemanticParseRequestSchema = z
  .object({
    contractVersion: z.literal(resumeSemanticParserContractVersion),
    importId: safeIdentifierSchema.nullable(),
    correlationId: safeIdentifierSchema.nullable(),
    documentFormat: semanticDocumentFormatSchema,
    languageContext: languageContextSchema,
    normalizedTranscript: normalizedTranscriptSchema,
    sourceFragments: z.array(semanticSourceFragmentSchema).min(1).max(800),
    fragmentHashes: z.array(sha256Schema).min(1).max(800),
    formatMetadata: semanticFormatMetadataSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.importId === null && value.correlationId === null) {
      context.addIssue({
        code: "custom",
        message: "importId or correlationId is required",
        path: ["importId"],
      });
    }
    if (value.formatMetadata.sourceFormat !== value.documentFormat) {
      context.addIssue({
        code: "custom",
        message: "formatMetadata.sourceFormat must match documentFormat",
        path: ["formatMetadata", "sourceFormat"],
      });
    }
    const fragmentHashes = value.sourceFragments.map(
      (fragment) => fragment.hash,
    );
    if (value.fragmentHashes.length !== fragmentHashes.length) {
      context.addIssue({
        code: "custom",
        message: "fragmentHashes must mirror sourceFragments",
        path: ["fragmentHashes"],
      });
      return;
    }
    for (const [index, hash] of fragmentHashes.entries()) {
      if (value.fragmentHashes[index] !== hash) {
        context.addIssue({
          code: "custom",
          message: "fragmentHashes must preserve source fragment order",
          path: ["fragmentHashes", index],
        });
      }
    }
    for (let index = 1; index < value.sourceFragments.length; index += 1) {
      const previous = value.sourceFragments[index - 1];
      const current = value.sourceFragments[index];
      if (previous !== undefined && current !== undefined) {
        if (current.order <= previous.order) {
          context.addIssue({
            code: "custom",
            message: "sourceFragments must be ordered",
            path: ["sourceFragments", index, "order"],
          });
        }
        if (current.line < previous.line) {
          context.addIssue({
            code: "custom",
            message: "sourceFragments lines must be ordered",
            path: ["sourceFragments", index, "line"],
          });
        }
      }
    }
  });

export type SemanticDocumentLanguage = z.infer<
  typeof semanticDocumentLanguageSchema
>;
export type SemanticDocumentFormat = z.infer<
  typeof semanticDocumentFormatSchema
>;
export type SemanticEvidence = z.infer<typeof semanticEvidenceSchema>;
export type SemanticValue = z.infer<typeof semanticValueSchema>;
export type NuvitaeSemanticExtractionResponse = z.infer<
  typeof nuvitaeSemanticExtractionResponseSchema
>;
export type ResumeSemanticParseRequest = z.infer<
  typeof resumeSemanticParseRequestSchema
>;
