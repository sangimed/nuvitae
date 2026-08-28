import { z } from "zod";

/**
 * V2 is deliberately a different provider boundary from semantic-extraction.v1.
 * The provider supplies interpretation and locating hints only. Evidence,
 * identity, normalization, and review policy are constructed downstream.
 */
export const nuvitaeSemanticExtractionV2ResponseVersion =
  "nuvitae.semantic-extraction.v2" as const;

export const maxSemanticExtractionV2ResponseJsonBytes = 256_000;
/** Allows complete multi-line summaries and project descriptions from dense PDFs. */
export const maxSemanticExtractionV2SourceRefs = 32;
export const maxSemanticExtractionV2QuoteLength = 2_000;
/** Matches the existing review/draft text ceiling for long-form source text. */
export const maxSemanticExtractionV2ValueLength = 4_000;
export const maxSemanticExtractionV2ArrayItems = 120;
/** The deepest valid path is a work-role bullet's source-reference quote. */
export const maxSemanticExtractionV2ObjectDepth = 10;
/**
 * A two-to-three page CV normally produces well below 200 grounded atoms. A
 * 600-atom ceiling leaves room for dense senior CVs while bounding grounding,
 * candidate construction, and downstream persistence work. This is a whole
 * response limit, not a license to truncate provider output.
 */
export const maxSemanticExtractionV2TotalAtoms = 600;
/**
 * The node budget is deliberately independent from collection cardinality.
 * Twenty structural nodes per atom covers the atom/source-reference shape,
 * grouping objects, and nullable fields without reviving the old synthetic
 * `array-items * 50` coupling. The serialized response limit remains the
 * primary byte/memory ceiling.
 */
export const maxSemanticExtractionV2TotalNodes =
  maxSemanticExtractionV2TotalAtoms * 20;
export const maxSemanticExtractionV2WorkExperiences = 25;
export const maxSemanticExtractionV2RolesPerWorkExperience = 12;
export const maxSemanticExtractionV2ResponsibilitiesPerRole = 20;
export const maxSemanticExtractionV2AchievementsPerRole = 20;
export const maxSemanticExtractionV2EducationEntries = 20;
export const maxSemanticExtractionV2Skills = 120;
export const maxSemanticExtractionV2Languages = 20;
export const maxSemanticExtractionV2Projects = 30;
export const maxSemanticExtractionV2Certifications = 30;
export const maxSemanticExtractionV2ProfessionalLinks = 30;
export const maxSemanticExtractionV2Relationships =
  maxSemanticExtractionV2ArrayItems;
export const maxSemanticExtractionV2Ambiguities = 50;
export const maxSemanticExtractionV2Conflicts = 50;

const v2IdentifierSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/u);

export const semanticExtractionV2SourceRefSchema = z
  .object({
    fragmentId: v2IdentifierSchema,
    quote: z.string().min(1).max(maxSemanticExtractionV2QuoteLength),
  })
  .strict();

export const semanticExtractionV2AtomSchema = z
  .object({
    value: z.string().min(1).max(maxSemanticExtractionV2ValueLength),
    sourceRefs: z
      .array(semanticExtractionV2SourceRefSchema)
      .min(1)
      .max(maxSemanticExtractionV2SourceRefs),
  })
  .strict();

const nullableAtomSchema = semanticExtractionV2AtomSchema.nullable();

/**
 * The canonical V2 contact wrapper is required and has exactly these five
 * keys. Each key is required in the canonical response but nullable when the
 * source does not contain that contact concept. The provider's compact wire
 * form may omit an absent nullable member; canonicalization restores null.
 */
export const semanticExtractionV2ContactKeys = [
  "fullName",
  "email",
  "phone",
  "location",
  "website",
] as const;

export const semanticExtractionV2ContactSchema = z
  .object({
    fullName: nullableAtomSchema,
    email: nullableAtomSchema,
    phone: nullableAtomSchema,
    location: nullableAtomSchema,
    website: nullableAtomSchema,
  })
  .strict();

export type SemanticExtractionV2Contact = z.infer<
  typeof semanticExtractionV2ContactSchema
>;

const workRoleSchema = z
  .object({
    title: nullableAtomSchema,
    location: nullableAtomSchema,
    startDate: nullableAtomSchema,
    endDate: nullableAtomSchema,
    responsibilities: z
      .array(semanticExtractionV2AtomSchema)
      .max(maxSemanticExtractionV2ResponsibilitiesPerRole),
    achievements: z
      .array(semanticExtractionV2AtomSchema)
      .max(maxSemanticExtractionV2AchievementsPerRole),
  })
  .strict();

const workExperienceSchema = z
  .object({
    employerName: nullableAtomSchema,
    employerLocation: nullableAtomSchema,
    roles: z
      .array(workRoleSchema)
      .max(maxSemanticExtractionV2RolesPerWorkExperience),
  })
  .strict();

const educationSchema = z
  .object({
    institution: nullableAtomSchema,
    degree: nullableAtomSchema,
    fieldOfStudy: nullableAtomSchema,
    startDate: nullableAtomSchema,
    endDate: nullableAtomSchema,
    location: nullableAtomSchema,
  })
  .strict();

const skillSchema = z
  .object({
    name: semanticExtractionV2AtomSchema,
  })
  .strict();

const languageSchema = z
  .object({
    name: semanticExtractionV2AtomSchema,
    proficiency: nullableAtomSchema,
  })
  .strict();

const projectSchema = z
  .object({
    name: nullableAtomSchema,
    description: nullableAtomSchema,
  })
  .strict();

const certificationSchema = z
  .object({
    name: nullableAtomSchema,
    issuer: nullableAtomSchema,
  })
  .strict();

