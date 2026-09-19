import {
  maxSemanticExtractionV2ObjectDepth,
  maxSemanticExtractionV2Ambiguities,
  maxSemanticExtractionV2Certifications,
  maxSemanticExtractionV2Conflicts,
  maxSemanticExtractionV2EducationEntries,
  maxSemanticExtractionV2Languages,
  maxSemanticExtractionV2ProfessionalLinks,
  maxSemanticExtractionV2Projects,
  maxSemanticExtractionV2ResponseJsonBytes,
  maxSemanticExtractionV2Relationships,
  maxSemanticExtractionV2Skills,
  maxSemanticExtractionV2TotalAtoms,
  maxSemanticExtractionV2TotalNodes,
  maxSemanticExtractionV2WorkExperiences,
  semanticExtractionV2ContactKeys,
  nuvitaeSemanticExtractionV2EnvelopeSchema,
  semanticExtractionV2AtomSchema,
  semanticExtractionV2RelationshipSchema,
  semanticExtractionV2SourceRefSchema,
  semanticExtractionV2SignalSchema,
  type SemanticExtractionV2Signal,
} from "@nuvitae/contracts";

import {
  normalizeSourceText,
  type SourceReferenceFailureReason,
  type SourceReferenceResolution,
  type SourceRegistry,
} from "./source-registry.js";

export type V2CanonicalValueKind = "text" | "date" | "link" | "language";

/**
 * Semantic completeness is independent from textual grounding. SourceRegistry
 * fragments prove extraction provenance, not semantic-concept boundaries.
 */
export type SemanticCompletenessState =
  "proven_complete" | "unknown" | "proven_incomplete";

export interface V2CanonicalEvidence {
  readonly fragmentId: string;
  readonly fragmentHash: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly quote: string;
  readonly continuationToNext?: "none" | "space";
}

export interface V2CanonicalSemanticCandidate {
  readonly fieldPath: string;
  readonly groupPath: string;
  readonly candidateId: string;
  readonly fieldId: string;
  readonly value: string;
  readonly normalizedValue: string;
  readonly valueKind: V2CanonicalValueKind;
  readonly sourceStatus: "explicit_source";
  readonly confidence: "high";
  readonly inferenceStatus: "not_inferred" | "inferred_needs_review";
  readonly reviewStatus: "unreviewed";
  readonly evidence: readonly V2CanonicalEvidence[];
  readonly semanticCompleteness?: SemanticCompletenessState;
  readonly linkLabel?: string;
}

export interface V2CanonicalSignal {
  readonly kind: SemanticExtractionV2Signal["kind"];
  readonly evidence: readonly V2CanonicalEvidence[];
  readonly affectedFieldPaths: readonly string[];
}

export interface V2RejectedField {
  readonly path: readonly (string | number)[];
  readonly code:
    | "malformed_atom"
    | "missing_source_refs"
    | SourceReferenceFailureReason
    | "ambiguous_source_refs"
    | "duplicate_source_ref"
    | "overlapping_source_refs"
    | "value_not_grounded"
    | "materially_truncated_value"
    | "value_ambiguous"
    | "unsupported_typed_value"
    | "malformed_group"
    | "missing_required_group_field"
    | "unsupported_group_shape"
    | "malformed_relationship"
    | "relationship_not_supported_phase1"
    | "malformed_signal"
    | "signal_source_invalid";
}

export type V2CanonicalizationResult =
  | {
      readonly ok: true;
      readonly candidates: readonly V2CanonicalSemanticCandidate[];
      readonly signals: readonly V2CanonicalSignal[];
      readonly rejected: readonly V2RejectedField[];
    }
  | {
      readonly ok: false;
      readonly reason:
        | "malformed_json"
        | "response_too_large"
        | "response_depth_limit"
        | "total_atom_limit"
        | "total_node_limit"
        | "unsupported_contract_version"
        | "invalid_top_level_envelope";
      /**
       * Privacy-safe structural category for the whole-response failure. The
       * legacy `reason` is retained for provider error/recovery compatibility.
       */
      readonly failureCategory: SemanticExtractionV2WholeEnvelopeFailureCategory;
      readonly rejected: readonly V2RejectedField[];
    };

export type SemanticExtractionV2WholeEnvelopeFailureCategory =
  | "invalid_json"
  | "wrong_root_shape"
  | "missing_required_root_field"
  | "unexpected_root_field"
  | "invalid_section_shape"
  | "invalid_candidate_shape"
  | "invalid_source_ref_shape"
  | "unsupported_typed_value_shape"
  | "object_depth_exceeded"
  | "atom_limit_exceeded"
  | "node_limit_exceeded"
  | "response_size_exceeded"
  | "cardinality_limit_exceeded"
  | "other_schema_violation";

interface GroundedAtom {
  readonly value: string;
  readonly normalizedValue: string;
  readonly valueKind: V2CanonicalValueKind;
  readonly evidence: readonly V2CanonicalEvidence[];
  readonly semanticCompleteness?: SemanticCompletenessState;
  readonly linkLabel?: string;
}

type WholeResponseReason =
  | "malformed_json"
  | "response_too_large"
  | "response_depth_limit"
  | "total_atom_limit"
  | "total_node_limit"
  | "unsupported_contract_version"
  | "invalid_top_level_envelope";

export interface V2StructuralInspection {
  readonly serializedBytes: number;
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly atomCount: number;
  readonly depthLimitExceeded: boolean;
  readonly atomLimitExceeded: boolean;
  readonly nodeLimitExceeded: boolean;
}

const groupKeys = {
  work: ["employerName", "employerLocation", "roles"],
  role: [
    "title",
    "location",
    "startDate",
    "endDate",
    "responsibilities",
    "achievements",
  ],
  education: [
    "institution",
    "degree",
    "fieldOfStudy",
    "startDate",
    "endDate",
    "location",
  ],
  skill: ["name"],
  language: ["name", "proficiency"],
  project: ["name", "description"],
  certification: ["name", "issuer"],
} as const;

const semanticExtractionV2ContactKeySet: ReadonlySet<string> = new Set(
  semanticExtractionV2ContactKeys,
);

