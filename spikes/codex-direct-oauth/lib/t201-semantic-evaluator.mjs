import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CODEX_T201_TRANSPORT_LIMITS } from "../oauth-constants.mjs";

export const T201_LIMITS = Object.freeze({
  outputMaxBytes: CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes,
  maxDepth: 14,
  maxArrayLength: 20,
  maxStringLength: 800,
});

export const T201_DERIVED_LIMIT_AUDIT = Object.freeze({
  schemaMaxValueObjects: 107,
  schemaMaxDiagnosticObjects: 20,
  schemaMaxEvidencePerValueOrDiagnostic: 4,
  schemaMaxExtractedValueLength: 500,
  schemaMaxDiagnosticCodeLength: 80,
  schemaMaxDiagnosticMessageLength: 400,
  derivedMaximumMinifiedJsonBytes: 170213,
  boundedJsonAndAssistantLimitBytes:
    CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes,
});

export function structuredJsonSizeAudit(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = null;
  }
  const bytes =
    typeof serialized === "string"
      ? Buffer.byteLength(serialized, "utf8")
      : null;
  return {
    golden_structured_json_bytes: bytes,
    golden_structured_json_size_category: byteSizeCategory(
      bytes,
      CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes,
    ),
    derived_expected_live_json_ceiling:
      CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes,
  };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(root, "fixtures/t201-synthetic-resume.txt");
const manifestPath = path.join(root, "fixtures/t201-expected-facts.json");
const schemaPath = path.join(root, "schemas/t201-output-schema.json");

export const T201_ARTIFACT_PATHS = Object.freeze({
  fixturePath,
  manifestPath,
  schemaPath,
});

const TOP_LEVEL_KEYS = new Set([
  "schema_version",
  "document_language",
  "basics",
  "work_experiences",
  "education",
  "skills",
  "languages",
  "certifications",
  "ambiguities",
  "warnings",
]);

const ERROR_CATEGORIES = new Set([
  "structured_output_unsupported",
  "invalid_json",
  "schema_validation_failed",
  "unknown_field",
  "output_too_large",
  "evidence_missing",
  "evidence_out_of_bounds",
  "evidence_mismatch",
  "unsupported_fact",
  "forbidden_inference",
  "expected_fact_missing",
  "ambiguity_mishandled",
  "document_language_misclassified",
  "transport_failure",
  "refresh_failure",
  "upstream_protocol_changed",
  "safe_unknown_failure",
]);

export function safeErrorCategory(value) {
  return ERROR_CATEGORIES.has(value) ? value : "safe_unknown_failure";
}

export function byteSizeCategory(bytes, limit = 65536) {
  if (!Number.isInteger(bytes) || bytes < 0) return "unknown";
  if (bytes === 0) return "empty";
  if (bytes <= 8192) return "small";
  if (bytes <= limit) return "bounded";
  return "over_limit";
}

export function classifyLocalArtifactFailure(error, phase) {
  const code = String(error?.code ?? "");
  if (code === "ENOENT") {
    return {
      primary_failure_phase: phase,
      safe_transport_classification: "missing_file",
      safe_node_error_code: "ENOENT",
    };
  }
  if (code === "EACCES") {
    return {
      primary_failure_phase: phase,
      safe_transport_classification: "filesystem_permission",
      safe_node_error_code: "EACCES",
    };
  }
  return {
    primary_failure_phase: phase,
    safe_transport_classification: "malformed_local_configuration",
    safe_node_error_code: null,
  };
}

function safeParseJson(text, phase) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw Object.assign(error, {
      safeCategory: "malformed_local_configuration",
      ...classifyLocalArtifactFailure(error, phase),
    });
  }
}

export async function loadT201Artifacts(paths = T201_ARTIFACT_PATHS) {
  let fixture;
  let manifestText;
  let schemaText;
  try {
    fixture = await fs.readFile(paths.fixturePath, "utf8");
  } catch (error) {
    throw Object.assign(error, {
      safeCategory: "transport_failure",
      ...classifyLocalArtifactFailure(error, "fixture_read"),
    });
  }
  try {
    manifestText = await fs.readFile(paths.manifestPath, "utf8");
  } catch (error) {
    throw Object.assign(error, {
      safeCategory: "transport_failure",
      ...classifyLocalArtifactFailure(error, "fixture_read"),
    });
  }
  try {
    schemaText = await fs.readFile(paths.schemaPath, "utf8");
  } catch (error) {
    throw Object.assign(error, {
      safeCategory: "transport_failure",
      ...classifyLocalArtifactFailure(error, "schema_read"),
    });
  }
  const manifest = safeParseJson(manifestText, "fixture_read");
  const schema = safeParseJson(schemaText, "schema_read");
  return { fixture, manifest, schema };
}

export function buildLocalInputDiagnostics({
  fixture,
  schema,
  prompt,
  serializedRequestBytes,
  requestLimitBytes = 65536,
}) {
  return {
    fixture_file_readable: typeof fixture === "string",
    schema_file_readable:
      schema && typeof schema === "object" && !Array.isArray(schema),
    json_schema_parsed_locally:
      schema && typeof schema === "object" && !Array.isArray(schema),
    fixture_bytes_category: byteSizeCategory(
      Buffer.byteLength(String(fixture ?? ""), "utf8"),
      requestLimitBytes,
    ),
    schema_bytes_category: byteSizeCategory(
      Buffer.byteLength(JSON.stringify(schema ?? {}), "utf8"),
      requestLimitBytes,
    ),
    prompt_bytes_category: byteSizeCategory(
      Buffer.byteLength(String(prompt ?? ""), "utf8"),
      requestLimitBytes,
    ),
    serialized_request_bytes_category:
      typeof serializedRequestBytes === "number"
        ? byteSizeCategory(serializedRequestBytes, requestLimitBytes)
        : "not_evaluated",
    serialized_request_within_limit:
      typeof serializedRequestBytes === "number"
        ? serializedRequestBytes <= requestLimitBytes
        : false,
    request_serialization_succeeded: typeof serializedRequestBytes === "number",
  };
}