const professionalLinkSchema = z.union([
  semanticExtractionV2AtomSchema,
  z
    .object({
      label: nullableAtomSchema,
      url: semanticExtractionV2AtomSchema,
    })
    .strict(),
]);

/**
 * This is the only relationship shape reserved by the architecture record.
 * Phase 1 has no supported destination for category relationships, so the
 * canonicalizer validates and rejects these independently rather than
 * creating a speculative domain relationship.
 */
export const semanticExtractionV2RelationshipSchema = z
  .object({
    type: z.literal("skill_belongs_to_category"),
    from: semanticExtractionV2AtomSchema,
    to: semanticExtractionV2AtomSchema,
    sourceRefs: z
      .array(semanticExtractionV2SourceRefSchema)
      .min(1)
      .max(maxSemanticExtractionV2SourceRefs),
  })
  .strict();

const semanticSignalKindSchema = z.enum([
  "ambiguous_section",
  "ambiguous_date",
  "ambiguous_grouping",
  "ambiguous_language",
  "ambiguous_contact",
  "ambiguous_role_association",
  "conflicting_dates",
  "conflicting_contact_value",
  "conflicting_role_grouping",
  "conflicting_education_value",
]);

export const semanticExtractionV2SignalSchema = z
  .object({
    kind: semanticSignalKindSchema,
    sourceRefs: z
      .array(semanticExtractionV2SourceRefSchema)
      .min(1)
      .max(maxSemanticExtractionV2SourceRefs),
  })
  .strict();

export const nuvitaeSemanticExtractionV2ResponseSchema = z
  .object({
    schemaVersion: z.literal(nuvitaeSemanticExtractionV2ResponseVersion),
    sections: z
      .object({
        contact: semanticExtractionV2ContactSchema,
        headline: nullableAtomSchema,
        summary: nullableAtomSchema,
        workExperience: z
          .array(workExperienceSchema)
          .max(maxSemanticExtractionV2WorkExperiences),
        education: z
          .array(educationSchema)
          .max(maxSemanticExtractionV2EducationEntries),
        skills: z.array(skillSchema).max(maxSemanticExtractionV2Skills),
        languages: z
          .array(languageSchema)
          .max(maxSemanticExtractionV2Languages),
        projects: z.array(projectSchema).max(maxSemanticExtractionV2Projects),
        certifications: z
          .array(certificationSchema)
          .max(maxSemanticExtractionV2Certifications),
        professionalLinks: z
          .array(professionalLinkSchema)
          .max(maxSemanticExtractionV2ProfessionalLinks),
      })
      .strict(),
    relationships: z
      .array(semanticExtractionV2RelationshipSchema)
      .max(maxSemanticExtractionV2Relationships),
    ambiguities: z
      .array(semanticExtractionV2SignalSchema)
      .max(maxSemanticExtractionV2Ambiguities),
    conflicts: z
      .array(semanticExtractionV2SignalSchema)
      .max(maxSemanticExtractionV2Conflicts),
  })
  .strict();

/*
 * The envelope schema intentionally validates only the response boundary and
 * bounded collections. Atom/group contents are unknown here so a valid V2
 * envelope can receive field-level fail-closed acceptance. The strict schema
 * above remains the contract for a fully valid provider response.
 */
const requiredUnknownSchema = z.custom<unknown>(
  (value) => value !== undefined,
  "required V2 envelope property",
);

const envelopeContactSchema = z
  .object({
    fullName: requiredUnknownSchema,
    email: requiredUnknownSchema,
    phone: requiredUnknownSchema,
    location: requiredUnknownSchema,
    website: requiredUnknownSchema,
  })
  .strict();

const envelopeSectionsSchema = z
  .object({
    contact: envelopeContactSchema,
    headline: requiredUnknownSchema,
    summary: requiredUnknownSchema,
    workExperience: z
      .array(z.unknown())
      .max(maxSemanticExtractionV2WorkExperiences),
    education: z
      .array(z.unknown())
      .max(maxSemanticExtractionV2EducationEntries),
    skills: z.array(z.unknown()).max(maxSemanticExtractionV2Skills),
    languages: z.array(z.unknown()).max(maxSemanticExtractionV2Languages),
    projects: z.array(z.unknown()).max(maxSemanticExtractionV2Projects),
    certifications: z
      .array(z.unknown())
      .max(maxSemanticExtractionV2Certifications),
    professionalLinks: z
      .array(z.unknown())
      .max(maxSemanticExtractionV2ProfessionalLinks),
  })
  .strict();

export const nuvitaeSemanticExtractionV2EnvelopeSchema = z
  .object({
    schemaVersion: z.literal(nuvitaeSemanticExtractionV2ResponseVersion),
    sections: envelopeSectionsSchema,
    relationships: z
      .array(z.unknown())
      .max(maxSemanticExtractionV2Relationships),
    ambiguities: z.array(z.unknown()).max(maxSemanticExtractionV2Ambiguities),
    conflicts: z.array(z.unknown()).max(maxSemanticExtractionV2Conflicts),
  })
  .strict();

export type SemanticExtractionV2SourceRef = z.infer<
  typeof semanticExtractionV2SourceRefSchema
>;
export type SemanticExtractionV2Atom = z.infer<
  typeof semanticExtractionV2AtomSchema
>;
export type SemanticExtractionV2Relationship = z.infer<
  typeof semanticExtractionV2RelationshipSchema
>;
export type SemanticExtractionV2Signal = z.infer<
  typeof semanticExtractionV2SignalSchema
>;
export type NuvitaeSemanticExtractionV2Response = z.infer<
  typeof nuvitaeSemanticExtractionV2ResponseSchema
>;
export type NuvitaeSemanticExtractionV2Envelope = z.infer<
  typeof nuvitaeSemanticExtractionV2EnvelopeSchema
>;
