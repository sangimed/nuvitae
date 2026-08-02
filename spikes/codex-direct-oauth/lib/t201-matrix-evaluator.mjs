import fs from "node:fs/promises";
import path from "node:path";
import {
  fragmentHash,
  validateT201Schema,
  lineEvidenceFor,
  fixtureHash,
  normalizeFragment,
  evaluateT201AmbiguityHandling,
} from "./t201-semantic-evaluator.mjs";

const CASE_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../fixtures/t201-matrix",
);
export const T201_MATRIX_CASE_IDS = Object.freeze([
  "T201-C01",
  "T201-C02",
  "T201-C03",
  "T201-C04",
  "T201-C05",
  "T201-C06",
]);
export const T201_MATRIX_METRIC_KEYS = Object.freeze([
  "schema_valid",
  "expected_section_recall",
  "expected_item_recall",
  "exact_fact_recall",
  "high_priority_fact_recall",
  "unsupported_fact_count",
  "forbidden_inference_count",
  "missing_evidence_count",
  "invalid_evidence_count",
  "ambiguity_handling_pass",
  "grounding_pass",
  "no_invention_pass",
  "parsing_pass",
]);

export async function loadT201MatrixCase(caseId) {
  if (!T201_MATRIX_CASE_IDS.includes(caseId))
    throw new Error(`unknown T201 matrix case: ${caseId}`);
  if (caseId === "T201-C01") {
    const legacy = await import("./t201-semantic-evaluator.mjs");
    const artifacts = await legacy.loadT201Artifacts();
    return {
      case_id: caseId,
      fixture: artifacts.fixture,
      manifest: {
        ...artifacts.manifest,
        language_category: "English",
        source_format_category: "plain-text",
        layout_category: "single-column",
        extraction_format: {
          kind: "plain_text",
          coordinate_system: "one_based_line_zero_based_utf8_offset",
        },
        document_language: "English",
      },
    };
  }
  const slug = caseId.toLowerCase();
  const fixturePath = path.join(CASE_ROOT, `${slug}.txt`);
  const manifestPath = path.join(CASE_ROOT, `${slug}.manifest.json`);
  return {
    case_id: caseId,
    fixture: await fs.readFile(fixturePath, "utf8"),
    manifest: JSON.parse(await fs.readFile(manifestPath, "utf8")),
  };
}

export async function loadAllT201MatrixCases() {
  return Promise.all(T201_MATRIX_CASE_IDS.map(loadT201MatrixCase));
}

function valueAtPath(output, expression) {
  let current = output;
  for (const part of expression
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)) {
    current = current?.[part];
    if (current === undefined) return undefined;
  }
  return current &&
    typeof current === "object" &&
    !Array.isArray(current) &&
    "value" in current
    ? current.value
    : current;
}

function evidenceFragment(lines, evidence) {
  const line = lines[evidence?.line - 1];
  if (
    typeof line !== "string" ||
    !Number.isInteger(evidence.start) ||
    !Number.isInteger(evidence.end)
  )
    return null;
  if (
    evidence.start < 0 ||
    evidence.end > line.length ||
    evidence.end <= evidence.start
  )
    return null;
  return line.slice(evidence.start, evidence.end);
}

function comparable(value) {
  return normalizeFragment(value)
    .toLowerCase()
    .replace(/^[-•]\s*/, "")
    .replace(/\.$/, "");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function allValueObjects(value, at = "$") {
  if (!value || typeof value !== "object") return [];
  if (
    !Array.isArray(value) &&
    typeof value.value === "string" &&
    Array.isArray(value.evidence)
  )
    return [{ at, value: value.value, evidence: value.evidence }];
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      allValueObjects(item, `${at}[${index}]`),
    );
  return Object.entries(value).flatMap(([key, child]) =>
    allValueObjects(child, `${at}.${key}`),
  );
}

function evidenceForManifestFact(lines, fact) {
  const fragment = fact.evidence?.fragment ?? fact.fragment ?? fact.value;
  return lineEvidenceFor(lines, fact.line, fragment, fact.category ?? "work");
}

