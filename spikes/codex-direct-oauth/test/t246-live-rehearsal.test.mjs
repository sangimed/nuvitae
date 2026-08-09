import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { collectT246CaseProof } from "../lib/t246-corpus-verification.mjs";

const execFileAsync = promisify(execFile);
const spikeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(spikeRoot, "../..");

async function run(command, args, options) {
  const result = await execFileAsync(command, args, options);
  return { code: 0, stdout: result.stdout, stderr: result.stderr };
}

test("T246 credential-free rehearsal through the public entrypoint touches no credential volume and writes no evidence", async () => {
  const proof = await collectT246CaseProof({ caseId: "T246-C01" });
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t246-rehearsal-"),
  );
  const repoCopy = path.join(directory, "repo");
  const copiedRoot = path.join(repoCopy, "spikes", "codex-direct-oauth");
  const dockerLog = path.join(directory, "docker.log");
  const docker = path.join(directory, "docker");
  const transcriptPath = path.join(directory, "transcript.txt");
  const evidencePath = path.join(
    directory,
    "codex-direct-oauth-t246-c01-a01-semantic-parsing.json",
  );
  const image = `sha256:${"e".repeat(64)}`;
  await fs.writeFile(transcriptPath, proof.transcript, { mode: 0o600 });
  const dockerScript = `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$NUVITAE_TEST_DOCKER_LOG"
case "$*" in
  *"image inspect"*"--format"*) printf '%s\\n' '${image}' ;;
  *) : ;;
esac
`;
  await fs.cp(repoRoot, repoCopy, {
    recursive: true,
    filter: (target) =>
      !target.includes(`${path.sep}.git`) &&
      !target.includes(`${path.sep}node_modules`) &&
      !target.includes(`${path.sep}.tmp`) &&
      !target.includes(`${path.sep}dist`) &&
      !target.includes(`${path.sep}.next`) &&
      !target.includes(`${path.sep}test-results`),
  });
  await fs.writeFile(docker, dockerScript, { mode: 0o700 });
  const result = await run(
    "/bin/sh",
    [path.join(copiedRoot, "run-t246-live-execute.sh")],
    {
      cwd: copiedRoot,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        NUVITAE_TEST_DOCKER_LOG: dockerLog,
        NUVITAE_TEST_IMAGE: image,
        NUVITAE_T246_IMMUTABLE_IMAGE: image,
        NUVITAE_T246_CAMPAIGN_ID: "T246-C01",
        NUVITAE_T246_ATTEMPT_ID: "A01",
        NUVITAE_T246_CASE_ID: "T246-C01",
        NUVITAE_T246_FIXTURE_PATH: path.join(
          repoCopy,
          "tests",
          "fixtures",
          "resumes",
          "anonymous-french-resume.pdf",
        ),
        NUVITAE_T246_MANIFEST_PATH:
          "fixtures/t246-matrix/t246-c01.manifest.json",
        NUVITAE_T246_TRANSCRIPT_PATH: transcriptPath,
        NUVITAE_T246_EVIDENCE_PATH: evidencePath,
        NUVITAE_T246_FIXTURE_SHA256: proof.row.fixture_sha256,
        NUVITAE_T246_TRANSCRIPT_SHA256: proof.row.transcript_sha256,
        NUVITAE_T246_MANIFEST_SHA256: proof.manifestSha256,
        NUVITAE_T246_MAX_BROKER_RUNS: "1",
        NUVITAE_T246_MAX_SEMANTIC_BACKEND_REQUESTS: "1",
        NUVITAE_T246_AUTOMATIC_RETRIES: "0",
        NUVITAE_T246_CREDENTIAL_FREE_REHEARSAL: "1",
      },
    },
  );
  const calls = await fs.readFile(dockerLog, "utf8");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /"phase":"credential_free_rehearsal"/);
  assert.match(result.stdout, /"semantic_backend_requests":0/);
  assert.match(result.stdout, /"evidence_written":false/);
  assert.match(calls, /t246-live-broker\.mjs/);
  assert.doesNotMatch(
    calls,
    /(?:\/run\/t199-key|\/spike\/credentials|OAUTH|OPENAI_API_KEY)/,
  );
  await assert.rejects(() => fs.access(evidencePath), { code: "ENOENT" });
  await fs.rm(directory, { recursive: true, force: true });
});
