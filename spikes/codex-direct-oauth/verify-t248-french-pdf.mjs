// Deterministic offline T248 verifier for the canonical French PDF fixture.
//
// T248 (specs/001-import-resume/tasks.md) requires proving that
// `tests/fixtures/resumes/anonymous-french-resume.pdf` is a structurally valid
// single-page PDF whose selectable text extracts without OCR, whose extracted
// text is non-empty and meaningful, which is classified as French by the
// repository's deterministic language detector, and whose normalized
// transcript reproduces the pinned `pdf-french-canonical-anonymous`
// semantic-evaluation corpus transcript byte-for-byte.
//
// This verifier runs entirely offline, never touches credentials, OAuth,
// Codex, or any network transport, and fails closed on every invalid state.
// It writes a sanitized evidence aggregate only after every check passes.
// The extraction reuses the production `PdfJsPdfAdapter` and
// `DeterministicLanguageDetector` from `@nuvitae/extraction` (built output),
// so no parallel parser is introduced.
//
// Run from the repository root: `node spikes/codex-direct-oauth/verify-t248-french-pdf.mjs`
// Requires `pnpm --filter @nuvitae/extraction build` output to exist.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeEvidenceAtomic } from "./lib/t201-live-runner-evidence.mjs";
import {
  assertEvidenceHasNoRawFixtureText,
  buildSanitizedT248Evidence,
} from "./lib/t248-french-pdf-evidence.mjs";

const SPIKE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPIKE_ROOT, "..", "..");

export const T248_FIXTURE_REL_PATH =
  "tests/fixtures/resumes/anonymous-french-resume.pdf";
export const T248_EVIDENCE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t248-french-pdf.json";

// Pinned to the `pdf-french-canonical-anonymous` corpus transcript
// (packages/test-fixtures/src/resume-import/semantic-parser-fixtures.ts).
// The integration verifier
// (tests/integration/import-resume/french-pdf-fixture-evaluation.integration.test.ts)
// proves the live PDF extraction reproduces that corpus transcript, so this
// constant and the corpus cannot drift independently.
const EXPECTED_TRANSCRIPT_SHA256 =
  "496bb2335d6ef5b65038aa227a1cd908eb02535413ccec408b5a499f16e5ee77";
const EXPECTED_LINE_COUNT = 21;
const EXPECTED_TEXT_ITEM_COUNT = 41;
const EXPECTED_PAGE_COUNT = 1;
const EXPECTED_LANGUAGE = "french";
const EXPECTED_STRUCTURAL_MARKERS = Object.freeze([
  "RÉSUMÉ",
  "EXPÉRIENCE",
  "FORMATION",
  "COMPÉTENCES",
  "LANGUES",
  "CERTIFICATION",
]);

export async function collectT248Proof() {
  const fixtureAbsPath = path.join(REPO_ROOT, T248_FIXTURE_REL_PATH);
  const bytes = await fs.readFile(fixtureAbsPath);
  const byteSize = bytes.byteLength;
  if (byteSize <= 0) {
    throw new Error("t248_fixture_empty");
  }
  if (byteSize > 100_000) {
    throw new Error("t248_fixture_over_size_limit");
  }
  const fixtureSha256 = sha256(bytes);

  const { DeterministicLanguageDetector, PdfJsPdfAdapter } =
    await import("../../packages/extraction/dist/index.js");
  const sourceReader = {
    async readSource(input) {
      return bytes.byteLength > input.maximumBytes
        ? bytes.subarray(0, input.maximumBytes + 1)
        : bytes;
    },
  };
  const adapter = new PdfJsPdfAdapter(sourceReader, {
    maximumFileSizeBytes: 100_000,
    maximumPageCount: 5,
  });
  const request = {
    importId: "00000000-0000-4000-8000-000000000701",
    ownerUserId: "00000000-0000-4000-8000-000000000702",
    sourceStorageKey: T248_FIXTURE_REL_PATH,
    format: "pdf",
  };

  const pageCountResult = await adapter.countPages(request);
  if (!pageCountResult.ok) {
    throw new Error("t248_page_count_failed");
  }
  const pageCount = pageCountResult.value.renderedPageCount;
  if (pageCount !== EXPECTED_PAGE_COUNT) {
    throw new Error("t248_unexpected_page_count");
  }

  const extraction = await adapter.extractSelectableText(request);
  if (!extraction.ok) {
    throw new Error("t248_selectable_text_extraction_failed");
  }
  const items = extraction.value.flatMap((page) => page.items);
  if (items.length !== EXPECTED_TEXT_ITEM_COUNT) {
    throw new Error("t248_unexpected_text_item_count");
  }
  if (items.some((item) => item.provenance.kind !== "pdf_text_item")) {
    throw new Error("t248_non_selectable_text_provenance");
  }
  const lines = items
    .map((item) => item.text.trim())
    .filter((line) => line.length > 0);
  if (lines.length !== EXPECTED_LINE_COUNT) {
    throw new Error("t248_unexpected_line_count");
  }
  const joined = items.map((item) => item.text).join("\n");
  for (const marker of EXPECTED_STRUCTURAL_MARKERS) {
    if (!joined.includes(marker)) {
      throw new Error("t248_missing_structural_marker");
    }
  }

  const detector = new DeterministicLanguageDetector();
  const languageResult = await detector.detectLanguage(
    request,
    extraction.value,
  );
  if (!languageResult.ok) {
    throw new Error("t248_language_detection_failed");
  }
  const { language, confidence } = languageResult.value;
  if (language !== EXPECTED_LANGUAGE) {
    throw new Error("t248_wrong_language_classification");
  }
  if (!["high", "medium"].includes(confidence)) {
    throw new Error("t248_low_language_confidence");
  }

  const transcriptSha256 = sha256(lines.map(normalizeFixtureLine).join("\n"));
  if (transcriptSha256 !== EXPECTED_TRANSCRIPT_SHA256) {
    throw new Error("t248_corpus_transcript_mismatch");
  }

  const evidence = buildSanitizedT248Evidence({
    fixture_sha256: fixtureSha256,
    byte_size: byteSize,
    page_count: pageCount,
    extraction_succeeded: true,
    ocr_used: false,
    selectable_text_contract_pass: true,
    extracted_text_present: true,
    meaningful_structure_pass: true,
    text_item_count: items.length,
    non_empty_line_count: lines.length,
    language_classification: language,
    language_confidence: confidence,
    corpus_transcript_match: true,
    validation_result_is_pass: true,
  });
  assertEvidenceHasNoRawFixtureText(evidence, lines);

  return { evidence, fixtureLines: lines };
}

export async function verifyCanonicalFrenchPdf() {
  const { evidence } = await collectT248Proof();
  const evidencePath = path.join(REPO_ROOT, T248_EVIDENCE_REL_PATH);
  await writeEvidenceAtomic(evidencePath, evidence);
  return { evidence, evidencePath };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeFixtureLine(value) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  verifyCanonicalFrenchPdf()
    .then(({ evidence, evidencePath }) => {
      console.log(
        `T248 canonical French PDF proof passed; evidence written to ${T248_EVIDENCE_REL_PATH}`,
      );
      console.log(
        `language=${evidence.language_classification} confidence=${evidence.language_confidence} pages=${evidence.page_count} items=${evidence.text_item_count} lines=${evidence.non_empty_line_count}`,
      );
      console.log(`evidence_abs_path=${evidencePath}`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`T248 verification failed: ${message}`);
      process.exitCode = 1;
    });
}
