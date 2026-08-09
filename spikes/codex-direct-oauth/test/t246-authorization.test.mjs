import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadT246AuthorizationRegistry,
  parseT246AttemptArguments,
  validateT246Authorization,
} from "../lib/t246-authorization.mjs";
import { consolidateT246Evidence } from "../consolidate-t246-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");
const registry = await loadT246AuthorizationRegistry({ root });

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

function argvOf(entry) {
  return [
    "--campaign",
    entry.campaign,
    "--attempt",
    entry.attempt,
    "--semantic-case",
    entry.semantic_case,
    "--fixture",
    entry.fixture,
    "--manifest",
    entry.manifest,
    "--evidence",
    entry.evidence,
    "--max-broker-runs",
    String(entry.maximum_live_broker_runs),
    "--max-semantic-backend-requests",
    String(entry.maximum_semantic_backend_requests),
    "--automatic-retries",
    String(entry.automatic_retries),
  ];
}

async function authorizedEntry(caseId, overrides = {}) {
  const base = registry.authorized_attempts.find(
    (entry) => entry.semantic_case === caseId,
  );
  assert.ok(base, `missing registry entry for ${caseId}`);
  const attempt = "A99";
  const isRecovery = caseId === "T246-C08";
  const evidence = isRecovery
    ? `spikes/codex-direct-oauth/evidence/codex-direct-oauth-${caseId.toLowerCase()}-${attempt.toLowerCase()}-recovery.json`
    : `spikes/codex-direct-oauth/evidence/codex-direct-oauth-${caseId.toLowerCase()}-${attempt.toLowerCase()}-semantic-parsing.json`;
  return {
    ...base,
    attempt,
    authorization_state: "AUTHORIZED",
    evidence,
    fixture_sha256: sha256(await fs.readFile(path.join(repo, base.fixture))),
    manifest_sha256: sha256(await fs.readFile(path.join(repo, base.manifest))),
    ...overrides,
  };
}

function stubRegistry(entry) {
  return {
    schema_version: 1,
    authorized_attempts: [entry],
  };
}

const tracked = async () => "tracked";

