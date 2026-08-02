import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadCampaignBAuthorizationRegistry,
  parseCampaignBAttemptArguments,
  validateCampaignBAuthorization,
} from "../lib/t201-campaign-b-authorization.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");
const registry = await loadCampaignBAuthorizationRegistry({ root });
const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const historicalContracts = registry.authorized_attempts.filter(
  ({ campaign, attempt, semantic_case }) =>
    campaign === "T201-C03-B" &&
    attempt === "B02" &&
    semantic_case === "T201-C03",
);
assert.equal(
  historicalContracts.length,
  1,
  "expected exactly one historical T201-C03-B B02 authorization",
);
const [historicalContract] = historicalContracts;
const contract = Object.freeze({
  ...historicalContract,
  attempt: "B99",
  evidence:
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-c03-b99-semantic-parsing.json",
  fixture_sha256: sha256(
    await fs.readFile(path.join(repo, historicalContract.fixture)),
  ),
  manifest_sha256: sha256(
    await fs.readFile(path.join(repo, historicalContract.manifest)),
  ),
});
const argv = (value = contract) => [
  "--campaign",
  value.campaign,
  "--attempt",
  value.attempt,
  "--semantic-case",
  value.semantic_case,
  "--fixture",
  value.fixture,
  "--manifest",
  value.manifest,
  "--evidence",
  value.evidence,
  "--max-broker-runs",
  String(value.maximum_live_broker_runs),
  "--max-semantic-backend-requests",
  String(value.maximum_semantic_backend_requests),
  "--automatic-retries",
  String(value.automatic_retries),
];
async function beforeEvidenceExists(target) {
  if (String(target).endsWith(contract.evidence))
    throw Object.assign(new Error("not yet written"), { code: "ENOENT" });
  await fs.access(target);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      }),
    );
  });
}

test("Campaign B parses only a complete explicit generic attempt contract", () => {
  const invocationContract = Object.fromEntries(
    Object.entries(contract).filter(
      ([field]) => !["fixture_sha256", "manifest_sha256"].includes(field),
    ),
  );
  assert.deepEqual(parseCampaignBAttemptArguments(argv()), invocationContract);
  assert.throws(
    () => parseCampaignBAttemptArguments(argv().slice(0, -2)),
    /campaign_b_explicit_contract_required/,
  );
  assert.throws(
    () => parseCampaignBAttemptArguments([...argv(), "--attempt", "B04"]),
    /campaign_b_invalid_arguments/,
  );
});

test("registry rejects stale historical manifest pins and authorizes only a current test contract", async () => {
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        invocation: parseCampaignBAttemptArguments(argv(historicalContract)),
        exists: async (target) => {
          if (String(target).endsWith(historicalContract.evidence))
            throw Object.assign(new Error("not yet written"), {
              code: "ENOENT",
            });
          await beforeEvidenceExists(target);
        },
      }),
    /campaign_b_matrix_artifact_hash_mismatch/,
  );
  const authorized = await validateCampaignBAuthorization({
    root,
    invocation: parseCampaignBAttemptArguments(argv()),
    registry: { schema_version: 1, authorized_attempts: [contract] },
    exists: beforeEvidenceExists,
  });
  assert.equal(authorized.attempt, contract.attempt);
  assert.equal(authorized.fixture_path, path.join(repo, contract.fixture));
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        registry: { schema_version: 1, authorized_attempts: [contract] },
        invocation: parseCampaignBAttemptArguments(
          argv({ ...contract, attempt: "B98" }),
        ),
        exists: beforeEvidenceExists,
      }),
    /campaign_b_attempt_not_authorized/,
  );
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        registry: { schema_version: 1, authorized_attempts: [contract] },
        invocation: parseCampaignBAttemptArguments(
          argv({ ...contract, campaign: "T201-C02-A", attempt: "A07" }),
        ),
        exists: beforeEvidenceExists,
      }),
    /campaign_b_attempt_not_authorized/,
  );
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        registry: { schema_version: 1, authorized_attempts: [contract] },
        invocation: parseCampaignBAttemptArguments(
          argv({
            ...contract,
            fixture:
              "spikes/codex-direct-oauth/fixtures/t201-matrix/t201-not-authorized.txt",
          }),
        ),
        exists: beforeEvidenceExists,
      }),
    /campaign_b_contract_mismatch_fixture/,
  );
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        registry: { schema_version: 1, authorized_attempts: [contract] },
        invocation: parseCampaignBAttemptArguments(
          argv({
            ...contract,
            evidence:
              "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-semantic-parsing.json",
          }),
        ),
        exists: beforeEvidenceExists,
      }),
    /campaign_b_contract_mismatch_evidence/,
  );
});

