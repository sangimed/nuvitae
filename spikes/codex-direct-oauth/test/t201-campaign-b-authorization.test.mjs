import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseCampaignBAttemptArguments, validateCampaignBAuthorization } from "../lib/t201-campaign-b-authorization.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");
const contract = Object.freeze({
  campaign: "T201-C02-B",
  attempt: "B03",
  semantic_case: "T201-C02",
  fixture: "spikes/codex-direct-oauth/fixtures/t201-matrix/t201-c02.txt",
  manifest: "spikes/codex-direct-oauth/fixtures/t201-matrix/t201-c02.manifest.json",
  evidence: "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-c02-b03-semantic-parsing.json",
  maximum_live_broker_runs: 1,
  maximum_semantic_backend_requests: 1,
  automatic_retries: 0,
});
const argv = (value = contract) => ["--campaign", value.campaign, "--attempt", value.attempt, "--semantic-case", value.semantic_case, "--fixture", value.fixture, "--manifest", value.manifest, "--evidence", value.evidence, "--max-broker-runs", String(value.maximum_live_broker_runs), "--max-semantic-backend-requests", String(value.maximum_semantic_backend_requests), "--automatic-retries", String(value.automatic_retries)];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = []; const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
  });
}

test("Campaign B parses only a complete explicit generic attempt contract", () => {
  assert.deepEqual(parseCampaignBAttemptArguments(argv()), contract);
  assert.throws(() => parseCampaignBAttemptArguments(argv().slice(0, -2)), /campaign_b_explicit_contract_required/);
  assert.throws(() => parseCampaignBAttemptArguments([...argv(), "--attempt", "B04"]), /campaign_b_invalid_arguments/);
});

test("registry authorizes only its declared attempt and binds matrix artifacts", async () => {
  const authorized = await validateCampaignBAuthorization({ root, invocation: parseCampaignBAttemptArguments(argv()) });
  assert.equal(authorized.attempt, contract.attempt);
  assert.equal(authorized.fixture_path, path.join(repo, contract.fixture));
  await assert.rejects(() => validateCampaignBAuthorization({ root, invocation: parseCampaignBAttemptArguments(argv({ ...contract, attempt: "B99" })) }), /campaign_b_attempt_not_authorized/);
  await assert.rejects(() => validateCampaignBAuthorization({ root, invocation: parseCampaignBAttemptArguments(argv({ ...contract, attempt: "B01" })) }), /campaign_b_attempt_not_authorized/);
  await assert.rejects(() => validateCampaignBAuthorization({ root, invocation: parseCampaignBAttemptArguments(argv({ ...contract, attempt: "B02" })) }), /campaign_b_attempt_not_authorized/);
  await assert.rejects(() => validateCampaignBAuthorization({ root, invocation: parseCampaignBAttemptArguments(argv({ ...contract, campaign: "T201-C02-A", attempt: "A07" })) }), /campaign_b_attempt_not_authorized/);
  await assert.rejects(() => validateCampaignBAuthorization({ root, invocation: parseCampaignBAttemptArguments(argv({ ...contract, fixture: "spikes/codex-direct-oauth/fixtures/t201-matrix/t201-c03.txt" })) }), /campaign_b_contract_mismatch_fixture/);
  await assert.rejects(() => validateCampaignBAuthorization({ root, invocation: parseCampaignBAttemptArguments(argv({ ...contract, evidence: "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-semantic-parsing.json" })) }), /campaign_b_contract_mismatch_evidence/);
});

