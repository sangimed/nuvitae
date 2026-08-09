import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertImmutableImageReference, declaredRuntimeUserIsNonRoot, T201_IMMUTABLE_IMAGE_ENV } from "./t201-image-contract.mjs";
import { parseReaderDiagnostics } from "./t201-live-runner-evidence.mjs";

const OUTPUT_HASH_LIMIT = 64 * 1024;
const SERVICE = "t201-semantic";
const RESULT_MOUNT = "/spike/result";

export const STDERR_CATEGORIES = new Set([
  "command_not_found",
  "daemon_unavailable",
  "permission_denied",
  "image_not_found",
  "image_pull_required_or_denied",
  "invalid_compose_configuration",
  "unknown_service",
  "container_create_failure",
  "container_start_failure",
  "container_runtime_failure",
  "volume_create_failure",
  "mount_failure",
  "inspection_failure",
  "timeout",
  "malformed_structured_output",
  "empty_structured_output",
  "cleanup_failure",
  "unknown_docker_failure",
]);

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safeHash = (value) => hash(Buffer.from(value).subarray(0, OUTPUT_HASH_LIMIT));
const hashIdentity = (value) => value ? hash(String(value)) : null;

function classifyText(text, operation) {
  const value = String(text ?? "").toLowerCase();
  if (value.includes("enoent") || value.includes("executable file not found")) return "command_not_found";
  if (value.includes("cannot connect to the docker daemon") || value.includes("is the docker daemon running") || value.includes("connection refused") && value.includes("docker")) return "daemon_unavailable";
  if (value.includes("permission denied") || value.includes("permission denied while trying to connect")) return "permission_denied";
  if (value.includes("pull access denied") || value.includes("pull required") || value.includes("denied: requested access")) return "image_pull_required_or_denied";
  if (value.includes("no such image") || value.includes("image not found") || value.includes("manifest unknown")) return "image_not_found";
  if (value.includes("validating ") || value.includes("compose file") || value.includes("invalid compose") || value.includes("services.") && value.includes("must be")) return "invalid_compose_configuration";
  if (value.includes("no such service") || value.includes("service ") && value.includes("not found")) return "unknown_service";
  if (value.includes("mount") && (value.includes("failed") || value.includes("error"))) return "mount_failure";
  if (operation.includes("volume") && (value.includes("create") || value.includes("volume"))) return "volume_create_failure";
  if (operation.includes("create") || operation.includes("creation")) return "container_create_failure";
  if (operation.includes("start")) return "container_start_failure";
  if (operation.includes("wait") || operation.includes("stdout") || operation.includes("stderr")) return "container_runtime_failure";
  if (operation.includes("inspect") || operation.includes("verification")) return "inspection_failure";
  if (operation.includes("removal")) return "cleanup_failure";
  return "unknown_docker_failure";
}

export function classifyDockerFailure({ stderr = "", operation, processStarted = true, timedOut = false } = {}) {
  if (timedOut) return "timeout";
  if (!processStarted) return "command_not_found";
  return classifyText(stderr, operation);
}

function boundedTextCollector() {
  let byteCount = 0;
  const chunks = [];
  let retained = 0;
  return {
    append(chunk) {
      const bytes = Buffer.from(chunk);
      byteCount += bytes.length;
      if (retained < OUTPUT_HASH_LIMIT) {
        const copy = bytes.subarray(0, OUTPUT_HASH_LIMIT - retained);
        chunks.push(copy);
        retained += copy.length;
      }
    },
    result() {
      const text = Buffer.concat(chunks).toString("utf8");
      return { byteCount, text, buffer: Buffer.concat(chunks), hash: safeHash(Buffer.concat(chunks)) };
    },
  };
}