export function normalizeFragment(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

export function fragmentHash(value) {
  return crypto
    .createHash("sha256")
    .update(normalizeFragment(value), "utf8")
    .digest("hex");
}

export function fixtureHash(fixture) {
  return crypto.createHash("sha256").update(fixture, "utf8").digest("hex");
}

export function lineEvidenceFor(lines, line, fragment, category) {
  const sourceLine = lines[line - 1];
  const start = sourceLine.indexOf(fragment);
  if (start < 0) throw new Error(`fragment not found on line ${line}`);
  const end = start + fragment.length;
  return {
    line,
    start,
    end,
    fragment_hash: fragmentHash(sourceLine.slice(start, end)),
    category,
  };
}

class JsonParser {
  constructor(text) {
    this.text = text;
    this.index = 0;
  }

  parse() {
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.index !== this.text.length)
      throw Object.assign(new Error("invalid_json"), {
        safeCategory: "invalid_json",
      });
    return value;
  }

  skipWhitespace() {
    while (/[\t\n\r ]/.test(this.text[this.index] ?? "")) this.index += 1;
  }

  parseValue(depth) {
    if (depth > T201_LIMITS.maxDepth)
      throw Object.assign(new Error("excessive_nesting"), {
        safeCategory: "schema_validation_failed",
      });
    this.skipWhitespace();
    const char = this.text[this.index];
    if (char === "{") return this.parseObject(depth + 1);
    if (char === "[") return this.parseArray(depth + 1);
    if (char === '"') return this.parseString();
    if (char === "-" || /[0-9]/.test(char ?? "")) return this.parseNumber();
    if (this.text.startsWith("true", this.index))
      return this.consumeLiteral("true", true);
    if (this.text.startsWith("false", this.index))
      return this.consumeLiteral("false", false);
    if (this.text.startsWith("null", this.index))
      return this.consumeLiteral("null", null);
    throw Object.assign(new Error("invalid_json"), {
      safeCategory: "invalid_json",
    });
  }

  consumeLiteral(literal, value) {
    this.index += literal.length;
    return value;
  }

  parseString() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.text.length) {
      const char = this.text[this.index];
      if (char === '"') {
        this.index += 1;
        const parsed = JSON.parse(this.text.slice(start, this.index));
        if (parsed.length > T201_LIMITS.maxStringLength) {
          throw Object.assign(new Error("excessive_string"), {
            safeCategory: "schema_validation_failed",
          });
        }
        return parsed;
      }
      if (char === "\\") {
        this.index += 1;
        if (this.index >= this.text.length)
          throw Object.assign(new Error("invalid_json"), {
            safeCategory: "invalid_json",
          });
      }
      this.index += 1;
    }
    throw Object.assign(new Error("invalid_json"), {
      safeCategory: "invalid_json",
    });
  }

  parseNumber() {
    const start = this.index;
    if (this.text[this.index] === "-") this.index += 1;
    if (this.text[this.index] === "0") this.index += 1;
    else {
      if (!/[1-9]/.test(this.text[this.index] ?? ""))
        throw Object.assign(new Error("invalid_json"), {
          safeCategory: "invalid_json",
        });
      while (/[0-9]/.test(this.text[this.index] ?? "")) this.index += 1;
    }
    if (this.text[this.index] === ".") {
      this.index += 1;
      if (!/[0-9]/.test(this.text[this.index] ?? ""))
        throw Object.assign(new Error("invalid_json"), {
          safeCategory: "invalid_json",
        });
      while (/[0-9]/.test(this.text[this.index] ?? "")) this.index += 1;
    }
    if (/[eE]/.test(this.text[this.index] ?? "")) {
      this.index += 1;
      if (/[+-]/.test(this.text[this.index] ?? "")) this.index += 1;
      if (!/[0-9]/.test(this.text[this.index] ?? ""))
        throw Object.assign(new Error("invalid_json"), {
          safeCategory: "invalid_json",
        });
      while (/[0-9]/.test(this.text[this.index] ?? "")) this.index += 1;
    }
    return JSON.parse(this.text.slice(start, this.index));
  }

  parseArray(depth) {
    this.index += 1;
    this.skipWhitespace();
    const result = [];
    if (this.text[this.index] === "]") {
      this.index += 1;
      return result;
    }
    while (true) {
      if (result.length >= T201_LIMITS.maxArrayLength) {
        throw Object.assign(new Error("excessive_array"), {
          safeCategory: "schema_validation_failed",
        });
      }
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      if (this.text[this.index] === "]") {
        this.index += 1;
        return result;
      }
      if (this.text[this.index] !== ",")
        throw Object.assign(new Error("invalid_json"), {
          safeCategory: "invalid_json",
        });
      this.index += 1;
    }
  }

  parseObject(depth) {
    this.index += 1;
    this.skipWhitespace();
    const result = {};
    const keys = new Set();
    if (this.text[this.index] === "}") {
      this.index += 1;
      return result;
    }
    while (true) {
      this.skipWhitespace();
      if (this.text[this.index] !== '"')
        throw Object.assign(new Error("invalid_json"), {
          safeCategory: "invalid_json",
        });
      const key = this.parseString();
      if (keys.has(key))
        throw Object.assign(new Error("duplicate_key"), {
          safeCategory: "schema_validation_failed",
        });
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.index] !== ":")
        throw Object.assign(new Error("invalid_json"), {
          safeCategory: "invalid_json",
        });
      this.index += 1;
      result[key] = this.parseValue(depth);
      this.skipWhitespace();
      if (this.text[this.index] === "}") {
        this.index += 1;
        return result;
      }
      if (this.text[this.index] !== ",")
        throw Object.assign(new Error("invalid_json"), {
          safeCategory: "invalid_json",
        });
      this.index += 1;
    }
  }
}

export function parseJsonOnly(text) {
  if (Buffer.byteLength(text, "utf8") > T201_LIMITS.outputMaxBytes) {
    throw Object.assign(new Error("output_too_large"), {
      safeCategory: "output_too_large",
    });
  }
  const trimmed = String(text).trim();
  if (trimmed.startsWith("```") || trimmed.endsWith("```")) {
    throw Object.assign(new Error("markdown_wrapped_json"), {
      safeCategory: "invalid_json",
    });
  }
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    throw Object.assign(new Error("invalid_json"), {
      safeCategory: "invalid_json",
    });
  }
  return new JsonParser(trimmed).parse();
}

function fail(errors, category, path, message) {
  errors.push({ category, path, message });
}

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function assertKeys(value, allowed, required, errors, at) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(
      errors,
      "schema_validation_failed",
      at,
      `expected object, got ${typeOf(value)}`,
    );
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key))
      fail(
        errors,
        at === "$" ? "unknown_field" : "schema_validation_failed",
        `${at}.${key}`,
        "unknown field",
      );
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key))
      fail(
        errors,
        "schema_validation_failed",
        `${at}.${key}`,
        "missing required field",
      );
  }
  return true;
}

function validateValueWithEvidence(value, errors, at, nullable = false) {
  if (value === null && nullable) return;
  if (
    !assertKeys(value, ["value", "evidence"], ["value", "evidence"], errors, at)
  )
    return;
  if (
    typeof value.value !== "string" ||
    value.value.trim() === "" ||
    value.value.length > 500
  ) {
    fail(
      errors,
      "schema_validation_failed",
      `${at}.value`,
      "invalid extracted string",
    );
  }
  if (
    !Array.isArray(value.evidence) ||
    value.evidence.length < 1 ||
    value.evidence.length > 4
  ) {
    fail(
      errors,
      "evidence_missing",
      `${at}.evidence`,
      "missing or excessive evidence",
    );
    return;
  }
  value.evidence.forEach((evidence, index) =>
    validateEvidence(evidence, errors, `${at}.evidence[${index}]`),
  );
}