export function canonicalizeSemanticExtractionV2(input: {
  readonly response: unknown;
  readonly sourceRegistry: SourceRegistry;
  readonly importId: string;
}): V2CanonicalizationResult {
  const structure = inspectSemanticExtractionV2Structure(input.response);
  if (structure.serializedBytes > maxSemanticExtractionV2ResponseJsonBytes) {
    return wholeResponseFailure("response_too_large");
  }
  if (!isRecord(input.response)) {
    return wholeResponseFailure("malformed_json", "wrong_root_shape");
  }
  if (structure.depthLimitExceeded) {
    return wholeResponseFailure("response_depth_limit");
  }
  if (structure.atomLimitExceeded) {
    return wholeResponseFailure("total_atom_limit");
  }
  if (structure.nodeLimitExceeded) {
    return wholeResponseFailure("total_node_limit");
  }

  // The provider wire shape may omit deterministic absence markers to reduce
  // generation work. Expand only the known nullable fields and collections
  // before applying the unchanged strict V2 envelope. Required semantic
  // anchors (for example an employer name, role title, institution, skill
  // name, or URL) are deliberately not synthesized here.
  const response = expandCompactSemanticExtractionV2Response(input.response);

  const version = isRecord(response) ? response.schemaVersion : undefined;
  if (version !== "nuvitae.semantic-extraction.v2") {
    return wholeResponseFailure(
      "unsupported_contract_version",
      isRecord(response) &&
        !Object.prototype.hasOwnProperty.call(response, "schemaVersion")
        ? "missing_required_root_field"
        : "other_schema_violation",
    );
  }
  const envelope =
    nuvitaeSemanticExtractionV2EnvelopeSchema.safeParse(response);
  if (!envelope.success) {
    return wholeResponseFailure(
      "invalid_top_level_envelope",
      classifyEnvelopeFailure(response),
    );
  }

  const candidates: V2CanonicalSemanticCandidate[] = [];
  const rejected: V2RejectedField[] = [];
  const signals: V2CanonicalSignal[] = [];

  const accept = (
    raw: unknown,
    path: readonly (string | number)[],
    groupPath: string,
  ): GroundedAtom | undefined => {
    const grounded = groundAtom(raw, path, input.sourceRegistry, rejected);
    if (grounded === undefined) return undefined;
    candidates.push(toCandidate(grounded, path, groupPath, input.importId));
    return grounded;
  };

  const sections = envelope.data.sections;
  const contact = sections.contact;
  accept(contact.fullName, ["sections", "contact", "fullName"], "contact");
  accept(contact.email, ["sections", "contact", "email"], "contact");
  accept(contact.phone, ["sections", "contact", "phone"], "contact");
  accept(contact.location, ["sections", "contact", "location"], "contact");
  accept(contact.website, ["sections", "contact", "website"], "contact");
  accept(sections.headline, ["sections", "headline"], "headline");
  accept(sections.summary, ["sections", "summary"], "summary");

  sections.workExperience.forEach((raw, index) => {
    const path = ["sections", "workExperience", index] as const;
    const groupStart = candidates.length;
    const workShape = groupShape(raw, groupKeys.work);
    if (workShape !== "valid") {
      rejected.push({
        path,
        code:
          workShape === "unsupported"
            ? "unsupported_group_shape"
            : "malformed_group",
      });
      return;
    }
    if (!isRecord(raw)) return;
    const groupPath = `workExperience.${index}`;
    const employer = accept(
      raw.employerName,
      [...path, "employerName"],
      groupPath,
    );
    accept(raw.employerLocation, [...path, "employerLocation"], groupPath);
    let validRoles = 0;
    if (!Array.isArray(raw.roles)) {
      rejected.push({ path: [...path, "roles"], code: "malformed_group" });
    } else {
      raw.roles.forEach((role, roleIndex) => {
        const rolePath = [...path, "roles", roleIndex] as const;
        const roleStart = candidates.length;
        const roleShape = groupShape(role, groupKeys.role);
        if (roleShape !== "valid") {
          rejected.push({
            path: rolePath,
            code:
              roleShape === "unsupported"
                ? "unsupported_group_shape"
                : "malformed_group",
          });
          return;
        }
        if (!isRecord(role)) return;
        const rolePathName = `${groupPath}.roles.${roleIndex}`;
        const title = accept(role.title, [...rolePath, "title"], rolePathName);
        if (title === undefined) {
          candidates.splice(roleStart);
          rejected.push({
            path: [...rolePath, "title"],
            code: "missing_required_group_field",
          });
          return;
        }
        validRoles += 1;
        accept(role.location, [...rolePath, "location"], rolePathName);
        accept(role.startDate, [...rolePath, "startDate"], rolePathName);
        accept(role.endDate, [...rolePath, "endDate"], rolePathName);
        acceptArray(
          role.responsibilities,
          [...rolePath, "responsibilities"],
          rolePathName,
          accept,
        );
        acceptArray(
          role.achievements,
          [...rolePath, "achievements"],
          rolePathName,
          accept,
        );
      });
    }
    if (employer === undefined || validRoles === 0) {
      candidates.splice(groupStart);
      rejected.push({ path, code: "missing_required_group_field" });
    }
  });

  sections.education.forEach((raw, index) => {
    const path = ["sections", "education", index] as const;
    const groupStart = candidates.length;
    const educationShape = groupShape(raw, groupKeys.education);
    if (educationShape !== "valid") {
      rejected.push({
        path,
        code:
          educationShape === "unsupported"
            ? "unsupported_group_shape"
            : "malformed_group",
      });
      return;
    }
    if (!isRecord(raw)) return;
    const groupPath = `education.${index}`;
    const institution = accept(
      raw.institution,
      [...path, "institution"],
      groupPath,
    );
    accept(raw.degree, [...path, "degree"], groupPath);
    accept(raw.fieldOfStudy, [...path, "fieldOfStudy"], groupPath);
    accept(raw.startDate, [...path, "startDate"], groupPath);
    accept(raw.endDate, [...path, "endDate"], groupPath);
    accept(raw.location, [...path, "location"], groupPath);
    if (institution === undefined) {
      candidates.splice(groupStart);
      rejected.push({ path, code: "missing_required_group_field" });
    }
  });

  sections.skills.forEach((raw, index) => {
    const path = ["sections", "skills", index] as const;
    const skillShape = groupShape(raw, groupKeys.skill);
    if (skillShape !== "valid") {
      rejected.push({
        path,
        code:
          skillShape === "unsupported"
            ? "unsupported_group_shape"
            : "malformed_group",
      });
      return;
    }
    if (!isRecord(raw)) return;
    accept(raw.name, [...path, "name"], `skills.${index}`);
  });

  sections.languages.forEach((raw, index) => {
    const path = ["sections", "languages", index] as const;
    const languageShape = groupShape(raw, groupKeys.language);
    if (languageShape !== "valid") {
      rejected.push({
        path,
        code:
          languageShape === "unsupported"
            ? "unsupported_group_shape"
            : "malformed_group",
      });
      return;
    }
    if (!isRecord(raw)) return;
    const name = accept(raw.name, [...path, "name"], `languages.${index}`);
    if (name !== undefined) {
      accept(raw.proficiency, [...path, "proficiency"], `languages.${index}`);
    }
  });

  sections.projects.forEach((raw, index) => {
    const path = ["sections", "projects", index] as const;
    const groupStart = candidates.length;
    const projectShape = groupShape(raw, groupKeys.project);
    if (projectShape !== "valid") {
      rejected.push({
        path,
        code:
          projectShape === "unsupported"
            ? "unsupported_group_shape"
            : "malformed_group",
      });
      return;
    }
    if (!isRecord(raw)) return;
    const groupPath = `projects.${index}`;
    const name = accept(raw.name, [...path, "name"], groupPath);
    const description = accept(
      raw.description,
      [...path, "description"],
      groupPath,
    );
    if (
      name !== undefined &&
      description === undefined &&
      looksLikeProjectSectionHeading(name.value)
    ) {
      candidates.splice(groupStart);
      rejected.push({ path, code: "missing_required_group_field" });
      return;
    }
    if (name === undefined) {
      candidates.splice(groupStart);
      rejected.push({ path, code: "missing_required_group_field" });
    }
  });

  sections.certifications.forEach((raw, index) => {
    const path = ["sections", "certifications", index] as const;
    const groupStart = candidates.length;
    const certificationShape = groupShape(raw, groupKeys.certification);
    if (certificationShape !== "valid") {
      rejected.push({
        path,
        code:
          certificationShape === "unsupported"
            ? "unsupported_group_shape"
            : "malformed_group",
      });
      return;
    }
    if (!isRecord(raw)) return;
    const groupPath = `certifications.${index}`;
    const name = accept(raw.name, [...path, "name"], groupPath);
    accept(raw.issuer, [...path, "issuer"], groupPath);
    if (name === undefined) {
      candidates.splice(groupStart);
      rejected.push({ path, code: "missing_required_group_field" });
    }
  });

  sections.professionalLinks.forEach((raw, index) => {
    acceptProfessionalLink(raw, index, input, candidates, rejected);
  });

  envelope.data.relationships.forEach((raw, index) => {
    const path = ["relationships", index] as const;
    const parsed = semanticExtractionV2RelationshipSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ path, code: "malformed_relationship" });
      return;
    }
    // The relationship shape is reserved, but category is not a supported V1
    // destination. It is therefore rejected without creating endpoint fields.
    rejected.push({ path, code: "relationship_not_supported_phase1" });
  });

  acceptSignals(
    envelope.data.ambiguities,
    "ambiguities",
    input.sourceRegistry,
    signals,
    rejected,
  );
  acceptSignals(
    envelope.data.conflicts,
    "conflicts",
    input.sourceRegistry,
    signals,
    rejected,
  );

  const classifiedSignals = signals.map((signal) => ({
    ...signal,
    affectedFieldPaths: affectedLongFormFieldPaths(signal, candidates),
  }));
  const reviewRequired = new Set(
    classifiedSignals.flatMap((signal) => signal.affectedFieldPaths),
  );
  return {
    ok: true,
    candidates: candidates.map((candidate) =>
      reviewRequired.has(candidate.fieldPath) ||
      candidate.semanticCompleteness === "unknown"
        ? { ...candidate, inferenceStatus: "inferred_needs_review" as const }
        : candidate,
    ),
    signals: classifiedSignals,
    rejected,
  };
}

