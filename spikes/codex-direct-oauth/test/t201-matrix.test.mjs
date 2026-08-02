import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import {
  T201_MATRIX_CASE_IDS,
  T201_MATRIX_METRIC_KEYS,
  aggregateT201Matrix,
  buildValidT201MatrixResult,
  evaluateT201MatrixCase,
  loadAllT201MatrixCases,
  loadT201MatrixCase,
  projectT201MatrixFactDiagnostics,
} from "../lib/t201-matrix-evaluator.mjs";
import {
  buildT201Prompt,
  validateT201Schema,
} from "../lib/t201-semantic-evaluator.mjs";
import {
  buildT201PdfCoordinateMapping,
  validateT201PdfEvidenceMapping,
} from "../lib/t201-pdf-coordinate-mapping.mjs";

async function c02() {
  return loadT201MatrixCase("T201-C02");
}

function c02Result(item) {
  return buildValidT201MatrixResult(item.fixture, item.manifest);
}

test("T201 matrix contains the six bounded provider-independent cases", async () => {
  const cases = await loadAllT201MatrixCases();
  assert.deepEqual(
    cases.map((item) => item.case_id),
    T201_MATRIX_CASE_IDS,
  );
  assert.deepEqual(
    cases.map((item) => item.manifest.fixture_classification),
    Array(6).fill("synthetic"),
  );
  for (const item of cases) {
    assert.ok(item.manifest.exact_facts.length > 0);
    assert.ok(item.manifest.intentionally_absent_fields.length > 0);
    assert.ok(item.manifest.ambiguous_facts.length > 0);
    assert.ok(item.manifest.forbidden_inferences.length > 0);
    assert.ok(item.manifest.extraction_format);
  }
  const french = cases.find((item) => item.case_id === "T201-C02");
  assert.match(french.fixture, /é|è|à|ç/);
  assert.match(french.fixture, /mars 2021|2017–2021/);
  const bilingual = cases.find((item) => item.case_id === "T201-C03");
  assert.match(bilingual.fixture, /SUMMARY \/ RÉSUMÉ/);
  const columns = cases.find((item) => item.case_id === "T201-C05");
  assert.equal(
    columns.manifest.extraction_format.reading_order_artifact,
    "adjacent_columns_interleaved",
  );
  assert.match(columns.fixture, /column=left/);
  assert.match(columns.fixture, /column=right/);
  const docx = cases.find((item) => item.case_id === "T201-C06");
  assert.equal(
    docx.manifest.extraction_format.kind,
    "deterministic_ooxml_text",
  );
  assert.match(docx.fixture, /style=ListBullet/);
  assert.match(docx.fixture, /Table row=0 cell=0/);
});

test("every T201 matrix fixture and manifest passes independently with deterministic grounded output", async () => {
  const results = [];
  for (const item of await loadAllT201MatrixCases()) {
    const output = buildValidT201MatrixResult(item.fixture, item.manifest);
    const result = evaluateT201MatrixCase({ ...item, output });
    results.push(result);
    assert.equal(result.metrics.schema_valid, true, item.case_id);
    assert.equal(result.metrics.expected_section_recall, 1, item.case_id);
    assert.equal(result.metrics.expected_item_recall, 1, item.case_id);
    assert.equal(result.metrics.exact_fact_recall, 1, item.case_id);
    assert.equal(result.metrics.high_priority_fact_recall, 1, item.case_id);
    assert.equal(
      result.metrics.document_language_classification_pass,
      true,
      item.case_id,
    );
    assert.equal(result.metrics.unsupported_fact_count, 0, item.case_id);
    assert.equal(result.metrics.forbidden_inference_count, 0, item.case_id);
    assert.equal(result.metrics.missing_evidence_count, 0, item.case_id);
    assert.equal(result.metrics.invalid_evidence_count, 0, item.case_id);
    assert.equal(result.metrics.ambiguity_handling_pass, true, item.case_id);
    assert.equal(result.metrics.grounding_pass, true, item.case_id);
    assert.equal(result.metrics.no_invention_pass, true, item.case_id);
    assert.equal(result.metrics.parsing_pass, true, item.case_id);
  }
  const aggregate = aggregateT201Matrix(results);
  assert.equal(aggregate.all_cases_pass, true);
  assert.equal(aggregate.case_count, 6);
  for (const item of aggregate.cases)
    assert.deepEqual(
      Object.keys(item.metrics).sort(),
      [...T201_MATRIX_METRIC_KEYS].sort(),
    );
});

