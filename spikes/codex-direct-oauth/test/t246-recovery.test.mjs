import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildT246C08RecoveryEvidence,
  verifyT246C08RecoveryEvidence,
} from "../lib/t246-recovery.mjs";

const authorization = {
  attempt: "A01",
  evidence:
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c08-a01-recovery.json",
  fixture: "tests/fixtures/resumes/anonymous-malformed-resume.pdf",
  manifest:
    "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c08.recovery-manifest.json",
  fixture_sha256:
    "14bcd090baf31edba64e9cbd8cdfc15f943344aa72cb3675ad8e91bfcbce03ad",
  manifest_sha256:
    "d55dd37642b4e883d07fc5ad22979a27a621872ecfcc34dd998ff1fd12697889",
};

const proof = {
  row: {
    fixture_sha256: authorization.fixture_sha256,
    recovery_input_sha256: authorization.fixture_sha256,
    recovery_failure_category: "malformed",
    user_facing_recovery_category: "malformed_or_corrupted",
  },
};

test("T246 C08 evidence proves the non-semantic zero-boundary recovery contract", () => {
  const evidence = buildT246C08RecoveryEvidence({ authorization, proof });
  assert.equal(verifyT246C08RecoveryEvidence(evidence), true);
  assert.equal(evidence.invocation_attempted, false);
  assert.equal(evidence.semantic_backend_requests, 0);
  assert.equal(evidence.credential_recovery_attempted, false);
  assert.equal(evidence.credential_volume_accessed, false);
  assert.equal(evidence.credential_volume_mount_attempted, false);
  assert.equal(evidence.broker_runs, 0);
  assert.equal(evidence.draft_created, false);
  assert.equal(evidence.artifact_created, false);
  assert.equal(evidence.raw_parser_exception_persisted, false);
  assert.equal(evidence.raw_document_content_persisted, false);
  assert.equal(evidence.secret_scan_result, "passed");
  assert.equal(evidence.case_pass, true);
});

test("T246 C08 evidence rejects any provider or credential activity", () => {
  const evidence = buildT246C08RecoveryEvidence({ authorization, proof });
  assert.throws(
    () =>
      verifyT246C08RecoveryEvidence({
        ...evidence,
        semantic_backend_requests: 1,
      }),
    /t246_c08_evidence_budget_mismatch/,
  );
  assert.throws(
    () =>
      verifyT246C08RecoveryEvidence({
        ...evidence,
        credential_volume_accessed: true,
      }),
    /t246_c08_evidence_credential_volume_accessed_mismatch/,
  );
});