/**
 * Expands the compact provider wire form into the stable V2 envelope.
 *
 * Omitted values mean the same thing as the existing explicit `null`/`[]`
 * representation only for the paths listed here. This keeps the external
 * semantic-extraction.v2/domain contract unchanged while allowing the
 * provider adapter to avoid repeatedly generating known absence metadata.
 */
function expandCompactSemanticExtractionV2Response(response: unknown): unknown {
  if (!isRecord(response) || !isRecord(response.sections)) return response;

  const sections = response.sections;
  const expandedSections: Record<string, unknown> = {
    ...sections,
    contact: expandCompactContact(sections.contact),
    headline: sections.headline === undefined ? null : sections.headline,
    summary: sections.summary === undefined ? null : sections.summary,
  };

  for (const key of [
    "workExperience",
    "education",
    "skills",
    "languages",
    "projects",
    "certifications",
    "professionalLinks",
  ] as const) {
    expandedSections[key] = expandCompactCollection(sections[key]);
  }

  expandedSections.workExperience = Array.isArray(
    expandedSections.workExperience,
  )
    ? expandedSections.workExperience.map(expandCompactWorkExperience)
    : expandedSections.workExperience;
  expandedSections.education = Array.isArray(expandedSections.education)
    ? expandedSections.education.map(expandCompactEducation)
    : expandedSections.education;
  expandedSections.languages = Array.isArray(expandedSections.languages)
    ? expandedSections.languages.map(expandCompactLanguage)
    : expandedSections.languages;
  expandedSections.projects = Array.isArray(expandedSections.projects)
    ? expandedSections.projects.map(expandCompactProject)
    : expandedSections.projects;
  expandedSections.certifications = Array.isArray(
    expandedSections.certifications,
  )
    ? expandedSections.certifications.map(expandCompactCertification)
    : expandedSections.certifications;
  expandedSections.professionalLinks = Array.isArray(
    expandedSections.professionalLinks,
  )
    ? expandedSections.professionalLinks.map(expandCompactProfessionalLink)
    : expandedSections.professionalLinks;

  return {
    ...response,
    sections: expandedSections,
    relationships: expandCompactCollection(response.relationships),
    ambiguities: expandCompactCollection(response.ambiguities),
    conflicts: expandCompactCollection(response.conflicts),
  };
}

function expandCompactContact(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return expandNullableFields(value, semanticExtractionV2ContactKeys);
}

function expandCompactWorkExperience(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const expanded = expandNullableFields(value, ["employerLocation"]);
  if (!isRecord(expanded)) return expanded;
  return {
    ...expanded,
    roles: Array.isArray(expanded.roles)
      ? expanded.roles.map(expandCompactRole)
      : expanded.roles,
  };
}