test("T201 aggregate fails when one mandatory case fails even if the others pass", async () => {
  const results = [];
  for (const item of await loadAllT201MatrixCases()) {
    results.push(
      evaluateT201MatrixCase({
        ...item,
        output: buildValidT201MatrixResult(item.fixture, item.manifest),
      }),
    );
  }
  results[3].metrics.parsing_pass = false;
  const aggregate = aggregateT201Matrix(results);
  assert.equal(aggregate.all_cases_pass, false);
  assert.equal(aggregate.cases.filter((item) => item.pass).length, 5);
});

test("T201 matrix treats missing or invalid diagnostic arrays as schema failures, not exceptions", async () => {
  const item = (await loadAllT201MatrixCases()).find(
    (candidate) => candidate.case_id === "T201-C02",
  );
  const output = buildValidT201MatrixResult(item.fixture, item.manifest);
  delete output.ambiguities;
  output.warnings = { not: "an array" };
  const result = evaluateT201MatrixCase({ ...item, output });
  assert.equal(result.metrics.schema_valid, false);
  assert.equal(result.metrics.parsing_pass, false);
  assert.ok(result.errors.includes("schema_validation_failed"));
});

test("T201 v2 requires every declared absent scalar to be explicit null and rejects invented values", async () => {
  const item = await loadT201MatrixCase("T201-C04");
  const output = buildValidT201MatrixResult(item.fixture, item.manifest);
  assert.equal(output.schema_version, 2);
  assert.equal(output.basics.phone, null);
  assert.equal(output.work_experiences[0].location, null);
  assert.equal(output.work_experiences[0].employment_type, null);
  assert.equal(output.education[0].grade, null);
  assert.equal(output.certifications[0].issuer, null);
  assert.equal(validateT201Schema(output).ok, true);

  delete output.work_experiences[0].employment_type;
  const omitted = evaluateT201MatrixCase({ ...item, output });
  assert.equal(omitted.metrics.schema_valid, false);
  assert.equal(omitted.metrics.parsing_pass, false);

  output.work_experiences[0].employment_type = {
    value: "full-time",
    evidence: output.work_experiences[0].employer.evidence,
  };
  const invented = evaluateT201MatrixCase({ ...item, output });
  assert.equal(invented.metrics.no_invention_pass, false);
  assert.equal(invented.metrics.parsing_pass, false);
});

test("T201 v2 validates PDF physical coordinates against flattened evidence and fails closed", async () => {
  const item = await loadT201MatrixCase("T201-C04");
  const output = buildValidT201MatrixResult(item.fixture, item.manifest);
  const evidence = output.work_experiences[0].employer.evidence[0];
  const mapping = buildT201PdfCoordinateMapping(item.fixture);
  assert.equal(validateT201PdfEvidenceMapping(mapping, evidence), true);
  assert.equal(evidence.physical.mapping_version, 1);
  assert.equal(evidence.physical.page, 1);
  assert.equal(evidence.physical.item, 8);

  evidence.physical.item = 999;
  const invalidItem = evaluateT201MatrixCase({ ...item, output });
  assert.equal(invalidItem.metrics.parsing_pass, false);
  assert.ok(invalidItem.errors.includes("evidence_coordinate_mismatch"));

  const c05 = await loadT201MatrixCase("T201-C05");
  const c05Output = buildValidT201MatrixResult(c05.fixture, c05.manifest);
  assert.equal(
    evaluateT201MatrixCase({ ...c05, output: c05Output }).metrics.parsing_pass,
    true,
  );
  const c06 = await loadT201MatrixCase("T201-C06");
  const c06Output = buildValidT201MatrixResult(c06.fixture, c06.manifest);
  assert.equal(
    Object.hasOwn(c06Output.basics.full_name.evidence[0], "physical"),
    false,
  );

  const multiPage = buildT201PdfCoordinateMapping(
    "[page=1 item=001] first item\n[page=2 item=001] second item\n",
  );
  const secondPageEvidence = {
    line: 2,
    start: 18,
    end: 24,
    physical: { mapping_version: 1, page: 2, item: 1, start: 0, end: 6 },
  };
  assert.equal(
    validateT201PdfEvidenceMapping(multiPage, secondPageEvidence),
    true,
  );
});