function validateEvidence(value, errors, at) {
  if (
    !assertKeys(
      value,
      ["line", "start", "end", "fragment_hash", "category"],
      ["line", "start", "end", "fragment_hash", "category"],
      errors,
      at,
    )
  )
    return;
  if (!Number.isInteger(value.line) || value.line < 1 || value.line > 200)
    fail(errors, "schema_validation_failed", `${at}.line`, "invalid line");
  if (!Number.isInteger(value.start) || value.start < 0 || value.start > 2000)
    fail(errors, "schema_validation_failed", `${at}.start`, "invalid start");
  if (
    !Number.isInteger(value.end) ||
    value.end <= value.start ||
    value.end > 2000
  )
    fail(errors, "schema_validation_failed", `${at}.end`, "invalid end");
  if (
    typeof value.fragment_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.fragment_hash)
  ) {
    fail(
      errors,
      "schema_validation_failed",
      `${at}.fragment_hash`,
      "invalid fragment hash",
    );
  }
  if (
    ![
      "identity",
      "summary",
      "work",
      "education",
      "skill",
      "language",
      "certification",
      "absence",
      "ambiguity",
      "warning",
      "basics",
      "skills",
      "languages",
      "certifications",
    ].includes(value.category)
  ) {
    fail(
      errors,
      "schema_validation_failed",
      `${at}.category`,
      "invalid evidence category",
    );
  }
}

function validateDiagnostic(value, errors, at) {
  if (
    !assertKeys(
      value,
      ["code", "message", "evidence"],
      ["code", "message", "evidence"],
      errors,
      at,
    )
  )
    return;
  if (
    typeof value.code !== "string" ||
    value.code.length < 1 ||
    value.code.length > 80
  )
    fail(errors, "schema_validation_failed", `${at}.code`, "invalid code");
  if (
    typeof value.message !== "string" ||
    value.message.length < 1 ||
    value.message.length > 400
  )
    fail(
      errors,
      "schema_validation_failed",
      `${at}.message`,
      "invalid message",
    );
  if (
    !Array.isArray(value.evidence) ||
    value.evidence.length < 1 ||
    value.evidence.length > 4
  )
    fail(errors, "evidence_missing", `${at}.evidence`, "missing evidence");
  else
    value.evidence.forEach((evidence, index) =>
      validateEvidence(evidence, errors, `${at}.evidence[${index}]`),
    );
}

export function validateT201Schema(value) {
  const errors = [];
  if (
    !assertKeys(value, [...TOP_LEVEL_KEYS], [...TOP_LEVEL_KEYS], errors, "$")
  ) {
    return { ok: false, errors };
  }
  if (![1, 2].includes(value.schema_version))
    fail(
      errors,
      "schema_validation_failed",
      "$.schema_version",
      "schema_version must be 1 or 2",
    );
  if (!DOCUMENT_LANGUAGE_VALUES.has(value.document_language)) {
    fail(
      errors,
      "schema_validation_failed",
      "$.document_language",
      "invalid document language",
    );
  }
  if (
    assertKeys(
      value.basics,
      ["full_name", "email", "phone", "location", "summary"],
      ["full_name", "email", "phone", "location", "summary"],
      errors,
      "$.basics",
    )
  ) {
    validateValueWithEvidence(
      value.basics.full_name,
      errors,
      "$.basics.full_name",
    );
    validateValueWithEvidence(value.basics.email, errors, "$.basics.email");
    validateValueWithEvidence(
      value.basics.phone,
      errors,
      "$.basics.phone",
      true,
    );
    validateValueWithEvidence(
      value.basics.location,
      errors,
      "$.basics.location",
    );
    validateValueWithEvidence(value.basics.summary, errors, "$.basics.summary");
  }
  if (
    !Array.isArray(value.work_experiences) ||
    value.work_experiences.length > 5
  )
    fail(
      errors,
      "schema_validation_failed",
      "$.work_experiences",
      "invalid work experience array",
    );
  else
    value.work_experiences.forEach((item, index) => {
      const at = `$.work_experiences[${index}]`;
      if (
        !assertKeys(
          item,
          value.schema_version === 2
            ? [
                "employer",
                "job_title",
                "start_date",
                "end_date",
                "location",
                "employment_type",
                "highlights",
              ]
            : [
                "employer",
                "job_title",
                "start_date",
                "end_date",
                "location",
                "highlights",
              ],
          value.schema_version === 2
            ? [
                "employer",
                "job_title",
                "start_date",
                "end_date",
                "location",
                "employment_type",
                "highlights",
              ]
            : [
                "employer",
                "job_title",
                "start_date",
                "end_date",
                "location",
                "highlights",
              ],
          errors,
          at,
        )
      )
        return;
      validateValueWithEvidence(item.employer, errors, `${at}.employer`);
      validateValueWithEvidence(item.job_title, errors, `${at}.job_title`);
      validateValueWithEvidence(item.start_date, errors, `${at}.start_date`);
      validateValueWithEvidence(item.end_date, errors, `${at}.end_date`);
      validateValueWithEvidence(item.location, errors, `${at}.location`, true);
      if (value.schema_version === 2)
        validateValueWithEvidence(
          item.employment_type,
          errors,
          `${at}.employment_type`,
          true,
        );
      if (!Array.isArray(item.highlights) || item.highlights.length > 8)
        fail(
          errors,
          "schema_validation_failed",
          `${at}.highlights`,
          "invalid highlights array",
        );
      else
        item.highlights.forEach((highlight, highlightIndex) =>
          validateValueWithEvidence(
            highlight,
            errors,
            `${at}.highlights[${highlightIndex}]`,
          ),
        );
    });
  if (!Array.isArray(value.education) || value.education.length > 3)
    fail(
      errors,
      "schema_validation_failed",
      "$.education",
      "invalid education array",
    );
  else
    value.education.forEach((item, index) => {
      const at = `$.education[${index}]`;
      if (
        !assertKeys(
          item,
          ["school", "degree", "start_date", "end_date", "grade"],
          ["school", "degree", "start_date", "end_date", "grade"],
          errors,
          at,
        )
      )
        return;
      validateValueWithEvidence(item.school, errors, `${at}.school`);
      validateValueWithEvidence(item.degree, errors, `${at}.degree`);
      validateValueWithEvidence(item.start_date, errors, `${at}.start_date`);
      validateValueWithEvidence(item.end_date, errors, `${at}.end_date`);
      validateValueWithEvidence(item.grade, errors, `${at}.grade`, true);
    });
  if (!Array.isArray(value.skills) || value.skills.length > 20)
    fail(
      errors,
      "schema_validation_failed",
      "$.skills",
      "invalid skills array",
    );
  else
    value.skills.forEach((skill, index) =>
      validateValueWithEvidence(skill, errors, `$.skills[${index}]`),
    );
  if (!Array.isArray(value.languages) || value.languages.length > 6)
    fail(
      errors,
      "schema_validation_failed",
      "$.languages",
      "invalid languages array",
    );
  else
    value.languages.forEach((item, index) => {
      const at = `$.languages[${index}]`;
      if (
        !assertKeys(
          item,
          ["name", "proficiency"],
          ["name", "proficiency"],
          errors,
          at,
        )
      )
        return;
      validateValueWithEvidence(item.name, errors, `${at}.name`);
      validateValueWithEvidence(item.proficiency, errors, `${at}.proficiency`);
    });
  if (!Array.isArray(value.certifications) || value.certifications.length > 5)
    fail(
      errors,
      "schema_validation_failed",
      "$.certifications",
      "invalid certifications array",
    );
  else
    value.certifications.forEach((item, index) => {
      const at = `$.certifications[${index}]`;
      if (
        !assertKeys(
          item,
          ["name", "date", "issuer"],
          ["name", "date", "issuer"],
          errors,
          at,
        )
      )
        return;
      validateValueWithEvidence(item.name, errors, `${at}.name`);
      validateValueWithEvidence(item.date, errors, `${at}.date`);
      validateValueWithEvidence(item.issuer, errors, `${at}.issuer`, true);
    });
  if (!Array.isArray(value.ambiguities) || value.ambiguities.length > 10)
    fail(
      errors,
      "schema_validation_failed",
      "$.ambiguities",
      "invalid ambiguities array",
    );
  else
    value.ambiguities.forEach((item, index) =>
      validateDiagnostic(item, errors, `$.ambiguities[${index}]`),
    );
  if (!Array.isArray(value.warnings) || value.warnings.length > 10)
    fail(
      errors,
      "schema_validation_failed",
      "$.warnings",
      "invalid warnings array",
    );
  else
    value.warnings.forEach((item, index) =>
      validateDiagnostic(item, errors, `$.warnings[${index}]`),
    );
  return { ok: errors.length === 0, errors };
}