function expandCompactRole(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...expandNullableFields(value, ["location", "startDate", "endDate"]),
    responsibilities: expandCompactCollection(value.responsibilities),
    achievements: expandCompactCollection(value.achievements),
  };
}

function expandCompactEducation(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return expandNullableFields(value, [
    "degree",
    "fieldOfStudy",
    "startDate",
    "endDate",
    "location",
  ]);
}

function expandCompactLanguage(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return expandNullableFields(value, ["proficiency"]);
}

function expandCompactProject(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return expandNullableFields(value, ["description"]);
}

function expandCompactCertification(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return expandNullableFields(value, ["issuer"]);
}

function expandCompactProfessionalLink(value: unknown): unknown {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "url"))
    return value;
  return expandNullableFields(value, ["label"]);
}

function expandCompactCollection(value: unknown): unknown[] | unknown {
  if (value === undefined) return [];
  return value;
}

function expandNullableFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const expanded = { ...value };
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(expanded, field))
      expanded[field] = null;
  }
  return expanded;
}

function acceptSignals(
  rawSignals: readonly unknown[],
  root: "ambiguities" | "conflicts",
  registry: SourceRegistry,
  accepted: V2CanonicalSignal[],
  rejected: V2RejectedField[],
): void {
  rawSignals.forEach((raw, index) => {
    const path = [root, index] as const;
    const parsed = semanticExtractionV2SignalSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ path, code: "malformed_signal" });
      return;
    }
    const evidence = resolveReferences(parsed.data.sourceRefs, registry);
    if (evidence === undefined) {
      rejected.push({ path, code: "signal_source_invalid" });
      return;
    }
    accepted.push({ kind: parsed.data.kind, evidence, affectedFieldPaths: [] });
  });
}

function groundAtom(
  raw: unknown,
  path: readonly (string | number)[],
  registry: SourceRegistry,
  rejected: V2RejectedField[],
): GroundedAtom | undefined {
  if (raw === null) return undefined;
  if (!isRecord(raw)) {
    rejected.push({ path, code: "malformed_atom" });
    return undefined;
  }
  if (!Object.prototype.hasOwnProperty.call(raw, "sourceRefs")) {
    rejected.push({ path, code: "missing_source_refs" });
    return undefined;
  }
  if (!Array.isArray(raw.sourceRefs)) {
    rejected.push({ path, code: "malformed_source_ref" });
    return undefined;
  }
  if (raw.sourceRefs.length === 0) {
    rejected.push({ path, code: "missing_source_refs" });
    return undefined;
  }
  if (
    raw.sourceRefs.some(
      (reference) =>
        !semanticExtractionV2SourceRefSchema.safeParse(reference).success,
    )
  ) {
    rejected.push({ path, code: "malformed_source_ref" });
    return undefined;
  }
  // Provider-owned metadata is not part of Nuvitae's atom contract. Project
  // only the two allowed members, then apply the unchanged strict shape and
  // grounding checks below. Malformed values or references still fail closed.
  const parsed = semanticExtractionV2AtomSchema.safeParse({
    value: raw.value,
    sourceRefs: raw.sourceRefs,
  });
  if (!parsed.success) {
    rejected.push({ path, code: "malformed_atom" });
    return undefined;
  }
  let references = parsed.data.sourceRefs;
  const longForm = isLongFormFieldPath(path);
  if (!longForm && references.length > 1) {
    const independentlyGrounding = references.filter((candidate) => {
      const resolution = registry.resolve(candidate);
      if (!resolution.ok) return false;
      const offset = findValueOffset(
        resolution,
        parsed.data.value,
        valueKindForPath(path),
      );
      return (
        offset !== undefined &&
        findValueOffset(
          resolution,
          parsed.data.value,
          valueKindForPath(path),
          offset + 1,
        ) === undefined
      );
    });
    // A provider may over-cite contextual fragments. When exactly one cited
    // fragment proves the complete scalar, retain that proof and discard only
    // the unrelated citations. Split scalars still use the strict continuation
    // path below.
    if (independentlyGrounding.length === 1)
      references = independentlyGrounding;
  }
  const reference = references[0];
  if (reference === undefined) {
    rejected.push({ path, code: "missing_source_refs" });
    return undefined;
  }
  const valueKind = valueKindForPath(path);
  if (longForm) {
    const longFormResult = resolveLongFormAtom(
      parsed.data.value,
      references,
      valueKind,
      registry,
    );
    if (!longFormResult.ok) {
      rejected.push({ path, code: longFormResult.code });
      return undefined;
    }
    return longFormResult.atom;
  }
  if (references.length > 1) {
    const splitScalarResult = resolveSplitScalarAtom(
      parsed.data.value,
      references,
      valueKind,
      registry,
    );
    if (!splitScalarResult.ok) {
      rejected.push({ path, code: splitScalarResult.code });
      return undefined;
    }
    return splitScalarResult.atom;
  }
  const resolution = registry.resolve(reference);
  if (!resolution.ok) {
    rejected.push({ path, code: resolution.reason });
    return undefined;
  }
  const valueOffset = findValueOffset(resolution, parsed.data.value, valueKind);
  if (valueOffset === undefined) {
    rejected.push({ path, code: "value_not_grounded" });
    return undefined;
  }
  if (
    findValueOffset(
      resolution,
      parsed.data.value,
      valueKind,
      valueOffset + 1,
    ) !== undefined
  ) {
    rejected.push({ path, code: "value_ambiguous" });
    return undefined;
  }
  const value = resolution.fragment.text.slice(
    resolution.start + valueOffset,
    resolution.start +
      valueOffset +
      normalizedMatchLength(
        parsed.data.value,
        valueKind,
        resolution.quote,
        valueOffset,
      ),
  );
  const normalized = normalizeTypedValue(value, valueKind);
  if (normalized === undefined) {
    rejected.push({ path, code: "unsupported_typed_value" });
    return undefined;
  }
  return {
    value,
    normalizedValue: normalized.value,
    valueKind,
    ...(normalized.linkLabel === undefined
      ? {}
      : { linkLabel: normalized.linkLabel }),
    evidence: [
      {
        fragmentId: resolution.fragment.fragmentId,
        fragmentHash: resolution.fragment.hash,
        line: resolution.fragment.line,
        start: resolution.fragment.start + resolution.start + valueOffset,
        end:
          resolution.fragment.start +
          resolution.start +
          valueOffset +
          normalizedMatchLength(
            parsed.data.value,
            valueKind,
            resolution.quote,
            valueOffset,
          ),
        quote: resolution.quote,
      },
    ],
  };
}