export function buildValidT201MatrixResult(fixture, manifest) {
  const lines = fixture.replace(/\n$/, "").split("\n");
  const result = {
    schema_version: 1,
    document_language: manifest.document_language,
    basics: {
      full_name: null,
      email: null,
      phone: null,
      location: null,
      summary: null,
    },
    work_experiences: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
    ambiguities: [],
    warnings: [],
  };
  const wrap = (fact) => ({
    value: fact.value,
    evidence: [evidenceForManifestFact(lines, fact)],
  });
  for (const fact of manifest.exact_facts) {
    if (fact.path === "document_language") continue;
    const parts = fact.path.replace(/\[(\d+)\]/g, ".$1").split(".");
    let current = result;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      const next = parts[index + 1];
      if (current[part] === undefined)
        current[part] = /^\d+$/.test(next) ? [] : {};
      if (/^\d+$/.test(next) && current[part][Number(next)] === undefined)
        current[part][Number(next)] = {};
      current = /^\d+$/.test(part) ? current[Number(part)] : current[part];
    }
    const leaf = parts.at(-1);
    current[leaf] = wrap(fact);
  }
  for (const work of result.work_experiences) work.location ??= null;
  for (const education of result.education) education.grade ??= null;
  for (const certification of result.certifications)
    certification.issuer ??= null;
  for (const item of manifest.ambiguous_facts ?? []) {
    const fact = {
      ...item,
      value: item.text,
      line: item.source_line,
      category: "ambiguity",
      evidence: { fragment: item.text },
    };
    result.ambiguities.push({
      code: item.id,
      message: item.expected_handling,
      evidence: [evidenceForManifestFact(lines, fact)],
    });
  }
  const absence = manifest.intentionally_absent_fields?.[0];
  if (absence && manifest.absence_evidence) {
    const fact = manifest.absence_evidence;
    result.warnings.push({
      code: "absent-optional-fields",
      message: "Optional source fields are absent and remain null.",
      evidence: [
        evidenceForManifestFact(lines, { ...fact, category: "absence" }),
      ],
    });
  }
  return result;
}