test("T201 C04 deterministic offline golden output preserves its required quality gates", async () => {
  const item = await loadT201MatrixCase("T201-C04");
  const result = evaluateT201MatrixCase({
    ...item,
    output: buildValidT201MatrixResult(item.fixture, item.manifest),
  });
  assert.equal(result.fact_diagnostics.matched_expected_fact_count, 23);
  assert.equal(result.fact_diagnostics.matched_high_priority_fact_count, 17);
  assert.equal(result.metrics.document_language_classification_pass, true);
  assert.equal(result.metrics.ambiguity_handling_pass, true);
  assert.equal(result.metrics.grounding_pass, true);
  assert.equal(result.metrics.no_invention_pass, true);
  assert.equal(result.metrics.parsing_pass, true);
});

test("T201 C02 manifest ambiguities have a schema-valid, prompt-defined representation", async () => {
  const item = await c02();
  const output = c02Result(item);
  const prompt = buildT201Prompt({
    ...item,
    schema: { type: "object" },
  });

  assert.equal(validateT201Schema(output).ok, true);
  for (const expected of item.manifest.ambiguous_facts) {
    const diagnostic = output.ambiguities.find(
      (candidate) => candidate.code === expected.id,
    );
    assert.ok(diagnostic, expected.id);
    assert.equal(diagnostic.evidence[0].line, expected.source_line);
    assert.equal(diagnostic.evidence[0].category, "ambiguity");
    assert.ok(prompt.includes(`code=${expected.id}`));
    assert.ok(prompt.includes(`evidence line=${expected.source_line}`));
  }
});

test("T201 classifies English, French, and bilingual documents separately from extracted facts", async () => {
  for (const [caseId, expected] of [
    ["T201-C01", "English"],
    ["T201-C02", "French"],
    ["T201-C03", "French/English"],
  ]) {
    const item = await loadT201MatrixCase(caseId);
    const output = buildValidT201MatrixResult(item.fixture, item.manifest);
    const result = evaluateT201MatrixCase({ ...item, output });
    assert.equal(output.document_language, expected, caseId);
    assert.equal(result.metrics.document_language_classification_pass, true);
    assert.equal(result.metrics.parsing_pass, true);
  }
  const item = await loadT201MatrixCase("T201-C03");
  const output = buildValidT201MatrixResult(item.fixture, item.manifest);
  output.document_language = "English";
  const result = evaluateT201MatrixCase({ ...item, output });
  assert.equal(result.metrics.document_language_classification_pass, false);
  assert.equal(result.metrics.exact_fact_recall, 1);
  assert.equal(result.metrics.high_priority_fact_recall, 1);
  assert.equal(result.metrics.grounding_pass, true);
  assert.equal(result.metrics.parsing_pass, false);
  assert.ok(result.errors.includes("document_language_misclassified"));

  const English = await loadT201MatrixCase("T201-C01");
  const manifestMismatch = buildValidT201MatrixResult(
    English.fixture,
    English.manifest,
  );
  manifestMismatch.document_language = "French";
  const manifestResult = evaluateT201MatrixCase({
    ...English,
    manifest: { ...English.manifest, document_language: "French" },
    output: manifestMismatch,
  });
  assert.equal(
    manifestResult.metrics.document_language_classification_pass,
    false,
  );
  assert.equal(manifestResult.metrics.exact_fact_recall, 1);
  assert.equal(manifestResult.metrics.high_priority_fact_recall, 1);
});