test("T246 registry pins consumed C01-C08 attempts with no extra authorization", () => {
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.authorized_attempts.length, 9);
  const a01 = registry.authorized_attempts.find(
    (entry) => entry.campaign === "T246-C01" && entry.attempt === "A01",
  );
  const a02 = registry.authorized_attempts.find(
    (entry) => entry.campaign === "T246-C01" && entry.attempt === "A02",
  );
  assert.equal(a01.authorization_state, "CONSUMED");
  assert.equal(a02.authorization_state, "CONSUMED");
  assert.equal(
    a02.evidence,
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a02-semantic-parsing.json",
  );
  assert.equal(
    a02.fixture_sha256,
    "51593da159285371b05919700ced3e8ed2be666f1b24482b504c48c579e0cf3e",
  );
  assert.equal(
    a02.transcript_sha256,
    "496bb2335d6ef5b65038aa227a1cd908eb02535413ccec408b5a499f16e5ee77",
  );
  assert.equal(
    a02.manifest_sha256,
    "8a3838e0b1397b6a817b828b62a6a6e960e925890bdcfe81be6c1043d2c5754d",
  );
  const c02 = registry.authorized_attempts.find(
    (entry) => entry.campaign === "T246-C02" && entry.attempt === "A01",
  );
  assert.equal(c02.authorization_state, "CONSUMED");
  assert.equal(c02.maximum_live_broker_runs, 1);
  assert.equal(c02.maximum_semantic_backend_requests, 1);
  assert.equal(c02.automatic_retries, 0);
  assert.equal(
    c02.evidence,
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c02-a01-semantic-parsing.json",
  );
  const c03 = registry.authorized_attempts.find(
    (entry) => entry.campaign === "T246-C03" && entry.attempt === "A01",
  );
  assert.equal(c03.authorization_state, "CONSUMED");
  assert.equal(c03.maximum_live_broker_runs, 1);
  assert.equal(c03.maximum_semantic_backend_requests, 1);
  assert.equal(c03.automatic_retries, 0);
  const c04 = registry.authorized_attempts.find(
    (entry) => entry.campaign === "T246-C04" && entry.attempt === "A01",
  );
  assert.equal(c04.authorization_state, "CONSUMED");
  assert.equal(c04.maximum_live_broker_runs, 1);
  assert.equal(c04.maximum_semantic_backend_requests, 1);
  assert.equal(c04.automatic_retries, 0);
  const c05 = registry.authorized_attempts.find(
    (entry) => entry.campaign === "T246-C05" && entry.attempt === "A01",
  );
  assert.equal(c05.authorization_state, "CONSUMED");
  assert.equal(c05.maximum_live_broker_runs, 1);
  assert.equal(c05.maximum_semantic_backend_requests, 1);
  assert.equal(c05.automatic_retries, 0);
  const c06 = registry.authorized_attempts.find(
    (entry) => entry.campaign === "T246-C06" && entry.attempt === "A01",
  );
  assert.equal(c06.authorization_state, "CONSUMED");
  assert.equal(c06.maximum_live_broker_runs, 1);
  assert.equal(c06.maximum_semantic_backend_requests, 1);
  assert.equal(c06.automatic_retries, 0);
  const c07 = registry.authorized_attempts.find(
    (entry) => entry.semantic_case === "T246-C07",
  );
  assert.equal(c07.authorization_state, "CONSUMED");
  const c08Entries = registry.authorized_attempts.filter(
    (entry) => entry.semantic_case === "T246-C08",
  );
  assert.equal(c08Entries.length, 1);
  for (const entry of registry.authorized_attempts) {
    assert.match(entry.semantic_case, /^T246-C0[1-8]$/);
    assert.match(entry.attempt, /^A[0-9]{2,}$/);
    assert.match(entry.fixture_sha256, /^[a-f0-9]{64}$/);
    assert.match(entry.manifest_sha256, /^[a-f0-9]{64}$/);
    assert.equal(entry.automatic_retries, 0);
  }
  assert.ok(
    c08Entries.every((entry) => entry.authorization_state === "CONSUMED"),
  );
  assert.equal(
    registry.authorized_attempts.filter(
      (entry) => entry.authorization_state === "AUTHORIZED",
    ).length,
    0,
  );
  assert.equal(
    registry.authorized_attempts.some(
      (entry) => entry.campaign === "T246-C01" && entry.attempt === "A03",
    ),
    false,
  );
  const consumed = registry.consumed_attempts ?? [];
  assert.equal(consumed.length, 9);
  assert.equal(consumed[0].campaign, "T246-C01");
  assert.equal(consumed[0].attempt, "A01");
  assert.equal(consumed[0].invocation_attempted, true);
  assert.equal(consumed[0].do_not_rerun, true);
  assert.match(consumed[0].evidence_sha256, /^[a-f0-9]{64}$/);
  assert.equal(consumed[1].campaign, "T246-C01");
  assert.equal(consumed[1].attempt, "A02");
  assert.equal(consumed[1].invocation_attempted, true);
  assert.equal(consumed[1].case_pass, false);
  assert.equal(consumed[1].do_not_rerun, true);
  assert.equal(consumed[1].evidence_size_bytes, 10679);
  assert.equal(
    consumed[1].evidence_canonical_path,
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a02-semantic-parsing.json",
  );
  assert.equal(consumed[2].campaign, "T246-C02");
  assert.equal(consumed[2].attempt, "A01");
  assert.equal(consumed[2].case_pass, true);
  assert.equal(consumed[2].safe_final_state, "complete");
  assert.equal(consumed[2].evidence_size_bytes, 13202);
  assert.equal(consumed[3].campaign, "T246-C03");
  assert.equal(consumed[3].attempt, "A01");
  assert.equal(consumed[3].case_pass, true);
  assert.equal(consumed[3].safe_final_state, "complete");
  assert.equal(consumed[3].evidence_size_bytes, 12880);
  assert.equal(consumed[4].campaign, "T246-C04");
  assert.equal(consumed[4].attempt, "A01");
  assert.equal(consumed[4].case_pass, false);
  assert.equal(consumed[4].semantic_metrics_passed, false);
  assert.equal(consumed[4].exact_fact_recall, 0.75);
  assert.equal(consumed[4].high_priority_fact_recall, 0.6842);
  assert.equal(consumed[4].unsupported_fact_count, 0);
  assert.equal(consumed[4].forbidden_inference_count, 0);
  assert.equal(consumed[4].grounding, true);
  assert.equal(consumed[4].no_invention, true);
  assert.equal(consumed[4].parsing, false);
  assert.equal(
    consumed[4].primary_failure_phase,
    "response_semantic_evaluation",
  );
  assert.equal(consumed[4].primary_failure_category, "expected_fact_missing");
  assert.equal(consumed[4].evidence_size_bytes, 13555);
  assert.equal(consumed[5].campaign, "T246-C05");
  assert.equal(consumed[5].attempt, "A01");
  assert.equal(consumed[5].case_pass, true);
  assert.equal(consumed[5].safe_final_state, "complete");
  assert.equal(
    consumed[5].evidence_sha256,
    "ea5d13138a3c17fda6e2548ba0cebebbca3fd24ffede3b5ca92114a540741e84",
  );
  assert.equal(consumed[5].evidence_size_bytes, 12740);
  assert.equal(consumed[6].campaign, "T246-C06");
  assert.equal(consumed[6].attempt, "A01");
  assert.equal(consumed[6].case_pass, true);
  assert.equal(consumed[6].safe_final_state, "complete");
  assert.equal(
    consumed[6].evidence_sha256,
    "21611140539114711d0094fee51076d28e6ee4882e22b82fd9dfb2a1eccb6b32",
  );
  assert.equal(consumed[6].evidence_size_bytes, 12337);
  assert.equal(consumed[7].campaign, "T246-C07");
  assert.equal(consumed[7].case_pass, true);
  assert.equal(consumed[7].safe_final_state, "complete");
  assert.equal(
    consumed[7].evidence_sha256,
    "b350ee1dc70a73869558c87e4c67f298704195e9d14d8a5aa6ef97a8204d5d4b",
  );
  assert.equal(consumed[7].evidence_size_bytes, 14021);
  assert.equal(consumed[8].campaign, "T246-C08");
  assert.equal(consumed[8].attempt, "A01");
  assert.equal(consumed[8].case_pass, true);
  assert.equal(consumed[8].recovery_case, true);
  assert.equal(consumed[8].broker_runs, 0);
  assert.equal(consumed[8].semantic_backend_requests, 0);
  assert.equal(consumed[8].credential_recovery_attempted, false);
  for (const caseId of [
    "T246-C01",
    "T246-C02",
    "T246-C03",
    "T246-C04",
    "T246-C05",
    "T246-C06",
    "T246-C07",
  ]) {
    const entry = registry.authorized_attempts.find(
      (candidate) => candidate.semantic_case === caseId,
    );
    assert.equal(entry.maximum_live_broker_runs, 1);
    assert.equal(entry.maximum_semantic_backend_requests, 1);
    assert.match(entry.transcript_sha256, /^[a-f0-9]{64}$/);
  }
  const c08 = registry.authorized_attempts.find(
    (candidate) => candidate.semantic_case === "T246-C08",
  );
  assert.equal(c08.maximum_live_broker_runs, 0);
  assert.equal(c08.maximum_semantic_backend_requests, 0);
  assert.equal(c08.transcript_sha256, null);
});

