import type {
  NuvitaeSemanticExtractionResponse,
  SemanticValue,
} from "@nuvitae/contracts";
import type {
  ConfidenceCategory,
  DeterministicResumeFieldCandidate,
  DeterministicResumeSection,
  ExtractedValue,
  ImportedDocument,
} from "@nuvitae/domain";
import type { SemanticValidationDiagnostic } from "../validation/validation-types.js";

export type CandidateReviewReason =
  "inferred" | "low_confidence" | "ambiguous" | "conflicting";

export interface ReviewRequiredField {
  readonly section: DeterministicResumeSection;
  readonly fieldPath: string;
  readonly reasons: readonly CandidateReviewReason[];
}

/**
 * Canonical flattened evidence reference for one draft field, aligned with the
 * T180-T184 `EvidenceRecord` persistence contract. Provider-neutral: it carries
 * only canonical transcript coordinates, fragment identity, classification, and
 * confidence.
 */
export interface MappedEvidenceReference {
  readonly fieldPath: string;
  readonly candidateId?: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly fragmentHash: string;
  readonly fragmentId?: string;
  readonly classification: "explicit" | "inferred";
  readonly confidence: ConfidenceCategory;
}

export type MappedRelationshipState = "valid" | "invalid";

export interface MappedRelationship {
  readonly candidateId: string;
  readonly relationshipType:
    | "role_belongs_to_employer"
    | "achievement_belongs_to_role"
    | "skill_belongs_to_category"
    | "link_belongs_to_project";
  readonly fromCandidateId: string;
  readonly toCandidateId: string;
  readonly confidence: ConfidenceCategory;
  readonly state: MappedRelationshipState;
  readonly reason?: "unknown_candidate" | "relationship_type_mismatch";
}

export interface DuplicateCandidate {
  readonly section: DeterministicResumeSection;
  readonly keptFieldPath: string;
  readonly duplicateFieldPath: string;
  readonly value: ExtractedValue;
}

export type RejectedCandidateReason = "missing_evidence" | "unsupported_field";

export interface RejectedCandidate {
  readonly section: DeterministicResumeSection;
  readonly fieldPath: string;
  readonly reason: RejectedCandidateReason;
}

export interface SemanticCandidateMappingInput {
  readonly response: NuvitaeSemanticExtractionResponse;
  readonly document: ImportedDocument;
  readonly diagnostics?: readonly SemanticValidationDiagnostic[];
}

/**
 * Provider-neutral mapping result for validated semantic candidates. Fields are
 * directly consumable by `buildExtractionDraft`; evidence, identities, and
 * relationships are carried separately so they can be persisted (T180-T184)
 * without leaking provider-native data into the review model.
 */
export interface SemanticCandidateMappingResult {
  readonly fields: readonly DeterministicResumeFieldCandidate[];
  readonly evidence: readonly MappedEvidenceReference[];
  readonly candidateIdentities: Readonly<Record<string, string>>;
  readonly relationships: readonly MappedRelationship[];
  readonly duplicates: readonly DuplicateCandidate[];
  readonly duplicateSuppressed: number;
  readonly rejected: readonly RejectedCandidate[];
  readonly reviewRequired: readonly ReviewRequiredField[];
}

/** Nuvitae owns candidate correlation IDs; providers only return semantic facts. */
function applicationCandidateId(
  documentId: string,
  structuralPath: string,
): string {
  return `candidate-${documentId}-${structuralPath.replaceAll(".", "-")}`;
}

function registerProviderCandidateAlias(
  aliases: Map<string, string | null>,
  providerCandidateId: unknown,
  applicationId: string,
): void {
  if (typeof providerCandidateId !== "string") return;
  const existing = aliases.get(providerCandidateId);
  aliases.set(
    providerCandidateId,
    existing === undefined || existing === applicationId ? applicationId : null,
  );
}

function resolveProviderCandidateAlias(
  aliases: ReadonlyMap<string, string | null>,
  providerCandidateId: string,
): string | undefined {
  const applicationId = aliases.get(providerCandidateId);
  return applicationId === null ? undefined : applicationId;
}

