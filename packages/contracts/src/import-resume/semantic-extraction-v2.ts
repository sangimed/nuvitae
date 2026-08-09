import { z } from "zod";

/**
 * V2 is deliberately a different provider boundary from semantic-extraction.v1.
 * The provider supplies interpretation and locating hints only. Evidence,
 * identity, normalization, and review policy are constructed downstream.
 */
export const nuvitaeSemanticExtractionV2ResponseVersion =
  "nuvitae.semantic-extraction.v2" as const;

export const maxSemanticExtractionV2ResponseJsonBytes = 256_000;
export const maxSemanticExtractionV2SourceRefs = 8;
export const maxSemanticExtractionV2QuoteLength = 2_000;
export const maxSemanticExtractionV2ValueLength = 1_000;
export const maxSemanticExtractionV2ArrayItems = 120;
export const maxSemanticExtractionV2ObjectDepth = 8;

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

const contactSchema = z
  .object({
    fullName: nullableAtomSchema,
    email: nullableAtomSchema,
    phone: nullableAtomSchema,
    location: nullableAtomSchema,
    website: nullableAtomSchema,
  })
  .strict();

const workRoleSchema = z
  .object({
    title: nullableAtomSchema,
    location: nullableAtomSchema,
    startDate: nullableAtomSchema,
    endDate: nullableAtomSchema,
    responsibilities: z.array(semanticExtractionV2AtomSchema).max(20),
    achievements: z.array(semanticExtractionV2AtomSchema).max(20),
  })
  .strict();

const workExperienceSchema = z
  .object({
    employerName: nullableAtomSchema,
    employerLocation: nullableAtomSchema,
    roles: z.array(workRoleSchema).max(12),
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
        contact: contactSchema,
        headline: nullableAtomSchema,
        summary: nullableAtomSchema,
        workExperience: z.array(workExperienceSchema).max(25),
        education: z.array(educationSchema).max(20),
        skills: z.array(skillSchema).max(120),
        languages: z.array(languageSchema).max(20),
        projects: z.array(projectSchema).max(30),
        certifications: z.array(certificationSchema).max(30),
        professionalLinks: z.array(semanticExtractionV2AtomSchema).max(30),
      })
      .strict(),
    relationships: z
      .array(semanticExtractionV2RelationshipSchema)
      .max(maxSemanticExtractionV2ArrayItems),
    ambiguities: z.array(semanticExtractionV2SignalSchema).max(50),
    conflicts: z.array(semanticExtractionV2SignalSchema).max(50),
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
    workExperience: z.array(z.unknown()).max(25),
    education: z.array(z.unknown()).max(20),
    skills: z.array(z.unknown()).max(120),
    languages: z.array(z.unknown()).max(20),
    projects: z.array(z.unknown()).max(30),
    certifications: z.array(z.unknown()).max(30),
    professionalLinks: z.array(z.unknown()).max(30),
  })
  .strict();

export const nuvitaeSemanticExtractionV2EnvelopeSchema = z
  .object({
    schemaVersion: z.literal(nuvitaeSemanticExtractionV2ResponseVersion),
    sections: envelopeSectionsSchema,
    relationships: z.array(z.unknown()).max(maxSemanticExtractionV2ArrayItems),
    ambiguities: z.array(z.unknown()).max(50),
    conflicts: z.array(z.unknown()).max(50),
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
