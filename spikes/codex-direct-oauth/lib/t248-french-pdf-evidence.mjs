// Sanitized evidence contract for the T248 canonical French PDF proof.
//
// Only safe metadata, derived booleans, and counts may be persisted. The full
// extracted résumé text, names, contact values, work-history text, education
// text, raw parser output, page renderings, prompts, and model output are
// never written. `assertEvidenceHasNoRawFixtureText` fails closed if any
// pinned transcript line leaks into the serialized evidence.

export const T248_EVIDENCE_CLASSIFICATION = "t248_french_pdf_fixture_proof";

const REQUIRED_BOOLEAN_FIELDS = Object.freeze([
  "extraction_succeeded",
  "ocr_used",
  "selectable_text_contract_pass",
  "extracted_text_present",
  "meaningful_structure_pass",
  "corpus_transcript_match",
  "validation_result_is_pass",
]);

/**
 * Builds the fixed-shape sanitized evidence object. Throws on missing,
 * malformed, or contradictory inputs so a verifier can never emit unsafe or
 * inconsistent evidence.
 */
export function buildSanitizedT248Evidence(input) {
  if (input === null || typeof input !== "object") {
    throw new Error("unsafe_evidence_input");
  }
  const {
    fixture_sha256,
    byte_size,
    page_count,
    extraction_succeeded,
    ocr_used,
    selectable_text_contract_pass,
    extracted_text_present,
    meaningful_structure_pass,
    text_item_count,
    non_empty_line_count,
    language_classification,
    language_confidence,
    corpus_transcript_match,
  } = input;

  if (!/^[a-f0-9]{64}$/.test(fixture_sha256 ?? "")) {
    throw new Error("unsafe_evidence_missing_fixture_hash");
  }
  if (
    !Number.isSafeInteger(byte_size) ||
    byte_size <= 0 ||
    !Number.isSafeInteger(page_count) ||
    page_count <= 0
  ) {
    throw new Error("unsafe_evidence_invalid_structural_metric");
  }
  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    if (typeof input[field] !== "boolean") {
      throw new Error(`unsafe_evidence_missing_boolean:${field}`);
    }
  }
  if (ocr_used !== false) {
    throw new Error("unsafe_evidence_ocr_used");
  }
  if (!Number.isSafeInteger(text_item_count) || text_item_count <= 0) {
    throw new Error("unsafe_evidence_invalid_text_item_count");
  }
  if (
    !Number.isSafeInteger(non_empty_line_count) ||
    non_empty_line_count <= 0
  ) {
    throw new Error("unsafe_evidence_invalid_line_count");
  }
  if (
    !["english", "french", "bilingual_french_english"].includes(
      language_classification ?? "",
    )
  ) {
    throw new Error("unsafe_evidence_invalid_language");
  }
  if (
    !["high", "medium", "low", "not_applicable"].includes(
      language_confidence ?? "",
    )
  ) {
    throw new Error("unsafe_evidence_invalid_language_confidence");
  }
  if (
    extraction_succeeded !== true ||
    selectable_text_contract_pass !== true ||
    extracted_text_present !== true ||
    meaningful_structure_pass !== true ||
    corpus_transcript_match !== true
  ) {
    throw new Error("unsafe_evidence_non_passing_proof");
  }

  return {
    evidence_classification: T248_EVIDENCE_CLASSIFICATION,
    verifier: "spikes/codex-direct-oauth/verify-t248-french-pdf.mjs",
    verifier_version: 1,
    fixture_relative_path: "tests/fixtures/resumes/anonymous-french-resume.pdf",
    fixture_id: "anonymous-french-resume",
    corpus_fixture_id: "pdf-french-canonical-anonymous",
    fixture_sha256,
    byte_size,
    page_count,
    extraction_succeeded,
    ocr_used,
    selectable_text_contract_pass,
    extracted_text_present,
    meaningful_structure_pass,
    text_item_count,
    non_empty_line_count,
    language_classification,
    language_confidence,
    corpus_transcript_match,
    validation_result_is_pass: true,
    raw_fixture_text_present: false,
  };
}

/**
 * Fails closed when any pinned fixture transcript line (length >= 8 after
 * trimming) appears in the serialized evidence. Short structural markers are
 * intentionally excluded from the check threshold so metadata like "french"
 * or "pdf" never trips the guard.
 */
export function assertEvidenceHasNoRawFixtureText(evidence, fixtureLines) {
  const serialized = JSON.stringify(evidence);
  const violations = [];
  for (const line of fixtureLines) {
    const candidate = line.trim();
    if (candidate.length >= 8 && serialized.includes(candidate)) {
      violations.push("raw_fixture_text_present");
    }
  }
  if (violations.length > 0) {
    throw new Error(`unsafe_evidence:${violations[0]}`);
  }
  return true;
}