function valueAtPath(output, pathExpression) {
  const parts = pathExpression
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current = output;
  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return undefined;
  }
  if (
    current &&
    typeof current === "object" &&
    !Array.isArray(current) &&
    "value" in current
  )
    return current.value;
  return current;
}

function collectValueObjects(value, pathPrefix = "$", results = []) {
  if (!value || typeof value !== "object") return results;
  if (
    !Array.isArray(value) &&
    typeof value.value === "string" &&
    Array.isArray(value.evidence)
  ) {
    results.push({
      path: pathPrefix,
      value: value.value,
      evidence: value.evidence,
    });
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectValueObjects(item, `${pathPrefix}[${index}]`, results),
    );
    return results;
  }
  for (const [key, child] of Object.entries(value))
    collectValueObjects(child, `${pathPrefix}.${key}`, results);
  return results;
}

function collectStrings(value, pathPrefix = "$", results = []) {
  if (typeof value === "string") {
    results.push({ path: pathPrefix, value });
    return results;
  }
  if (!value || typeof value !== "object") return results;
  if (Array.isArray(value))
    value.forEach((item, index) =>
      collectStrings(item, `${pathPrefix}[${index}]`, results),
    );
  else
    for (const [key, child] of Object.entries(value))
      collectStrings(child, `${pathPrefix}.${key}`, results);
  return results;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function diagnosticItems(output) {
  return [...safeArray(output?.ambiguities), ...safeArray(output?.warnings)];
}

export function sourceGroundedManifestFacts(manifest) {
  return safeArray(manifest?.exact_facts).filter(
    (fact) => fact?.path !== "document_language",
  );
}

const DOCUMENT_LANGUAGE_VALUES = new Set([
  "English",
  "French",
  "French/English",
]);
const FRENCH_DOCUMENT_LANGUAGE_MARKERS =
  /[àâçéèêëîïôûùüÿœ]|\b(?:analyste|anglais|certificat|compétence|créé|données|expérience|français|ingénieure|langues|présent|professionnelle|résumé|synthétique|téléphone)\b/iu;
const ENGLISH_DOCUMENT_LANGUAGE_MARKERS =
  /\b(?:all|and|analyst|built|certificate|education|english|experience|for|from|languages|present|professional|skills|summary|synthetic|the|with)\b/i;

export function classifyT201DocumentLanguage(fixture) {
  if (typeof fixture !== "string") return null;
  const hasFrench = FRENCH_DOCUMENT_LANGUAGE_MARKERS.test(fixture);
  const hasEnglish = ENGLISH_DOCUMENT_LANGUAGE_MARKERS.test(fixture);
  if (hasFrench && hasEnglish) return "French/English";
  if (hasFrench) return "French";
  if (hasEnglish) return "English";
  return null;
}

export function evaluateT201DocumentLanguage(output, fixture, manifest) {
  const expected = manifest?.document_language;
  const actual = output?.document_language;
  const classified = classifyT201DocumentLanguage(fixture);
  return {
    pass:
      classified !== null &&
      DOCUMENT_LANGUAGE_VALUES.has(expected) &&
      actual === expected &&
      actual === classified,
  };
}

function normalizeComparable(value) {
  return normalizeFragment(value)
    .toLowerCase()
    .replace(/^[-•]\s*/, "")
    .replace(/\.$/, "");
}

function evidenceFragment(lines, evidence) {
  const line = lines[evidence.line - 1];
  if (typeof line !== "string") return null;
  if (
    evidence.start < 0 ||
    evidence.end > line.length ||
    evidence.end <= evidence.start
  )
    return null;
  return line.slice(evidence.start, evidence.end);
}

export function evaluateT201AmbiguityHandling(output, fixture, manifest) {
  const lines = fixture.replace(/\n$/, "").split("\n");
  const diagnostics = diagnosticItems(output);
  let handledCount = 0;
  let invalidEvidenceCount = 0;
  const errorCategories = new Set();

  for (const expected of safeArray(manifest?.ambiguous_facts)) {
    const matchingDiagnostics = diagnostics.filter(
      (diagnostic) => diagnostic?.code === expected?.id,
    );
    let handled = false;
    for (const diagnostic of matchingDiagnostics) {
      for (const evidence of safeArray(diagnostic?.evidence)) {
        const fragment = evidenceFragment(lines, evidence);
        if (fragment === null) {
          invalidEvidenceCount += 1;
          errorCategories.add("evidence_out_of_bounds");
          continue;
        }
        if (fragmentHash(fragment) !== evidence.fragment_hash) {
          invalidEvidenceCount += 1;
          errorCategories.add("evidence_mismatch");
          continue;
        }
        if (
          evidence.line !== expected.source_line ||
          evidence.category !== "ambiguity" ||
          !normalizeComparable(fragment).includes(
            normalizeComparable(expected.text),
          )
        ) {
          invalidEvidenceCount += 1;
          errorCategories.add("ambiguity_evidence_mismatch");
          continue;
        }
        handled = true;
      }
    }
    if (handled) handledCount += 1;
  }

  return {
    handled_count: handledCount,
    pass: handledCount === safeArray(manifest?.ambiguous_facts).length,
    invalid_evidence_count: invalidEvidenceCount,
    error_categories: [...errorCategories].sort(),
  };
}

export function evaluateT201Output(output, fixture, manifest) {
  const lines = fixture.replace(/\n$/, "").split("\n");
  const schema = validateT201Schema(output);
  const valueObjects = collectValueObjects(output);
  const allStrings = collectStrings(output);
  let missingEvidenceCount = 0;
  let invalidEvidenceCount = 0;
  let unsupportedFactCount = 0;
  const errorCategories = new Set(schema.errors.map((error) => error.category));
  const documentLanguage = evaluateT201DocumentLanguage(
    output,
    fixture,
    manifest,
  );
  if (!documentLanguage.pass)
    errorCategories.add("document_language_misclassified");

  for (const item of valueObjects) {
    if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
      missingEvidenceCount += 1;
      errorCategories.add("evidence_missing");
      continue;
    }
    let itemSupported = false;
    for (const evidence of item.evidence) {
      const fragment = evidenceFragment(lines, evidence);
      if (fragment === null) {
        invalidEvidenceCount += 1;
        errorCategories.add("evidence_out_of_bounds");
        continue;
      }
      if (fragmentHash(fragment) !== evidence.fragment_hash) {
        invalidEvidenceCount += 1;
        errorCategories.add("evidence_mismatch");
        continue;
      }
      const normalizedValue = normalizeComparable(item.value);
      const normalizedFragment = normalizeComparable(fragment);
      if (
        normalizedFragment.includes(normalizedValue) ||
        normalizedValue.includes(normalizedFragment) ||
        normalizedValue
          .split(/\s+/)
          .every((word) => normalizedFragment.includes(word))
      ) {
        itemSupported = true;
      }
    }
    if (!itemSupported) {
      unsupportedFactCount += 1;
      errorCategories.add("unsupported_fact");
    }
  }

  const expectedSections = manifest?.expected_section_counts ?? {};
  const sectionMatches = [
    output.basics && typeof output.basics === "object" ? 1 : 0,
    output.work_experiences?.length === expectedSections.work_experiences
      ? 1
      : 0,
    output.education?.length === expectedSections.education ? 1 : 0,
    output.skills?.length === expectedSections.skills ? 1 : 0,
    output.languages?.length === expectedSections.languages ? 1 : 0,
    output.certifications?.length === expectedSections.certifications ? 1 : 0,
  ];
  const expectedSectionRecall =
    sectionMatches.reduce((sum, value) => sum + value, 0) /
    sectionMatches.length;
  const expectedHighlightCount = safeArray(output.work_experiences).reduce(
    (sum, work) =>
      sum + (Array.isArray(work?.highlights) ? work.highlights.length : 0),
    0,
  );
  const itemMatches = [
    expectedHighlightCount ===
    manifest?.expected_item_counts?.work_experience_highlights
      ? 1
      : 0,
    safeArray(output.ambiguities).length + safeArray(output.warnings).length >=
    (manifest?.expected_item_counts?.warnings_or_ambiguities_minimum ??
      Infinity)
      ? 1
      : 0,
  ];
  const expectedItemRecall =
    itemMatches.reduce((sum, value) => sum + value, 0) / itemMatches.length;

  let exactFactMatches = 0;
  let highPriorityMatches = 0;
  const facts = sourceGroundedManifestFacts(manifest);
  const highPriorityFacts = facts.filter((fact) => fact.priority === "high");
  const missingFacts = [];
  for (const fact of facts) {
    const actual = valueAtPath(output, fact.path);
    const matched =
      normalizeComparable(actual ?? "") === normalizeComparable(fact.value);
    if (matched) {
      exactFactMatches += 1;
      if (fact.priority === "high") highPriorityMatches += 1;
    } else {
      missingFacts.push(fact.path);
    }
  }
  const exactFactRecall = facts.length ? exactFactMatches / facts.length : 0;
  const highPriorityFactRecall = highPriorityFacts.length
    ? highPriorityMatches / highPriorityFacts.length
    : 0;
  if (
    highPriorityFactRecall <
    manifest?.thresholds?.required_high_priority_fact_recall
  )
    errorCategories.add("expected_fact_missing");

  let forbiddenInferenceCount = 0;
  if (output.basics?.phone !== null && output.basics?.phone !== undefined)
    forbiddenInferenceCount += 1;
  for (const [index, work] of safeArray(output.work_experiences).entries()) {
    if (!work || typeof work !== "object") continue;
    if (work.location !== null && work.location !== undefined)
      forbiddenInferenceCount += 1;
    if (
      manifest?.schema_version === 1 &&
      Object.prototype.hasOwnProperty.call(work, "employment_type")
    )
      forbiddenInferenceCount += 1;
    if (Object.prototype.hasOwnProperty.call(work, "management_responsibility"))
      forbiddenInferenceCount += 1;
    const locationString =
      typeof work.location?.value === "string" ? work.location.value : "";
    if (index === 1 && /example harbor/i.test(locationString))
      forbiddenInferenceCount += 1;
  }
  for (const education of safeArray(output.education)) {
    if (education.grade !== null && education.grade !== undefined)
      forbiddenInferenceCount += 1;
  }
  for (const certification of safeArray(output.certifications)) {
    if (certification.issuer !== null && certification.issuer !== undefined)
      forbiddenInferenceCount += 1;
  }
  const inventedSkill = safeArray(manifest?.forbidden_inferences).find(
    (item) => item?.id === "invented-skill",
  );
  const allowedSkills = new Set(safeArray(inventedSkill?.allowed_values));
  for (const skill of safeArray(output.skills)) {
    if (!allowedSkills.has(skill?.value)) forbiddenInferenceCount += 1;
  }
  for (const stringValue of allStrings) {
    if (
      /owned platform reliability|led platform reliability|improved platform reliability/i.test(
        stringValue.value,
      )
    )
      forbiddenInferenceCount += 1;
    if (/direct reports|people manager/i.test(stringValue.value))
      forbiddenInferenceCount += 1;
  }
  if (forbiddenInferenceCount > 0) errorCategories.add("forbidden_inference");

  const ambiguity = evaluateT201AmbiguityHandling(output, fixture, manifest);
  invalidEvidenceCount += ambiguity.invalid_evidence_count;
  ambiguity.error_categories.forEach((category) =>
    errorCategories.add(category),
  );
  const ambiguityMishandled = !ambiguity.pass;
  if (ambiguityMishandled) errorCategories.add("ambiguity_mishandled");

  const nullForAbsentFieldsCount = [
    output.basics?.phone === null,
    output.work_experiences?.[0]?.location === null,
    output.work_experiences?.[1]?.location === null,
    output.education?.[0]?.grade === null,
    output.certifications?.[0]?.issuer === null,
  ].filter(Boolean).length;

  const metrics = {
    schema_valid: schema.ok,
    JSON_only_valid: true,
    expected_section_recall: Number(expectedSectionRecall.toFixed(4)),
    expected_item_recall: Number(expectedItemRecall.toFixed(4)),
    exact_fact_recall: Number(exactFactRecall.toFixed(4)),
    high_priority_fact_recall: Number(highPriorityFactRecall.toFixed(4)),
    unsupported_fact_count: unsupportedFactCount,
    missing_evidence_count: missingEvidenceCount,
    invalid_evidence_count: invalidEvidenceCount,
    ambiguous_fact_handling_count: ambiguity.handled_count,
    forbidden_inference_count: forbiddenInferenceCount,
    null_for_absent_fields_count: nullForAbsentFieldsCount,
    source_grounding_pass:
      missingEvidenceCount === 0 &&
      invalidEvidenceCount === 0 &&
      unsupportedFactCount === 0,
    no_invention_pass:
      forbiddenInferenceCount === 0 && nullForAbsentFieldsCount === 5,
    document_language_classification_pass: documentLanguage.pass,
  };
  metrics.parsing_pass =
    metrics.schema_valid &&
    metrics.source_grounding_pass &&
    metrics.no_invention_pass &&
    metrics.expected_section_recall >=
      manifest?.thresholds?.minimum_expected_section_recall &&
    metrics.expected_item_recall >=
      manifest?.thresholds?.minimum_expected_item_recall &&
    metrics.exact_fact_recall >=
      manifest?.thresholds?.minimum_exact_fact_recall &&
    metrics.high_priority_fact_recall >=
      manifest?.thresholds?.required_high_priority_fact_recall &&
    metrics.document_language_classification_pass &&
    ambiguityMishandled === false;

  return {
    metrics,
    schema_errors: schema.errors,
    missing_expected_facts: missingFacts,
    error_categories: [...errorCategories].sort(),
  };
}

