import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeDockerCommand, runCredentialFreePreflight } from "./lib/t201-preflight-diagnostics.mjs";
import { prepareImmutableT201Image, safePreparedImageEvidence, T201_IMMUTABLE_IMAGE_ENV, verifyPreparedT201Image } from "./lib/t201-image-contract.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const preparedImage = await prepareImmutableT201Image({ root, execute: executeDockerCommand });
const preflightImage = process.env.NUVITAE_T201_CAMPAIGN_B_INJECT_IMAGE_MISMATCH === "1"
  ? { ...preparedImage, reference: `${preparedImage.reference.slice(0, -1)}${preparedImage.reference.endsWith("0") ? "1" : "0"}` }
  : preparedImage;
const preflight = await runCredentialFreePreflight({ root, execute: executeDockerCommand, preparedImage: preflightImage });

if (!preflight.success) {
  process.stdout.write(`${JSON.stringify({ campaign: "T201-C02-B", phase: "credential_free_preflight", success: false, ...safePreparedImageEvidence(preparedImage) })}\n`);
  process.exitCode = 1;
} else {
  await verifyPreparedT201Image({ root, execute: executeDockerCommand, preparedImage });
  // B01 is intentionally not enabled by this preparation work. Its future
  // runner receives the ID only through this child process environment.
  if (process.env.NUVITAE_T201_CAMPAIGN_B_EXECUTE !== "authorized-B01") {
    process.stdout.write(`${JSON.stringify({ campaign: "T201-C02-B", phase: "ready_for_future_B01_only", success: true, ...safePreparedImageEvidence(preparedImage) })}\n`);
  } else {
    const child = spawn("sh", ["./run-t201-live-execute.sh"], {
      cwd: root,
      env: { ...process.env, [T201_IMMUTABLE_IMAGE_ENV]: preparedImage.reference },
      stdio: "inherit",
      shell: false,
    });
    process.exitCode = await new Promise((resolve) => child.once("close", (code) => resolve(code ?? 1)));
  }
}