function resolveSplitScalarAtom(
  value: string,
  references: readonly Parameters<SourceRegistry["resolve"]>[0][],
  kind: V2CanonicalValueKind,
  registry: SourceRegistry,
):
  | { readonly ok: true; readonly atom: GroundedAtom }
  | {
      readonly ok: false;
      readonly code:
        | SourceReferenceFailureReason
        | "ambiguous_source_refs"
        | "duplicate_source_ref"
        | "overlapping_source_refs"
        | "value_not_grounded"
        | "unsupported_typed_value";
    } {
  const resolved: Array<
    Extract<SourceReferenceResolution, { readonly ok: true }>
  > = [];
  for (const reference of references) {
    const result = registry.resolve(reference);
    if (!result.ok) return { ok: false, code: result.reason };
    const sameFragment = resolved.find(
      (item) => item.fragment.fragmentId === result.fragment.fragmentId,
    );
    if (sameFragment !== undefined) {
      if (
        sameFragment.start === result.start &&
        sameFragment.end === result.end
      )
        return { ok: false, code: "duplicate_source_ref" };
      if (sameFragment.start < result.end && result.start < sameFragment.end)
        return { ok: false, code: "overlapping_source_refs" };
      return { ok: false, code: "ambiguous_source_refs" };
    }
    resolved.push(result);
  }

  let reconstructed = resolved[0]?.quote ?? "";
  for (let index = 1; index < resolved.length; index += 1) {
    const previous = resolved[index - 1];
    const current = resolved[index];
    if (previous === undefined || current === undefined) {
      return { ok: false, code: "ambiguous_source_refs" };
    }
    if (
      current.fragment.order !== previous.fragment.order + 1 ||
      previous.end !== previous.fragment.text.length ||
      current.start !== 0 ||
      previous.fragment.continuationToNext === null
    ) {
      return { ok: false, code: "ambiguous_source_refs" };
    }
    reconstructed +=
      previous.fragment.continuationToNext === "space" ? " " : "";
    reconstructed += current.quote;
  }

  if (normalizeSourceText(value) !== reconstructed) {
    return { ok: false, code: "value_not_grounded" };
  }
  const normalized = normalizeTypedValue(reconstructed, kind);
  if (normalized === undefined) {
    return { ok: false, code: "unsupported_typed_value" };
  }
  return {
    ok: true,
    atom: {
      value: reconstructed,
      normalizedValue: normalized.value,
      valueKind: kind,
      ...(normalized.linkLabel === undefined
        ? {}
        : { linkLabel: normalized.linkLabel }),
      evidence: resolved.map((result, index) => ({
        fragmentId: result.fragment.fragmentId,
        fragmentHash: result.fragment.hash,
        line: result.fragment.line,
        start: result.fragment.start + result.start,
        end: result.fragment.start + result.end,
        quote: result.quote,
        ...(index === resolved.length - 1 ||
        result.fragment.continuationToNext === null
          ? {}
          : { continuationToNext: result.fragment.continuationToNext }),
      })),
    },
  };
}

function resolveLongFormAtom(
  value: string,
  references: readonly Parameters<SourceRegistry["resolve"]>[0][],
  kind: V2CanonicalValueKind,
  registry: SourceRegistry,
):
  | { readonly ok: true; readonly atom: GroundedAtom }
  | {
      readonly ok: false;
      readonly code:
        | SourceReferenceFailureReason
        | "ambiguous_source_refs"
        | "duplicate_source_ref"
        | "overlapping_source_refs"
        | "value_not_grounded"
        | "materially_truncated_value"
        | "unsupported_typed_value";
    } {
  if (kind !== "text") return { ok: false, code: "unsupported_typed_value" };
  const resolved: Array<
    Extract<SourceReferenceResolution, { readonly ok: true }>
  > = [];
  const seen = new Set<string>();
  for (const reference of references) {
    const key = `${reference.fragmentId}\u0000${normalizeSourceText(reference.quote)}`;
    if (seen.has(key)) return { ok: false, code: "duplicate_source_ref" };
    seen.add(key);
    const result = registry.resolve(reference);
    if (!result.ok) return { ok: false, code: result.reason };
    resolved.push(result);
  }
  for (let index = 1; index < resolved.length; index += 1) {
    const previous = resolved[index - 1];
    const current = resolved[index];
    if (previous === undefined || current === undefined) continue;
    if (
      current.fragment.order < previous.fragment.order ||
      (current.fragment.fragmentId === previous.fragment.fragmentId &&
        current.start < previous.start)
    ) {
      return { ok: false, code: "ambiguous_source_refs" };
    }
    if (
      current.fragment.fragmentId === previous.fragment.fragmentId &&
      current.start < previous.end
    ) {
      return { ok: false, code: "overlapping_source_refs" };
    }
  }
  const canonicalSpans: Array<{
    readonly fragment: (typeof resolved)[number]["fragment"];
    readonly start: number;
    readonly end: number;
    readonly continuationToNext?: "none" | "space";
  }> = [];
  for (const item of resolved) {
    const previous = canonicalSpans.at(-1);
    if (previous?.fragment.fragmentId === item.fragment.fragmentId) {
      const omitted = item.fragment.text.slice(previous.end, item.start);
      if (omitted.trim().length > 0)
        return { ok: false, code: "ambiguous_source_refs" };
      canonicalSpans[canonicalSpans.length - 1] = {
        fragment: previous.fragment,
        start: previous.start,
        end: item.end,
        ...(previous.continuationToNext === undefined
          ? {}
          : { continuationToNext: previous.continuationToNext }),
      };
      continue;
    }
    if (
      previous !== undefined &&
      (item.fragment.order !== previous.fragment.order + 1 ||
        previous.end !== previous.fragment.text.length ||
        item.start !== 0 ||
        previous.fragment.continuationToNext === null)
    ) {
      return { ok: false, code: "ambiguous_source_refs" };
    }
    if (previous !== undefined) {
      canonicalSpans[canonicalSpans.length - 1] = {
        ...previous,
        continuationToNext: previous.fragment.continuationToNext ?? "none",
      };
    }
    canonicalSpans.push({
      fragment: item.fragment,
      start: item.start,
      end: item.end,
    });
  }

  const reconstructed = canonicalSpans
    .map((span, index) => {
      const selected = span.fragment.text.slice(span.start, span.end);
      if (index === canonicalSpans.length - 1) return selected;
      return `${selected}${span.continuationToNext === "space" ? " " : ""}`;
    })
    .join("");
  if (normalizeSourceText(value) !== normalizeSourceText(reconstructed)) {
    return { ok: false, code: "value_not_grounded" };
  }
  return {
    ok: true,
    atom: {
      value: reconstructed,
      normalizedValue: normalizeSourceText(reconstructed),
      valueKind: kind,
      // Absence of evidence of truncation is not evidence of completeness.
      // Extraction boundaries are not semantic boundaries, so the current
      // source model can ground this value but cannot generically prove the
      // complete semantic concept (or prove that it was truncated).
      semanticCompleteness: "unknown",
      evidence: canonicalSpans.map((span, index) => ({
        fragmentId: span.fragment.fragmentId,
        fragmentHash: span.fragment.hash,
        line: span.fragment.line,
        start: span.fragment.start + span.start,
        end: span.fragment.start + span.end,
        quote: span.fragment.text.slice(span.start, span.end),
        ...(index === canonicalSpans.length - 1 ||
        span.continuationToNext === undefined
          ? {}
          : { continuationToNext: span.continuationToNext }),
      })),
    },
  };
}