test("T246 C07-A01 and C08-A01 are single consumed attempts with no replacements", () => {
  const c05Attempts = registry.authorized_attempts.filter(
    (entry) => entry.campaign === "T246-C05",
  );
  assert.deepEqual(
    c05Attempts.map((entry) => [entry.attempt, entry.authorization_state]),
    [["A01", "CONSUMED"]],
  );
  assert.equal(
    registry.authorized_attempts.find(
      (entry) => entry.campaign === "T246-C06" && entry.attempt === "A01",
    ).authorization_state,
    "CONSUMED",
  );
  assert.equal(
    registry.authorized_attempts.find(
      (entry) => entry.campaign === "T246-C07" && entry.attempt === "A01",
    ).authorization_state,
    "CONSUMED",
  );
  assert.equal(
    registry.authorized_attempts.some(
      (entry) => entry.campaign === "T246-C05" && entry.attempt === "A02",
    ),
    false,
  );
  for (const caseId of ["T246-C08"]) {
    const entry = registry.authorized_attempts.find(
      (candidate) => candidate.semantic_case === caseId,
    );
    assert.equal(entry.authorization_state, "CONSUMED");
  }
  assert.equal(
    registry.authorized_attempts.some(
      (entry) => entry.campaign === "T246-C02" && entry.attempt === "A02",
    ),
    false,
  );
  assert.equal(
    registry.authorized_attempts.some(
      (entry) => entry.campaign === "T246-C03" && entry.attempt === "A02",
    ),
    false,
  );
});

