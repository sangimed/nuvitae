import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT,
  RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH,
  RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT,
} from "../lib/t199-lifecycle-evidence.mjs";
import { assessT245, writeT245Aggregate } from "../lib/t245-evaluator.mjs";

const SPIKE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPO_ROOT = path.resolve(SPIKE_ROOT, "../..");

function makeT199Fixture(overrides = {}) {
  return {
    evidence_classification: "live_oauth_validation_only",
    observation_timestamp: "2026-08-07T10:00:00.000Z",
    initial_live_oauth_succeeded: true,
    callback_completion: "completed",
    connection_status_after_callback: "connected",
    callback_state_validated: true,
    token_exchange_succeeded: true,
    real_encrypted_record_created: true,
    encrypted_record_contains_plaintext: false,
    real_restart_recovery_succeeded: true,
    real_refresh_attempted: true,
    real_refresh_succeeded: true,
    real_refresh_token_rotated: true,
    live_concurrent_refresh_requests: 2,
    live_network_refresh_count: 1,
    refresh_trigger_category: "scheduled",
    invalid_grant_observed_live: false,
    deterministic_invalid_grant_detected: true,
    expired_invalid_credential_recovery_category:
      RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT,
    expired_invalid_credential_recovery_observation: "deterministic_only",
    provider_side_revocation_behavior:
      "not_exercised_without_supported_revocation_mechanism",
    real_local_logout_succeeded: true,
    real_record_deletion_succeeded: true,
    real_disconnected_restart_succeeded: true,
    final_live_reauthentication_succeeded: true,
    explicit_reconnect_attempted: true,
    explicit_reconnect_succeeded: true,
    reconnect_trigger_category: "after_disconnect",
    final_connection_status_after_callback: "connected",
    final_real_encrypted_recovery_succeeded: true,
    final_state_available_for_t200: true,
    revoked_behavior: "not_exercised_without_external_provider_revocation",
    secret_scan_result: "passed",
    key_volume_name: "nuvitae-codex-direct-oauth-t199-key-live",
    credential_volume_name: "nuvitae-codex-direct-oauth-t199-credentials-live",
    callback_publication: ["127.0.0.1:1455->2455", "[::1]:1455->2455"],
    raw_credentials_exposed_to_host: false,
    ...overrides,
  };
}

function makeT200Fixture(overrides = {}) {
  return {
    evidence_classification: "live_t200_direct_invocation",
    observation_timestamp: "2026-08-07T10:05:00.000Z",
    encrypted_state_recovered: true,
    refresh_required: false,
    invocation_attempted: true,
    invocation_succeeded: true,
    exact_http_status: 200,
    response_protocol_valid: true,
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_response_persisted: false,
    secret_scan_result: "passed",
    ...overrides,
  };
}

async function writeFixturePair(tempRoot, t199, t200) {
  const t199Path = path.join(
    tempRoot,
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t199-live.json",
  );
  const t200Path = path.join(
    tempRoot,
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json",
  );
  await fs.mkdir(path.dirname(t199Path), { recursive: true });
  await fs.mkdir(path.dirname(t200Path), { recursive: true });
  await fs.writeFile(t199Path, JSON.stringify(t199, null, 2), "utf8");
  await fs.writeFile(t200Path, JSON.stringify(t200, null, 2), "utf8");
}

