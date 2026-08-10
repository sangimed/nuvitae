import {
  nuvitaeSemanticExtractionV2EnvelopeSchema,
  nuvitaeSemanticExtractionV2ResponseVersion,
} from "@nuvitae/contracts";

export type SemanticExtractionV2EnvelopeFailureStage =
  "semantic_json_parse" | "v2_envelope" | "v2_canonicalizer";

export type SemanticExtractionV2ValueCategory =
  | "not_observed"
  | "unparseable"
  | "missing"
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "other";

export type SemanticExtractionV2SchemaVersionCategory =
  "not_observed" | "exact_v2" | "missing" | "other_string" | "wrong_type";

export interface SemanticExtractionV2EnvelopeDiagnostic {
  readonly responseContractVersion: typeof nuvitaeSemanticExtractionV2ResponseVersion;
  readonly semanticJsonParseSucceeded: boolean;
  readonly canonicalizerReached: boolean;
  readonly failureStage: SemanticExtractionV2EnvelopeFailureStage;
  readonly topLevelValueCategory: SemanticExtractionV2ValueCategory;
  readonly schemaVersionCategory: SemanticExtractionV2SchemaVersionCategory;
  readonly topLevelKeys: readonly string[];
  readonly missingTopLevelKeys: readonly string[];
  readonly unexpectedTopLevelKeys: readonly string[];
  readonly unrecognizedTopLevelKeyPresent: boolean;
  readonly sectionsValueCategory: SemanticExtractionV2ValueCategory;
  readonly sectionKeys: readonly string[];
  readonly missingSectionKeys: readonly string[];
  readonly unexpectedSectionKeys: readonly string[];
  readonly unrecognizedSectionKeyPresent: boolean;
  readonly relationshipsValueCategory: SemanticExtractionV2ValueCategory;
  readonly ambiguitiesValueCategory: SemanticExtractionV2ValueCategory;
  readonly conflictsValueCategory: SemanticExtractionV2ValueCategory;
  readonly firstZodIssueCode?: string;
  readonly firstZodPath: readonly string[];
  readonly issueCountBucket: "0-4" | "5-19" | "20-99" | "100+";
}

const topLevelKeys = [
  "schemaVersion",
  "sections",
  "relationships",
  "ambiguities",
  "conflicts",
] as const;

const sectionKeys = [
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
] as const;

// Only known contract vocabulary is emitted as an unexpected key. Arbitrary
// provider keys are represented by the boolean presence flags and never
// copied into logs.
const knownUnexpectedTopLevelKeys = new Set([
  "contractVersion",
  "documentLanguage",
  "ambiguityDiagnostics",
  "conflictDiagnostics",
  "privacyWarnings",
  "candidateId",
  "response",
  "output",
  "result",
  "data",
  "id",
  "status",
  "type",
  "content",
]);

const knownUnexpectedSectionKeys = new Set([
  "contactInfo",
  "headlineText",
  "summaryText",
  "work",
  "experience",
  "jobs",
  "skill",
  "skillsList",
  "language",
  "languagesList",
  "links",
]);

const schemaFieldNames = new Set([
  ...topLevelKeys,
  ...sectionKeys,
  "fullName",
  "email",
  "phone",
  "location",
  "website",
  "value",
  "sourceRefs",
  "fragmentId",
  "quote",
  "employerName",
  "employerLocation",
  "roles",
  "title",
  "startDate",
  "endDate",
  "responsibilities",
  "achievements",
  "institution",
  "degree",
  "fieldOfStudy",
  "name",
  "proficiency",
  "description",
  "issuer",
  "kind",
  "from",
  "to",
]);