const reviewReasonOrder: readonly CandidateReviewReason[] = [
  "inferred",
  "low_confidence",
  "ambiguous",
  "conflicting",
];

const draftFieldPathPattern = /^[a-z][a-z0-9_]*(?:\.[a-zA-Z0-9_-]+)*$/u;

const sectionByRoot: Record<string, DeterministicResumeSection> = {
  personal: "personal",
  contact: "contact",
  headline: "headline",
  summary: "summary",
  workExperience: "work_experience",
  education: "education",
  skills: "skills",
  languages: "languages",
  projects: "projects",
  certifications: "certifications",
  professionalLinks: "professional_links",
};

/**
 * Converts a validation diagnostic path into the stable draft field path used
 * by the mapper (for example `sections.skills[0].name.evidence[0]` becomes
 * `skills.0.name`). Absence or non-field paths return undefined.
 */
export function candidateFieldPath(
  path: readonly (string | number)[],
): string | undefined {
  let value = path
    .map((part) => (typeof part === "number" ? `[${part}]` : part))
    .join(".")
    .replaceAll(".[", "[");
  if (value.startsWith("sections.")) {
    value = value.slice("sections.".length);
  }
  value = value.replace(/\[\d+\]/gu, (match) => `.${match.slice(1, -1)}`);
  value = value.replace(/\.evidence(?:\.\d+)?$/u, "");
  if (value.endsWith(".startDate")) {
    value = `${value.slice(0, -".startDate".length)}.date_range`;
  }
  if (value.endsWith(".endDate")) {
    value = `${value.slice(0, -".endDate".length)}.date_range`;
  }
  value = value.replace(/^workExperience/u, "work_experience");
  value = value.replace(/^professionalLinks/u, "professional_links");
  return value.length > 0 && draftFieldPathPattern.test(value)
    ? value
    : undefined;
}

export function sectionFromPath(
  path: readonly (string | number)[],
): DeterministicResumeSection {
  const fieldPath = candidateFieldPath(path);
  if (fieldPath !== undefined) {
    const root = fieldPath.split(".")[0] ?? "";
    const section = sectionByRoot[root];
    if (section !== undefined) return section;
  }
  return "summary";
}

