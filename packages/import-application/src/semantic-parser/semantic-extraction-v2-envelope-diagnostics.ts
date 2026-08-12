import {
  maxSemanticExtractionV2ObjectDepth,
  maxSemanticExtractionV2ResponseJsonBytes,
  maxSemanticExtractionV2TotalAtoms,
  maxSemanticExtractionV2TotalNodes,
  nuvitaeSemanticExtractionV2EnvelopeSchema,
  nuvitaeSemanticExtractionV2ResponseVersion,
} from "@nuvitae/contracts";

import {
  inspectSemanticExtractionV2Structure,
  type V2StructuralInspection,
} from "./semantic-extraction-v2-canonicalizer.js";

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

export type SemanticExtractionV2EnvelopeStructuralReason =
  | "none"
  | "semantic_json_parse"
  | "response_size_limit"
  | "response_depth_limit"
  | "total_atom_limit"
  | "total_node_limit"
  | "section_cardinality_limit"
  | "relationship_cardinality_limit"
  | "aggregate_collection_limit"
  | "schema_version"
  | "top_level_envelope"
  | "canonicalizer_exception";

export type SemanticExtractionV2CountBucket =
  "0-4" | "5-19" | "20-99" | "100-199" | "200-499" | "500-999" | "1000+";

export type SemanticExtractionV2SerializedBytesBucket =
  "not_observed" | "0-64k" | "64k-128k" | "128k-256k" | "over_256k";

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
  readonly structuralReason: SemanticExtractionV2EnvelopeStructuralReason;
  readonly serializedResponseBytesBucket: SemanticExtractionV2SerializedBytesBucket;
  readonly totalAtomCountBucket: SemanticExtractionV2CountBucket;
  readonly totalNodeCountBucket: SemanticExtractionV2CountBucket;
  readonly maxDepthBucket: SemanticExtractionV2CountBucket;
  readonly maxDepthObserved: number;
  readonly workExperienceCountBucket: SemanticExtractionV2CountBucket;
  readonly educationCountBucket: SemanticExtractionV2CountBucket;
  readonly skillsCountBucket: SemanticExtractionV2CountBucket;
  readonly languagesCountBucket: SemanticExtractionV2CountBucket;
  readonly projectsCountBucket: SemanticExtractionV2CountBucket;
  readonly certificationsCountBucket: SemanticExtractionV2CountBucket;
  readonly professionalLinksCountBucket: SemanticExtractionV2CountBucket;
  readonly relationshipCountBucket: SemanticExtractionV2CountBucket;
  readonly ambiguityCountBucket: SemanticExtractionV2CountBucket;
  readonly conflictCountBucket: SemanticExtractionV2CountBucket;
  readonly configuredLimits: {
    readonly responseJsonBytes: number;
    readonly objectDepth: number;
    readonly totalAtoms: number;
    readonly totalNodes: number;
  };
  readonly responseJsonByteLimit: number;
  readonly objectDepthLimit: number;
  readonly totalAtomLimit: number;
  readonly totalNodeLimit: number;
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
  const structure = inspectSemanticExtractionV2Structure(input.response);

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
    structuralReason: structuralReason({
      input,
      record,
      parsed,
      structure,
    }),
    serializedResponseBytesBucket: serializedBytesBucket(
      structure.serializedBytes,
    ),
    totalAtomCountBucket: countBucket(structure.atomCount),
    totalNodeCountBucket: countBucket(structure.nodeCount),
    maxDepthBucket: countBucket(structure.maxDepth),
    maxDepthObserved: structure.maxDepth,
    workExperienceCountBucket: collectionCountBucket(
      sectionRecord,
      "workExperience",
    ),
    educationCountBucket: collectionCountBucket(sectionRecord, "education"),
    skillsCountBucket: collectionCountBucket(sectionRecord, "skills"),
    languagesCountBucket: collectionCountBucket(sectionRecord, "languages"),
    projectsCountBucket: collectionCountBucket(sectionRecord, "projects"),
    certificationsCountBucket: collectionCountBucket(
      sectionRecord,
      "certifications",
    ),
    professionalLinksCountBucket: collectionCountBucket(
      sectionRecord,
      "professionalLinks",
    ),
    relationshipCountBucket: collectionCountBucket(record, "relationships"),
    ambiguityCountBucket: collectionCountBucket(record, "ambiguities"),
    conflictCountBucket: collectionCountBucket(record, "conflicts"),
    configuredLimits: {
      responseJsonBytes: maxSemanticExtractionV2ResponseJsonBytes,
      objectDepth: maxSemanticExtractionV2ObjectDepth,
      totalAtoms: maxSemanticExtractionV2TotalAtoms,
      totalNodes: maxSemanticExtractionV2TotalNodes,
    },
    responseJsonByteLimit: maxSemanticExtractionV2ResponseJsonBytes,
    objectDepthLimit: maxSemanticExtractionV2ObjectDepth,
    totalAtomLimit: maxSemanticExtractionV2TotalAtoms,
    totalNodeLimit: maxSemanticExtractionV2TotalNodes,
    ...(firstIssue === undefined ? {} : { firstZodIssueCode: firstIssue.code }),
    firstZodPath: firstZodPath(firstIssue?.path),
    issueCountBucket: issueCountBucket(
      parsed?.success === false ? parsed.error.issues.length : 0,
    ),
  };
}

