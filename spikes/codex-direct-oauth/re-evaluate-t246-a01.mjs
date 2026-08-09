#!/usr/bin/env node
// Offline canonical re-evaluation of the consumed T246-C01-A01 live attempt.
//
// Reads ONLY the immutable historical sanitized evidence, the checked-in
// fixture/transcript/manifest pins, and the authorization registry. No OAuth,
// Codex/OpenAI/provider request, network access, credential-volume access, or
// live runner occurs. The historical A01 evidence is never modified, moved,
// normalized, or rewritten.
//
// The pre-fix runner gate read recall/language metrics from top-level fields
// that the broker never emits (they are nested under `evaluation_metrics`),
// so A01's sanitized evidence records case_pass=false and a safe final state
// of safe_unknown_failure while every mandatory semantic gate passed. This
// verifier recomputes the canonical T246 complete gate from the retained
// sanitized metrics and records a derived acceptance artifact that truthfully
// reports semantic_result=PASS and runner_finalization=FAIL. It does NOT flip
// the T246 aggregate: T246 stays INCOMPLETE and T203 stays NO-GO until the
// repository-defined acceptance process accepts live evidence.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadT246AuthorizationRegistry } from "./lib/t246-authorization.mjs";
import {
  t246CompleteGate,
  t246SemanticFailureCategory,
} from "./lib/t246-live-runner-evidence.mjs";
import { writeEvidenceAtomic } from "./lib/t201-live-runner-evidence.mjs";

const SPIKE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = path.resolve(SPIKE_ROOT, "..", "..");
const DERIVED_ACCEPTANCE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a01-derived-acceptance.json";

const CAMPAIGN = "T246-C01";
const ATTEMPT = "A01";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function failure(code, detail) {
  const error = new Error(`${code}${detail ? `:${detail}` : ""}`);
  error.code = code;
  return error;
}