export function mapSemanticCandidates(
  input: SemanticCandidateMappingInput,
): SemanticCandidateMappingResult {
  const fields: DeterministicResumeFieldCandidate[] = [];
  const evidence: MappedEvidenceReference[] = [];
  const candidateIdentities: Record<string, string> = {};
  const duplicates: DuplicateCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  const seen = new Map<string, string>();
  const providerCandidateAliases = new Map<string, string | null>();
  let duplicateSuppressed = 0;

  const roleIds = new Set<string>();
  const workIds = new Set<string>();
  const educationIds = new Set<string>();
  const skillIds = new Set<string>();
  const languageIds = new Set<string>();
  const projectIds = new Set<string>();
  const certificationIds = new Set<string>();
  const knownCandidateIds = new Set<string>();

  const push = (
    section: DeterministicResumeFieldCandidate["section"],
    fieldPath: string,
    semanticValue: SemanticValue | null,
    value: DeterministicResumeFieldCandidate["value"],
    candidateId: string | undefined,
    duplicateEligible: boolean,
    extraEvidence: readonly SemanticValue[] = [],
  ): void => {
    if (semanticValue === null) return;
    if (semanticValue.evidence.length === 0) {
      rejected.push({ section, fieldPath, reason: "missing_evidence" });
      return;
    }
    const dedupeKey = duplicateEligible
      ? `${section}|${JSON.stringify(value)}|${semanticValue.confidence}|${semanticValue.classification}`
      : undefined;
    if (dedupeKey !== undefined) {
      const kept = seen.get(dedupeKey);
      if (kept !== undefined) {
        duplicates.push({
          section,
          keptFieldPath: kept,
          duplicateFieldPath: fieldPath,
          value,
        });
        duplicateSuppressed += 1;
        return;
      }
      seen.set(dedupeKey, fieldPath);
    }
    fields.push({
      section,
      fieldPath,
      value,
      sourceLocation: minimalLocation(input.document),
      confidence: semanticValue.confidence,
      inferenceStatus:
        semanticValue.classification === "inferred"
          ? "inferred_needs_review"
          : "not_inferred",
      sourceOrder: fields.length,
    });
    if (candidateId !== undefined) {
      candidateIdentities[fieldPath] = candidateId;
    }
    appendEvidence(evidence, fieldPath, semanticValue, candidateId);
    for (const additional of extraEvidence) {
      appendEvidence(evidence, fieldPath, additional, candidateId);
    }
  };

  const rejectUnsupported = (
    section: DeterministicResumeSection,
    fieldPath: string,
  ): void => {
    rejected.push({ section, fieldPath, reason: "unsupported_field" });
  };

  const contact = input.response.sections.contact;
  push(
    "contact",
    "contact.full_name",
    contact.fullName,
    textValue(contact.fullName),
    undefined,
    false,
  );
  push(
    "contact",
    "contact.email",
    contact.email,
    textValue(contact.email),
    undefined,
    false,
  );
  push(
    "contact",
    "contact.phone",
    contact.phone,
    textValue(contact.phone),
    undefined,
    false,
  );
  push(
    "contact",
    "contact.location",
    contact.location,
    textValue(contact.location),
    undefined,
    false,
  );
  push(
    "contact",
    "contact.website",
    contact.website,
    textValue(contact.website),
    undefined,
    false,
  );
  push(
    "headline",
    "headline",
    input.response.sections.headline,
    textValue(input.response.sections.headline),
    undefined,
    false,
  );
  push(
    "summary",
    "summary",
    input.response.sections.summary,
    textValue(input.response.sections.summary),
    undefined,
    false,
  );

  for (const [
    workIndex,
    work,
  ] of input.response.sections.workExperience.entries()) {
    const workApplicationId = applicationCandidateId(
      input.document.id,
      `work_experience.${workIndex}`,
    );
    workIds.add(workApplicationId);
    knownCandidateIds.add(workApplicationId);
    registerProviderCandidateAlias(
      providerCandidateAliases,
      work.candidateId,
      workApplicationId,
    );
    for (const [roleIndex, role] of work.roles.entries()) {
      const roleApplicationId = applicationCandidateId(
        input.document.id,
        `work_experience.${workIndex}.roles.${roleIndex}`,
      );
      roleIds.add(roleApplicationId);
      knownCandidateIds.add(roleApplicationId);
      registerProviderCandidateAlias(
        providerCandidateAliases,
        role.candidateId,
        roleApplicationId,
      );
    }
  }

  input.response.sections.workExperience.forEach((work, workIndex) => {
    work.roles.forEach((role, roleIndex) => {
      const prefix = `work_experience.${workIndex}.roles.${roleIndex}`;
      const workCandidateId = applicationCandidateId(
        input.document.id,
        `work_experience.${workIndex}`,
      );
      const roleCandidateId = applicationCandidateId(input.document.id, prefix);
      push(
        "work_experience",
        `${prefix}.employer`,
        work.employerName,
        textValue(work.employerName),
        workCandidateId,
        false,
      );
      push(
        "work_experience",
        `${prefix}.employer_location`,
        work.employerLocation,
        textValue(work.employerLocation),
        workCandidateId,
        false,
      );
      push(
        "work_experience",
        `${prefix}.title`,
        role.title,
        textValue(role.title),
        roleCandidateId,
        false,
      );
      push(
        "work_experience",
        `${prefix}.location`,
        role.location,
        textValue(role.location),
        roleCandidateId,
        false,
      );
      const dateRange = buildRoleDateRange(role);
      if (dateRange !== undefined) {
        push(
          "work_experience",
          `${prefix}.date_range`,
          role.startDate ?? role.endDate,
          dateRange,
          roleCandidateId,
          false,
        );
      }
      role.responsibilities.forEach((value) =>
        push(
          "work_experience",
          `${prefix}.responsibility`,
          value,
          textValue(value),
          roleCandidateId,
          false,
        ),
      );
      role.achievements.forEach((value) =>
        push(
          "work_experience",
          `${prefix}.achievement`,
          value,
          textValue(value),
          roleCandidateId,
          false,
        ),
      );
    });
  });

  input.response.sections.education.forEach((item, index) => {
    const prefix = `education.${index}`;
    const candidateId = applicationCandidateId(input.document.id, prefix);
    educationIds.add(candidateId);
    knownCandidateIds.add(candidateId);
    registerProviderCandidateAlias(
      providerCandidateAliases,
      item.candidateId,
      candidateId,
    );
    push(
      "education",
      `${prefix}.institution`,
      item.institution,
      textValue(item.institution),
      candidateId,
      false,
    );
    push(
      "education",
      `${prefix}.credential`,
      item.degree,
      textValue(item.degree),
      candidateId,
      false,
    );
    push(
      "education",
      `${prefix}.field_of_study`,
      item.fieldOfStudy,
      textValue(item.fieldOfStudy),
      candidateId,
      false,
    );
    if (item.startDate !== null) {
      const date = parseResumeYear(item.startDate.value);
      if (date === undefined) {
        rejectUnsupported("education", `${prefix}.start_date`);
      } else {
        push(
          "education",
          `${prefix}.start_date`,
          item.startDate,
          { kind: "date", value: date },
          candidateId,
          false,
        );
      }
    }
    if (item.endDate !== null) {
      const date = parseResumeYear(item.endDate.value);
      if (date === undefined) {
        rejectUnsupported("education", `${prefix}.end_date`);
      } else {
        push(
          "education",
          `${prefix}.end_date`,
          item.endDate,
          { kind: "date", value: date },
          candidateId,
          false,
        );
      }
    }
    push(
      "education",
      `${prefix}.location`,
      item.location,
      textValue(item.location),
      candidateId,
      false,
    );
    if (item.details.length > 0) {
      rejectUnsupported("education", `${prefix}.details`);
    }
  });

  input.response.sections.skills.forEach((item, index) => {
    const candidateId = applicationCandidateId(
      input.document.id,
      `skills.${index}`,
    );
    skillIds.add(candidateId);
    knownCandidateIds.add(candidateId);
    registerProviderCandidateAlias(
      providerCandidateAliases,
      item.candidateId,
      candidateId,
    );
    push(
      "skills",
      `skills.${index}.name`,
      item.name,
      textValue(item.name),
      candidateId,
      true,
    );
  });

  input.response.sections.languages.forEach((item, index) => {
    const candidateId = applicationCandidateId(
      input.document.id,
      `languages.${index}`,
    );
    languageIds.add(candidateId);
    knownCandidateIds.add(candidateId);
    registerProviderCandidateAlias(
      providerCandidateAliases,
      item.candidateId,
      candidateId,
    );
    if (item.name === null) return;
    const fieldPath = `languages.${index}.name`;
    push(
      "languages",
      fieldPath,
      item.name,
      {
        kind: "language",
        name: item.name.value,
        ...(item.proficiency === null
          ? {}
          : { proficiency: item.proficiency.value }),
      },
      candidateId,
      true,
      item.proficiency === null ? [] : [item.proficiency],
    );
  });

  input.response.sections.projects.forEach((item, index) => {
    const prefix = `projects.${index}`;
    const candidateId = applicationCandidateId(input.document.id, prefix);
    projectIds.add(candidateId);
    knownCandidateIds.add(candidateId);
    registerProviderCandidateAlias(
      providerCandidateAliases,
      item.candidateId,
      candidateId,
    );
    push(
      "projects",
      `${prefix}.name`,
      item.name,
      textValue(item.name),
      candidateId,
      false,
    );
    push(
      "projects",
      `${prefix}.description`,
      item.description,
      textValue(item.description),
      candidateId,
      false,
    );
    if (item.technologies.length > 0) {
      rejectUnsupported("projects", `${prefix}.technologies`);
    }
    if (item.links.length > 0) {
      rejectUnsupported("projects", `${prefix}.links`);
    }
  });

  input.response.sections.certifications.forEach((item, index) => {
    const prefix = `certifications.${index}`;
    const candidateId = applicationCandidateId(input.document.id, prefix);
    certificationIds.add(candidateId);
    knownCandidateIds.add(candidateId);
    registerProviderCandidateAlias(
      providerCandidateAliases,
      item.candidateId,
      candidateId,
    );
    push(
      "certifications",
      `${prefix}.name`,
      item.name,
      textValue(item.name),
      candidateId,
      false,
    );
    push(
      "certifications",
      `${prefix}.issuer`,
      item.issuer,
      textValue(item.issuer),
      candidateId,
      false,
    );
    if (item.date !== null) {
      rejectUnsupported("certifications", `${prefix}.date`);
    }
  });

  input.response.sections.professionalLinks.forEach((value) => {
    if (value === null) return;
    push(
      "professional_links",
      "professional_links.url",
      value,
      { kind: "link", url: value.value },
      undefined,
      true,
    );
  });

  const relationships = input.response.relationships.map(
    (relationship, index) =>
      mapRelationship(relationship, {
        documentId: input.document.id,
        relationshipIndex: index,
        knownCandidateIds,
        providerCandidateAliases,
        roleIds,
        workIds,
        educationIds,
        skillIds,
        languageIds,
        projectIds,
        certificationIds,
      }),
  );

  const reviewRequired = buildReviewRequired(fields, input.diagnostics ?? []);

  return {
    fields,
    evidence,
    candidateIdentities,
    relationships,
    duplicates,
    duplicateSuppressed,
    rejected,
    reviewRequired,
  };
}