export function evaluateModelText(
  modelText,
  fixture,
  manifest,
  { evaluateOutput = evaluateT201Output } = {},
) {
  let parsed;
  try {
    parsed = parseJsonOnly(modelText);
  } catch (error) {
    const category = safeErrorCategory(error.safeCategory);
    return {
      parsed: null,
      metrics: {
        schema_valid: false,
        JSON_only_valid: false,
        expected_section_recall: 0,
        expected_item_recall: 0,
        exact_fact_recall: 0,
        high_priority_fact_recall: 0,
        document_language_classification_pass: false,
        unsupported_fact_count: 0,
        missing_evidence_count: 0,
        invalid_evidence_count: 0,
        ambiguous_fact_handling_count: 0,
        forbidden_inference_count: 0,
        null_for_absent_fields_count: 0,
        source_grounding_pass: false,
        no_invention_pass: false,
        parsing_pass: false,
      },
      schema_errors: [],
      missing_expected_facts: sourceGroundedManifestFacts(manifest).map(
        (fact) => fact.path,
      ),
      error_categories: [category],
    };
  }
  try {
    return { parsed, ...evaluateOutput(parsed, fixture, manifest) };
  } catch {
    return {
      parsed,
      metrics: {
        schema_valid: false,
        JSON_only_valid: true,
        expected_section_recall: 0,
        expected_item_recall: 0,
        exact_fact_recall: 0,
        high_priority_fact_recall: 0,
        document_language_classification_pass: false,
        unsupported_fact_count: 0,
        missing_evidence_count: 0,
        invalid_evidence_count: 0,
        ambiguous_fact_handling_count: 0,
        forbidden_inference_count: 0,
        null_for_absent_fields_count: 0,
        source_grounding_pass: false,
        no_invention_pass: false,
        parsing_pass: false,
      },
      schema_errors: [],
      missing_expected_facts: sourceGroundedManifestFacts(manifest).map(
        (fact) => fact.path,
      ),
      error_categories: ["safe_unknown_failure"],
      safe_evaluation_failure_phase: "response_semantic_evaluation",
    };
  }
}