test("T201 manifest-driven completeness checklist covers every selected fact without treating absences as facts", async () => {
  for (const caseId of ["T201-C02", "T201-C03"]) {
    const item = await loadT201MatrixCase(caseId);
    const prompt = buildT201Prompt({ ...item, schema: { type: "object" } });
    const checklist = prompt
      .split("REQUIRED COMPLETENESS CHECKLIST:\n")[1]
      .split("\n\nINTENTIONALLY ABSENT OPTIONAL FIELDS")[0];

    for (const fact of item.manifest.exact_facts) {
      const factId = `${item.manifest.fixture_id}:${fact.path}`;
      assert.equal(
        checklist.split(`fact_id=${factId}`).length - 1,
        1,
        `${caseId} ${factId}`,
      );
      assert.match(
        checklist,
        new RegExp(`destination_path=${fact.path.replace(/[.[\]]/g, "\\$&")};`),
      );
      assert.match(checklist, new RegExp(`source_line_hint=${fact.line}`));
      assert.match(
        checklist,
        new RegExp(`required_evidence_category=${fact.category ?? "work"}`),
      );
      if (fact.priority === "high")
        assert.match(
          checklist,
          new RegExp(
            `fact_id=${factId.replace(/[.[\]]/g, "\\$&")};[^\n]*high_priority=true`,
          ),
        );
    }
    for (const path of item.manifest.intentionally_absent_fields) {
      assert.equal(checklist.includes(`destination_path=${path}`), false);
      assert.match(
        prompt,
        new RegExp(
          `INTENTIONALLY ABSENT OPTIONAL FIELDS[\\s\\S]*destination_path=${path.replace(/[.[\]]/g, "\\$&")}; required_output=null`,
        ),
      );
    }
  }
});

test("T201 completeness instructions preserve bilingual coverage, ambiguity safety, and JSON-only output", async () => {
  const item = await loadT201MatrixCase("T201-C03");
  const prompt = buildT201Prompt({ ...item, schema: { type: "object" } });
  assert.match(
    prompt,
    /do not omit a supported value merely because it appears in bilingual text/,
  );
  assert.match(
    prompt,
    /verify that every extracted value has valid source evidence/,
  );
  assert.match(
    prompt,
    /verify that every required destination path has been addressed/,
  );
  assert.match(prompt, /For every REQUIRED AMBIGUITY/);
  assert.match(
    prompt,
    /Return exactly one compact minified JSON object and nothing else/,
  );
  assert.match(
    prompt,
    /document-level classification of the full synthetic source/,
  );
  assert.match(prompt, /Do not reveal this internal check or any reasoning/);
  assert.doesNotMatch(prompt, /chain of thought/i);
  assert.doesNotMatch(prompt, /respond with prose/i);
});

test("T201 C03 fact diagnostics exclude document language but retain every real source fact", async () => {
  const item = await loadT201MatrixCase("T201-C03");
  const result = evaluateT201MatrixCase({
    ...item,
    output: buildValidT201MatrixResult(item.fixture, item.manifest),
  });
  const diagnostics = result.fact_diagnostics;

  assert.equal(
    diagnostics.expected_fact_count,
    item.manifest.exact_facts.filter(
      (fact) => fact.path !== "document_language",
    ).length,
  );
  assert.equal(diagnostics.matched_expected_fact_count, 23);
  assert.equal(diagnostics.high_priority_fact_count, 17);
  assert.equal(diagnostics.matched_high_priority_fact_count, 17);
  assert.deepEqual(diagnostics.missing_expected_fact_ids, []);
  assert.deepEqual(diagnostics.missing_high_priority_fact_ids, []);
  assert.equal(diagnostics.matched_expected_fact_ids.length, 23);
  assert.equal(
    diagnostics.matched_expected_fact_ids.includes(
      "T201-C03:document_language",
    ),
    false,
  );
  for (const identifier of diagnostics.matched_expected_fact_ids)
    assert.match(identifier, /^T201-C03:[a-z_[\]0-9.]+$/);
  assert.equal(JSON.stringify(diagnostics).includes("Dana Example"), false);
});

