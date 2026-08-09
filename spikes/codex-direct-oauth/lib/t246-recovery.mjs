// Offline-only T246-C08 recovery execution.
//
// This module intentionally has no Docker, credential, broker, transport, or
// provider imports. It validates the authorized A01 contract, runs the
// production deterministic PDF extraction against the malformed fixture, and
// writes only the sanitized recovery result.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { containsSecretLikeValue } from "./sanitize.mjs";
import {
  consumeT246Attempt,
  validateT246Authorization,
} from "./t246-authorization.mjs";
import { collectT246CaseProof } from "./t246-corpus-verification.mjs";

const SPIKE_ROOT = pathFromUrl(new URL(".", import.meta.url));

function pathFromUrl(url) {
  return fileURLToPath(url);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export const T246_C08_EVIDENCE_CLASSIFICATION = "offline_t246_recovery";

export function buildT246C08RecoveryEvidence({
  authorization,
  proof,
  generatedAt = new Date(),
} = {}) {
  const row = proof.row;
  const evidence = {
    evidence_classification: T246_C08_EVIDENCE_CLASSIFICATION,
    observation_timestamp: generatedAt.toISOString(),
    t246_case: "T246-C08",
    case_id: "T246-C08",
    attempt_id: authorization.attempt,
    evidence_path: authorization.evidence,
    fixture_path: authorization.fixture,
    fixture_sha256: row.fixture_sha256,
    recovery_input_sha256: row.recovery_input_sha256,
    manifest_path: authorization.manifest,
    manifest_sha256: authorization.manifest_sha256,
    extraction_attempted: true,
    malformed_detection: row.recovery_failure_category === "malformed",
    extraction_failure_category: row.recovery_failure_category,
    failure_category: row.recovery_failure_category,
    safe_recovery_category: row.user_facing_recovery_category,
    user_facing_recovery_category: row.user_facing_recovery_category,
    retryable: false,
    semantic_request_attempted: false,
    invocation_attempted: false,
    invocation_succeeded: false,
    semantic_quality_evaluated: false,
    semantic_metrics_passed: null,
    semantic_backend_requests: 0,
    credential_recovery_attempted: false,
    credential_volume_accessed: false,
    credential_volume_mount_attempted: false,
    broker_runs: 0,
    max_broker_runs: 0,
    max_semantic_backend_requests: 0,
    automatic_retries: 0,
    draft_created: false,
    artifact_created: false,
    raw_parser_exception_persisted: false,
    raw_document_content_persisted: false,
    sanitized_evidence: true,
    sanitized_evidence_contract_validated: true,
    no_provider_boundary_crossed: true,
    provider_request_attempted: false,
    secret_scan_result: "pending",
    runner_finalization: "passed",
    primary_failure_phase: "none",
    primary_failure_category: "none",
    safe_final_state: "complete",
    recovery_behavior_pass: false,
    case_pass: false,
  };
  evidence.secret_scan_result = containsSecretLikeValue(
    JSON.stringify(evidence),
  )
    ? "failed"
    : "passed";
  evidence.recovery_behavior_pass =
    evidence.malformed_detection === true &&
    evidence.safe_recovery_category === "malformed_or_corrupted" &&
    evidence.invocation_attempted === false &&
    evidence.semantic_backend_requests === 0 &&
    evidence.credential_recovery_attempted === false &&
    evidence.credential_volume_accessed === false &&
    evidence.credential_volume_mount_attempted === false &&
    evidence.broker_runs === 0 &&
    evidence.draft_created === false &&
    evidence.artifact_created === false &&
    evidence.raw_parser_exception_persisted === false &&
    evidence.raw_document_content_persisted === false &&
    evidence.secret_scan_result === "passed";
  evidence.case_pass = evidence.recovery_behavior_pass;
  return evidence;
}

export function verifyT246C08RecoveryEvidence(evidence) {
  const required = {
    case_id: "T246-C08",
    attempt_id: "A01",
    safe_recovery_category: "malformed_or_corrupted",
    safe_final_state: "complete",
    secret_scan_result: "passed",
  };
  for (const [field, expected] of Object.entries(required)) {
    if (evidence?.[field] !== expected) {
      throw new Error(`t246_c08_evidence_${field}_mismatch`);
    }
  }
  if (evidence.case_pass !== true || evidence.recovery_behavior_pass !== true) {
    throw new Error("t246_c08_recovery_contract_failed");
  }
  const booleanExpectations = {
    malformed_detection: true,
    semantic_request_attempted: false,
    invocation_attempted: false,
    credential_recovery_attempted: false,
    credential_volume_accessed: false,
    credential_volume_mount_attempted: false,
    draft_created: false,
    artifact_created: false,
    raw_parser_exception_persisted: false,
    raw_document_content_persisted: false,
    no_provider_boundary_crossed: true,
    provider_request_attempted: false,
  };
  for (const [field, expected] of Object.entries(booleanExpectations)) {
    if (evidence[field] !== expected) {
      throw new Error(`t246_c08_evidence_${field}_mismatch`);
    }
  }
  if (
    evidence.semantic_backend_requests !== 0 ||
    evidence.broker_runs !== 0 ||
    evidence.max_broker_runs !== 0 ||
    evidence.max_semantic_backend_requests !== 0 ||
    evidence.automatic_retries !== 0
  ) {
    throw new Error("t246_c08_evidence_budget_mismatch");
  }
  return true;
}

export async function executeT246C08Recovery({
  root = SPIKE_ROOT,
  invocation,
  validateAuthorization = validateT246Authorization,
  collectProof = collectT246CaseProof,
  writeEvidence = async (evidencePath, evidence) => {
    await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
  },
  consumeAttempt = consumeT246Attempt,
} = {}) {
  if (
    invocation?.campaign !== "T246-C08" ||
    invocation?.attempt !== "A01" ||
    invocation?.semantic_case !== "T246-C08"
  ) {
    throw new Error("t246_c08_a01_only");
  }
  const authorization = await validateAuthorization({ root, invocation });
  if (!authorization.is_recovery_case) {
    throw new Error("t246_c08_recovery_contract_required");
  }
  const proof = await collectProof({ caseId: "T246-C08" });
  const evidence = buildT246C08RecoveryEvidence({ authorization, proof });
  verifyT246C08RecoveryEvidence(evidence);
  const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  const evidenceSha256 = sha256(evidenceBytes);
  await writeEvidence(authorization.evidence_path, evidence);
  await consumeAttempt({
    root,
    invocation: {
      ...invocation,
      evidence_sha256: evidenceSha256,
      evidence_size_bytes: evidenceBytes.byteLength,
    },
    evidence,
  });
  return {
    evidence: { ...evidence, evidence_path: authorization.evidence_path },
    evidence_sha256: evidenceSha256,
    evidence_size_bytes: evidenceBytes.byteLength,
    authorization,
  };
}