function textValue(
  value: SemanticValue | null,
): DeterministicResumeFieldCandidate["value"] {
  if (value === null) return { kind: "text", value: "" };
  return { kind: "text", value: value.value };
}

function buildRoleDateRange(role: {
  readonly startDate: SemanticValue | null;
  readonly endDate: SemanticValue | null;
  readonly isOngoing: boolean | null;
}): DeterministicResumeFieldCandidate["value"] | undefined {
  const start = role.startDate?.value;
  const end = role.endDate?.value;
  const startDate = parseResumeYear(start);
  const endDate = parseResumeYear(end);
  const isOngoing =
    role.isOngoing === true || (end !== undefined && /present/i.test(end));
  if (startDate === undefined && endDate === undefined && !isOngoing)
    return undefined;
  return {
    kind: "date_range",
    ...(startDate === undefined ? {} : { startDate }),
    ...(endDate === undefined ? {} : { endDate }),
    isOngoing,
  };
}

function parseResumeYear(
  value: string | undefined,
): { readonly year: number; readonly precision: "year" } | undefined {
  if (value === undefined) return undefined;
  const match = /\b(19|20)\d{2}\b/.exec(value);
  if (match === null) return undefined;
  return { year: Number(match[0]), precision: "year" };
}

function minimalLocation(document: ImportedDocument) {
  return {
    kind: "minimal" as const,
    label: "imported_from_initial_resume" as const,
    confirmedByUser: false,
    sourceDeletedAt: undefined,
    documentId: document.id,
  };
}