export async function executeDockerCommand({ executable, args, cwd, timeoutMs = 30_000, env = process.env } = {}) {
  const stdout = boundedTextCollector();
  const stderr = boundedTextCollector();
  return await new Promise((resolve) => {
    let child;
    let processStarted = false;
    let timedOut = false;
    let settled = false;
    const finish = (values) => {
      if (settled) return;
      settled = true;
      const capturedStdout = stdout.result();
      const capturedStderr = stderr.result();
      resolve({
        process_started: processStarted,
        timed_out: timedOut,
        exit_code: values.exitCode ?? null,
        stdout: capturedStdout.text,
        stderr: capturedStderr.text,
        stdout_buffer: capturedStdout.buffer,
        stderr_buffer: capturedStderr.buffer,
        stdout_byte_count: capturedStdout.byteCount,
        stderr_byte_count: capturedStderr.byteCount,
        stdout_hash: capturedStdout.hash,
        stderr_hash: capturedStderr.hash,
      });
    };
    try {
      child = spawn(executable, args, { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      stderr.append(Buffer.from(String(error?.code ?? "spawn_failure")));
      finish({ exitCode: null });
      return;
    }
    child.once("spawn", () => { processStarted = true; });
    child.stdout?.on("data", (chunk) => stdout.append(chunk));
    child.stderr?.on("data", (chunk) => stderr.append(chunk));
    child.once("error", (error) => {
      stderr.append(Buffer.from(String(error?.code ?? "spawn_failure")));
      finish({ exitCode: null });
    });
    child.once("close", (exitCode) => finish({ exitCode }));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    timer.unref();
  });
}

function commandRecord(operation, executableCategory, command, expectedStructuredOutput) {
  return {
    operation,
    executable_category: executableCategory,
    command,
    expectedStructuredOutput,
  };
}

function parseExpectedOutput(value, expectation) {
  const text = String(value ?? "");
  if (expectation === "json") {
    if (text.trim() === "") return { present: false, category: "empty_structured_output", value: null };
    try { return { present: true, category: null, value: JSON.parse(text) }; } catch { return { present: false, category: "malformed_structured_output", value: null }; }
  }
  if (expectation === "integer") {
    const match = text.trim().match(/^-?\d+$/);
    return match ? { present: true, category: null, value: Number(match[0]) } : { present: false, category: text.trim() === "" ? "empty_structured_output" : "malformed_structured_output", value: null };
  }
  return { present: false, category: null, value: null };
}

// `docker start --attach` can forward Docker's eight-byte multiplex framing
// instead of a terminal-normalized stream. Decode it in memory only; the
// resulting payload is still subjected to the exact-one-JSON parser below.
export function splitDockerAttachOutput(value) {
  const source = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ""), "utf8");
  if (source.length < 8 || ![1, 2].includes(source[0]) || source[1] !== 0 || source[2] !== 0 || source[3] !== 0) {
    return { multiplexed: false, stdout: source, stderr: Buffer.alloc(0) };
  }
  const stdout = [];
  const stderr = [];
  let offset = 0;
  while (offset + 8 <= source.length) {
    const stream = source[offset];
    const length = source.readUInt32BE(offset + 4);
    const next = offset + 8 + length;
    if (![1, 2].includes(stream) || next > source.length) return { multiplexed: false, stdout: source, stderr: Buffer.alloc(0) };
    (stream === 1 ? stdout : stderr).push(source.subarray(offset + 8, next));
    offset = next;
  }
  if (offset !== source.length) return { multiplexed: false, stdout: source, stderr: Buffer.alloc(0) };
  return { multiplexed: true, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
}

function operationFailure(record) {
  if (!record.process_started || record.timed_out || record.exit_code !== 0) return true;
  return record.expected_structured_output_present === false && record.expected_structured_output_kind !== null;
}

function sanitizedCommandResult(base, raw) {
  const parsed = parseExpectedOutput(raw.stdout, base.expectedStructuredOutput);
  const commandFailed = !raw.process_started || raw.timed_out || raw.exit_code !== 0;
  const structuredOutputFailed = !commandFailed && base.expectedStructuredOutput && !parsed.present;
  const failureCategory = commandFailed
    ? classifyDockerFailure({ stderr: raw.stderr, operation: base.operation, processStarted: raw.process_started, timedOut: raw.timed_out })
    : structuredOutputFailed ? parsed.category : null;
  return {
    operation: base.operation,
    executable_category: base.executable_category,
    exit_code: raw.exit_code,
    process_started: raw.process_started,
    timed_out: raw.timed_out,
    stdout_byte_count: raw.stdout_byte_count,
    stderr_byte_count: raw.stderr_byte_count,
    stdout_hash: raw.stdout_hash,
    stderr_hash: raw.stderr_hash,
    stderr_category: failureCategory,
    expected_structured_output_present: parsed.present,
    expected_structured_output_kind: base.expectedStructuredOutput ?? null,
    cleanup_status: null,
    _parsed: parsed.value,
  };
}

function publicOperation(record) {
  const safe = { ...record };
  delete safe._parsed;
  return safe;
}

async function writeAtomically(file, result) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  await fs.writeFile(temporary, `${JSON.stringify(result)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}

function overlayYaml({ containerName, readerContainerName, resultVolume, resultPath, runId }) {
  return `services:\n  ${SERVICE}:\n    container_name: ${containerName}\n    network_mode: none\n    entrypoint: ["node"]\n    command: ["t201-live-result-channel-preflight.mjs"]\n    environment:\n      NUVITAE_T201_RESULT_PATH: ${resultPath}\n      NUVITAE_T201_RUN_ID_HASH: ${runId}\n      NUVITAE_T201_CASE_ID: T201-C02\n    volumes:\n      - type: volume\n        source: ${resultVolume}\n        target: /spike/result\n  t201-result-reader:\n    container_name: ${readerContainerName}\n    network_mode: none\n    environment:\n      NUVITAE_T201_RESULT_PATH: ${resultPath}\n    volumes:\n      - type: volume\n        source: ${resultVolume}\n        target: /spike/result\n        read_only: true\nvolumes:\n  ${resultVolume}:\n    external: true\n`;
}

function isExactImmutableService(config, service, immutableReference, networkIsolated = false) {
  const definition = config?.services?.[service];
  return Boolean(definition && definition.image === immutableReference && !Object.hasOwn(definition, "build") && (!networkIsolated || definition.network_mode === "none"));
}

function pickResultMount(inspect) {
  return (inspect?.Mounts ?? []).find((mount) => mount.Destination === RESULT_MOUNT) ?? null;
}

function filesystemMeasurements(probe, mount) {
  const mountStat = probe?.records?.find((item) => item.operation === "stat_result_mount")?.after ?? null;
  const verifiedRunDirectory = probe?.records?.find((item) => item.operation === "stat_verify_run_directory")?.after ?? null;
  return {
    // The persisted probe artifact intentionally contains no process metadata;
    // this record is emitted only after it proves ownership matches the
    // effective runtime identity, so it is the safe measured identity source.
    effective_uid: probe?.identity?.uid ?? verifiedRunDirectory?.uid ?? null,
    effective_gid: probe?.identity?.gid ?? verifiedRunDirectory?.gid ?? null,
    result_mount_present: mount ? true : null,
    result_mount_read_write: mount ? mount.RW === true : null,
    result_mount_owner_uid: mountStat?.uid ?? null,
    result_mount_owner_gid: mountStat?.gid ?? null,
    result_mount_mode: mountStat?.mode ?? null,
    filesystem_probe_completed: probe ? true : null,
  };
}

function safeProbeFromLog(value) {
  if (!value || typeof value !== "object" || value.probe !== "t201_live_result_channel" || value.semantic_invocation_attempted === true) return null;
  return value;
}

export async function runCredentialFreePreflight({
  root,
  outputPath,
  preparedImage,
  execute = executeDockerCommand,
  runId = crypto.randomBytes(24).toString("hex"),
  injectFailure = process.env.NUVITAE_T201_PREFLIGHT_INJECT_FAILURE ?? null,
  composeProject = process.env.COMPOSE_PROJECT_NAME ?? "codex-direct-oauth",
} = {}) {
  const immutableReference = assertImmutableImageReference(preparedImage?.reference);
  const resolvedRoot = path.resolve(root ?? process.cwd());
  const composeFile = path.join(resolvedRoot, "compose.yml");
  const containerName = `t201-result-preflight-${runId}`;
  const readerContainerName = `t201-result-preflight-reader-${runId}`;
  const resultVolume = `nuvitae-codex-direct-oauth-t201-result-${runId}`;
  const resultPath = `${RESULT_MOUNT}/${runId}/result.json`;
  const defaultOutput = path.join(resolvedRoot, ".tmp", "t201-live-preflight-last.json");
  const result = {
    diagnostic: "credential_free_exact_live_service_preflight",
    semantic_invocation_attempted: false,
    preserved_credentials_mounted: false,
    credential_mounts_are_disposable_standins: false,
    success: false,
    first_failure_operation: null,
    first_failure_exit_code: null,
    first_failure_category: null,
    process_started: null,
    container_created: null,
    container_started: null,
    container_exit_code: null,
    fresh_image_identity_hash: null,
    created_container_image_identity_hash: null,
    launched_container_image_identity_hash: null,
    reader_created_container_image_identity_hash: null,
    reader_launched_container_image_identity_hash: null,
    stale_image_detected: null,
    effective_uid: null,
    effective_gid: null,
    reader_effective_uid: null,
    reader_effective_gid: null,
    result_mount_present: null,
    result_mount_read_write: null,
    result_mount_owner_uid: null,
    result_mount_owner_gid: null,
    result_mount_mode: null,
    filesystem_probe_completed: null,
    stdout_byte_count: null,
    stderr_byte_count: null,
    stdout_hash: null,
    stderr_hash: null,
    cleanup_container_removed: null,
    cleanup_volume_removed: null,
    reader_path_passed: null,
    broker_network_isolated: null,
    reader_network_isolated: null,
    evidence_written: false,
    operations: [],
  };
  const rawByOperation = new Map();
  let overlayPath = null;
  const volumes = [resultVolume];
  let containerCreated = false;
  let readerCreated = false;
  let outputWritten = false;

  const record = async (base) => {
    let raw;
    if (injectFailure === base.operation) {
      raw = { process_started: true, timed_out: false, exit_code: 73, stdout: "", stderr: `injected_${base.operation}_failure`, stdout_byte_count: 0, stderr_byte_count: Buffer.byteLength(`injected_${base.operation}_failure`), stdout_hash: safeHash(Buffer.alloc(0)), stderr_hash: safeHash(Buffer.from(`injected_${base.operation}_failure`)) };
    } else {
      raw = await execute({ executable: base.command[0], args: base.command.slice(1), cwd: resolvedRoot, env: base.env });
    }
    const operation = sanitizedCommandResult(base, raw);
    rawByOperation.set(base.operation, { raw, operation });
    result.operations.push(publicOperation(operation));
    if (operationFailure(operation) && result.first_failure_operation === null) {
      result.first_failure_operation = operation.operation;
      result.first_failure_exit_code = operation.exit_code;
      result.first_failure_category = operation.stderr_category;
      result.process_started = operation.process_started;
    }
    return operation;
  };
  const docker = (operation, args, expectedStructuredOutput = null) => record(commandRecord(operation, "docker", ["docker", ...args], expectedStructuredOutput));
  const composeEnvironment = { ...process.env, [T201_IMMUTABLE_IMAGE_ENV]: immutableReference };
  const compose = (operation, args, expectedStructuredOutput = null) => record({ ...commandRecord(operation, "docker_compose", ["docker", "compose", "--project-name", composeProject, "--file", composeFile, ...args], expectedStructuredOutput), env: composeEnvironment });
  const failed = () => result.first_failure_operation !== null;

  try {
    const config = (await compose("compose_config_resolution", ["config", "--format", "json"], "json"))._parsed;
    if (!failed() && (!isExactImmutableService(config, SERVICE, immutableReference) || !isExactImmutableService(config, "t201-result-reader", immutableReference))) {
      result.first_failure_operation = "compose_config_resolution";
      result.first_failure_exit_code = 0;
      result.first_failure_category = "invalid_compose_configuration";
    }
    if (!failed()) {
      const inspection = (await docker("prepared_image_reinspection", ["image", "inspect", immutableReference], "json"))._parsed;
      const image = Array.isArray(inspection) ? inspection[0] : inspection;
      result.fresh_image_identity_hash = hashIdentity(image?.Id);
      if (image?.Id !== immutableReference || !declaredRuntimeUserIsNonRoot(image?.Config?.User)) {
        result.first_failure_operation = "prepared_image_reinspection";
        result.first_failure_exit_code = 0;
        result.first_failure_category = "inspection_failure";
      }
    }
    for (const volume of volumes) {
      if (!failed()) await docker("diagnostic_volume_creation_result", ["volume", "create", volume]);
    }
    if (!failed()) {
      overlayPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "nuvitae-t201-preflight-")), "compose.preflight.yml");
      await fs.writeFile(overlayPath, overlayYaml({ containerName, readerContainerName, resultVolume, resultPath, runId }), { mode: 0o600 });
      const preflightConfig = (await compose("preflight_compose_config_resolution", ["--file", overlayPath, "config", "--format", "json"], "json"))._parsed;
      if (!failed() && (!isExactImmutableService(preflightConfig, SERVICE, immutableReference, true) || !isExactImmutableService(preflightConfig, "t201-result-reader", immutableReference, true))) {
        result.first_failure_operation = "preflight_compose_config_resolution";
        result.first_failure_exit_code = 0;
        result.first_failure_category = "invalid_compose_configuration";
      }
      if (!failed()) {
        await compose("preflight_container_creation", ["--file", overlayPath, "create", "--no-build", SERVICE, "t201-result-reader"]);
        if (!failed()) { containerCreated = true; readerCreated = true; }
      }
    }
    let createdInspect = null;
    if (containerCreated) {
      createdInspect = (await docker("created_container_inspection", ["inspect", containerName], "json"))._parsed;
      const created = Array.isArray(createdInspect) ? createdInspect[0] : null;
      result.created_container_image_identity_hash = hashIdentity(created?.Image);
      result.broker_network_isolated = created?.HostConfig?.NetworkMode === "none";
      if (!failed() && (!created || created.Image !== immutableReference)) {
        result.first_failure_operation = "created_container_inspection";
        result.first_failure_exit_code = 0;
        result.first_failure_category = "inspection_failure";
      }
      const readerInspect = (await docker("reader_created_container_inspection", ["inspect", readerContainerName], "json"))._parsed;
      const reader = Array.isArray(readerInspect) ? readerInspect[0] : null;
      result.reader_created_container_image_identity_hash = hashIdentity(reader?.Image);
      result.reader_network_isolated = reader?.HostConfig?.NetworkMode === "none";
      if (!failed() && (!reader || reader.Image !== immutableReference)) {
        result.first_failure_operation = "reader_created_container_inspection";
        result.first_failure_exit_code = 0;
        result.first_failure_category = "inspection_failure";
      }
    }
    if (containerCreated && !failed()) {
      await docker("preflight_container_start", ["start", "--attach", containerName]);
      result.container_started = !failed();
      const startRaw = rawByOperation.get("preflight_container_start")?.raw;
      const attached = splitDockerAttachOutput(startRaw?.stdout_buffer ?? startRaw?.stdout);
      const commandStderr = startRaw?.stderr_buffer ?? Buffer.from(startRaw?.stderr ?? "", "utf8");
      const stderr = Buffer.concat([attached.stderr, commandStderr]);
      result.stdout_byte_count = attached.stdout.length;
      result.stderr_byte_count = stderr.length;
      result.stdout_hash = safeHash(attached.stdout);
      result.stderr_hash = safeHash(stderr);
    }
    if (result.container_started) {
      const containerExit = (await docker("preflight_container_wait", ["wait", containerName], "integer"))._parsed;
      result.container_exit_code = Number.isInteger(containerExit) ? containerExit : null;
      if (!failed() && result.container_exit_code !== 0) {
        result.first_failure_operation = "preflight_container_wait";
        result.first_failure_exit_code = result.container_exit_code;
        result.first_failure_category = "container_runtime_failure";
      }
    }
    if (containerCreated && result.container_started) {
      const launchedInspect = (await docker("launched_image_verification", ["inspect", containerName], "json"))._parsed;
      const launched = Array.isArray(launchedInspect) ? launchedInspect[0] : null;
      result.launched_container_image_identity_hash = hashIdentity(launched?.Image);
      result.stale_image_detected = result.fresh_image_identity_hash && result.launched_container_image_identity_hash
        ? result.fresh_image_identity_hash !== result.launched_container_image_identity_hash
        : null;
      if (!failed() && result.stale_image_detected) {
        result.first_failure_operation = "launched_image_verification";
        result.first_failure_exit_code = 0;
        result.first_failure_category = "inspection_failure";
      }
      const mount = pickResultMount(launched);
      if (mount) {
        result.result_mount_present = true;
        result.result_mount_read_write = mount.RW === true;
      }
    }
    let probe = null;
    if (result.container_started) {
      const artifactPath = path.join(path.dirname(overlayPath), "result.json");
      await docker("preflight_result_artifact_capture", ["cp", `${containerName}:${resultPath}`, artifactPath]);
      let artifactText = "";
      try { artifactText = await fs.readFile(artifactPath, "utf8"); } catch { artifactText = ""; }
      probe = safeProbeFromLog(parseExpectedOutput(artifactText, "json").value);
      if (!failed() && !probe) {
        const capture = rawByOperation.get("preflight_result_artifact_capture")?.operation;
        result.first_failure_operation = "preflight_result_parse";
        result.first_failure_exit_code = capture?.exit_code ?? null;
        result.first_failure_category = artifactText.length === 0 ? "empty_structured_output" : "malformed_structured_output";
      }
      if (probe) Object.assign(result, filesystemMeasurements(probe, result.result_mount_present ? { RW: result.result_mount_read_write } : null));
      if (!failed() && probe?.first_failure) {
        result.first_failure_operation = "preflight_result_parse";
        result.first_failure_exit_code = result.container_exit_code;
        result.first_failure_category = "mount_failure";
      }
    }
    if (readerCreated) {
      await docker("preflight_reader_start", ["start", "--attach", readerContainerName]);
      const readerStart = rawByOperation.get("preflight_reader_start")?.raw;
      const readerAttached = splitDockerAttachOutput(readerStart?.stdout_buffer ?? readerStart?.stdout);
      const readerDiagnosticText = Buffer.concat([readerAttached.stderr, readerStart?.stderr_buffer ?? Buffer.from(readerStart?.stderr ?? "", "utf8")]).toString("utf8");
      const readerDiagnostics = parseReaderDiagnostics(readerDiagnosticText, readerStart?.exit_code ?? null);
      result.reader_effective_uid = readerDiagnostics.reader_effective_uid;
      result.reader_effective_gid = readerDiagnostics.reader_effective_gid;
      const readerWait = (await docker("preflight_reader_wait", ["wait", readerContainerName], "integer"))._parsed;
      const readerLaunchedInspect = (await docker("reader_launched_image_verification", ["inspect", readerContainerName], "json"))._parsed;
      const readerLaunched = Array.isArray(readerLaunchedInspect) ? readerLaunchedInspect[0] : null;
      result.reader_launched_container_image_identity_hash = hashIdentity(readerLaunched?.Image);
      if (!failed() && readerLaunched?.Image !== immutableReference) {
        result.first_failure_operation = "reader_launched_image_verification";
        result.first_failure_exit_code = 0;
        result.first_failure_category = "inspection_failure";
      }
      if (!failed() && (result.reader_effective_uid !== result.effective_uid || result.reader_effective_gid !== result.effective_gid)) {
        result.first_failure_operation = "reader_runtime_identity_verification";
        result.first_failure_exit_code = 0;
        result.first_failure_category = "inspection_failure";
      }
      result.reader_path_passed = Number.isInteger(readerWait) ? readerWait === 0 : false;
      if (!failed() && !result.reader_path_passed) {
        result.first_failure_operation = "preflight_reader_wait";
        result.first_failure_exit_code = Number.isInteger(readerWait) ? readerWait : null;
        result.first_failure_category = "container_runtime_failure";
      }
    }
  } finally {
    if (containerCreated || readerCreated) {
      const operation = await docker("preflight_container_removal", ["rm", "-f", containerName, readerContainerName]);
      result.cleanup_container_removed = !operationFailure(operation);
      result.operations.at(-1).cleanup_status = result.cleanup_container_removed ? "removed" : "failed";
      if (!result.cleanup_container_removed && !failed()) {
        result.first_failure_operation = "preflight_container_removal";
        result.first_failure_exit_code = operation.exit_code;
        result.first_failure_category = "cleanup_failure";
      }
    }
    const removed = [];
    for (const volume of volumes) {
      const operation = await docker("diagnostic_volume_removal_result", ["volume", "rm", volume]);
      const ok = !operationFailure(operation);
      removed.push(ok);
      result.operations.at(-1).cleanup_status = ok ? "removed" : "failed";
      if (!ok && !failed()) {
        result.first_failure_operation = "diagnostic_volume_removal";
        result.first_failure_exit_code = operation.exit_code;
        result.first_failure_category = "cleanup_failure";
      }
    }
    result.cleanup_volume_removed = removed.length === volumes.length ? removed.every(Boolean) : null;
    await fs.rm(path.dirname(overlayPath ?? ""), { recursive: true, force: true }).catch(() => undefined);
    result.success = !failed() && result.container_created !== false && result.container_started === true && result.container_exit_code === 0 && result.stale_image_detected === false && result.fresh_image_identity_hash === result.created_container_image_identity_hash && result.fresh_image_identity_hash === result.launched_container_image_identity_hash && result.fresh_image_identity_hash === result.reader_created_container_image_identity_hash && result.fresh_image_identity_hash === result.reader_launched_container_image_identity_hash && result.broker_network_isolated === true && result.reader_network_isolated === true && result.reader_effective_uid === result.effective_uid && result.reader_effective_gid === result.effective_gid && result.filesystem_probe_completed === true && result.result_mount_present === true && result.result_mount_read_write === true && result.reader_path_passed === true && result.cleanup_container_removed === true && result.cleanup_volume_removed === true;
    if (result.process_started === null) result.process_started = rawByOperation.get("compose_config_resolution")?.operation.process_started ?? null;
    result.container_created = containerCreated;
    try {
      result.evidence_written = true;
      await writeAtomically(outputPath ?? defaultOutput, result);
      outputWritten = true;
    } catch (error) {
      result.evidence_written = false;
      if (!failed()) {
        result.first_failure_operation = "preflight_result_write";
        result.first_failure_exit_code = null;
        result.first_failure_category = classifyDockerFailure({ stderr: error?.code, operation: "preflight_result_write" });
        result.success = false;
      }
    }
  }
  result.evidence_written = outputWritten;
  return result;
}