test("registry rejects reused evidence, multiple requests, retries, and a missing canonical target before Docker", async () => {
  const reused = {
    authorized_attempts: [
      {
        ...contract,
        evidence:
          "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-c02-b01-semantic-parsing.json",
        fixture_sha256: sha256(
          await fs.readFile(path.join(repo, contract.fixture)),
        ),
        manifest_sha256: sha256(
          await fs.readFile(path.join(repo, contract.manifest)),
        ),
      },
    ],
    schema_version: 1,
  };
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        registry: reused,
        invocation: parseCampaignBAttemptArguments(
          argv(reused.authorized_attempts[0]),
        ),
      }),
    /campaign_b_evidence_path_reused/,
  );
  const unsafeTwoRequests = {
    schema_version: 1,
    authorized_attempts: [
      {
        ...reused.authorized_attempts[0],
        evidence: contract.evidence,
        maximum_semantic_backend_requests: 2,
      },
    ],
  };
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        registry: unsafeTwoRequests,
        invocation: parseCampaignBAttemptArguments(
          argv(unsafeTwoRequests.authorized_attempts[0]),
        ),
      }),
    /campaign_b_single_request_required/,
  );
  const unsafeRetry = {
    schema_version: 1,
    authorized_attempts: [
      {
        ...reused.authorized_attempts[0],
        evidence: contract.evidence,
        automatic_retries: 1,
      },
    ],
  };
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        registry: unsafeRetry,
        invocation: parseCampaignBAttemptArguments(
          argv(unsafeRetry.authorized_attempts[0]),
        ),
      }),
    /campaign_b_retries_disabled_required/,
  );
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        registry: { schema_version: 1, authorized_attempts: [contract] },
        invocation: parseCampaignBAttemptArguments(argv()),
        exists: async (target) => {
          if (String(target).endsWith("run-t201-live-execute.sh"))
            throw Object.assign(new Error("missing"), { code: "ENOENT" });
          await beforeEvidenceExists(target);
        },
      }),
    /campaign_b_canonical_target_missing/,
  );
});

test("registry fails closed for an unavailable Git client", async () => {
  await assert.rejects(
    () =>
      validateCampaignBAuthorization({
        root,
        registry: { schema_version: 1, authorized_attempts: [contract] },
        invocation: parseCampaignBAttemptArguments(argv()),
        exists: beforeEvidenceExists,
        gitCommand: "nuvitae-git-unavailable-for-test",
      }),
    /campaign_b_canonical_target_tracking_unavailable/,
  );
});

test("real Git rejects an untracked canonical Campaign-B entrypoint", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-campaign-b-untracked-"),
  );
  const copiedRoot = path.join(
    directory,
    "repo",
    "spikes",
    "codex-direct-oauth",
  );
  const copiedRepo = path.join(directory, "repo");
  try {
    await fs.cp(root, copiedRoot, { recursive: true });
    assert.equal((await run("git", ["init"], { cwd: copiedRepo })).code, 0);
    assert.equal(
      (
        await run(
          "git",
          [
            "add",
            "spikes/codex-direct-oauth/run-t201-live.sh",
            "spikes/codex-direct-oauth/t201-campaign-b-runner.mjs",
          ],
          { cwd: copiedRepo },
        )
      ).code,
      0,
    );
    await assert.rejects(
      () =>
        validateCampaignBAuthorization({
          root: copiedRoot,
          registry: { schema_version: 1, authorized_attempts: [contract] },
          invocation: parseCampaignBAttemptArguments(argv()),
          exists: async (target) => {
            if (String(target).endsWith(contract.evidence))
              throw Object.assign(new Error("not yet written"), {
                code: "ENOENT",
              });
            await fs.access(target);
          },
        }),
      /campaign_b_canonical_target_untracked/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Campaign-B authorization Git is isolated to its declared test image", async () => {
  const [baseTestDockerfile, authorizationDockerfile, compose] =
    await Promise.all([
      fs.readFile(path.join(repo, "docker/test/Dockerfile"), "utf8"),
      fs.readFile(
        path.join(repo, "docker/test/t201-authorization.Dockerfile"),
        "utf8",
      ),
      fs.readFile(path.join(repo, "compose.yml"), "utf8"),
    ]);
  assert.doesNotMatch(baseTestDockerfile, /install[^\n]*\bgit\b/);
  assert.match(
    authorizationDockerfile,
    /install --yes --no-install-recommends git/,
  );
  assert.match(
    compose,
    /t201-authorization-test:[\s\S]*docker\/test\/t201-authorization\.Dockerfile/,
  );
  for (const runtimeDockerfile of [
    "docker/web/Dockerfile",
    "docker/api/Dockerfile",
    "docker/worker/Dockerfile",
  ])
    assert.doesNotMatch(
      await fs.readFile(path.join(repo, runtimeDockerfile), "utf8"),
      /install[^\n]*\bgit\b/,
    );
});

test("registry-backed attempts remain bounded and use distinct evidence paths", () => {
  assert.ok(registry.authorized_attempts.length > 0);
  const evidencePaths = new Set();
  for (const authorization of registry.authorized_attempts) {
    assert.equal(authorization.maximum_live_broker_runs, 1);
    assert.equal(authorization.maximum_semantic_backend_requests, 1);
    assert.equal(authorization.automatic_retries, 0);
    assert.match(authorization.attempt, /^B[0-9]{2,}$/);
    assert.equal(evidencePaths.has(authorization.evidence), false);
    evidencePaths.add(authorization.evidence);
  }
});