export async function reEvaluateT246C01A01({
  spikeRoot = SPIKE_ROOT,
  repoRoot = REPO_ROOT,
  registryLoader = loadT246AuthorizationRegistry,
  gate = t246CompleteGate,
  semanticFailure = t246SemanticFailureCategory,
  write = writeEvidenceAtomic,
  readFile = fs.readFile,
  hash = sha256,
} = {}) {
  const registry = await registryLoader({ root: spikeRoot });
  const consumed = (registry.consumed_attempts ?? []).find(
    (entry) => entry.campaign === CAMPAIGN && entry.attempt === ATTEMPT,
  );
  if (!consumed) {
    throw failure("t246_a01_not_recorded_consumed");
  }
  const actualPath = path.join(repoRoot, consumed.evidence_actual_path);
  const canonicalPath = path.join(repoRoot, consumed.evidence_canonical_path);
  let bytes;
  try {
    bytes = await readFile(actualPath);
  } catch {
    throw failure("t246_a01_historical_evidence_missing", actualPath);
  }
  const actualSha256 = hash(bytes);
  if (actualSha256 !== consumed.evidence_sha256) {
    throw failure("t246_a01_historical_evidence_hash_mismatch");
  }
  if (Buffer.byteLength(bytes) !== consumed.evidence_size_bytes) {
    throw failure("t246_a01_historical_evidence_size_mismatch");
  }
  const evidence = JSON.parse(bytes);
  if (
    evidence.evidence_classification !== consumed.evidence_classification ||
    evidence.case_id !== CAMPAIGN ||
    evidence.attempt_id !== ATTEMPT
  ) {
    throw failure("t246_a01_historical_evidence_identity_mismatch");
  }
  if (evidence.invocation_attempted !== true) {
    throw failure("t246_a01_invocation_not_attempted");
  }
  if (evidence.invocation_succeeded !== true) {
    throw failure("t246_a01_invocation_not_succeeded");
  }
  if (evidence.exact_http_status !== 200) {
    throw failure("t246_a01_http_status_not_200");
  }
  if (evidence.evidence_schema_valid !== true) {
    throw failure("t246_a01_evidence_schema_invalid");
  }
  if (evidence.broker_exit_status_category !== "success") {
    throw failure("t246_a01_broker_not_success");
  }
  const authorization = registry.authorized_attempts.find(
    (entry) => entry.campaign === CAMPAIGN && entry.attempt === ATTEMPT,
  );
  if (!authorization) {
    throw failure("t246_a01_registry_entry_missing");
  }
  for (const field of [
    "fixture_sha256",
    "transcript_sha256",
    "manifest_sha256",
  ]) {
    if (evidence[field] !== authorization[field]) {
      throw failure(`t246_a01_${field}_mismatch`);
    }
  }
  if (
    evidence.t246_transport_manifest_matches_t200 !== true ||
    evidence.secret_scan_result !== "passed" ||
    evidence.log_secret_scan_result !== "passed" ||
    evidence.raw_credentials_exposed_to_parent !== false ||
    evidence.account_identifier_exposed_to_parent !== false ||
    evidence.raw_model_response_persisted !== false
  ) {
    throw failure("t246_a01_security_gate_not_passed");
  }

  const semanticPass = gate(evidence, "success");
  const semanticFailureCategory = semanticPass
    ? null
    : semanticFailure(evidence);
  const checks = {
    historical_evidence_present: true,
    historical_evidence_sha256_matches_ledger: true,
    historical_evidence_size_matches_ledger: true,
    invocation_attempted: true,
    invocation_succeeded: true,
    exact_http_status: 200,
    broker_exit_status_category: "success",
    evidence_schema_valid: true,
    artifact_hashes_pinned: true,
    transport_manifest_matches_t200: true,
    secret_scans_passed: true,
    canonical_gate_passes: semanticPass,
    semantic_failure_category: semanticFailureCategory,
  };
  const derived = {
    evidence_classification: "t246_derived_acceptance",
    schema_version: 1,
    case_id: CAMPAIGN,
    attempt_id: ATTEMPT,
    derived_at: evidence.observation_timestamp,
    semantic_result: semanticPass ? "PASS" : "FAIL",
    runner_finalization: "FAIL",
    derived_case_pass: semanticPass,
    official_status: semanticPass
      ? "semantic_pass_runner_finalization_failed_not_accepted"
      : "semantic_failure",
    historical_evidence: {
      immutable: true,
      actual_path: consumed.evidence_actual_path,
      canonical_path: consumed.evidence_canonical_path,
      sha256: actualSha256,
      size_bytes: Buffer.byteLength(bytes),
      evidence_classification: consumed.evidence_classification,
      invocation_attempted: true,
    },
    note: "Derived offline from the immutable consumed A01 sanitized evidence using the canonical T246 complete gate. The historical A01 evidence and the T246 aggregate are not rewritten; T246 remains INCOMPLETE and T203 remains NO-GO.",
    checks,
  };
  if (!semanticPass) {
    throw failure(
      "t246_a01_semantic_gate_failed",
      semanticFailureCategory ?? "unknown",
    );
  }
  const derivedPath = path.join(repoRoot, DERIVED_ACCEPTANCE_REL_PATH);
  await write(derivedPath, derived);
  return {
    derived,
    derivedPath,
    historicalEvidencePath: actualPath,
    canonicalEvidencePath: canonicalPath,
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { derived, historicalEvidencePath } = await reEvaluateT246C01A01();
    process.stdout.write(
      `${JSON.stringify(
        {
          case_id: derived.case_id,
          attempt_id: derived.attempt_id,
          semantic_result: derived.semantic_result,
          runner_finalization: derived.runner_finalization,
          derived_case_pass: derived.derived_case_pass,
          official_status: derived.official_status,
          historical_evidence_sha256: derived.historical_evidence.sha256,
          derived_acceptance_path: DERIVED_ACCEPTANCE_REL_PATH,
          historical_evidence_path: historicalEvidencePath,
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `T246 C01-A01 offline re-evaluation failed closed: ${message}`,
    );
    process.exitCode = 1;
  }
}
