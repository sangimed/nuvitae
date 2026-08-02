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
    return failure(
      hasEvidenceIssue(parsed.error.issues)
        ? "malformed_flattened_evidence"
        : "schema_violation",
      issuesFromZod(parsed.error.issues),
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
    return failure(
      hasEvidenceIssue(parsed.error.issues)
        ? "malformed_flattened_evidence"
        : "schema_violation",
      issuesFromZod(parsed.error.issues),
    );
  }
  return { ok: true, value: parsed.data };
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