test("T246 consumed A02 is rejected before any credential or live step", async () => {
  const entry = registry.authorized_attempts.find(
    (candidate) =>
      candidate.campaign === "T246-C01" && candidate.attempt === "A02",
  );
  assert.equal(entry.authorization_state, "CONSUMED");
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({
      root,
      invocation,
      isTracked: tracked,
    }),
    (error) => error.code === "t246_attempt_consumed",
  );
});

test("T246 consumed C01-A01 is rejected even though its artifact exists only at the historical misplaced path", async () => {
  const entry = registry.authorized_attempts.find(
    (candidate) => candidate.semantic_case === "T246-C01",
  );
  assert.equal(entry.authorization_state, "CONSUMED");
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({ root, invocation, isTracked: tracked }),
    (error) => error.code === "t246_attempt_consumed",
  );
});

test("T246 consumption does not rely solely on the canonical evidence pathname", async () => {
  const base = registry.authorized_attempts.find(
    (candidate) => candidate.semantic_case === "T246-C01",
  );
  const entry = {
    ...base,
    authorization_state: "AUTHORIZED",
  };
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({
      root,
      invocation,
      registry: stubRegistry(entry),
      isTracked: tracked,
      findConsumedArtifacts: async () => [
        {
          path: path.join(
            root,
            "spikes",
            "codex-direct-oauth",
            "evidence",
            "codex-direct-oauth-t246-c01-a01-semantic-parsing.json",
          ),
          campaign: "T246-C01",
          attempt: "A01",
          kind: "semantic-parsing",
        },
      ],
    }),
    (error) => error.code === "t246_attempt_consumed",
  );
});

test("T246 consumed C08-A01 fails closed before any credential or live step", async () => {
  const entry = registry.authorized_attempts.find(
    (candidate) => candidate.semantic_case === "T246-C08",
  );
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({ root, invocation, isTracked: tracked }),
    (error) => error.code === "t246_attempt_consumed",
  );
});

test("T246 authorization passes only with an explicit AUTHORIZED entry and pinned hashes", async () => {
  const entry = await authorizedEntry("T246-C07");
  const invocation = parseT246AttemptArguments(argvOf(entry));
  const authorization = await validateT246Authorization({
    root,
    invocation,
    registry: stubRegistry(entry),
    isTracked: tracked,
  });
  assert.equal(authorization.semantic_case, "T246-C07");
  assert.equal(authorization.is_recovery_case, false);
  assert.equal(authorization.authorization_state, "AUTHORIZED");
  assert.equal(authorization.maximum_semantic_backend_requests, 1);
});

test("T246 authorization fails on fixture hash mismatch", async () => {
  const entry = await authorizedEntry("T246-C07", {
    fixture_sha256: "0".repeat(64),
  });
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({
      root,
      invocation,
      registry: stubRegistry(entry),
      isTracked: tracked,
    }),
    (error) => error.code === "t246_fixture_hash_mismatch",
  );
});