const groundedReviewSignalKinds = new Set<SemanticExtractionV2Signal["kind"]>([
  "ambiguous_section",
  "ambiguous_grouping",
  "ambiguous_role_association",
]);

function affectedLongFormFieldPaths(
  signal: V2CanonicalSignal,
  candidates: readonly V2CanonicalSemanticCandidate[],
): readonly string[] {
  if (!groundedReviewSignalKinds.has(signal.kind)) return [];
  const anchors = candidates.filter((candidate) =>
    candidate.evidence.some((candidateEvidence) =>
      signal.evidence.some((signalEvidence) =>
        evidenceOverlaps(candidateEvidence, signalEvidence),
      ),
    ),
  );
  if (signal.kind === "ambiguous_section") {
    return anchors
      .filter(isLongFormCandidate)
      .map((candidate) => candidate.fieldPath);
  }
  return candidates
    .filter(
      (candidate) =>
        isLongFormCandidate(candidate) &&
        anchors.some((anchor) => groupPathsAreRelated(anchor, candidate)),
    )
    .map((candidate) => candidate.fieldPath);
}

function evidenceOverlaps(
  left: V2CanonicalEvidence,
  right: V2CanonicalEvidence,
): boolean {
  return (
    left.fragmentId === right.fragmentId &&
    left.start < right.end &&
    right.start < left.end
  );
}

function groupPathsAreRelated(
  left: V2CanonicalSemanticCandidate,
  right: V2CanonicalSemanticCandidate,
): boolean {
  return (
    left.groupPath === right.groupPath ||
    left.groupPath.startsWith(`${right.groupPath}.`) ||
    right.groupPath.startsWith(`${left.groupPath}.`)
  );
}

function isLongFormCandidate(candidate: V2CanonicalSemanticCandidate): boolean {
  return (
    candidate.fieldPath === "summary" ||
    candidate.fieldPath.includes(".responsibilities.") ||
    candidate.fieldPath.includes(".achievements.") ||
    /^projects\.\d+\.description$/u.test(candidate.fieldPath)
  );
}

function findValueOffset(
  resolution: Extract<SourceReferenceResolution, { readonly ok: true }>,
  value: string,
  kind: V2CanonicalValueKind,
  fromIndex = 0,
): number | undefined {
  const candidate = normalizeSourceText(value);
  const exact = resolution.quote.indexOf(candidate, fromIndex);
  if (exact >= 0) return exact;
  if (kind === "text" || kind === "language" || kind === "date")
    return undefined;
  const loweredQuote = resolution.quote.toLocaleLowerCase();
  const loweredValue = candidate.toLocaleLowerCase();
  const lowered = loweredQuote.indexOf(loweredValue, fromIndex);
  return lowered >= 0 ? lowered : undefined;
}

function normalizedMatchLength(
  value: string,
  kind: V2CanonicalValueKind,
  quote: string,
  offset: number,
): number {
  const normalized = normalizeSourceText(value);
  if (kind !== "link") return normalized.length;
  const exact = quote.slice(offset).toLocaleLowerCase();
  const lower = normalized.toLocaleLowerCase();
  return exact.startsWith(lower) ? normalized.length : normalized.length;
}

function normalizeTypedValue(
  value: string,
  kind: V2CanonicalValueKind,
): { readonly value: string; readonly linkLabel?: string } | undefined {
  const normalized = normalizeSourceText(value);
  if (kind === "date") {
    return normalizePartialDate(normalized);
  }
  if (kind === "link") {
    const urlMatch = /https?:\/\/[^\s<>]+/iu.exec(normalized);
    if (urlMatch === null) return undefined;
    try {
      const url = new URL(urlMatch[0]);
      if (url.protocol !== "http:" && url.protocol !== "https:")
        return undefined;
      const label = normalizeSourceText(
        normalized.slice(0, urlMatch.index).replace(/[|:,-]+$/u, ""),
      );
      return {
        value: url.toString(),
        ...(label.length === 0 ? {} : { linkLabel: label }),
      };
    } catch {
      return undefined;
    }
  }
  if (normalized.length === 0) return undefined;
  if (kind === "language") return { value: normalized };
  return { value: normalized.toLocaleLowerCase() };
}