export function buildT201Prompt({ fixture, manifest, schema }) {
  const lines = fixture.replace(/\n$/, "").split("\n");
  const numbered = lines
    .map((line, index) => `${String(index + 1).padStart(3, "0")}| ${line}`)
    .join("\n");
  const lineHashes = lines
    .map(
      (line, index) =>
        `${String(index + 1).padStart(3, "0")}| length=${line.length} whole_line_sha256=${fragmentHash(line)}`,
    )
    .join("\n");
  const facts = sourceGroundedManifestFacts(manifest);
  const evidenceHints = facts
    .map((fact) => `${fact.path}: line ${fact.line}`)
    .join("\n");
  const completenessChecklist = facts
    .map((fact) => {
      const factId = `${manifest.fixture_id}:${fact.path}`;
      const evidenceCategory = fact.category ?? "work";
      return [
        `fact_id=${factId}`,
        `destination_path=${fact.path}`,
        `source_line_hint=${fact.line}`,
        `high_priority=${fact.priority === "high"}`,
        `required_evidence_category=${evidenceCategory}`,
      ].join("; ");
    })
    .join("\n");
  const intentionallyAbsentChecklist = safeArray(
    manifest.intentionally_absent_fields,
  )
    .map((path) => `destination_path=${path}; required_output=null`)
    .join("\n");
  const ambiguityHints = safeArray(manifest.ambiguous_facts)
    .map(
      (fact) =>
        `code=${fact.id}; evidence line=${fact.source_line}; category=ambiguity; source must cover=${JSON.stringify(fact.text)}; handling=${fact.expected_handling}`,
    )
    .join("\n");
  return [
    "You are parsing one deliberately synthetic resume for a local compatibility spike.",
    "Return exactly one compact minified JSON object and nothing else. No Markdown fences. No prose before or after JSON.",
    "Do not include explanations, Markdown, commentary, source excerpts, repeated fixture text, reasoning summaries, or optional fields outside the strict schema.",
    `Use schema_version ${manifest.schema_version ?? 1} and the exact top-level fields defined by the schema.`,
    "Every non-null extracted value must be an object with value and evidence.",
    "document_language is a document-level classification of the full synthetic source, not an extracted fact. Set it to exactly English, French, or French/English. Do not attach source evidence to it.",
    "Evidence line numbers refer to the numbered source below; start/end are zero-based offsets in the original line text after the `NNN| ` prefix, end exclusive.",
    "fragment_hash is lowercase SHA-256 of the whitespace-normalized source fragment for those offsets.",
    "Evidence objects may contain only line, start, end, fragment_hash, and category.",
    "You may use whole-line evidence by setting start=0, end=the source line length, and fragment_hash=the whole_line_sha256 from SOURCE LINE HASH INDEX.",
    "Do not persist or repeat large source excerpts beyond extracted values.",
    "Return explicit null for every manifest-declared absent optional path; do not omit it. Absent collections must be []. Null requires no value evidence.",
    "Do not invent phone, employer location, skill proficiency, management responsibility, employment type, degree grade, certification issuer, normalized dates more precise than source, or technologies absent from the source.",
    "For every REQUIRED AMBIGUITY below, add exactly one diagnostic under ambiguities or warnings using its exact code, ambiguity-category evidence covering the listed source text, and a message that states the listed safe handling. Do not convert it into a hard achievement.",
    "For work highlights, include only concrete bullet facts; do not include the deliberately ambiguous platform-reliability statement as a highlight.",
    "The expected-facts hint below is a line-reference aid, not a model output source of truth.",
    "Before emitting the JSON, internally inspect every REQUIRED COMPLETENESS CHECKLIST entry; extract every source-supported value; leave only intentionally absent fields null; do not omit a supported value merely because it appears in bilingual text; verify that every extracted value has valid source evidence; and verify that every required destination path has been addressed. Do not reveal this internal check or any reasoning.",
    "",
    "STRICT OUTPUT SCHEMA:",
    JSON.stringify(schema),
    "",
    "EXPECTED FACT LINE HINTS:",
    evidenceHints,
    "",
    "REQUIRED COMPLETENESS CHECKLIST:",
    completenessChecklist,
    "",
    "INTENTIONALLY ABSENT OPTIONAL FIELDS (must remain null; these are not expected facts):",
    intentionallyAbsentChecklist,
    "",
    "REQUIRED AMBIGUITY DIAGNOSTICS:",
    ambiguityHints,
    "",
    "SOURCE LINE HASH INDEX:",
    lineHashes,
    "",
    "BEGIN SYNTHETIC SOURCE",
    numbered,
    "END SYNTHETIC SOURCE",
  ].join("\n");
}