test("T201 C03 fact diagnostics identify omissions without accepting variants, wrong paths, or duplicates", async () => {
  const item = await loadT201MatrixCase("T201-C03");
  const expectedId = (path) => `T201-C03:${path}`;
  const evaluate = (output) =>
    evaluateT201MatrixCase({ ...item, output }).fact_diagnostics;

  const ordinaryOmitted = buildValidT201MatrixResult(
    item.fixture,
    item.manifest,
  );
  ordinaryOmitted.basics.summary.value = "different summary";
  assert.deepEqual(evaluate(ordinaryOmitted).missing_expected_fact_ids, [
    expectedId("basics.summary"),
  ]);

  const highOmitted = buildValidT201MatrixResult(item.fixture, item.manifest);
  highOmitted.basics.full_name.value = "different identity";
  assert.deepEqual(evaluate(highOmitted).missing_high_priority_fact_ids, [
    expectedId("basics.full_name"),
  ]);

  const multipleOmitted = buildValidT201MatrixResult(
    item.fixture,
    item.manifest,
  );
  multipleOmitted.basics.summary.value = "different summary";
  multipleOmitted.basics.full_name.value = "different identity";
  assert.deepEqual(evaluate(multipleOmitted).missing_expected_fact_ids, [
    expectedId("basics.full_name"),
    expectedId("basics.summary"),
  ]);

  const punctuationVariant = buildValidT201MatrixResult(
    item.fixture,
    item.manifest,
  );
  punctuationVariant.skills[0].value = "SQL.";
  assert.equal(
    evaluate(punctuationVariant).missing_expected_fact_ids.length,
    0,
  );

  const wrongPath = buildValidT201MatrixResult(item.fixture, item.manifest);
  wrongPath.basics.summary.value = wrongPath.education[0].degree.value;
  wrongPath.education[0].degree.value = "different degree";
  const wrongPathDiagnostics = evaluate(wrongPath);
  assert.ok(
    wrongPathDiagnostics.missing_expected_fact_ids.includes(
      expectedId("basics.summary"),
    ),
  );
  assert.ok(
    wrongPathDiagnostics.missing_expected_fact_ids.includes(
      expectedId("education[0].degree"),
    ),
  );

  const duplicate = buildValidT201MatrixResult(item.fixture, item.manifest);
  duplicate.skills[1].value = duplicate.skills[0].value;
  assert.ok(
    evaluate(duplicate).missing_expected_fact_ids.includes(
      expectedId("skills[1]"),
    ),
  );
});

test("T201 C03 evaluator still rejects threshold-breaking ordinary omissions and every high-priority omission", async () => {
  const item = await loadT201MatrixCase("T201-C03");
  const ordinaryOmitted = buildValidT201MatrixResult(
    item.fixture,
    item.manifest,
  );
  ordinaryOmitted.basics.summary.value = "different summary";
  ordinaryOmitted.work_experiences[0].highlights[0].value =
    "different highlight";
  ordinaryOmitted.work_experiences[0].highlights[1].value =
    "another different highlight";
  const ordinaryResult = evaluateT201MatrixCase({
    ...item,
    output: ordinaryOmitted,
  });
  assert.equal(ordinaryResult.metrics.exact_fact_recall, 0.8696);
  assert.equal(ordinaryResult.metrics.parsing_pass, false);

  const highOmitted = buildValidT201MatrixResult(item.fixture, item.manifest);
  highOmitted.basics.full_name.value = "different identity";
  const highResult = evaluateT201MatrixCase({ ...item, output: highOmitted });
  assert.equal(highResult.metrics.high_priority_fact_recall, 0.9412);
  assert.equal(highResult.metrics.parsing_pass, false);
});

test("T201 C03 fact-diagnostic projection fails closed for unknown identifiers", async () => {
  const item = await loadT201MatrixCase("T201-C03");
  const identifiers = item.manifest.exact_facts.map(
    (fact) => `T201-C03:${fact.path}`,
  );
  await assert.rejects(
    async () =>
      projectT201MatrixFactDiagnostics(item.manifest, {
        matchedExpectedFactIds: identifiers.slice(1),
        missingExpectedFactIds: ["secret-like-identifier"],
      }),
    /t201_matrix_fact_diagnostic_unknown_identifier/,
  );
});