function normalizePartialDate(
  value: string,
): { readonly value: string } | undefined {
  const lowered = value.toLocaleLowerCase();
  if (
    /^(?:present|current|now|ongoing|en cours|présent|actuel|actualidad|presente|en curso|حتى الآن|الآن|حاليًا|حالياً|حاليا)$/iu.test(
      lowered,
    )
  )
    return { value: "current" };
  // This changes only the typed comparison value. `candidate.value` and its
  // grounded quote retain the source digits and spelling for review.
  const decimalDigits = normalizeDecimalDigits(value);
  const year = /^(?:19|20)\d{2}$/u.exec(decimalDigits)?.[0];
  if (year !== undefined) return { value: year };
  const yearMonth =
    /^(?:(\d{1,2})[/-]((?:19|20)\d{2})|((?:19|20)\d{2})[/-](\d{1,2}))$/u.exec(
      decimalDigits,
    );
  if (yearMonth !== null) {
    const month = Number(yearMonth[1] ?? yearMonth[4]);
    const parsedYear = Number(yearMonth[2] ?? yearMonth[3]);
    if (month >= 1 && month <= 12) {
      return { value: `${parsedYear}-${String(month).padStart(2, "0")}` };
    }
    return undefined;
  }
  // Year/month ideographs make the ordering explicit, unlike a day/month
  // numeric date. Accept the structure without translating any source text.
  const ideographicYearMonth = /^((?:19|20)\d{2})年(\d{1,2})月$/u.exec(
    decimalDigits,
  );
  if (ideographicYearMonth !== null) {
    const month = Number(ideographicYearMonth[2]);
    if (month >= 1 && month <= 12) {
      return {
        value: `${ideographicYearMonth[1]}-${String(month).padStart(2, "0")}`,
      };
    }
    return undefined;
  }
  const monthNames: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
    janvier: 1,
    février: 2,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    août: 8,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    décembre: 12,
    decembre: 12,
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };
  const monthYear = /^([\p{L}.]+)(?:[ ,/-]+| de )((?:19|20)\d{2})$/u.exec(
    normalizeDecimalDigits(lowered),
  );
  if (monthYear !== null) {
    const month = monthNames[monthYear[1]?.replace(/\.$/u, "") ?? ""];
    if (month !== undefined)
      return { value: `${monthYear[2]}-${String(month).padStart(2, "0")}` };
  }
  return undefined;
}

function normalizeDecimalDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/gu, (digit) => {
    const codePoint = digit.codePointAt(0)!;
    const zero = codePoint >= 0x660 && codePoint <= 0x669 ? 0x660 : 0x6f0;
    return String(codePoint - zero);
  });
}

function isLongFormFieldPath(path: readonly (string | number)[]): boolean {
  return (
    path.includes("summary") ||
    path.includes("responsibilities") ||
    path.includes("achievements") ||
    (path.includes("projects") && path.at(-1) === "description")
  );
}

function looksLikeProjectSectionHeading(value: string): boolean {
  return /^(?:open\s+source\s*(?:&|and)\s*)?personal\s+projects?$|^open\s+source\s*(?:&|and)\s*personal\s+projects?$|^projects?$/iu.test(
    normalizeSourceText(value),
  );
}

function valueKindForPath(
  path: readonly (string | number)[],
): V2CanonicalValueKind {
  const leaf = path.at(-1);
  if (leaf === "label") return "text";
  if (leaf === "startDate" || leaf === "endDate") return "date";
  if (leaf === "website" || path.includes("professionalLinks")) return "link";
  if (leaf === "name" && path.includes("languages")) return "language";
  return "text";
}

function toCandidate(
  grounded: GroundedAtom,
  path: readonly (string | number)[],
  groupPath: string,
  importId: string,
): V2CanonicalSemanticCandidate {
  const fieldPath = pathToFieldPath(path);
  const candidateId = `candidate-${importId}-${groupPath.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}`;
  const fieldId = `field-${importId}-${fieldPath.replaceAll(/[^A-Za-z0-9_-]/gu, "-")}`;
  return {
    fieldPath,
    groupPath,
    candidateId,
    fieldId,
    value: grounded.value,
    normalizedValue: grounded.normalizedValue,
    valueKind: grounded.valueKind,
    sourceStatus: "explicit_source",
    confidence: "high",
    inferenceStatus: "not_inferred",
    reviewStatus: "unreviewed",
    evidence: grounded.evidence,
    ...(grounded.semanticCompleteness === undefined
      ? {}
      : { semanticCompleteness: grounded.semanticCompleteness }),
    ...(grounded.linkLabel === undefined
      ? {}
      : { linkLabel: grounded.linkLabel }),
  };
}

function acceptProfessionalLink(
  raw: unknown,
  index: number,
  input: {
    readonly sourceRegistry: SourceRegistry;
    readonly importId: string;
  },
  candidates: V2CanonicalSemanticCandidate[],
  rejected: V2RejectedField[],
): void {
  const path = ["sections", "professionalLinks", index] as const;
  const groupPath = `professionalLinks.${index}`;
  if (!isRecord(raw) || !Object.prototype.hasOwnProperty.call(raw, "url")) {
    const grounded = groundAtom(raw, path, input.sourceRegistry, rejected);
    if (grounded !== undefined) {
      candidates.push(toCandidate(grounded, path, groupPath, input.importId));
    }
    return;
  }
  const keys = Object.keys(raw);
  if (
    keys.some((key) => key !== "label" && key !== "url") ||
    !Object.prototype.hasOwnProperty.call(raw, "label")
  ) {
    rejected.push({ path, code: "malformed_group" });
    return;
  }
  const url = groundAtom(
    raw.url,
    [...path, "url"],
    input.sourceRegistry,
    rejected,
  );
  if (url === undefined) return;
  const label = groundAtom(
    raw.label,
    [...path, "label"],
    input.sourceRegistry,
    rejected,
  );
  const merged = {
    ...url,
    ...(label === undefined ? {} : { linkLabel: label.value }),
    evidence:
      label === undefined ? url.evidence : [...url.evidence, ...label.evidence],
  } satisfies GroundedAtom;
  candidates.push(toCandidate(merged, path, groupPath, input.importId));
}

function acceptArray(
  raw: unknown,
  path: readonly (string | number)[],
  groupPath: string,
  accept: (
    raw: unknown,
    path: readonly (string | number)[],
    groupPath: string,
  ) => GroundedAtom | undefined,
): void {
  if (!Array.isArray(raw)) return;
  raw.forEach((item, index) =>
    accept(item, [...path, index], `${groupPath}.${path.at(-1)}.${index}`),
  );
}