function safeManifestFactDiagnostics(manifest, metrics) {
  const facts = Array.isArray(manifest?.exact_facts)
    ? sourceGroundedManifestFacts(manifest)
    : null;
  if (!facts || typeof manifest.fixture_id !== "string")
    throw new Error("t201_manifest_fact_diagnostic_manifest_invalid");
  const allowed = new Set(
    facts.map((fact) => `${manifest.fixture_id}:${fact.path}`),
  );
  const high = new Set(
    facts
      .filter((fact) => fact.priority === "high")
      .map((fact) => `${manifest.fixture_id}:${fact.path}`),
  );
  const read = (field) => {
    const value = metrics[field];
    if (!Array.isArray(value) || new Set(value).size !== value.length)
      throw new Error("t201_manifest_fact_diagnostic_identifier_invalid");
    if (value.some((identifier) => !allowed.has(identifier)))
      throw new Error("t201_manifest_fact_diagnostic_identifier_unknown");
    return value;
  };
  const matched = read("matched_expected_fact_ids");
  const missing = read("missing_expected_fact_ids");
  const missingHigh = read("missing_high_priority_fact_ids");
  if (
    matched.some((identifier) => missing.includes(identifier)) ||
    matched.length + missing.length !== allowed.size ||
    missingHigh.some((identifier) => !missing.includes(identifier)) ||
    missingHigh.some((identifier) => !high.has(identifier))
  )
    throw new Error("t201_manifest_fact_diagnostic_partition_invalid");
  const matchedHigh = matched.filter((identifier) => high.has(identifier));
  const counts = {
    expected_fact_count: allowed.size,
    matched_expected_fact_count: matched.length,
    high_priority_fact_count: high.size,
    matched_high_priority_fact_count: matchedHigh.length,
  };
  for (const [field, expected] of Object.entries(counts))
    if (metrics[field] !== expected)
      throw new Error("t201_manifest_fact_diagnostic_count_invalid");
  return {
    ...counts,
    missing_expected_fact_ids: missing,
    missing_high_priority_fact_ids: missingHigh,
    matched_expected_fact_ids: matched,
  };
}

export function safeEvaluationProjection(evaluation, { manifest } = {}) {
  if (evaluation.metrics_measurement_state === "not_measured") {
    return {
      primary_failure_category: evaluation.primary_failure_category,
      primary_failure_phase: evaluation.primary_failure_phase,
      secondary_failure_categories: evaluation.secondary_failure_categories,
      model_output_received: false,
      structured_output_evaluated: false,
      semantic_quality_evaluated: false,
      metrics_measurement_state: "not_measured",
      schema_valid: null,
      JSON_only_valid: null,
      expected_section_recall: null,
      expected_item_recall: null,
      exact_fact_recall: null,
      high_priority_fact_recall: null,
      document_language_classification_pass: null,
      unsupported_fact_count: null,
      missing_evidence_count: null,
      invalid_evidence_count: null,
      ambiguous_fact_handling_count: null,
      forbidden_inference_count: null,
      null_for_absent_fields_count: null,
      source_grounding_pass: null,
      no_invention_pass: null,
      parsing_pass: false,
      expected_fact_count: null,
      matched_expected_fact_count: null,
      missing_expected_fact_ids: [],
      high_priority_fact_count: null,
      matched_high_priority_fact_count: null,
      missing_high_priority_fact_ids: [],
      matched_expected_fact_ids: [],
      safe_error_categories: [
        evaluation.primary_failure_category,
        ...evaluation.secondary_failure_categories,
      ],
      missing_expected_fact_count: null,
    };
  }
  const jsonParsed = evaluation.metrics.JSON_only_valid === true;
  const outputTooLarge = evaluation.error_categories[0] === "output_too_large";
  const schemaInvalid = jsonParsed && evaluation.metrics.schema_valid === false;
  const primaryFailureCategory =
    evaluation.metrics.parsing_pass === true
      ? null
      : outputTooLarge
        ? "output_too_large"
        : !jsonParsed
          ? "invalid_json"
          : schemaInvalid
            ? "schema_validation_failed"
            : safeErrorCategory(evaluation.error_categories[0]);
  const factDiagnostics = manifest
    ? safeManifestFactDiagnostics(manifest, evaluation.metrics)
    : {
        expected_fact_count: null,
        matched_expected_fact_count: null,
        missing_expected_fact_ids: [],
        high_priority_fact_count: null,
        matched_high_priority_fact_count: null,
        missing_high_priority_fact_ids: [],
        matched_expected_fact_ids: [],
      };
  return {
    primary_failure_category: primaryFailureCategory,
    primary_failure_phase:
      evaluation.metrics.parsing_pass === true
        ? null
        : outputTooLarge || !jsonParsed
          ? "response_json_parsing"
          : (evaluation.safe_evaluation_failure_phase ??
            (schemaInvalid
              ? "response_schema_validation"
              : "response_semantic_evaluation")),
    secondary_failure_categories:
      evaluation.metrics.parsing_pass === true
        ? []
        : outputTooLarge
          ? []
          : evaluation.error_categories.slice(1),
    model_output_received: true,
    structured_output_evaluated: outputTooLarge ? false : true,
    semantic_quality_evaluated: outputTooLarge ? false : jsonParsed,
    metrics_measurement_state: outputTooLarge
      ? "not_measured"
      : jsonParsed
        ? "measured"
        : "not_measured",
    schema_valid: outputTooLarge ? null : evaluation.metrics.schema_valid,
    JSON_only_valid: outputTooLarge ? null : evaluation.metrics.JSON_only_valid,
    expected_section_recall: outputTooLarge
      ? null
      : evaluation.metrics.expected_section_recall,
    expected_item_recall: outputTooLarge
      ? null
      : evaluation.metrics.expected_item_recall,
    exact_fact_recall: outputTooLarge
      ? null
      : evaluation.metrics.exact_fact_recall,
    high_priority_fact_recall: outputTooLarge
      ? null
      : evaluation.metrics.high_priority_fact_recall,
    document_language_classification_pass: outputTooLarge
      ? null
      : evaluation.metrics.document_language_classification_pass,
    unsupported_fact_count: outputTooLarge
      ? null
      : evaluation.metrics.unsupported_fact_count,
    missing_evidence_count: outputTooLarge
      ? null
      : evaluation.metrics.missing_evidence_count,
    invalid_evidence_count: outputTooLarge
      ? null
      : evaluation.metrics.invalid_evidence_count,
    ambiguous_fact_handling_count: outputTooLarge
      ? null
      : evaluation.metrics.ambiguous_fact_handling_count,
    forbidden_inference_count: outputTooLarge
      ? null
      : evaluation.metrics.forbidden_inference_count,
    null_for_absent_fields_count: outputTooLarge
      ? null
      : evaluation.metrics.null_for_absent_fields_count,
    source_grounding_pass: outputTooLarge
      ? null
      : evaluation.metrics.source_grounding_pass,
    no_invention_pass: outputTooLarge
      ? null
      : evaluation.metrics.no_invention_pass,
    parsing_pass: evaluation.metrics.parsing_pass,
    ...factDiagnostics,
    safe_error_categories: outputTooLarge
      ? ["output_too_large"]
      : evaluation.error_categories,
    missing_expected_fact_count: outputTooLarge
      ? null
      : evaluation.missing_expected_facts.length,
  };
}

