import {
  maxSemanticExtractionResponseJsonBytes,
  maxSemanticParserRequestJsonBytes,
  nuvitaeSemanticExtractionResponseSchema,
  nuvitaeSemanticExtractionResponseVersion,
  resumeSemanticParseRequestSchema,
  resumeSemanticParserContractVersion,
  type NuvitaeSemanticExtractionResponse,
  type ResumeSemanticParseRequest,
} from "@nuvitae/contracts";

import {
  createPrivacySafeSemanticProviderError,
  type PrivacySafeSemanticProviderError,
  type PrivacySafeValidationIssue,
  type SemanticProviderErrorCode,
} from "./provider-errors.js";

export type SemanticValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PrivacySafeSemanticProviderError };

const forbiddenResponsePhysicalKeys = new Set([
  "page",
  "item",
  "physical",
  "physicalOffset",
  "physicalOffsets",
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
]);

const flattenedEvidenceKeys = new Set([
  "line",
  "start",
  "end",
  "fragmentHash",
  "fragmentId",
]);

const nonValueEvidencePaths = new Set([
  "documentLanguage",
  "relationships",
  "ambiguityDiagnostics",
  "conflictDiagnostics",
  "privacyWarnings",
]);

export function validateSemanticParseRequest(
  candidate: unknown,
): SemanticValidationResult<ResumeSemanticParseRequest> {
  const size = jsonSize(candidate);
  if (size > maxSemanticParserRequestJsonBytes) {
    return failure("request_too_large");
  }
  const version = readStringProperty(candidate, "contractVersion");
  if (version !== resumeSemanticParserContractVersion) {
    return failure("unsupported_contract_version", [
      { path: ["contractVersion"], code: "unsupported_contract_version" },
    ]);
  }
  const parsed = resumeSemanticParseRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    const validationIssues = issuesFromZod(parsed.error.issues);
    return failure(
      hasEvidenceIssue(parsed.error.issues)
        ? "malformed_flattened_evidence"
        : "schema_violation",
      validationIssues,
    );
  }
  return { ok: true, value: parsed.data };
}

export function validateSemanticExtractionResponse(
  candidate: unknown,
): SemanticValidationResult<NuvitaeSemanticExtractionResponse> {
  const size = jsonSize(candidate);
  if (size > maxSemanticExtractionResponseJsonBytes) {
    return failure("response_too_large");
  }
  const physicalLeak = findForbiddenKey(
    candidate,
    forbiddenResponsePhysicalKeys,
  );
  if (physicalLeak) {
    return failure("schema_violation", [
      { path: physicalLeak, code: "physical_provenance_rejected" },
    ]);
  }
  const version = readStringProperty(candidate, "schemaVersion");
  if (version !== nuvitaeSemanticExtractionResponseVersion) {
    return failure("unsupported_contract_version", [
      { path: ["schemaVersion"], code: "unsupported_contract_version" },
    ]);
  }
  const parsed = nuvitaeSemanticExtractionResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    const structuralIssues = inspectFlattenedEvidence(candidate);
    const validationIssues = mergeValidationIssues(
      structuralIssues,
      issuesFromZod(parsed.error.issues),
    );
    return failure(
      structuralIssues.length > 0 || hasEvidenceIssue(parsed.error.issues)
        ? "malformed_flattened_evidence"
        : "schema_violation",
      validationIssues,
    );
  }
  return { ok: true, value: parsed.data };
}

/**
 * Classifies only the shape of malformed evidence. It intentionally never
 * reads or returns provider values, source text, hashes, or response content.
 */
