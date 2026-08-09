import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { executeDockerCommand } from "./lib/t201-preflight-diagnostics.mjs";
import { prepareImmutableT201Image } from "./lib/t201-image-contract.mjs";
import { containsSecretLikeValue } from "./lib/sanitize.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

function runDiagnostic(image) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "compose",
        "run",
        "--rm",
        "--no-deps",
        "t201-credential-recovery-diagnostic",
      ],
      {
        cwd: root,
        env: { ...process.env, NUVITAE_T201_IMMUTABLE_IMAGE: image },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      }),
    );
  });
}

try {
  const prepared = await prepareImmutableT201Image({
    root,
    execute: executeDockerCommand,
  });
  const result = await runDiagnostic(prepared.reference);
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1)
    throw new Error("credential_recovery_diagnostic_output_invalid");
  const diagnostic = JSON.parse(lines[0]);
  if (containsSecretLikeValue(JSON.stringify(diagnostic)))
    throw new Error("credential_recovery_diagnostic_secret_like_output");
  process.stdout.write(`${JSON.stringify(diagnostic)}\n`);
  process.exitCode = result.code;
} catch {
  process.stdout.write(
    `${JSON.stringify({ failure_stage: "diagnostic_runner", safe_failure_category: "diagnostic_runner_failure" })}\n`,
  );
  process.exitCode = 1;
}