function appendEvidence(
  evidence: MappedEvidenceReference[],
  fieldPath: string,
  semanticValue: SemanticValue,
  candidateId: string | undefined,
): void {
  for (const item of semanticValue.evidence) {
    evidence.push({
      fieldPath,
      ...(candidateId === undefined ? {} : { candidateId }),
      line: item.line,
      start: item.start,
      end: item.end,
      fragmentHash: item.fragmentHash,
      ...(item.fragmentId === null ? {} : { fragmentId: item.fragmentId }),
      classification: semanticValue.classification,
      confidence: semanticValue.confidence,
    });
  }
}

function mapRelationship(
  relationship: NuvitaeSemanticExtractionResponse["relationships"][number],
  registry: {
    readonly documentId: string;
    readonly relationshipIndex: number;
    readonly knownCandidateIds: ReadonlySet<string>;
    readonly providerCandidateAliases: ReadonlyMap<string, string | null>;
    readonly roleIds: ReadonlySet<string>;
    readonly workIds: ReadonlySet<string>;
    readonly educationIds: ReadonlySet<string>;
    readonly skillIds: ReadonlySet<string>;
    readonly languageIds: ReadonlySet<string>;
    readonly projectIds: ReadonlySet<string>;
    readonly certificationIds: ReadonlySet<string>;
  },
): MappedRelationship {
  const fromCandidateId = resolveProviderCandidateAlias(
    registry.providerCandidateAliases,
    relationship.fromCandidateId,
  );
  const toCandidateId = resolveProviderCandidateAlias(
    registry.providerCandidateAliases,
    relationship.toCandidateId,
  );
  const base = {
    candidateId: applicationCandidateId(
      registry.documentId,
      `relationships.${registry.relationshipIndex}`,
    ),
    relationshipType: relationship.relationshipType,
    fromCandidateId: fromCandidateId ?? relationship.fromCandidateId,
    toCandidateId: toCandidateId ?? relationship.toCandidateId,
    confidence: relationship.confidence,
  };
  if (
    fromCandidateId === undefined ||
    toCandidateId === undefined ||
    !registry.knownCandidateIds.has(fromCandidateId) ||
    !registry.knownCandidateIds.has(toCandidateId)
  ) {
    return { ...base, state: "invalid", reason: "unknown_candidate" };
  }
  let valid = false;
  switch (relationship.relationshipType) {
    case "role_belongs_to_employer":
      valid =
        registry.roleIds.has(fromCandidateId) &&
        registry.workIds.has(toCandidateId);
      break;
    case "achievement_belongs_to_role":
      valid = registry.roleIds.has(toCandidateId);
      break;
    case "skill_belongs_to_category":
      valid = registry.skillIds.has(fromCandidateId);
      break;
    case "link_belongs_to_project":
      valid = registry.projectIds.has(toCandidateId);
      break;
  }
  if (!valid) {
    return { ...base, state: "invalid", reason: "relationship_type_mismatch" };
  }
  return { ...base, state: "valid" };
}