test("T246 authorization fails on transcript hash mismatch", async () => {
  const base = registry.authorized_attempts.find(
    (candidate) => candidate.semantic_case === "T246-C07",
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(repo, base.manifest), "utf8"),
  );
  const entry = await authorizedEntry("T246-C07", {
    transcript_sha256: "1".repeat(64),
  });
  assert.notEqual(entry.transcript_sha256, manifest.transcript_sha256);
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({
      root,
      invocation,
      registry: stubRegistry(entry),
      isTracked: tracked,
    }),
    (error) => error.code === "t246_transcript_hash_mismatch",
  );
});

test("T246 recovery case requires zero broker runs and zero backend requests", async () => {
  const entry = await authorizedEntry("T246-C08", {
    maximum_live_broker_runs: 1,
    maximum_semantic_backend_requests: 1,
  });
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({
      root,
      invocation,
      registry: stubRegistry(entry),
      isTracked: tracked,
    }),
    (error) => error.code === "t246_recovery_single_request_required",
  );
});

test("T246 semantic case cannot be run as a recovery case", async () => {
  const entry = await authorizedEntry("T246-C01", {
    maximum_live_broker_runs: 0,
    maximum_semantic_backend_requests: 0,
  });
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({
      root,
      invocation,
      registry: stubRegistry(entry),
      isTracked: tracked,
    }),
    (error) => error.code === "t246_single_request_required",
  );
});

test("T246 authorization forbids reused evidence paths", async () => {
  const entry = await authorizedEntry("T246-C02", {
    evidence:
      "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c02-a98-semantic-parsing.json",
  });
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({
      root,
      invocation,
      registry: stubRegistry(entry),
      isTracked: tracked,
      exists: async () => undefined,
    }),
    (error) => error.code === "t246_evidence_path_reused",
  );
});

test("T246 authorization forbids default evidence paths", async () => {
  const entry = await authorizedEntry("T246-C03", {
    evidence:
      "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-semantic-parsing.json",
  });
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({
      root,
      invocation,
      registry: stubRegistry(entry),
      isTracked: tracked,
    }),
    (error) => error.code === "t246_default_evidence_forbidden",
  );
});

test("T246 authorization requires canonical targets to be tracked", async () => {
  const entry = await authorizedEntry("T246-C07");
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({
      root,
      invocation,
      registry: stubRegistry(entry),
      isTracked: async () => "untracked",
    }),
    (error) => error.code === "t246_canonical_target_untracked",
  );
});

const windowsGitCommand = "/mnt/c/Program Files/Git/cmd/git.exe";

test(
  "T246 canonical tracking handles Windows Git resolving the WSL repository as a UNC path",
  { skip: !existsSync(windowsGitCommand) },
  async () => {
    const entry = await authorizedEntry("T246-C03");
    const invocation = parseT246AttemptArguments(argvOf(entry));
    const authorization = await validateT246Authorization({
      root,
      invocation,
      registry: stubRegistry(entry),
      gitCommand: windowsGitCommand,
    });
    assert.equal(authorization.semantic_case, "T246-C03");
    assert.equal(authorization.attempt, "A99");
  },
);