function structuralReason(input: {
  readonly input: Parameters<typeof diagnoseSemanticExtractionV2Envelope>[0];
  readonly record: Record<string, unknown> | undefined;
  readonly parsed:
    | { readonly success: true }
    | {
        readonly success: false;
        readonly error: {
          readonly issues: readonly {
            readonly code: string;
            readonly path: readonly PropertyKey[];
          }[];
        };
      }
    | undefined;
  readonly structure: V2StructuralInspection;
}): SemanticExtractionV2EnvelopeStructuralReason {
  if (!input.input.semanticJsonParseSucceeded) return "semantic_json_parse";
  if (
    input.structure.serializedBytes > maxSemanticExtractionV2ResponseJsonBytes
  )
    return "response_size_limit";
  if (input.record === undefined) return "top_level_envelope";
  if (input.structure.depthLimitExceeded) return "response_depth_limit";
  if (input.structure.atomLimitExceeded) return "total_atom_limit";
  if (input.structure.nodeLimitExceeded) return "total_node_limit";
  if (schemaVersionCategory(input.record) !== "exact_v2")
    return "schema_version";
  if (input.parsed?.success !== false) {
    return input.input.failureStage === "v2_canonicalizer"
      ? "canonicalizer_exception"
      : "none";
  }
  const issue = input.parsed.error.issues[0];
  if (issue?.code === "too_big") {
    if (issue.path[0] === "relationships")
      return "relationship_cardinality_limit";
    if (issue.path[0] === "ambiguities" || issue.path[0] === "conflicts")
      return "aggregate_collection_limit";
    if (issue.path[0] === "sections") return "section_cardinality_limit";
  }
  return "top_level_envelope";
}

function collectionCountBucket(
  record: Record<string, unknown> | undefined,
  key: string,
): SemanticExtractionV2CountBucket {
  const value = record?.[key];
  return Array.isArray(value) ? countBucket(value.length) : countBucket(0);
}

function serializedBytesBucket(
  bytes: number,
): SemanticExtractionV2SerializedBytesBucket {
  if (!Number.isFinite(bytes)) return "not_observed";
  if (bytes <= 64 * 1024) return "0-64k";
  if (bytes <= 128 * 1024) return "64k-128k";
  if (bytes <= 256 * 1024) return "128k-256k";
  return "over_256k";
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

function countBucket(count: number): SemanticExtractionV2CountBucket {
  if (count <= 4) return "0-4";
  if (count <= 19) return "5-19";
  if (count <= 99) return "20-99";
  if (count <= 199) return "100-199";
  if (count <= 499) return "200-499";
  if (count <= 999) return "500-999";
  return "1000+";
}

function issueCountBucket(count: number): "0-4" | "5-19" | "20-99" | "100+" {
  if (count <= 4) return "0-4";
  if (count <= 19) return "5-19";
  if (count <= 99) return "20-99";
  return "100+";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