function buildReviewRequired(
  fields: readonly DeterministicResumeFieldCandidate[],
  diagnostics: readonly SemanticValidationDiagnostic[],
): readonly ReviewRequiredField[] {
  const reasonsByField = new Map<string, Set<CandidateReviewReason>>();
  const sectionByField = new Map<string, DeterministicResumeSection>();
  for (const field of fields) {
    sectionByField.set(field.fieldPath, field.section);
    if (field.inferenceStatus === "inferred_needs_review") {
      addReason(reasonsByField, field.fieldPath, "inferred");
    }
    if (field.confidence === "low") {
      addReason(reasonsByField, field.fieldPath, "low_confidence");
    }
  }
  for (const item of diagnostics) {
    if (item.category !== "ambiguity" && item.category !== "conflict") continue;
    const fieldPath = candidateFieldPath(item.path);
    if (fieldPath === undefined || !sectionByField.has(fieldPath)) continue;
    addReason(
      reasonsByField,
      fieldPath,
      item.category === "ambiguity" ? "ambiguous" : "conflicting",
    );
  }
  return [...reasonsByField.entries()]
    .map(([fieldPath, reasons]) => ({
      section: sectionByField.get(fieldPath) ?? "summary",
      fieldPath,
      reasons: [...reasons].sort(
        (left, right) =>
          reviewReasonOrder.indexOf(left) - reviewReasonOrder.indexOf(right),
      ),
    }))
    .sort((left, right) => left.fieldPath.localeCompare(right.fieldPath, "en"));
}

function addReason(
  reasonsByField: Map<string, Set<CandidateReviewReason>>,
  fieldPath: string,
  reason: CandidateReviewReason,
): void {
  const reasons =
    reasonsByField.get(fieldPath) ?? new Set<CandidateReviewReason>();
  reasons.add(reason);
  reasonsByField.set(fieldPath, reasons);
}
