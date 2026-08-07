// T246 live/preflight orchestration bridge.
//
// This is the smallest secure bridge from the T246 authorization contract
// into the qualified T201 live infrastructure: it validates the T246
// authorization, regenerates and verifies the accepted deterministic
// transcript, prepares the immutable spike image, runs the T201 credential-
// free preflight, verifies the prepared image identity, and then executes the
// T246 execution body (rehearsal for `preflight`, live for `live`). All
// dependencies are injectable so offline tests can prove the whole path with
// fakes at the provider/credential boundary. No credential volume is mounted
// and no provider request is made in `preflight` mode.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { validateT246Authorization } from "./t246-authorization.mjs";
import { collectT246CaseProof } from "./t246-corpus-verification.mjs";
import {
  prepareImmutableT201Image,
  verifyPreparedT201Image,
  T201_IMMUTABLE_IMAGE_ENV,
} from "./t201-image-contract.mjs";
import {
  executeDockerCommand,
  runCredentialFreePreflight,
} from "./t201-preflight-diagnostics.mjs";

export const T246_EXECUTION_ENTRYPOINT = "run-t246-live-execute.sh";

export function t246ContainerManifestPath(authorization) {
  return String(authorization.manifest).replace(
    /^spikes\/codex-direct-oauth\//,
    "",
  );
}

async function writeTranscriptFile({ lines }) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t246-transcript-"),
  );
  const transcriptPath = path.join(directory, "transcript.txt");
  await fs.writeFile(transcriptPath, lines.join("\n"), { mode: 0o600 });
  return {
    transcriptPath,
    cleanup: () => fs.rm(directory, { recursive: true, force: true }),
  };
}

function validateEntrypoint(root, exists = fs.access) {
  return exists(path.join(root, T246_EXECUTION_ENTRYPOINT));
}

export async function runT246LiveBridge({
  root,
  invocation,
  mode,
  validateAuthorization = validateT246Authorization,
  collectProof = collectT246CaseProof,
  prepareImage = prepareImmutableT201Image,
  runPreflight = runCredentialFreePreflight,
  verifyImage = verifyPreparedT201Image,
  executeDocker = executeDockerCommand,
  spawnExecute,
  writeTranscript = writeTranscriptFile,
  entrypointExists = validateEntrypoint,
  environment = process.env,
} = {}) {
  if (mode !== "preflight" && mode !== "live") {
    throw new Error("t246_bridge_mode_required");
  }
  const authorization = await validateAuthorization({ root, invocation });
  await entrypointExists(root);
  const proof = await collectProof({ caseId: invocation.semantic_case });
  if (invocation.semantic_case === "T246-C08") {
    throw new Error("t246_recovery_case_requires_no_live_bridge");
  }
  const transcript = await writeTranscript({ lines: proof.lines });
  try {
    const preparedImage = await prepareImage({
      root,
      execute: executeDocker,
    });
    const preflight = await runPreflight({
      root,
      preparedImage,
      execute: executeDocker,
    });
    if (!preflight.success) {
      return {
        success: false,
        mode,
        phase: "credential_free_preflight",
        preflight,
      };
    }
    await verifyImage({ root, preparedImage, execute: executeDocker });
    const baseEnv = {
      ...environment,
      [T201_IMMUTABLE_IMAGE_ENV]: preparedImage.reference,
      NUVITAE_T246_IMMUTABLE_IMAGE: preparedImage.reference,
      NUVITAE_T246_CAMPAIGN_ID: authorization.campaign,
      NUVITAE_T246_ATTEMPT_ID: authorization.attempt,
      NUVITAE_T246_CASE_ID: authorization.semantic_case,
      NUVITAE_T246_FIXTURE_PATH: path.resolve(authorization.fixture_path),
      NUVITAE_T246_MANIFEST_PATH: t246ContainerManifestPath(authorization),
      NUVITAE_T246_TRANSCRIPT_PATH: transcript.transcriptPath,
      NUVITAE_T246_EVIDENCE_PATH: authorization.evidence,
      NUVITAE_T246_FIXTURE_SHA256: authorization.fixture_sha256,
      NUVITAE_T246_TRANSCRIPT_SHA256: authorization.transcript_sha256,
      NUVITAE_T246_MANIFEST_SHA256: authorization.manifest_sha256,
      NUVITAE_T246_MAX_BROKER_RUNS: String(
        authorization.maximum_live_broker_runs,
      ),
      NUVITAE_T246_MAX_SEMANTIC_BACKEND_REQUESTS: String(
        authorization.maximum_semantic_backend_requests,
      ),
      NUVITAE_T246_AUTOMATIC_RETRIES: String(authorization.automatic_retries),
    };
    if (mode === "preflight") {
      baseEnv.NUVITAE_T246_CREDENTIAL_FREE_REHEARSAL = "1";
    }
    const execute =
      spawnExecute ??
      (({ env }) =>
        new Promise((resolve) => {
          const child = spawn("sh", [T246_EXECUTION_ENTRYPOINT], {
            cwd: root,
            env,
            stdio: "inherit",
            shell: false,
          });
          child.once("close", (code) => resolve(code ?? 1));
        }));
    const exitCode = await execute({ env: baseEnv, cwd: root });
    return {
      success: exitCode === 0,
      mode,
      phase: mode === "live" ? "live_execution" : "credential_free_rehearsal",
      exitCode,
      authorization,
      preflight,
      transcript_sha256: authorization.transcript_sha256,
      fixture_sha256: authorization.fixture_sha256,
      manifest_sha256: authorization.manifest_sha256,
    };
  } finally {
    await transcript.cleanup();
  }
}