export function inspectFlattenedEvidence(
  candidate: unknown,
): readonly PrivacySafeValidationIssue[] {
  const issues: PrivacySafeValidationIssue[] = [];
  const seen = new Set<string>();

  const add = (code: string, path: readonly (string | number)[]): void => {
    const key = `${code}:${path.join(".")}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ path: [...path], code });
  };

  const inspectEvidence = (
    value: unknown,
    path: readonly (string | number)[],
    requireEvidence: boolean,
  ): void => {
    if (!Array.isArray(value)) {
      add("evidence_wrong_type", path);
      if (isRecord(value)) add("evidence_shape_nested", path);
      return;
    }
    if (requireEvidence && (value.length === 0 || value.length > 8)) {
      add("evidence_cardinality_invalid", path);
    }
    for (const [index, item] of value.entries()) {
      const itemPath = [...path, index];
      if (!isRecord(item)) {
        add("evidence_wrong_type", itemPath);
        continue;
      }
      for (const key of Object.keys(item)) {
        if (!flattenedEvidenceKeys.has(key)) {
          add("evidence_shape_unexpected_key", [...itemPath, key]);
        }
      }
      if (!Object.prototype.hasOwnProperty.call(item, "fragmentId")) {
        add("evidence_fragment_id_missing", [...itemPath, "fragmentId"]);
      }
      const hasStart = Object.prototype.hasOwnProperty.call(item, "start");
      const hasEnd = Object.prototype.hasOwnProperty.call(item, "end");
      if (!hasStart || !hasEnd) {
        add("evidence_range_missing", itemPath);
      } else if (
        typeof item.start !== "number" ||
        !Number.isInteger(item.start) ||
        typeof item.end !== "number" ||
        !Number.isInteger(item.end) ||
        item.start < 0 ||
        item.end <= item.start
      ) {
        add("evidence_range_invalid", itemPath);
      }
    }
  };

  const walk = (value: unknown, path: readonly (string | number)[]): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, index]));
      return;
    }
    if (!isRecord(value)) return;

    const semanticValue =
      path[0] !== "documentLanguage" && typeof value.value === "string";
    if (
      semanticValue &&
      !Object.prototype.hasOwnProperty.call(value, "evidence")
    ) {
      add("evidence_missing", [...path, "evidence"]);
    }

    for (const [key, item] of Object.entries(value)) {
      const childPath = [...path, key];
      if (key === "evidence") {
        const root = typeof path[0] === "string" ? path[0] : undefined;
        if (
          semanticValue ||
          (root !== undefined && nonValueEvidencePaths.has(root))
        ) {
          inspectEvidence(item, childPath, semanticValue);
        } else {
          add("evidence_shape_nested", childPath);
        }
        continue;
      }
      walk(item, childPath);
    }
  };

  walk(candidate, []);
  return issues.slice(0, 24);
}

export function validationIssueCategory(
  issue: PrivacySafeValidationIssue,
): "schema" | "evidence" {
  return issue.path.some(
    (segment) =>
      segment === "evidence" ||
      segment === "fragmentHash" ||
      segment === "fragmentId" ||
      segment === "line" ||
      segment === "start" ||
      segment === "end",
  ) || issue.code.startsWith("evidence_")
    ? "evidence"
    : "schema";
}

function failure(
  code: SemanticProviderErrorCode,
  issues: readonly PrivacySafeValidationIssue[] = [],
): SemanticValidationResult<never> {
  return {
    ok: false,
    error: createPrivacySafeSemanticProviderError(code, issues),
  };
}

function readStringProperty(
  candidate: unknown,
  key: string,
): string | undefined {
  if (!isRecord(candidate)) return undefined;
  const value = candidate[key];
  return typeof value === "string" ? value : undefined;
}

function jsonSize(candidate: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(candidate), "utf8");
  } catch {
    return maxSemanticExtractionResponseJsonBytes + 1;
  }
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate)
  );
}

function findForbiddenKey(
  candidate: unknown,
  forbiddenKeys: ReadonlySet<string>,
  path: readonly (string | number)[] = [],
): readonly (string | number)[] | undefined {
  if (Array.isArray(candidate)) {
    for (const [index, value] of candidate.entries()) {
      const found = findForbiddenKey(value, forbiddenKeys, [...path, index]);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(candidate)) return undefined;
  for (const [key, value] of Object.entries(candidate)) {
    const currentPath = [...path, key];
    if (forbiddenKeys.has(key)) return currentPath;
    const found = findForbiddenKey(value, forbiddenKeys, currentPath);
    if (found) return found;
  }
  return undefined;
}

function issuesFromZod(
  issues: readonly { path: readonly PropertyKey[]; code: string }[],
): readonly PrivacySafeValidationIssue[] {
  return issues.slice(0, 12).map((issue) => ({
    path: serializablePath(issue.path),
    code: issue.code,
  }));
}

function mergeValidationIssues(
  first: readonly PrivacySafeValidationIssue[],
  second: readonly PrivacySafeValidationIssue[],
): readonly PrivacySafeValidationIssue[] {
  const merged: PrivacySafeValidationIssue[] = [];
  const seen = new Set<string>();
  for (const issue of [...first, ...second]) {
    const key = `${issue.code}:${issue.path.join(".")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(issue);
    if (merged.length >= 12) break;
  }
  return merged;
}

function hasEvidenceIssue(
  issues: readonly { path: readonly PropertyKey[] }[],
): boolean {
  return issues.some((issue) =>
    issue.path.some(
      (segment) =>
        segment === "evidence" ||
        segment === "fragmentHash" ||
        segment === "fragmentHashes" ||
        segment === "sourceFragments" ||
        segment === "line" ||
        segment === "start" ||
        segment === "end",
    ),
  );
}

function serializablePath(
  path: readonly PropertyKey[],
): readonly (string | number)[] {
  return path.flatMap((segment) =>
    typeof segment === "string" || typeof segment === "number" ? [segment] : [],
  );
}