function resolveReferences(
  references: readonly Parameters<SourceRegistry["resolve"]>[0][],
  registry: SourceRegistry,
): readonly V2CanonicalEvidence[] | undefined {
  const seen = new Set<string>();
  const resolved: Array<
    Extract<SourceReferenceResolution, { readonly ok: true }>
  > = [];
  for (const reference of references) {
    const key = `${reference.fragmentId}\u0000${normalizeSourceText(reference.quote)}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    const result = registry.resolve(reference);
    if (!result.ok) return undefined;
    resolved.push(result);
  }
  for (let index = 0; index < resolved.length; index += 1) {
    const left = resolved[index];
    if (left === undefined) continue;
    for (let next = index + 1; next < resolved.length; next += 1) {
      const right = resolved[next];
      if (
        right !== undefined &&
        left.fragment.fragmentId === right.fragment.fragmentId &&
        left.start < right.end &&
        right.start < left.end
      ) {
        return undefined;
      }
    }
  }
  return resolved.map((result) => ({
    fragmentId: result.fragment.fragmentId,
    fragmentHash: result.fragment.hash,
    line: result.fragment.line,
    start: result.fragment.start + result.start,
    end: result.fragment.start + result.end,
    quote: result.quote,
  }));
}

function pathToFieldPath(path: readonly (string | number)[]): string {
  return path
    .slice(1)
    .map((part) => (typeof part === "number" ? String(part) : part))
    .join(".");
}

function groupShape(
  value: unknown,
  keys: readonly string[],
): "valid" | "malformed" | "unsupported" {
  if (!isRecord(value)) return "malformed";
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) return "unsupported";
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    ? "valid"
    : "malformed";
}

function wholeResponseFailure(
  reason: WholeResponseReason,
  failureCategory: SemanticExtractionV2WholeEnvelopeFailureCategory = wholeEnvelopeFailureCategoryForReason(
    reason,
  ),
): V2CanonicalizationResult {
  return { ok: false, reason, failureCategory, rejected: [] };
}

function wholeEnvelopeFailureCategoryForReason(
  reason: WholeResponseReason,
): SemanticExtractionV2WholeEnvelopeFailureCategory {
  switch (reason) {
    case "malformed_json":
      return "invalid_json";
    case "response_too_large":
      return "response_size_exceeded";
    case "response_depth_limit":
      return "object_depth_exceeded";
    case "total_atom_limit":
      return "atom_limit_exceeded";
    case "total_node_limit":
      return "node_limit_exceeded";
    case "unsupported_contract_version":
      return "other_schema_violation";
    case "invalid_top_level_envelope":
      return "other_schema_violation";
  }
}

/**
 * Classifies only the response boundary. Candidate atoms, source references,
 * and typed values intentionally do not fail the envelope: they are handled
 * by field-level canonicalization so valid siblings can survive.
 */
function classifyEnvelopeFailure(
  response: unknown,
): SemanticExtractionV2WholeEnvelopeFailureCategory {
  if (!isRecord(response)) return "wrong_root_shape";

  const requiredRootKeys = [
    "schemaVersion",
    "sections",
    "relationships",
    "ambiguities",
    "conflicts",
  ];
  const presentRootKeys = new Set(Object.keys(response));
  if (requiredRootKeys.some((key) => !presentRootKeys.has(key))) {
    return "missing_required_root_field";
  }
  if (Object.keys(response).some((key) => !requiredRootKeys.includes(key))) {
    return "unexpected_root_field";
  }
  if (response.schemaVersion !== "nuvitae.semantic-extraction.v2") {
    return "other_schema_violation";
  }

  if (!isRecord(response.sections)) return "invalid_section_shape";
  const sections = response.sections;
  const requiredSectionKeys = [
    "contact",
    "headline",
    "summary",
    "workExperience",
    "education",
    "skills",
    "languages",
    "projects",
    "certifications",
    "professionalLinks",
  ];
  const sectionKeys = Object.keys(sections);
  if (
    requiredSectionKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(sections, key),
    ) ||
    sectionKeys.some((key) => !requiredSectionKeys.includes(key))
  ) {
    return "invalid_section_shape";
  }
  if (!isRecord(sections.contact)) return "invalid_section_shape";
  const contact = sections.contact;
  if (
    semanticExtractionV2ContactKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(contact, key),
    ) ||
    Object.keys(contact).some(
      (key) => !semanticExtractionV2ContactKeySet.has(key),
    )
  ) {
    return "invalid_section_shape";
  }

  const collectionLimits: Readonly<Record<string, number>> = {
    workExperience: maxSemanticExtractionV2WorkExperiences,
    education: maxSemanticExtractionV2EducationEntries,
    skills: maxSemanticExtractionV2Skills,
    languages: maxSemanticExtractionV2Languages,
    projects: maxSemanticExtractionV2Projects,
    certifications: maxSemanticExtractionV2Certifications,
    professionalLinks: maxSemanticExtractionV2ProfessionalLinks,
  };
  for (const [key, limit] of Object.entries(collectionLimits)) {
    const value = sections[key];
    if (!Array.isArray(value)) return "invalid_section_shape";
    if (value.length > limit) return "cardinality_limit_exceeded";
  }
  for (const [key, limit] of [
    ["relationships", maxSemanticExtractionV2Relationships],
    ["ambiguities", maxSemanticExtractionV2Ambiguities],
    ["conflicts", maxSemanticExtractionV2Conflicts],
  ] as const) {
    const value = response[key];
    if (!Array.isArray(value)) return "other_schema_violation";
    if (value.length > limit) return "cardinality_limit_exceeded";
  }
  return "other_schema_violation";
}

/** Used by privacy-safe diagnostics to inspect the same compact-expanded form. */
export function expandCompactSemanticExtractionV2ResponseForDiagnostics(
  response: unknown,
): unknown {
  return expandCompactSemanticExtractionV2Response(response);
}

export function inspectSemanticExtractionV2Structure(
  value: unknown,
): V2StructuralInspection {
  const serializedBytes = jsonSize(value);
  let nodeCount = 0;
  let maxDepth = 0;
  let atomCount = 0;
  let depthLimitExceeded = false;

  const visit = (current: unknown, depth: number): void => {
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (depth > maxSemanticExtractionV2ObjectDepth) {
      depthLimitExceeded = true;
      return;
    }
    if (isRecord(current)) {
      if (
        Object.prototype.hasOwnProperty.call(current, "value") &&
        Object.prototype.hasOwnProperty.call(current, "sourceRefs")
      ) {
        atomCount += 1;
      }
      for (const child of Object.values(current)) visit(child, depth + 1);
      return;
    }
    if (Array.isArray(current)) {
      for (const child of current) visit(child, depth + 1);
    }
  };

  if (value !== undefined) visit(value, 0);

  return {
    serializedBytes,
    nodeCount,
    maxDepth,
    atomCount,
    depthLimitExceeded,
    atomLimitExceeded: atomCount > maxSemanticExtractionV2TotalAtoms,
    nodeLimitExceeded: nodeCount > maxSemanticExtractionV2TotalNodes,
  };
}

function jsonSize(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return Number.POSITIVE_INFINITY;
    return Buffer.byteLength(serialized, "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
