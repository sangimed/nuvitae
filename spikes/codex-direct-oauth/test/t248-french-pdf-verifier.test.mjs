import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertEvidenceHasNoRawFixtureText,
  buildSanitizedT248Evidence,
} from "../lib/t248-french-pdf-evidence.mjs";
import { collectT248Proof } from "../verify-t248-french-pdf.mjs";

const validInput = Object.freeze({
  fixture_sha256: "a".repeat(64),
  byte_size: 4811,
  page_count: 1,
  extraction_succeeded: true,
  ocr_used: false,
  selectable_text_contract_pass: true,
  extracted_text_present: true,
  meaningful_structure_pass: true,
  text_item_count: 41,
  non_empty_line_count: 21,
  language_classification: "french",
  language_confidence: "medium",
  corpus_transcript_match: true,
  validation_result_is_pass: true,
});

const fixtureLines = Object.freeze([
  "Léa Dupont-Exemple",
  "Ingénieure Systèmes",
  "lea.exemple@example.invalid",
  "Nantes, France",
  "RÉSUMÉ",
  "Ingénieure systèmes qui simplifie des processus d'approbation fictifs.",
  "EXPÉRIENCE",
  "Atelier Fictif Lumière (employeur fictif)",
  "Ingénieure Systèmes",
  "avril 2022 – décembre 2024",
  "- A cartographié 18 parcours d'approbation fictifs.",
  "- A écrit des vérifications JSON pour 300 enregistrements fictifs.",
  "- « Résilience opérationnelle » apparaît sans périmètre défini.",
  "FORMATION",
  "Institut de Design Fictif",
  "Diplôme en Design de Systèmes",
  "2019–2022",
  "COMPÉTENCES : JSON ; Cartographie ; Tests",
  "LANGUES : Français — courant ; Anglais — professionnel",
  "CERTIFICATION : Médaille fictive de sécurité, 2024",
  "ABSENT : téléphone, lieu de l'employeur, mention, émetteur, type d'emploi.",
]);

test("sanitized T248 evidence has the fixed safe shape", () => {
  const evidence = buildSanitizedT248Evidence(validInput);

  assert.equal(
    evidence.evidence_classification,
    "t248_french_pdf_fixture_proof",
  );
  assert.equal(
    evidence.fixture_relative_path,
    "tests/fixtures/resumes/anonymous-french-resume.pdf",
  );
  assert.equal(evidence.corpus_fixture_id, "pdf-french-canonical-anonymous");
  assert.equal(evidence.ocr_used, false);
  assert.equal(evidence.raw_fixture_text_present, false);
  assert.equal(evidence.validation_result_is_pass, true);
  assert.match(evidence.fixture_sha256, /^[a-f0-9]{64}$/);
});

test("sanitized T248 evidence rejects unsafe or contradictory inputs", () => {
  assert.throws(
    () =>
      buildSanitizedT248Evidence({ ...validInput, fixture_sha256: "short" }),
    /unsafe_evidence_missing_fixture_hash/,
  );
  assert.throws(
    () => buildSanitizedT248Evidence({ ...validInput, ocr_used: true }),
    /unsafe_evidence_ocr_used/,
  );
  assert.throws(
    () =>
      buildSanitizedT248Evidence({
        ...validInput,
        extraction_succeeded: false,
      }),
    /unsafe_evidence_non_passing_proof/,
  );
  assert.throws(
    () =>
      buildSanitizedT248Evidence({
        ...validInput,
        language_classification: "unknown",
      }),
    /unsafe_evidence_invalid_language/,
  );
  assert.throws(
    () =>
      buildSanitizedT248Evidence({
        ...validInput,
        corpus_transcript_match: false,
      }),
    /unsafe_evidence_non_passing_proof/,
  );
  assert.throws(
    () => buildSanitizedT248Evidence({ ...validInput, text_item_count: 0 }),
    /unsafe_evidence_invalid_text_item_count/,
  );
});

test("evidence generation is deterministic", () => {
  const first = buildSanitizedT248Evidence(validInput);
  const second = buildSanitizedT248Evidence(validInput);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("evidence never contains raw fixture text", () => {
  const evidence = buildSanitizedT248Evidence(validInput);
  assert.equal(assertEvidenceHasNoRawFixtureText(evidence, fixtureLines), true);

  const unsafe = { ...evidence, leaked_summary: fixtureLines[5] };
  assert.throws(
    () => assertEvidenceHasNoRawFixtureText(unsafe, fixtureLines),
    /unsafe_evidence:raw_fixture_text_present/,
  );
});

test("the offline proof passes on the canonical fixture without writing evidence", async () => {
  const { evidence, fixtureLines: lines } = await collectT248Proof();
  assert.equal(evidence.validation_result_is_pass, true);
  assert.equal(evidence.page_count, 1);
  assert.equal(evidence.language_classification, "french");
  assert.equal(evidence.ocr_used, false);
  assert.equal(evidence.text_item_count, 41);
  assert.equal(evidence.non_empty_line_count, 21);
  assert.equal(evidence.corpus_transcript_match, true);
  assert.equal(assertEvidenceHasNoRawFixtureText(evidence, lines), true);
});