test("canonical execution body has no attempt-specific authorization logic", async () => {
  const body = await fs.readFile(
    path.join(root, "run-t201-live-execute.sh"),
    "utf8",
  );
  assert.doesNotMatch(body, /\bB(?:01|02|03)\b/);
  assert.doesNotMatch(body, /authorized-B/);
  assert.doesNotMatch(body, /run-t201-live\.sh/);
});

test("canonical Campaign-B execution graph remains explicit and acyclic", async () => {
  const [entrypoint, runner, body] = await Promise.all([
    fs.readFile(path.join(root, "run-t201-live.sh"), "utf8"),
    fs.readFile(path.join(root, "t201-campaign-b-runner.mjs"), "utf8"),
    fs.readFile(path.join(root, "run-t201-live-execute.sh"), "utf8"),
  ]);
  assert.match(entrypoint, /t201-campaign-b-runner\.mjs/);
  assert.match(runner, /run-t201-live-execute\.sh/);
  assert.doesNotMatch(body, /t201-campaign-b-runner\.mjs|run-t201-live\.sh/);
});

test("exact public entrypoint completes a registry-backed credential-free rehearsal without a historical attempt", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-campaign-b-rehearsal-"),
  );
  const repoRoot = path.join(directory, "repo");
  const copiedRoot = path.join(repoRoot, "spikes", "codex-direct-oauth");
  const dockerLog = path.join(directory, "docker.log");
  const docker = path.join(directory, "docker");
  const rehearsal = {
    ...contract,
    attempt: "B99",
    evidence:
      "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-c02-b99-semantic-parsing.json",
  };
  const image = `sha256:${"a".repeat(64)}`;
  const dockerScript = `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$NUVITAE_TEST_DOCKER_LOG"
all="$*"
case "$all" in
  *"image inspect"*"--format"*) printf '%s\\n' '${image}' ;;
  *"image inspect"*) printf '%s\\n' '[{"Id":"${image}","Config":{"User":"spike"}}]' ;;
  *" build "*|build\\ *) : ;;
  *" config --format json"*) printf '%s\\n' '{"services":{"t201-semantic":{"image":"${image}","network_mode":"none"},"t201-result-reader":{"image":"${image}","network_mode":"none"}}}' ;;
  inspect\\ *|*" inspect "*) printf '%s\\n' '[{"Image":"${image}","HostConfig":{"NetworkMode":"none"},"Mounts":[{"Destination":"/spike/result","RW":true}]}]' ;;
  wait\\ *|*" wait "*) printf '0\\n' ;;
  start\\ --attach\\ *reader*|*" start --attach "*reader*) printf '%s\\n' 'safe_result_reader_success:1000:1000:600:same_filesystem' >&2 ;;
  cp\\ *|*" cp "*) for last; do :; done; printf '%s\\n' '{"probe":"t201_live_result_channel","semantic_invocation_attempted":false,"identity":{"uid":1000,"gid":1000},"records":[{"operation":"stat_result_mount","after":{"uid":1000,"gid":1000,"mode":448}}],"first_failure":null}' > "$last" ;;
  *) : ;;
esac
`;
  await fs.cp(root, copiedRoot, {
    recursive: true,
    filter: (target) => !target.includes(`${path.sep}.tmp`),
  });
  await fs.writeFile(
    path.join(copiedRoot, "campaign-b-authorizations.json"),
    JSON.stringify({ schema_version: 1, authorized_attempts: [rehearsal] }),
  );
  await fs.writeFile(docker, dockerScript, { mode: 0o700 });
  assert.equal((await run("git", ["init"], { cwd: repoRoot })).code, 0);
  assert.equal(
    (
      await run(
        "git",
        [
          "add",
          "spikes/codex-direct-oauth/run-t201-live.sh",
          "spikes/codex-direct-oauth/t201-campaign-b-runner.mjs",
          "spikes/codex-direct-oauth/run-t201-live-execute.sh",
        ],
        { cwd: repoRoot },
      )
    ).code,
    0,
  );
  const result = await run(
    "sh",
    [path.join(copiedRoot, "run-t201-live.sh"), ...argv(rehearsal)],
    {
      cwd: copiedRoot,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        NUVITAE_TEST_DOCKER_LOG: dockerLog,
        NUVITAE_T201_CREDENTIAL_FREE_REHEARSAL: "1",
      },
    },
  );
  const calls = await fs.readFile(dockerLog, "utf8");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /"attempt":"B99"/);
  assert.match(result.stdout, /"semantic_backend_requests":0/);
  assert.doesNotMatch(
    calls,
    /(?:\/run\/t199-key|\/spike\/credentials|OAUTH|OPENAI_API_KEY)/,
  );
  assert.equal((calls.match(/^build /gm) ?? []).length, 1);
  assert.match(calls, /^build --pull=false /m);
  assert.doesNotMatch(calls, /^pull /m);
  await assert.rejects(
    () => fs.access(path.join(repoRoot, rehearsal.evidence)),
    { code: "ENOENT" },
  );
  await fs.rm(directory, { recursive: true, force: true });
});
