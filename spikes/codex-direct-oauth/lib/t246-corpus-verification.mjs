// Offline verification core for the T246 real-document corpus (C01-C08).
//
// Every semantic case (C01-C07) is proven by extracting the checked-in
// binary through the production `PdfJsPdfAdapter`/`OoxmlDocxAdapter`,
// classifying the extracted text with `DeterministicLanguageDetector`,
// pinning the normalized transcript against the corpus entry and the
// per-case manifest, and confirming the manifest's exact facts appear in the
// exact transcript lines. C08 is proven as a deterministic malformed
// recovery case with no semantic corpus entry. The verifier never touches
// OAuth, Codex, any provider, the network, or credentials, and fails closed
// on every mismatch. The evidence written is sanitized: it contains only
// hashes, counts, categories, and readiness booleans.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SPIKE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPIKE_ROOT, "..", "..", "..");

export const T246_CORPUS_EVIDENCE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-corpus-offline.json";
export const T246_AUTHORIZATION_REGISTRY_REL_PATH =
  "spikes/codex-direct-oauth/t246-authorizations.json";

export const T246_CASES = Object.freeze([
  {
    caseId: "T246-C01",
    scenario: "real French PDF",
    fixturePath: "tests/fixtures/resumes/anonymous-french-resume.pdf",
    format: "pdf",
    corpusFixtureId: "pdf-french-canonical-anonymous",
    manifestPath:
      "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c01.manifest.json",
    expectedLanguage: "french",
    liveRequestRequired: true,
  },
  {
    caseId: "T246-C02",
    scenario: "real English PDF",
    fixturePath:
      "tests/fixtures/resumes/semantic-vertical-slice-jordan-avery.pdf",
    format: "pdf",
    corpusFixtureId: "pdf-english-anonymous",
    manifestPath:
      "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c02.manifest.json",
    expectedLanguage: "english",
    liveRequestRequired: true,
  },
  {
    caseId: "T246-C03",
    scenario: "real DOCX",
    fixturePath:
      "tests/fixtures/resumes/semantic-vertical-slice-maya-chen.docx",
    format: "docx",
    corpusFixtureId: "docx-english-anonymous",
    manifestPath:
      "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c03.manifest.json",
    expectedLanguage: "english",
    liveRequestRequired: true,
  },
  {
    caseId: "T246-C04",
    scenario: "bilingual real document",
    fixturePath: "tests/fixtures/resumes/anonymous-bilingual-resume.pdf",
    format: "pdf",
    corpusFixtureId: "pdf-bilingual-canonical-anonymous",
    manifestPath:
      "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c04.manifest.json",
    expectedLanguage: "bilingual_french_english",
    liveRequestRequired: true,
  },
  {
    caseId: "T246-C05",
    scenario: "partial/sparse real document",
    fixturePath: "tests/fixtures/resumes/anonymous-partial-resume.docx",
    format: "docx",
    corpusFixtureId: "docx-partial-canonical-anonymous",
    manifestPath:
      "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c05.manifest.json",
    expectedLanguage: "english",
    liveRequestRequired: true,
  },
  {
    caseId: "T246-C06",
    scenario: "structurally ambiguous real document",
    fixturePath: "tests/fixtures/resumes/anonymous-ambiguous-resume.pdf",
    format: "pdf",
    corpusFixtureId: "pdf-ambiguous-canonical-anonymous",
    manifestPath:
      "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c06.manifest.json",
    expectedLanguage: "english",
    liveRequestRequired: true,
  },
  {
    caseId: "T246-C07",
    scenario: "prompt-instruction-like real document",
    fixturePath:
      "tests/fixtures/resumes/anonymous-prompt-instruction-resume.docx",
    format: "docx",
    corpusFixtureId: "docx-prompt-instruction-canonical-anonymous",
    manifestPath:
      "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c07.manifest.json",
    expectedLanguage: "english",
    liveRequestRequired: true,
  },
  {
    caseId: "T246-C08",
    scenario: "malformed/unsupported recovery",
    fixturePath: "tests/fixtures/resumes/anonymous-malformed-resume.pdf",
    format: "pdf",
    corpusFixtureId: null,
    manifestPath:
      "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c08.recovery-manifest.json",
    expectedLanguage: null,
    liveRequestRequired: false,
  },
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeFixtureLine(value) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

async function readJson(relativePath) {
  const raw = await fs.readFile(path.join(REPO_ROOT, relativePath), "utf8");
  return JSON.parse(raw);
}

async function extractPdf(fixtureAbsPath, request) {
  const bytes = await fs.readFile(fixtureAbsPath);
  const { DeterministicLanguageDetector, PdfJsPdfAdapter } =
    await import("../../../packages/extraction/dist/index.js");
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
  const pageCount = await adapter.countPages(request);
  const extraction = await adapter.extractSelectableText(request);
  if (!extraction.ok) {
    return { ok: false, error: extraction.error };
  }
  const items = extraction.value.flatMap((page) => page.items);
  const lines = items
    .map((item) => item.text.trim())
    .filter((line) => line.length > 0);
  const detector = new DeterministicLanguageDetector();
  const language = await detector.detectLanguage(request, extraction.value);
  return {
    ok: true,
    pageCount: pageCount.ok ? pageCount.value.renderedPageCount : null,
    itemCount: items.length,
    lines,
    language: language.ok ? language.value : null,
  };
}

async function extractDocx(fixtureAbsPath, request) {
  const bytes = await fs.readFile(fixtureAbsPath);
  const { DeterministicLanguageDetector, OoxmlDocxAdapter } =
    await import("../../../packages/extraction/dist/index.js");
  const sourceReader = {
    async readSource(input) {
      return bytes.byteLength > input.maximumBytes
        ? bytes.subarray(0, input.maximumBytes + 1)
        : bytes;
    },
  };
  const adapter = new OoxmlDocxAdapter(sourceReader, {
    maximumArchiveSizeBytes: 100_000,
    maximumEntryCount: 200,
    maximumEntryUncompressedSizeBytes: 5 * 1024 * 1024,
    maximumTotalUncompressedSizeBytes: 20 * 1024 * 1024,
    maximumCompressionRatio: 200,
    maximumXmlDepth: 80,
  });
  const extraction = await adapter.extractText(request);
  if (!extraction.ok) {
    return { ok: false, error: extraction.error };
  }
  const runs = extraction.value.flatMap((paragraph) => paragraph.runs);
  const lines = runs
    .map((run) => run.text.trim())
    .filter((line) => line.length > 0);
  const detector = new DeterministicLanguageDetector();
  const language = await detector.detectLanguage(request, extraction.value);
  return {
    ok: true,
    paragraphCount: extraction.value.length,
    lines,
    language: language.ok ? language.value : null,
  };
}

function extractCase(caseDefinition, fixtureAbsPath, request) {
  return caseDefinition.format === "pdf"
    ? extractPdf(fixtureAbsPath, request)
    : extractDocx(fixtureAbsPath, request);
}

function expectedJsonHash(corpus, corpusFixtureId) {
  const { expectedSemanticJsonById } = corpus;
  const response = expectedSemanticJsonById[corpusFixtureId];
  if (response === undefined) {
    throw new Error(`t246_missing_expected_semantic_json:${corpusFixtureId}`);
  }
  return sha256(JSON.stringify(response));
}

async function loadCorpus() {
  return await import("../../../packages/test-fixtures/dist/index.js");
}

async function loadAuthorizationRegistry() {
  return await readJson(T246_AUTHORIZATION_REGISTRY_REL_PATH);
}

function verifySemanticCase({
  caseDefinition,
  fixtureBytes,
  extraction,
  manifest,
  corpus,
  registryEntry,
}) {
  if (extraction.ok !== true) {
    throw new Error(`t246_extraction_failed:${caseDefinition.caseId}`);
  }
  const lines = extraction.lines.map(normalizeFixtureLine);
  const transcriptSha256 = sha256(lines.join("\n"));
  if (transcriptSha256 !== manifest.transcript_sha256) {
    throw new Error(`t246_transcript_mismatch:${caseDefinition.caseId}`);
  }
  if (registryEntry?.transcript_sha256 !== manifest.transcript_sha256) {
    throw new Error(
      `t246_registry_transcript_mismatch:${caseDefinition.caseId}`,
    );
  }
  const fixtureSha256 = sha256(fixtureBytes);
  if (fixtureSha256 !== manifest.fixture_sha256) {
    throw new Error(`t246_fixture_mismatch:${caseDefinition.caseId}`);
  }
  if (registryEntry?.fixture_sha256 !== manifest.fixture_sha256) {
    throw new Error(`t246_registry_fixture_mismatch:${caseDefinition.caseId}`);
  }
  if (
    !extraction.language ||
    extraction.language.language !== caseDefinition.expectedLanguage
  ) {
    throw new Error(`t246_language_mismatch:${caseDefinition.caseId}`);
  }
  if (!["high", "medium"].includes(extraction.language.confidence)) {
    throw new Error(`t246_language_low_confidence:${caseDefinition.caseId}`);
  }
  const corpusEntry =
    corpus.semanticParserFixtureInputs[caseDefinition.corpusFixtureId];
  if (corpusEntry === undefined) {
    throw new Error(`t246_missing_corpus_entry:${caseDefinition.caseId}`);
  }
  if (transcriptSha256 !== corpusEntry.transcript.sha256) {
    throw new Error(`t246_corpus_transcript_mismatch:${caseDefinition.caseId}`);
  }
  if (
    JSON.stringify(lines) !==
    JSON.stringify(corpusEntry.fragments.map((fragment) => fragment.text))
  ) {
    throw new Error(`t246_corpus_fragments_mismatch:${caseDefinition.caseId}`);
  }
  const expectedHash = expectedJsonHash(corpus, caseDefinition.corpusFixtureId);
  if (expectedHash !== manifest.expected_semantic_json_sha256) {
    throw new Error(
      `t246_expected_semantic_json_mismatch:${caseDefinition.caseId}`,
    );
  }
  verifyManifestFacts(manifest, lines, caseDefinition.caseId);
  return {
    fixtureSha256,
    transcriptSha256,
    expectedSemanticJsonSha256: expectedHash,
    lineCount: lines.length,
    language: extraction.language.language,
    languageConfidence: extraction.language.confidence,
    pageCount: extraction.pageCount ?? null,
    paragraphCount: extraction.paragraphCount ?? null,
    itemCount: extraction.itemCount ?? null,
  };
}

function verifyManifestFacts(manifest, lines, caseId) {
  if (
    manifest.thresholds?.minimum_exact_fact_recall !== 0.9 ||
    manifest.thresholds?.required_high_priority_fact_recall !== 1
  ) {
    throw new Error(`t246_thresholds_weakened:${caseId}`);
  }
  const highPaths = new Set(manifest.high_priority_fact_paths ?? []);
  if (highPaths.size === 0) {
    throw new Error(`t246_missing_high_priority_facts:${caseId}`);
  }
  const highPriorityFactPaths = new Set();
  for (const fact of manifest.exact_facts ?? []) {
    const fragment = lines[fact.line - 1];
    if (fragment === undefined) {
      throw new Error(`t246_fact_line_missing:${caseId}:${fact.path}`);
    }
    const normalizedValue = normalizeFixtureLine(fact.value);
    if (!fragment.includes(normalizedValue)) {
      throw new Error(`t246_fact_not_grounded:${caseId}:${fact.path}`);
    }
    if (!categoryMatchesPath(fact.path, fact.category)) {
      throw new Error(`t246_fact_category_mismatch:${caseId}:${fact.path}`);
    }
    if (fact.priority === "high") {
      highPriorityFactPaths.add(fact.path);
    }
  }
  for (const highPath of highPaths) {
    if (!highPriorityFactPaths.has(highPath)) {
      throw new Error(`t246_high_priority_fact_missing:${caseId}:${highPath}`);
    }
  }
  if (!Array.isArray(manifest.intentionally_absent_fields)) {
    throw new Error(`t246_missing_absent_fields:${caseId}`);
  }
}

function categoryMatchesPath(factPath, category) {
  if (category === "basics") return factPath.startsWith("basics.");
  if (category === "work") return factPath.startsWith("work_experiences[");
  if (category === "education") return factPath.startsWith("education[");
  if (category === "skills") return /^skills\[\d+\]$/.test(factPath);
  if (category === "languages") return factPath.startsWith("languages[");
  if (category === "certifications")
    return factPath.startsWith("certifications[");
  return false;
}

function verifyRecoveryCase({
  fixtureBytes,
  extraction,
  manifest,
  registryEntry,
  corpus,
}) {
  const fixtureSha256 = sha256(fixtureBytes);
  if (fixtureSha256 !== manifest.fixture_sha256) {
    throw new Error("t246_recovery_fixture_mismatch");
  }
  if (registryEntry?.fixture_sha256 !== manifest.fixture_sha256) {
    throw new Error("t246_recovery_registry_fixture_mismatch");
  }
  if (manifest.semantic_request_required !== false) {
    throw new Error("t246_recovery_semantic_request_required");
  }
  if (manifest.credential_recovery_required !== false) {
    throw new Error("t246_recovery_credential_recovery_required");
  }
  if (manifest.maximum_semantic_backend_requests !== 0) {
    throw new Error("t246_recovery_backend_requests_not_zero");
  }
  if (extraction.ok !== false) {
    throw new Error("t246_recovery_extraction_did_not_fail");
  }
  if (extraction.error?.category !== "malformed") {
    throw new Error("t246_recovery_wrong_failure_category");
  }
  for (const id of corpus.semanticParserFixtureIds ?? []) {
    if (String(id).includes("malformed")) {
      throw new Error("t246_recovery_has_semantic_corpus_entry");
    }
  }
  return {
    fixtureSha256,
    recoveryInputSha256: fixtureSha256,
    failureCategory: extraction.error.category,
    retryable: extraction.error.retryable,
  };
}

export async function collectT246CorpusProof() {
  const registry = await loadAuthorizationRegistry();
  const registryByCase = new Map(
    (registry.authorized_attempts ?? []).map((entry) => [
      entry.semantic_case,
      entry,
    ]),
  );
  const corpus = await loadCorpus();
  const rows = [];
  for (const caseDefinition of T246_CASES) {
    const fixtureAbsPath = path.join(REPO_ROOT, caseDefinition.fixturePath);
    const bytes = await fs.readFile(fixtureAbsPath);
    if (bytes.byteLength <= 0) {
      throw new Error(`t246_fixture_empty:${caseDefinition.caseId}`);
    }
    const manifest = await readJson(caseDefinition.manifestPath);
    const manifestBytes = await fs.readFile(
      path.join(REPO_ROOT, caseDefinition.manifestPath),
    );
    const manifestSha256 = sha256(manifestBytes);
    const registryEntry = registryByCase.get(caseDefinition.caseId);
    if (registryEntry === undefined) {
      throw new Error(`t246_missing_registry_entry:${caseDefinition.caseId}`);
    }
    if (registryEntry.manifest_sha256 !== manifestSha256) {
      throw new Error(
        `t246_registry_manifest_mismatch:${caseDefinition.caseId}`,
      );
    }
    const request = {
      importId: `00000000-0000-4000-8000-00000000${caseDefinition.caseId.slice(-2)}`,
      ownerUserId: "00000000-0000-4000-8000-000000000702",
      sourceStorageKey: caseDefinition.fixturePath,
      format: caseDefinition.format,
    };
    const extraction = await extractCase(
      caseDefinition,
      fixtureAbsPath,
      request,
    );
    let proof;
    if (caseDefinition.corpusFixtureId === null) {
      proof = verifyRecoveryCase({
        fixtureBytes: bytes,
        extraction,
        manifest,
        registryEntry,
        corpus,
      });
    } else {
      proof = verifySemanticCase({
        caseDefinition,
        fixtureBytes: bytes,
        extraction,
        manifest,
        corpus,
        registryEntry,
      });
    }
    rows.push({
      case_id: caseDefinition.caseId,
      scenario: caseDefinition.scenario,
      fixture_path: caseDefinition.fixturePath,
      format: caseDefinition.format,
      language: proof.language ?? "not_applicable",
      language_confidence: proof.languageConfidence ?? "not_applicable",
      fixture_sha256: proof.fixtureSha256,
      transcript_sha256: proof.transcriptSha256 ?? null,
      recovery_input_sha256: proof.recoveryInputSha256 ?? null,
      expected_semantic_json_sha256: proof.expectedSemanticJsonSha256 ?? null,
      manifest_path: caseDefinition.manifestPath,
      manifest_sha256: manifestSha256,
      extraction_status:
        caseDefinition.corpusFixtureId === null
          ? "recovery_verified"
          : "transcript_verified",
      provenance_status:
        caseDefinition.corpusFixtureId === null
          ? "not_applicable"
          : "deterministic_enrichment_ready",
      semantic_expectation_status:
        caseDefinition.corpusFixtureId === null
          ? "not_applicable"
          : "expected_json_pinned",
      live_request_required: caseDefinition.liveRequestRequired,
      live_ready: true,
    });
  }
  const evidence = buildSanitizedT246CorpusEvidence({ rows });
  return { evidence, rows };
}

export function buildSanitizedT246CorpusEvidence({ rows }) {
  if (!Array.isArray(rows) || rows.length !== 8) {
    throw new Error("t246_corpus_rows_incomplete");
  }
  const semanticCases = rows.filter((row) => row.live_request_required);
  const recoveryCases = rows.filter((row) => !row.live_request_required);
  if (semanticCases.length !== 7 || recoveryCases.length !== 1) {
    throw new Error("t246_corpus_case_mix_invalid");
  }
  for (const row of rows) {
    if (row.live_ready !== true) {
      throw new Error(`t246_case_not_ready:${row.case_id}`);
    }
  }
  return {
    evidence_classification: "t246_corpus_offline_preparation",
    verifier: "spikes/codex-direct-oauth/verify-t246-corpus.mjs",
    verifier_version: 1,
    live_execution_authorized: false,
    all_cases_offline_ready: true,
    raw_fixture_text_present: false,
    cases: rows,
    request_budget: {
      semantic_cases: semanticCases.length,
      non_semantic_recovery_cases: recoveryCases.length,
      maximum_requests_per_case: 1,
      maximum_broker_runs_per_case: 1,
      automatic_retries: 0,
      total_maximum_future_codex_requests: semanticCases.length,
    },
  };
}

export async function verifyT246Corpus() {
  const { evidence, rows } = await collectT246CorpusProof();
  const evidencePath = path.join(REPO_ROOT, T246_CORPUS_EVIDENCE_REL_PATH);
  await fs.mkdir(path.dirname(evidencePath), { recursive: true });
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return { evidence, rows, evidencePath };
}

export { sha256, normalizeFixtureLine };