export function evaluateT201MatrixCase({ caseId, fixture, manifest, output }) {
  const lines = fixture.replace(/\n$/, "").split("\n");
  const schema = validateT201Schema(output);
  const errors = new Set(schema.errors.map((item) => item.category));
  let missingEvidence = 0;
  let invalidEvidence = 0;
  let unsupported = 0;
  for (const item of allValueObjects(output)) {
    if (!item.evidence.length) {
      missingEvidence += 1;
      errors.add("evidence_missing");
      continue;
    }
    const supported = item.evidence.some((evidence) => {
      const fragment = evidenceFragment(lines, evidence);
      if (!fragment) {
        invalidEvidence += 1;
        errors.add("evidence_out_of_bounds");
        return false;
      }
      if (fragmentHash(fragment) !== evidence.fragment_hash) {
        invalidEvidence += 1;
        errors.add("evidence_mismatch");
        return false;
      }
      return comparable(fragment).includes(comparable(item.value));
    });
    if (!supported) {
      unsupported += 1;
      errors.add("unsupported_fact");
    }
  }
  const sectionKeys = [
    "basics",
    "work_experiences",
    "education",
    "skills",
    "languages",
    "certifications",
  ];
  const sectionMatches = sectionKeys.map((key) =>
    key === "basics"
      ? output.basics
        ? 1
        : 0
      : safeArray(output[key]).length === manifest.expected_section_counts[key]
        ? 1
        : 0,
  );
  const sectionRecall =
    sectionMatches.reduce((a, b) => a + b, 0) / sectionMatches.length;
  const highlights = safeArray(output.work_experiences).reduce(
    (total, item) => total + safeArray(item?.highlights).length,
    0,
  );
  const diagnostics = [
    ...safeArray(output.ambiguities),
    ...safeArray(output.warnings),
  ];
  const itemRecall =
    [
      highlights === manifest.expected_item_counts.work_experience_highlights,
      diagnostics.length >=
        manifest.expected_item_counts.warnings_or_ambiguities_minimum,
    ].filter(Boolean).length / 2;
  const matches = manifest.exact_facts.map(
    (fact) =>
      comparable(valueAtPath(output, fact.path)) === comparable(fact.value),
  );
  const exactRecall =
    matches.filter(Boolean).length / manifest.exact_facts.length;
  const high = manifest.exact_facts.filter((fact) => fact.priority === "high");
  const highRecall = high.length
    ? high.filter(
        (fact) =>
          comparable(valueAtPath(output, fact.path)) === comparable(fact.value),
      ).length / high.length
    : 1;
  let forbidden = 0;
  for (const pathExpression of manifest.intentionally_absent_fields ?? [])
    if (
      valueAtPath(output, pathExpression) !== null &&
      valueAtPath(output, pathExpression) !== undefined
    )
      forbidden += 1;
  const allOutputValues = allValueObjects(output).map((item) =>
    item.value.toLowerCase(),
  );
  for (const inference of manifest.forbidden_inferences ?? []) {
    const scopedValues =
      inference.path && !inference.path.includes("*")
        ? [valueAtPath(output, inference.path)]
            .filter((value) => typeof value === "string")
            .map((value) => value.toLowerCase())
        : allOutputValues;
    for (const forbiddenValue of inference.forbidden_values ?? [])
      if (
        scopedValues.some((value) =>
          value.includes(forbiddenValue.toLowerCase()),
        )
      )
        forbidden += 1;
  }
  const ambiguityHandling = evaluateT201AmbiguityHandling(
    output,
    fixture,
    manifest,
  );
  invalidEvidence += ambiguityHandling.invalid_evidence_count;
  ambiguityHandling.error_categories.forEach((category) =>
    errors.add(category),
  );
  const grounding =
    missingEvidence === 0 && invalidEvidence === 0 && unsupported === 0;
  const absentPass = (manifest.intentionally_absent_fields ?? []).every(
    (pathExpression) =>
      valueAtPath(output, pathExpression) === null ||
      valueAtPath(output, pathExpression) === undefined,
  );
  const metrics = {
    schema_valid: schema.ok,
    expected_section_recall: Number(sectionRecall.toFixed(4)),
    expected_item_recall: Number(itemRecall.toFixed(4)),
    exact_fact_recall: Number(exactRecall.toFixed(4)),
    high_priority_fact_recall: Number(highRecall.toFixed(4)),
    unsupported_fact_count: unsupported,
    forbidden_inference_count: forbidden,
    missing_evidence_count: missingEvidence,
    invalid_evidence_count: invalidEvidence,
    ambiguity_handling_pass: ambiguityHandling.pass,
    grounding_pass: grounding,
    no_invention_pass: forbidden === 0 && absentPass,
    parsing_pass:
      schema.ok &&
      sectionRecall >= 1 &&
      itemRecall >= 1 &&
      exactRecall >= manifest.thresholds.minimum_exact_fact_recall &&
      highRecall >= manifest.thresholds.required_high_priority_fact_recall &&
      grounding &&
      forbidden === 0 &&
      ambiguityHandling.pass &&
      absentPass,
  };
  return {
    case_id: caseId,
    metrics,
    fixture_hash: fixtureHash(fixture),
    language_category: manifest.language_category,
    source_format_category: manifest.source_format_category,
    layout_category: manifest.layout_category,
    errors: [...errors].sort(),
  };
}

export function aggregateT201Matrix(results) {
  const cases = results.map((result) => ({
    case_id: result.case_id,
    language_category: result.language_category,
    source_format_category: result.source_format_category,
    layout_category: result.layout_category,
    fixture_hash: result.fixture_hash,
    metrics: Object.fromEntries(
      T201_MATRIX_METRIC_KEYS.map((key) => [key, result.metrics[key]]),
    ),
    pass: result.metrics.parsing_pass,
  }));
  return {
    case_count: cases.length,
    mandatory_case_count: T201_MATRIX_CASE_IDS.length,
    all_cases_pass:
      cases.length === T201_MATRIX_CASE_IDS.length &&
      cases.every((item) => item.pass === true),
    cases,
  };
}
