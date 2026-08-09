import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { classifyDockerFailure, runCredentialFreePreflight, splitDockerAttachOutput } from "../lib/t201-preflight-diagnostics.mjs";

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const runId = "f".repeat(32);
const root = path.resolve(path.dirname(new URL("../compose.yml", import.meta.url).pathname));
const imageId = `sha256:${"a".repeat(64)}`;
const preparedImage = { reference: imageId, identity_hash: digest(imageId), declared_runtime_user_hash: digest("spike") };
const composeConfig = () => ({ services: { "t201-semantic": { image: imageId, network_mode: "none" }, "t201-result-reader": { image: imageId, network_mode: "none" } } });

function commandResult({ exitCode = 0, stdout = "", stderr = "", processStarted = true, timedOut = false } = {}) {
  return {
    process_started: processStarted,
    timed_out: timedOut,
    exit_code: exitCode,
    stdout,
    stderr,
    stdout_byte_count: Buffer.byteLength(stdout),
    stderr_byte_count: Buffer.byteLength(stderr),
    stdout_hash: digest(Buffer.from(stdout).subarray(0, 65536)),
    stderr_hash: digest(Buffer.from(stderr).subarray(0, 65536)),
  };
}

function probe() {
  return {
    probe: "t201_live_result_channel",
    semantic_invocation_attempted: false,
    identity: { uid: 1000, gid: 1000 },
    records: [{ operation: "stat_result_mount", after: { uid: 1000, gid: 1000, mode: 0o700 } }],
    first_failure: null,
  };
}

function successfulExecutor() {
  let inspectCalls = 0;
  return async ({ args }) => {
    if (args.includes("config")) return commandResult({ stdout: JSON.stringify(composeConfig()) });
    if (args.includes("image") && args.includes("inspect")) return commandResult({ stdout: JSON.stringify([{ Id: imageId, Config: { User: "spike" } }]) });
    if (args.includes("inspect")) {
      inspectCalls += 1;
      return commandResult({ stdout: JSON.stringify([{ Image: imageId, HostConfig: { NetworkMode: "none" }, Mounts: [{ Destination: "/spike/result", RW: true }] }]) });
    }
    if (args.includes("wait")) return commandResult({ stdout: "0\n" });
    if (args.includes("cp")) {
      await fs.writeFile(args.at(-1), JSON.stringify(probe()));
      return commandResult();
    }
    if (args.includes("start")) return commandResult({ stdout: args.some((value) => String(value).includes("reader")) ? "" : `${JSON.stringify(probe())}\n`, stderr: args.some((value) => String(value).includes("reader")) ? "safe_result_reader_success:1000:1000:600:same_filesystem\n" : "safe diagnostic only\n" });
    assert.ok(inspectCalls >= 0);
    return commandResult();
  };
}

