import {
  maxSemanticExtractionV2ObjectDepth,
  maxSemanticExtractionV2ResponseJsonBytes,
  maxSemanticExtractionV2TotalAtoms,
  maxSemanticExtractionV2TotalNodes,
  nuvitaeSemanticExtractionV2EnvelopeSchema,
  semanticExtractionV2AtomSchema,
  semanticExtractionV2RelationshipSchema,
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

export interface V2CanonicalEvidence {
  readonly fragmentId: string;
  readonly fragmentHash: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly quote: string;
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
  readonly inferenceStatus: "not_inferred";
  readonly reviewStatus: "unreviewed";
  readonly evidence: readonly V2CanonicalEvidence[];
  readonly linkLabel?: string;
}

export interface V2CanonicalSignal {
  readonly kind: SemanticExtractionV2Signal["kind"];
  readonly evidence: readonly V2CanonicalEvidence[];
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
      readonly rejected: readonly V2RejectedField[];
    };

interface GroundedAtom {
  readonly value: string;
  readonly normalizedValue: string;
  readonly valueKind: V2CanonicalValueKind;
  readonly evidence: readonly V2CanonicalEvidence[];
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
    return wholeResponseFailure("malformed_json");
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

  const version = input.response.schemaVersion;
  if (version !== "nuvitae.semantic-extraction.v2") {
    return wholeResponseFailure("unsupported_contract_version");
  }
  const envelope = nuvitaeSemanticExtractionV2EnvelopeSchema.safeParse(
    input.response,
  );
  if (!envelope.success) {
    return wholeResponseFailure("invalid_top_level_envelope");
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

  return { ok: true, candidates, signals, rejected };
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
    accepted.push({ kind: parsed.data.kind, evidence });
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
  if (Array.isArray(raw.sourceRefs) && raw.sourceRefs.length === 0) {
    rejected.push({ path, code: "missing_source_refs" });
    return undefined;
  }
  const parsed = semanticExtractionV2AtomSchema.safeParse(raw);
  if (!parsed.success) {
    rejected.push({ path, code: "malformed_atom" });
    return undefined;
  }
  const longForm = isLongFormFieldPath(path);
  if (parsed.data.sourceRefs.length !== 1 && !longForm) {
    rejected.push({
      path,
      code: classifyMultipleRefs(parsed.data.sourceRefs, registry),
    });
    return undefined;
  }
  const references = parsed.data.sourceRefs;
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
  const reconstructed = resolved.map((item) => item.quote).join(" ");
  if (normalizeSourceText(value) !== normalizeSourceText(reconstructed)) {
    return { ok: false, code: "value_not_grounded" };
  }
  return {
    ok: true,
    atom: {
      value: reconstructed,
      normalizedValue: normalizeSourceText(reconstructed),
      valueKind: kind,
      evidence: resolved.map((result) => ({
        fragmentId: result.fragment.fragmentId,
        fragmentHash: result.fragment.hash,
        line: result.fragment.line,
        start: result.fragment.start + result.start,
        end: result.fragment.start + result.end,
        quote: result.quote,
      })),
    },
  };
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
    /^(?:present|current|now|ongoing|en cours|présent|present|actuel)$/iu.test(
      lowered,
    )
  )
    return { value: "current" };
  const year = /^(?:19|20)\d{2}$/u.exec(value)?.[0];
  if (year !== undefined) return { value: year };
  const yearMonth = /^(?:(\d{1,2})[/-](\d{4})|(\d{4})-(\d{1,2}))$/u.exec(value);
  if (yearMonth !== null) {
    const month = Number(yearMonth[1] ?? yearMonth[4]);
    const parsedYear = Number(yearMonth[2] ?? yearMonth[3]);
    if (month >= 1 && month <= 12) {
      return { value: `${parsedYear}-${String(month).padStart(2, "0")}` };
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
  };
  const monthYear = /^([\p{L}.]+)[ ,/-]+((?:19|20)\d{2})$/u.exec(lowered);
  if (monthYear !== null) {
    const month = monthNames[monthYear[1]?.replace(/\.$/u, "") ?? ""];
    if (month !== undefined)
      return { value: `${monthYear[2]}-${String(month).padStart(2, "0")}` };
  }
  return undefined;
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

function classifyMultipleRefs(
  references: readonly Parameters<SourceRegistry["resolve"]>[0][],
  registry: SourceRegistry,
):
  | SourceReferenceFailureReason
  | "duplicate_source_ref"
  | "overlapping_source_refs"
  | "ambiguous_source_refs" {
  const seen = new Set<string>();
  const resolved: Array<
    Extract<SourceReferenceResolution, { readonly ok: true }>
  > = [];
  for (const reference of references) {
    const key = `${reference.fragmentId}\u0000${normalizeSourceText(reference.quote)}`;
    if (seen.has(key)) return "duplicate_source_ref";
    seen.add(key);
    const result = registry.resolve(reference);
    if (!result.ok) return result.reason;
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
        return "overlapping_source_refs";
      }
    }
  }
  return "ambiguous_source_refs";
}

function wholeResponseFailure(
  reason: WholeResponseReason,
): V2CanonicalizationResult {
  return { ok: false, reason, rejected: [] };
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
