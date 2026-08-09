import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeDockerCommand, runCredentialFreePreflight } from "./lib/t201-preflight-diagnostics.mjs";
import { prepareImmutableT201Image, safePreparedImageEvidence, T201_IMMUTABLE_IMAGE_ENV, validateCampaignBExecutionEntrypoint, verifyPreparedT201Image } from "./lib/t201-image-contract.mjs";
import { parseCampaignBAttemptArguments, validateCampaignBAuthorization } from "./lib/t201-campaign-b-authorization.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  await validateCampaignBExecutionEntrypoint({ root });
  const invocation = parseCampaignBAttemptArguments(process.argv.slice(2));
  const authorization = await validateCampaignBAuthorization({ root, invocation });
  const preparedImage = await prepareImmutableT201Image({ root, execute: executeDockerCommand });
  const preflightImage = process.env.NUVITAE_T201_CAMPAIGN_B_INJECT_IMAGE_MISMATCH === "1"
    ? { ...preparedImage, reference: `${preparedImage.reference.slice(0, -1)}${preparedImage.reference.endsWith("0") ? "1" : "0"}` }
    : preparedImage;
  const rehearsalOutput = process.env.NUVITAE_T201_CREDENTIAL_FREE_REHEARSAL === "1"
    ? path.join(root, ".tmp", `t201-campaign-b-rehearsal-${process.pid}.json`)
    : undefined;
  let preflight;
  try {
    preflight = await runCredentialFreePreflight({ root, outputPath: rehearsalOutput, execute: executeDockerCommand, preparedImage: preflightImage });
  } finally {
    if (rehearsalOutput) await fs.rm(rehearsalOutput, { force: true });
  }

  if (!preflight.success) {
    process.stdout.write(`${JSON.stringify({ campaign: authorization.campaign, attempt: authorization.attempt, phase: "credential_free_preflight", success: false, ...safePreparedImageEvidence(preparedImage) })}\n`);
    process.exitCode = 1;
  } else {
    await verifyPreparedT201Image({ root, execute: executeDockerCommand, preparedImage });
    const child = spawn("sh", ["./run-t201-live-execute.sh"], {
      cwd: root,
      env: {
        ...process.env,
        [T201_IMMUTABLE_IMAGE_ENV]: preparedImage.reference,
        NUVITAE_T201_CAMPAIGN_ID: authorization.campaign,
        NUVITAE_T201_ATTEMPT_ID: authorization.attempt,
        NUVITAE_T201_CASE_ID: authorization.semantic_case,
        NUVITAE_T201_FIXTURE_PATH: authorization.fixture_path,
        NUVITAE_T201_MANIFEST_PATH: authorization.manifest_path,
        NUVITAE_T201_EVIDENCE_PATH: authorization.evidence_path,
        NUVITAE_T201_MAX_BROKER_RUNS: String(authorization.maximum_live_broker_runs),
        NUVITAE_T201_MAX_SEMANTIC_BACKEND_REQUESTS: String(authorization.maximum_semantic_backend_requests),
        NUVITAE_T201_AUTOMATIC_RETRIES: String(authorization.automatic_retries),
      },
      stdio: "inherit",
      shell: false,
    });
    process.exitCode = await new Promise((resolve) => child.once("close", (code) => resolve(code ?? 1)));
  }
} catch (error) {
  process.stderr.write(`campaign_b_authorization_failed:${error?.code ?? "UNKNOWN"}\n`);
  process.exitCode = 1;
}