test("T201 C02 ambiguity contract accepts only the exact grounded diagnostic", async () => {
  const item = await c02();
  const correct = c02Result(item);
  const expected = item.manifest.ambiguous_facts[0];
  const verify = (output) =>
    evaluateT201MatrixCase({ ...item, output }).metrics;

  const correctMetrics = verify(correct);
  assert.equal(correctMetrics.schema_valid, true);
  assert.equal(correctMetrics.ambiguity_handling_pass, true);
  assert.equal(correctMetrics.parsing_pass, true);
  assert.equal(correctMetrics.expected_section_recall, 1);
  assert.equal(correctMetrics.expected_item_recall, 1);
  assert.equal(correctMetrics.exact_fact_recall, 1);
  assert.equal(correctMetrics.high_priority_fact_recall, 1);
  assert.equal(correctMetrics.grounding_pass, true);
  assert.equal(correctMetrics.no_invention_pass, true);
  assert.equal(correctMetrics.unsupported_fact_count, 0);
  assert.equal(correctMetrics.forbidden_inference_count, 0);

  const omitted = c02Result(item);
  omitted.ambiguities = [];
  assert.equal(verify(omitted).ambiguity_handling_pass, false);
  assert.equal(verify(omitted).parsing_pass, false);

  const guessed = c02Result(item);
  guessed.ambiguities = [];
  guessed.work_experiences[0].highlights.push({
    value:
      "La fiabilité de plateforme établit une responsabilité de direction.",
    evidence: correct.ambiguities[0].evidence,
  });
  assert.equal(verify(guessed).ambiguity_handling_pass, false);
  assert.equal(verify(guessed).parsing_pass, false);

  const nullOnly = c02Result(item);
  nullOnly.ambiguities = [];
  assert.equal(nullOnly.basics.phone, null);
  assert.equal(verify(nullOnly).ambiguity_handling_pass, false);
  assert.equal(verify(nullOnly).no_invention_pass, true);

  const wrongPath = c02Result(item);
  wrongPath.ambiguities[0].evidence = [correct.basics.full_name.evidence[0]];
  assert.equal(verify(wrongPath).ambiguity_handling_pass, false);
  assert.equal(verify(wrongPath).invalid_evidence_count, 1);

  const invalidEvidence = c02Result(item);
  invalidEvidence.ambiguities[0].evidence[0].fragment_hash = "0".repeat(64);
  assert.equal(verify(invalidEvidence).ambiguity_handling_pass, false);
  assert.equal(verify(invalidEvidence).invalid_evidence_count, 1);

  assert.equal(correct.ambiguities[0].code, expected.id);
});

test("T201 matrix evidence is source-local and aggregate evidence has no fixture or model text", async () => {
  const item = (await loadAllT201MatrixCases()).find(
    (candidate) => candidate.case_id === "T201-C05",
  );
  const output = buildValidT201MatrixResult(item.fixture, item.manifest);
  const result = evaluateT201MatrixCase({ ...item, output });
  assert.equal(result.metrics.grounding_pass, true);
  const aggregate = aggregateT201Matrix([result]);
  const serialized = JSON.stringify(aggregate);
  assert.match(serialized, /fixture_hash/);
  assert.doesNotMatch(
    serialized,
    /Harborless Example Studio|Noor Fiction|raw_model|response_text/,
  );
});

test("persisted T201 aggregate evidence contains only the approved safe fields", async () => {
  const evidence = JSON.parse(
    await fs.readFile(
      new URL(
        "../evidence/codex-direct-oauth-t201-matrix.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(evidence.matrix_pass, false);
  for (const item of evidence.cases) {
    assert.ok(item.case_id);
    assert.ok(item.language_category);
    assert.ok(item.source_format_category);
    assert.ok(item.layout_category);
    assert.match(item.fixture_hash, /^[a-f0-9-]+$/);
    assert.equal(typeof item.pass, "boolean");
    assert.equal(typeof item.privacy_safe, "boolean");
    assert.equal(typeof item.credential_isolation, "boolean");
    assert.equal(Object.hasOwn(item, "raw_model_output"), false);
    assert.equal(Object.hasOwn(item, "fixture_text"), false);
  }
});