export function diagnoseSemanticExtractionV2Envelope(input: {
  readonly response: unknown;
  readonly semanticJsonParseSucceeded: boolean;
  readonly canonicalizerReached: boolean;
  readonly failureStage: SemanticExtractionV2EnvelopeFailureStage;
}): SemanticExtractionV2EnvelopeDiagnostic {
  const record = isRecord(input.response) ? input.response : undefined;
  const parsed =
    input.semanticJsonParseSucceeded && record !== undefined
      ? nuvitaeSemanticExtractionV2EnvelopeSchema.safeParse(input.response)
      : undefined;
  const topLevelProjection = projectKeys(
    record,
    topLevelKeys,
    knownUnexpectedTopLevelKeys,
  );
  const sectionRecord = isRecord(record?.sections)
    ? record.sections
    : undefined;
  const sectionProjection = projectKeys(
    sectionRecord,
    sectionKeys,
    knownUnexpectedSectionKeys,
  );
  const firstIssue =
    parsed?.success === false ? parsed.error.issues[0] : undefined;

  return {
    responseContractVersion: nuvitaeSemanticExtractionV2ResponseVersion,
    semanticJsonParseSucceeded: input.semanticJsonParseSucceeded,
    canonicalizerReached: input.canonicalizerReached,
    failureStage: input.failureStage,
    topLevelValueCategory: input.semanticJsonParseSucceeded
      ? valueCategory(input.response)
      : "unparseable",
    schemaVersionCategory: schemaVersionCategory(record),
    topLevelKeys: topLevelProjection.expected,
    missingTopLevelKeys: topLevelProjection.missing,
    unexpectedTopLevelKeys: topLevelProjection.unexpected,
    unrecognizedTopLevelKeyPresent: topLevelProjection.unrecognized,
    sectionsValueCategory: valueCategoryOrMissing(record, "sections"),
    sectionKeys: sectionProjection.expected,
    missingSectionKeys: sectionProjection.missing,
    unexpectedSectionKeys: sectionProjection.unexpected,
    unrecognizedSectionKeyPresent: sectionProjection.unrecognized,
    relationshipsValueCategory: valueCategoryOrMissing(record, "relationships"),
    ambiguitiesValueCategory: valueCategoryOrMissing(record, "ambiguities"),
    conflictsValueCategory: valueCategoryOrMissing(record, "conflicts"),
    ...(firstIssue === undefined ? {} : { firstZodIssueCode: firstIssue.code }),
    firstZodPath: firstZodPath(firstIssue?.path),
    issueCountBucket: countBucket(
      parsed?.success === false ? parsed.error.issues.length : 0,
    ),
  };
}

function projectKeys(
  record: Record<string, unknown> | undefined,
  expected: readonly string[],
  knownUnexpected: ReadonlySet<string>,
): {
  readonly expected: readonly string[];
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  readonly unrecognized: boolean;
} {
  if (record === undefined) {
    return { expected: [], missing: [], unexpected: [], unrecognized: false };
  }
  const present = new Set(Object.keys(record));
  const observedExpected = expected.filter((key) => present.has(key));
  const missing = expected.filter((key) => !present.has(key));
  const unexpected = Object.keys(record).filter((key) =>
    knownUnexpected.has(key),
  );
  const allowlisted = new Set([...expected, ...knownUnexpected]);
  return {
    expected: observedExpected,
    missing,
    unexpected,
    unrecognized: Object.keys(record).some((key) => !allowlisted.has(key)),
  };
}

function schemaVersionCategory(
  record: Record<string, unknown> | undefined,
): SemanticExtractionV2SchemaVersionCategory {
  if (record === undefined) return "not_observed";
  if (!Object.prototype.hasOwnProperty.call(record, "schemaVersion"))
    return "missing";
  const value = record.schemaVersion;
  if (value === nuvitaeSemanticExtractionV2ResponseVersion) return "exact_v2";
  if (typeof value === "string") return "other_string";
  return "wrong_type";
}

function valueCategory(value: unknown): SemanticExtractionV2ValueCategory {
  if (value === undefined) return "not_observed";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "other";
}

function valueCategoryOrMissing(
  record: Record<string, unknown> | undefined,
  key: string,
): SemanticExtractionV2ValueCategory {
  if (record === undefined) return "not_observed";
  if (!Object.prototype.hasOwnProperty.call(record, key)) return "missing";
  return valueCategory(record[key]);
}

function firstZodPath(
  path: readonly PropertyKey[] | undefined,
): readonly string[] {
  if (path === undefined) return [];
  return path
    .filter(
      (part): part is string =>
        typeof part === "string" && schemaFieldNames.has(part),
    )
    .slice(0, 8);
}

function countBucket(count: number): "0-4" | "5-19" | "20-99" | "100+" {
  if (count <= 4) return "0-4";
  if (count <= 19) return "5-19";
  if (count <= 99) return "20-99";
  return "100+";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