test("registry rejects reused evidence, multiple requests, retries, and a missing canonical target before Docker", async () => {
  const reused = { authorized_attempts: [{ ...contract, evidence: "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-c02-b01-semantic-parsing.json", fixture_sha256: sha256(await fs.readFile(path.join(repo, contract.fixture))), manifest_sha256: sha256(await fs.readFile(path.join(repo, contract.manifest))) }], schema_version: 1 };
  await assert.rejects(() => validateCampaignBAuthorization({ root, registry: reused, invocation: parseCampaignBAttemptArguments(argv(reused.authorized_attempts[0])) }), /campaign_b_evidence_path_reused/);
  const unsafeTwoRequests = { schema_version: 1, authorized_attempts: [{ ...reused.authorized_attempts[0], evidence: contract.evidence, maximum_semantic_backend_requests: 2 }] };
  await assert.rejects(() => validateCampaignBAuthorization({ root, registry: unsafeTwoRequests, invocation: parseCampaignBAttemptArguments(argv(unsafeTwoRequests.authorized_attempts[0])) }), /campaign_b_single_request_required/);
  const unsafeRetry = { schema_version: 1, authorized_attempts: [{ ...reused.authorized_attempts[0], evidence: contract.evidence, automatic_retries: 1 }] };
  await assert.rejects(() => validateCampaignBAuthorization({ root, registry: unsafeRetry, invocation: parseCampaignBAttemptArguments(argv(unsafeRetry.authorized_attempts[0])) }), /campaign_b_retries_disabled_required/);
  await assert.rejects(() => validateCampaignBAuthorization({ root, invocation: parseCampaignBAttemptArguments(argv()), exists: async (target) => { if (String(target).endsWith("run-t201-live-execute.sh")) throw Object.assign(new Error("missing"), { code: "ENOENT" }); await fs.access(target); } }), /campaign_b_canonical_target_missing/);
});

test("canonical execution body has no attempt-specific authorization logic", async () => {
  const body = await fs.readFile(path.join(root, "run-t201-live-execute.sh"), "utf8");
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

test("exact public entrypoint completes the authorized credential-free rehearsal without B03 evidence", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nuvitae-campaign-b-rehearsal-"));
  const dockerLog = path.join(directory, "docker.log");
  const docker = path.join(directory, "docker");
  const image = `sha256:${"a".repeat(64)}`;
  const script = `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$NUVITAE_TEST_DOCKER_LOG"
all="$*"
case "$all" in
  *"image inspect"*"--format"*) printf '%s\\n' '${image}' ;;
  *"image inspect"*) printf '%s\\n' '[{"Id":"${image}","Config":{"User":"spike"}}]' ;;
  *" build "*|build\\ *) : ;;
  *" config --format json"*) printf '%s\\n' '{"services":{"t201-semantic":{},"t201-result-reader":{}}}' ;;
  inspect\\ *|*" inspect "*) printf '%s\\n' '[{"Image":"${image}","Mounts":[{"Destination":"/spike/result","RW":true}]}]' ;;
  wait\\ *|*" wait "*) printf '0\\n' ;;
  start\\ --attach\\ *reader*|*" start --attach "*reader*) printf '%s\\n' 'safe_result_reader_success:1000:1000:600:same_filesystem' >&2 ;;
  cp\\ *|*" cp "*) for last; do :; done; printf '%s\\n' '{"probe":"t201_live_result_channel","semantic_invocation_attempted":false,"identity":{"uid":1000,"gid":1000},"records":[{"operation":"stat_result_mount","after":{"uid":1000,"gid":1000,"mode":448}}],"first_failure":null}' > "$last" ;;
  *) : ;;
esac
`;
  await fs.writeFile(docker, script, { mode: 0o700 });
  const result = await run("sh", [path.join(root, "run-t201-live.sh"), ...argv()], {
    cwd: root,
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, NUVITAE_TEST_DOCKER_LOG: dockerLog, NUVITAE_T201_CREDENTIAL_FREE_REHEARSAL: "1" },
  });
  const calls = await fs.readFile(dockerLog, "utf8");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /"attempt":"B03"/);
  assert.match(result.stdout, /"semantic_backend_requests":0/);
  assert.doesNotMatch(calls, /(?:\/run\/t199-key|\/spike\/credentials|OAUTH|OPENAI_API_KEY)/);
  assert.equal((calls.match(/^build /gm) ?? []).length, 1);
  assert.match(calls, /^build --pull=false /m);
  assert.doesNotMatch(calls, /^pull /m);
  assert.match(calls, /t201-semantic/);
  assert.match(calls, /t201-result-reader/);
  await assert.rejects(() => fs.access(path.join(repo, contract.evidence)), { code: "ENOENT" });
});