async function withFixturePair(t199, t200, fn) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nuvitae-t245-"));
  try {
    await writeFixturePair(tempRoot, t199, t200);
    return await fn(tempRoot);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test("current checked-in T199/T200 evidence satisfies the precise T245 criteria", async () => {
  const report = await assessT245({ repoRoot: REPO_ROOT });
  assert.equal(report.summary.t245_live_proof_complete, true);
  assert.equal(report.summary.passing_mandatory_criteria_count, 9);
  assert.equal(report.summary.live_observed_count, 8);
  assert.equal(report.summary.deterministic_only_count, 1);
  assert.equal(report.summary.not_exercised_count, 1);
  const criteria = new Map(report.criteria.map((item) => [item.key, item]));
  assert.equal(
    criteria.get("callback_completion_and_connection_status_after_callback")
      .pass,
    true,
  );
  assert.equal(
    report.recovery_observations.expired_invalid_credential_recovery_category,
    RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT,
  );
});

test("evaluator rejects a missing T199 observation timestamp", async () => {
  await withFixturePair(
    makeT199Fixture({ observation_timestamp: undefined }),
    makeT200Fixture(),
    async (repoRoot) => {
      const report = await assessT245({ repoRoot });
      assert.equal(report.summary.t245_live_proof_complete, false);
      assert.ok(
        report.summary.failures.includes(
          "t199_observation_timestamp_missing_or_invalid",
        ),
      );
    },
  );
});

test("evaluator rejects missing post-callback connection status", async () => {
  await withFixturePair(
    makeT199Fixture({ connection_status_after_callback: undefined }),
    makeT200Fixture(),
    async (repoRoot) => {
      const report = await assessT245({ repoRoot });
      assert.equal(report.summary.t245_live_proof_complete, false);
      assert.ok(
        report.summary.failures.includes(
          "missing_or_malformed_t199_field:connection_status_after_callback",
        ),
      );
    },
  );
});

test("evaluator rejects a disconnected post-callback status", async () => {
  await withFixturePair(
    makeT199Fixture({ connection_status_after_callback: "disconnected" }),
    makeT200Fixture(),
    async (repoRoot) => {
      const report = await assessT245({ repoRoot });
      assert.equal(report.summary.t245_live_proof_complete, false);
      assert.ok(
        report.summary.failures.includes(
          "contradictory_connection_status_after_successful_callback",
        ),
      );
      const callbackCriterion = report.criteria.find(
        (item) =>
          item.key ===
          "callback_completion_and_connection_status_after_callback",
      );
      assert.equal(callbackCriterion.pass, false);
    },
  );
});

test("deterministic-only invalid-credential classification is recorded and satisfies canonical T245, but not a live-only gate", async () => {
  const fixture = makeT199Fixture();
  await withFixturePair(fixture, makeT200Fixture(), async (repoRoot) => {
    const report = await assessT245({ repoRoot });
    assert.equal(report.summary.t245_live_proof_complete, true);
    assert.equal(
      report.recovery_observations.expired_invalid_credential_recovery_category,
      RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT,
    );
    assert.equal(
      report.recovery_observations
        .expired_invalid_credential_recovery_observation,
      "deterministic_only",
    );
    const recoveryCriterion = report.criteria.find(
      (item) => item.key === "expired_invalid_credential_recovery",
    );
    assert.equal(recoveryCriterion.pass, true);
    assert.equal(recoveryCriterion.observation_kind, "deterministic_only");

    const liveOnly = await assessT245({
      repoRoot,
      requireLiveInvalidCredentialRecovery: true,
    });
    assert.equal(liveOnly.summary.t245_live_proof_complete, false);
    assert.ok(
      liveOnly.summary.failures.includes(
        "invalid_credential_recovery_not_live_observed",
      ),
    );
  });
});

test("live expired-access refresh recovery passes the evaluator", async () => {
  const fixture = makeT199Fixture({
    refresh_trigger_category: "expiry_detected",
    expired_invalid_credential_recovery_category:
      RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH,
    expired_invalid_credential_recovery_observation: "live_observed",
  });
  await withFixturePair(fixture, makeT200Fixture(), async (repoRoot) => {
    const report = await assessT245({ repoRoot });
    assert.equal(report.summary.t245_live_proof_complete, true);
    const recoveryCriterion = report.criteria.find(
      (item) => item.key === "expired_invalid_credential_recovery",
    );
    assert.equal(recoveryCriterion.observation_kind, "live_observed");
  });
});

test("live invalid-grant reconnect recovery passes when a live-only gate is required", async () => {
  const fixture = makeT199Fixture({
    refresh_trigger_category: "scheduled",
    real_refresh_succeeded: true,
    real_refresh_token_rotated: true,
    live_network_refresh_count: 1,
    invalid_grant_observed_live: true,
    deterministic_invalid_grant_detected: false,
    expired_invalid_credential_recovery_category:
      RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT,
    expired_invalid_credential_recovery_observation: "live_observed",
  });
  await withFixturePair(fixture, makeT200Fixture(), async (repoRoot) => {
    const report = await assessT245({
      repoRoot,
      requireLiveInvalidCredentialRecovery: true,
    });
    assert.equal(report.summary.t245_live_proof_complete, true);
  });
});

test("evaluator rejects contradictory reconnect success without connected state", async () => {
  await withFixturePair(
    makeT199Fixture({
      explicit_reconnect_succeeded: true,
      final_connection_status_after_callback: "not_connected",
    }),
    makeT200Fixture(),
    async (repoRoot) => {
      const report = await assessT245({ repoRoot });
      assert.equal(report.summary.t245_live_proof_complete, false);
      assert.ok(
        report.summary.failures.includes(
          "contradictory_reconnect_succeeded_without_connected_state",
        ),
      );
    },
  );
});

test("evaluator rejects secret-like values in evidence", async () => {
  await withFixturePair(
    makeT199Fixture({ access_token: "sk-testtesttesttesttest123" }),
    makeT200Fixture(),
    async (repoRoot) => {
      const report = await assessT245({ repoRoot });
      assert.equal(report.summary.t245_live_proof_complete, false);
      assert.ok(
        report.summary.failures.includes("secret_like_value_in_t199_evidence"),
      );
    },
  );
});

test("a complete passing fixture produces a deterministic, categorized report", async () => {
  await withFixturePair(
    makeT199Fixture(),
    makeT200Fixture(),
    async (repoRoot) => {
      const report = await assessT245({ repoRoot });
      assert.equal(report.summary.t245_live_proof_complete, true);
      assert.equal(report.summary.passing_mandatory_criteria_count, 9);
      assert.equal(report.summary.live_observed_count, 8);
      assert.equal(report.summary.deterministic_only_count, 1);
      assert.equal(report.summary.not_exercised_count, 1);
      assert.equal(report.provider_side_revocation_required, false);
      const second = await assessT245({ repoRoot });
      assert.deepEqual(report, second);
    },
  );
});

test("aggregate writer refuses incomplete evidence and writes only a passing run", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t245-write-"),
  );
  try {
    const aggregatePath = path.join(
      tempRoot,
      "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json",
    );
    const t199Path = path.join(
      tempRoot,
      "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t199-live.json",
    );
    const t200Path = path.join(
      tempRoot,
      "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json",
    );
    await fs.mkdir(path.dirname(aggregatePath), { recursive: true });
    await fs.writeFile(
      t199Path,
      JSON.stringify(
        makeT199Fixture({ observation_timestamp: undefined }),
        null,
        2,
      ),
      "utf8",
    );
    await fs.writeFile(
      t200Path,
      JSON.stringify(makeT200Fixture(), null, 2),
      "utf8",
    );
    await assert.rejects(
      writeT245Aggregate({
        repoRoot: tempRoot,
        aggregatePath,
        t199Path,
        t200Path,
      }),
      /t245_evaluator_fail_closed:.*t199_observation_timestamp_missing_or_invalid/,
    );
    await assert.rejects(
      fs.stat(aggregatePath),
      (error) => error.code === "ENOENT",
    );

    await fs.writeFile(
      t199Path,
      JSON.stringify(makeT199Fixture(), null, 2),
      "utf8",
    );
    const report = await writeT245Aggregate({
      repoRoot: tempRoot,
      aggregatePath,
      t199Path,
      t200Path,
    });
    const persisted = JSON.parse(await fs.readFile(aggregatePath, "utf8"));
    assert.equal(
      persisted.evidence_classification,
      "sanitized_t245_lifecycle_proof",
    );
    assert.equal(persisted.evidence_atomic_replace_succeeded, true);
    assert.equal(persisted.summary.t245_live_proof_complete, true);
    assert.deepEqual(persisted, report);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