test("T246 aggregate records final FAILED qualification while preserving evidence", async () => {
  const { aggregate } = await consolidateT246Evidence();
  assert.equal(aggregate.status, "FAILED");
  assert.equal(aggregate.qualification_result, "FAILED");
  assert.equal(aggregate.all_cases_consumed, true);
  assert.equal(aggregate.all_cases_passed, false);
  assert.equal(aggregate.accepted_live_evidence_count, 5);
  assert.equal(aggregate.semantic_cases.length, 7);
  assert.equal(aggregate.case_matrix.length, 8);
  assert.deepEqual(
    aggregate.case_matrix.map((entry) => [entry.case_id, entry.result]),
    [
      ["T246-C01", "FAIL"],
      ["T246-C02", "PASS"],
      ["T246-C03", "PASS"],
      ["T246-C04", "FAIL"],
      ["T246-C05", "PASS"],
      ["T246-C06", "PASS"],
      ["T246-C07", "PASS"],
      ["T246-C08", "PASS"],
    ],
  );
  assert.equal(aggregate.recovery_case.case_id, "T246-C08");
  assert.equal(aggregate.consumed_attempts.length, 9);
  assert.equal(aggregate.consumed_attempts[0].campaign, "T246-C01");
  assert.equal(aggregate.consumed_attempts[0].attempt, "A01");
  assert.equal(aggregate.consumed_attempts[0].accepted, false);
  assert.equal(aggregate.consumed_attempts[1].attempt, "A02");
  assert.equal(aggregate.consumed_attempts[1].accepted, false);
  assert.equal(aggregate.consumed_attempts[1].case_pass, false);
  assert.equal(
    aggregate.consumed_attempts[1].primary_failure_category,
    "expected_fact_missing",
  );
  assert.equal(aggregate.consumed_attempts[2].campaign, "T246-C02");
  assert.equal(aggregate.consumed_attempts[2].accepted, true);
  assert.equal(aggregate.consumed_attempts[2].case_pass, true);
  assert.equal(aggregate.consumed_attempts[3].campaign, "T246-C03");
  assert.equal(aggregate.consumed_attempts[4].campaign, "T246-C04");
  assert.equal(aggregate.consumed_attempts[4].case_pass, false);
  assert.equal(aggregate.consumed_attempts[4].exact_fact_recall, 0.75);
  assert.equal(
    aggregate.consumed_attempts[4].high_priority_fact_recall,
    0.6842,
  );
  assert.equal(
    aggregate.semantic_cases.find((entry) => entry.case_id === "T246-C04")
      .consumed,
    true,
  );
  assert.equal(aggregate.consumed_attempts[3].accepted, true);
  assert.equal(aggregate.consumed_attempts[3].case_pass, true);
  assert.equal(aggregate.consumed_attempts[5].campaign, "T246-C05");
  assert.equal(aggregate.consumed_attempts[5].accepted, true);
  assert.equal(aggregate.consumed_attempts[5].case_pass, true);
  assert.equal(aggregate.consumed_attempts[6].campaign, "T246-C06");
  assert.equal(aggregate.consumed_attempts[6].accepted, true);
  assert.equal(aggregate.consumed_attempts[6].case_pass, true);
  assert.equal(aggregate.consumed_attempts[7].campaign, "T246-C07");
  assert.equal(aggregate.consumed_attempts[7].case_pass, true);
  assert.equal(aggregate.consumed_attempts[8].campaign, "T246-C08");
  assert.equal(aggregate.consumed_attempts[8].case_pass, true);
  assert.equal(aggregate.passed_case_count, 6);
  assert.equal(aggregate.failed_case_count, 2);
  assert.equal(aggregate.harness_invalid_attempt_count, 1);
  assert.equal(aggregate.harness_invalid_attempts.length, 1);
  assert.equal(
    aggregate.malformed_recovery_result.safe_recovery_category,
    "malformed_or_corrupted",
  );
  const c01 = aggregate.semantic_cases.find(
    (entry) => entry.case_id === "T246-C01",
  );
  assert.equal(c01.accepted, false);
  assert.equal(c01.consumed, true);
  const c02 = aggregate.semantic_cases.find(
    (entry) => entry.case_id === "T246-C02",
  );
  assert.equal(c02.accepted, true);
  assert.equal(c02.consumed, true);
  const c03 = aggregate.semantic_cases.find(
    (entry) => entry.case_id === "T246-C03",
  );
  assert.equal(c03.accepted, true);
  assert.equal(c03.consumed, true);
  const c05 = aggregate.semantic_cases.find(
    (entry) => entry.case_id === "T246-C05",
  );
  assert.equal(c05.accepted, true);
  assert.equal(c05.consumed, true);
  const c06 = aggregate.semantic_cases.find(
    (entry) => entry.case_id === "T246-C06",
  );
  assert.equal(c06.accepted, true);
  assert.equal(c06.consumed, true);
});
