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
} from "../lib/t201-matrix-evaluator.mjs";

test("T201 matrix contains the six bounded provider-independent cases", async () => {
  const cases = await loadAllT201MatrixCases();
  assert.deepEqual(cases.map((item) => item.case_id), T201_MATRIX_CASE_IDS);
  assert.deepEqual(cases.map((item) => item.manifest.fixture_classification), Array(6).fill("synthetic"));
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
  assert.equal(columns.manifest.extraction_format.reading_order_artifact, "adjacent_columns_interleaved");
  assert.match(columns.fixture, /column=left/);
  assert.match(columns.fixture, /column=right/);
  const docx = cases.find((item) => item.case_id === "T201-C06");
  assert.equal(docx.manifest.extraction_format.kind, "deterministic_ooxml_text");
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
  for (const item of aggregate.cases) assert.deepEqual(Object.keys(item.metrics).sort(), [...T201_MATRIX_METRIC_KEYS].sort());
});

test("T201 aggregate fails when one mandatory case fails even if the others pass", async () => {
  const results = [];
  for (const item of await loadAllT201MatrixCases()) {
    results.push(evaluateT201MatrixCase({ ...item, output: buildValidT201MatrixResult(item.fixture, item.manifest) }));
  }
  results[3].metrics.parsing_pass = false;
  const aggregate = aggregateT201Matrix(results);
  assert.equal(aggregate.all_cases_pass, false);
  assert.equal(aggregate.cases.filter((item) => item.pass).length, 5);
});

test("T201 matrix evidence is source-local and aggregate evidence has no fixture or model text", async () => {
  const item = (await loadAllT201MatrixCases()).find((candidate) => candidate.case_id === "T201-C05");
  const output = buildValidT201MatrixResult(item.fixture, item.manifest);
  const result = evaluateT201MatrixCase({ ...item, output });
  assert.equal(result.metrics.grounding_pass, true);
  const aggregate = aggregateT201Matrix([result]);
  const serialized = JSON.stringify(aggregate);
  assert.match(serialized, /fixture_hash/);
  assert.doesNotMatch(serialized, /Harborless Example Studio|Noor Fiction|raw_model|response_text/);
});

test("persisted T201 aggregate evidence contains only the approved safe fields", async () => {
  const evidence = JSON.parse(await fs.readFile(new URL("../evidence/codex-direct-oauth-t201-matrix.json", import.meta.url), "utf8"));
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