export function notEvaluatedT201Projection({
  primaryFailureCategory = "transport_failure",
  primaryFailurePhase = "safe_unknown_phase",
  secondaryFailureCategories = [],
} = {}) {
  return {
    metrics_measurement_state: "not_measured",
    primary_failure_category: primaryFailureCategory,
    primary_failure_phase: primaryFailurePhase,
    secondary_failure_categories: secondaryFailureCategories,
  };
}

export async function buildValidSyntheticResult() {
  const { fixture } = await loadT201Artifacts();
  const lines = fixture.replace(/\n$/, "").split("\n");
  const e = (line, fragment, category) => [
    lineEvidenceFor(lines, line, fragment, category),
  ];
  return {
    schema_version: 1,
    document_language: "English",
    basics: {
      full_name: {
        value: "Alex Exemple",
        evidence: e(1, "Alex Exemple", "identity"),
      },
      email: {
        value: "alex.exemple@example.invalid",
        evidence: e(3, "alex.exemple@example.invalid", "identity"),
      },
      phone: null,
      location: {
        value: "Synthetic City, Exampleland",
        evidence: e(4, "Synthetic City, Exampleland", "identity"),
      },
      summary: {
        value:
          "Product-minded software generalist who builds privacy-respecting workflow tools for small teams.",
        evidence: e(
          8,
          "Product-minded software generalist who builds privacy-respecting workflow tools for small teams.",
          "summary",
        ),
      },
    },
    work_experiences: [
      {
        employer: {
          value: "Northstar Example Labs",
          evidence: e(12, "Northstar Example Labs", "work"),
        },
        job_title: {
          value: "Senior Workflow Engineer",
          evidence: e(13, "Senior Workflow Engineer", "work"),
        },
        start_date: {
          value: "March 2022",
          evidence: e(14, "March 2022", "work"),
        },
        end_date: { value: "Present", evidence: e(14, "Present", "work") },
        location: null,
        highlights: [
          {
            value:
              "Led redesign of a resume intake dashboard that cut synthetic review steps from 9 to 5.",
            evidence: e(
              15,
              "Led redesign of a resume intake dashboard that cut synthetic review steps from 9 to 5.",
              "work",
            ),
          },
          {
            value:
              "Built TypeScript validation scripts for 1,200 demonstration records with zero unsupported field writes.",
            evidence: e(
              16,
              "Built TypeScript validation scripts for 1,200 demonstration records with zero unsupported field writes.",
              "work",
            ),
          },
          {
            value:
              "Coordinated with two product partners; no direct people-management role is stated.",
            evidence: e(
              17,
              "Coordinated with two product partners; no direct people-management role is stated.",
              "work",
            ),
          },
        ],
      },
      {
        employer: {
          value: "Acme Demonstration Systems",
          evidence: e(20, "Acme Demonstration Systems", "work"),
        },
        job_title: {
          value: "Automation Analyst",
          evidence: e(21, "Automation Analyst", "work"),
        },
        start_date: { value: "2019", evidence: e(22, "2019", "work") },
        end_date: { value: "Feb. 2022", evidence: e(22, "Feb. 2022", "work") },
        location: null,
        highlights: [
          {
            value:
              "Created Docker-based test fixtures that reduced local setup time by 35%.",
            evidence: e(
              23,
              "Created Docker-based test fixtures that reduced local setup time by 35%.",
              "work",
            ),
          },
          {
            value:
              "Maintained PostgreSQL reports and React review screens for a fictional hiring workflow.",
            evidence: e(
              24,
              "Maintained PostgreSQL reports and React review screens for a fictional hiring workflow.",
              "work",
            ),
          },
        ],
      },
    ],
    education: [
      {
        school: {
          value: "Example Institute of Technology",
          evidence: e(28, "Example Institute of Technology", "education"),
        },
        degree: {
          value: "Bachelor of Applied Computer Systems",
          evidence: e(29, "Bachelor of Applied Computer Systems", "education"),
        },
        start_date: { value: "2015", evidence: e(30, "2015", "education") },
        end_date: { value: "2019", evidence: e(30, "2019", "education") },
        grade: null,
      },
    ],
    skills: [
      "TypeScript",
      "React",
      "Docker",
      "PostgreSQL",
      "PDF.js",
      "Zod",
    ].map((skill) => ({
      value: skill,
      evidence: e(34, skill, "skill"),
    })),
    languages: [
      {
        name: { value: "English", evidence: e(37, "English", "language") },
        proficiency: { value: "fluent", evidence: e(37, "fluent", "language") },
      },
      {
        name: { value: "French", evidence: e(38, "French", "language") },
        proficiency: {
          value: "professional working proficiency",
          evidence: e(38, "professional working proficiency", "language"),
        },
      },
    ],
    certifications: [
      {
        name: {
          value: "Synthetic Privacy Engineering Certificate",
          evidence: e(
            41,
            "Synthetic Privacy Engineering Certificate",
            "certification",
          ),
        },
        date: { value: "2023", evidence: e(41, "2023", "certification") },
        issuer: null,
      },
    ],
    ambiguities: [
      {
        code: "ambiguous-platform-reliability",
        message:
          "The platform reliability statement is ambiguous and is not converted into a concrete ownership achievement.",
        evidence: e(
          18,
          'supported "platform reliability" across onboarding and analytics',
          "ambiguity",
        ),
      },
    ],
    warnings: [
      {
        code: "absent-employer-locations",
        message:
          "The source explicitly says exact employer locations are not stated; client visits near Example Harbor are not employer locations.",
        evidence: e(44, "exact employer locations", "absence"),
      },
    ],
  };
}
