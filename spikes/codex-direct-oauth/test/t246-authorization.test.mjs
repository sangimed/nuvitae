import assert from "node:assert/strict";
import crypto from "node:crypto";
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

test("T246 registry pins C01-A01 CONSUMED and C02-C08 NOT_AUTHORIZED with per-case limits", () => {
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.authorized_attempts.length, 8);
  const expectedStates = new Map([
    ["T246-C01", "CONSUMED"],
    ["T246-C02", "NOT_AUTHORIZED"],
    ["T246-C03", "NOT_AUTHORIZED"],
    ["T246-C04", "NOT_AUTHORIZED"],
    ["T246-C05", "NOT_AUTHORIZED"],
    ["T246-C06", "NOT_AUTHORIZED"],
    ["T246-C07", "NOT_AUTHORIZED"],
    ["T246-C08", "NOT_AUTHORIZED"],
  ]);
  for (const entry of registry.authorized_attempts) {
    assert.equal(
      entry.authorization_state,
      expectedStates.get(entry.semantic_case),
    );
    assert.match(entry.semantic_case, /^T246-C0[1-8]$/);
    assert.match(entry.attempt, /^A[0-9]{2,}$/);
    assert.match(entry.fixture_sha256, /^[a-f0-9]{64}$/);
    assert.match(entry.manifest_sha256, /^[a-f0-9]{64}$/);
    assert.equal(entry.automatic_retries, 0);
  }
  const consumed = registry.consumed_attempts ?? [];
  assert.equal(consumed.length, 1);
  assert.equal(consumed[0].campaign, "T246-C01");
  assert.equal(consumed[0].attempt, "A01");
  assert.equal(consumed[0].invocation_attempted, true);
  assert.equal(consumed[0].do_not_rerun, true);
  assert.match(consumed[0].evidence_sha256, /^[a-f0-9]{64}$/);
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

test("T246 attempts fail closed before any credential or live step while NOT_AUTHORIZED", async () => {
  const entry = registry.authorized_attempts.find(
    (candidate) => candidate.semantic_case === "T246-C04",
  );
  const invocation = parseT246AttemptArguments(argvOf(entry));
  await assert.rejects(
    validateT246Authorization({ root, invocation, isTracked: tracked }),
    (error) => error.code === "t246_not_authorized",
  );
});

test("T246 authorization passes only with an explicit AUTHORIZED entry and pinned hashes", async () => {
  const entry = await authorizedEntry("T246-C04");
  const invocation = parseT246AttemptArguments(argvOf(entry));
  const authorization = await validateT246Authorization({
    root,
    invocation,
    registry: stubRegistry(entry),
    isTracked: tracked,
  });
  assert.equal(authorization.semantic_case, "T246-C04");
  assert.equal(authorization.is_recovery_case, false);
  assert.equal(authorization.authorization_state, "AUTHORIZED");
  assert.equal(authorization.maximum_semantic_backend_requests, 1);
});

test("T246 authorization fails on fixture hash mismatch", async () => {
  const entry = await authorizedEntry("T246-C04", {
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
    (candidate) => candidate.semantic_case === "T246-C05",
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(repo, base.manifest), "utf8"),
  );
  const entry = await authorizedEntry("T246-C05", {
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

test("T246 aggregate stays INCOMPLETE with zero accepted evidence", async () => {
  const { aggregate } = await consolidateT246Evidence();
  assert.equal(aggregate.status, "INCOMPLETE");
  assert.equal(aggregate.all_cases_passed, false);
  assert.equal(aggregate.accepted_live_evidence_count, 0);
  assert.equal(aggregate.semantic_cases.length, 7);
  assert.equal(aggregate.recovery_case.case_id, "T246-C08");
  assert.equal(aggregate.consumed_attempts.length, 1);
  assert.equal(aggregate.consumed_attempts[0].campaign, "T246-C01");
  assert.equal(aggregate.consumed_attempts[0].attempt, "A01");
  assert.equal(aggregate.consumed_attempts[0].accepted, false);
  const c01 = aggregate.semantic_cases.find(
    (entry) => entry.case_id === "T246-C01",
  );
  assert.equal(c01.accepted, false);
  assert.equal(c01.consumed, true);
});