async function withOutput(testBody) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nuvitae-t201-preflight-test-"));
  const outputPath = path.join(directory, "result.json");
  try { await testBody(outputPath); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

test("credential-free preflight records the complete inspectable success lifecycle without credentials", async () => {
  await withOutput(async (outputPath) => {
    const result = await runCredentialFreePreflight({ root, outputPath, runId, preparedImage, execute: successfulExecutor() });
    assert.equal(result.success, true);
    assert.equal(result.first_failure_operation, null);
    assert.equal(result.fresh_image_identity_hash, result.created_container_image_identity_hash);
    assert.equal(result.fresh_image_identity_hash, result.launched_container_image_identity_hash);
    assert.equal(result.fresh_image_identity_hash, result.reader_created_container_image_identity_hash);
    assert.equal(result.fresh_image_identity_hash, result.reader_launched_container_image_identity_hash);
    assert.equal(result.stale_image_detected, false);
    assert.equal(result.effective_uid, 1000);
    assert.equal(result.effective_gid, 1000);
    assert.equal(result.reader_effective_uid, 1000);
    assert.equal(result.reader_effective_gid, 1000);
    assert.equal(result.result_mount_present, true);
    assert.equal(result.result_mount_read_write, true);
    assert.equal(result.cleanup_container_removed, true);
    assert.equal(result.cleanup_volume_removed, true);
    assert.equal(result.preserved_credentials_mounted, false);
    assert.equal(result.semantic_invocation_attempted, false);
    assert.equal(result.broker_network_isolated, true);
    assert.equal(result.reader_network_isolated, true);
    assert.deepEqual(JSON.parse(await fs.readFile(outputPath, "utf8")), result);
    assert.equal(result.operations.some((operation) => operation.operation === "preflight_container_start"), true);
    assert.equal(result.operations.every((operation) => typeof operation.stdout_hash === "string" && typeof operation.stderr_hash === "string"), true);
  });
});

test("injected startup failure retains the first operation, safe exit code, null downstream values, and cleanup", async () => {
  await withOutput(async (outputPath) => {
    const result = await runCredentialFreePreflight({
      root, outputPath, runId, preparedImage, execute: successfulExecutor(), injectFailure: "preflight_container_start",
    });
    assert.equal(result.success, false);
    assert.equal(result.first_failure_operation, "preflight_container_start");
    assert.equal(result.first_failure_exit_code, 73);
    assert.equal(result.first_failure_category, "container_start_failure");
    assert.equal(result.container_created, true);
    assert.equal(result.container_started, false);
    assert.equal(result.container_exit_code, null);
    assert.equal(result.launched_container_image_identity_hash, null);
    assert.equal(result.effective_uid, null);
    assert.equal(result.filesystem_probe_completed, null);
    assert.equal(result.cleanup_container_removed, true);
    assert.equal(result.cleanup_volume_removed, true);
    assert.equal(JSON.parse(await fs.readFile(outputPath, "utf8")).first_failure_operation, "preflight_container_start");
  });
});

test("process-start failure writes evidence before returning nonzero and does not fabricate downstream state", async () => {
  await withOutput(async (outputPath) => {
    const result = await runCredentialFreePreflight({
      root,
      outputPath,
      runId,
      preparedImage, execute: async () => commandResult({ processStarted: false, exitCode: null, stderr: "ENOENT" }),
    });
    assert.equal(result.success, false);
    assert.equal(result.first_failure_operation, "compose_config_resolution");
    assert.equal(result.first_failure_category, "command_not_found");
    assert.equal(result.container_created, false);
    assert.equal(result.container_started, null);
    assert.equal(result.created_container_image_identity_hash, null);
    assert.equal(result.evidence_written, true);
    assert.equal(JSON.parse(await fs.readFile(outputPath, "utf8")).success, false);
  });
});

test("sanitized Docker and Compose categories are deterministic", () => {
  const cases = [
    [{ processStarted: false }, "command_not_found"],
    [{ stderr: "Cannot connect to the Docker daemon", operation: "preflight_container_creation" }, "daemon_unavailable"],
    [{ stderr: "permission denied while trying to connect", operation: "preflight_container_creation" }, "permission_denied"],
    [{ stderr: "No such image", operation: "fresh_image_inspection" }, "image_not_found"],
    [{ stderr: "pull access denied", operation: "fresh_image_inspection" }, "image_pull_required_or_denied"],
    [{ stderr: "validating compose file", operation: "compose_config_resolution" }, "invalid_compose_configuration"],
    [{ stderr: "no such service: missing", operation: "compose_config_resolution" }, "unknown_service"],
    [{ stderr: "daemon error", operation: "preflight_container_creation" }, "container_create_failure"],
    [{ stderr: "daemon error", operation: "preflight_container_start" }, "container_start_failure"],
    [{ stderr: "daemon error", operation: "preflight_container_wait" }, "container_runtime_failure"],
    [{ stderr: "volume create failed", operation: "diagnostic_volume_creation_result" }, "volume_create_failure"],
    [{ stderr: "mount failed", operation: "preflight_container_creation" }, "mount_failure"],
    [{ stderr: "not inspectable", operation: "launched_image_verification" }, "inspection_failure"],
    [{ timedOut: true, operation: "preflight_container_start" }, "timeout"],
    [{ stderr: "cleanup failed", operation: "preflight_container_removal" }, "cleanup_failure"],
    [{ stderr: "unrecognized", operation: "something_else" }, "unknown_docker_failure"],
  ];
  for (const [input, expected] of cases) assert.equal(classifyDockerFailure(input), expected);
});

test("Docker attach framing is decoded before strict JSON parsing and keeps streams separate", () => {
  const stdout = Buffer.from('{"safe":true}\n');
  const stderr = Buffer.from("safe diagnostic\n");
  const frame = (stream, payload) => Buffer.concat([Buffer.from([stream, 0, 0, 0, 0, 0, 0, payload.length]), payload]);
  const parsed = splitDockerAttachOutput(Buffer.concat([frame(1, stdout), frame(2, stderr)]).toString("utf8"));
  assert.equal(parsed.multiplexed, true);
  assert.equal(parsed.stdout.toString("utf8"), stdout.toString("utf8"));
  assert.equal(parsed.stderr.toString("utf8"), stderr.toString("utf8"));
});

test("empty JSON, malformed JSON, mixed Compose progress, stderr diagnostics, and cleanup cannot hide failure", async () => {
  await withOutput(async (outputPath) => {
    const empty = await runCredentialFreePreflight({
      root, outputPath, runId, preparedImage, execute: async ({ args }) => args.includes("config") ? commandResult({ stdout: "" }) : commandResult(),
    });
    assert.equal(empty.first_failure_category, "empty_structured_output");
  });
  await withOutput(async (outputPath) => {
    const mixed = await runCredentialFreePreflight({
      root, outputPath, runId, preparedImage, execute: async ({ args }) => args.includes("config") ? commandResult({ stdout: "progress\n{}\n" }) : commandResult(),
    });
    assert.equal(mixed.first_failure_category, "malformed_structured_output");
  });
  await withOutput(async (outputPath) => {
    const result = await runCredentialFreePreflight({ root, outputPath, runId, preparedImage, execute: successfulExecutor(), injectFailure: "preflight_container_start" });
    assert.equal(result.cleanup_container_removed, true);
    assert.equal(result.first_failure_operation, "preflight_container_start");
  });
});
