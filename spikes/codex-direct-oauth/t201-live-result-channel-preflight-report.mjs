import fs from "node:fs/promises";
import { normalizeTopology } from "./lib/t201-result-channel-topology.mjs";

const [brokerStdoutPath, brokerStderrPath, readerStdoutPath, readerStderrPath, cleanupStdoutPath, cleanupStderrPath, brokerStatus, readerStatus, cleanupStatus, builtImageId] = process.argv.slice(2);
let inspectText = "";
for await (const chunk of process.stdin) inspectText += chunk;
const inspect = JSON.parse(inspectText)[0];
const parse = async (file) => {
  try { return JSON.parse((await fs.readFile(file, "utf8")).trim() || "{}"); } catch { return {}; }
};
const safeLine = async (file, prefix) => (await fs.readFile(file, "utf8")).split("\n").find((line) => line.startsWith(prefix)) ?? null;
const probe = await parse(brokerStdoutPath);
const reader = await fs.readFile(readerStdoutPath, "utf8");
const cleanup = await parse(cleanupStdoutPath);
const report = {
  diagnostic: "credential_free_exact_live_service_preflight",
  legacy_result_path_reproduction: process.env.NUVITAE_T201_PREFLIGHT_LEGACY_PATH === "true",
  semantic_invocation_attempted: false,
  credential_mounts_are_disposable_standins: true,
  broker_exit: Number(brokerStatus), reader_exit: Number(readerStatus), cleanup_exit: Number(cleanupStatus),
  first_failing_operation: probe.first_failure ?? null,
  probe_operations: (probe.records ?? []).map(({ operation, ok, errno, path_category, after, value }) => ({
    operation, ok, errno: errno ?? null, path_category, owner_uid: after?.uid ?? null, owner_gid: after?.gid ?? null, mode: after?.mode ?? null,
    same_filesystem: value?.same_filesystem ?? null, owner_matches_effective_identity: value?.owner_matches_effective_identity ?? null,
  })),
  broker_safe_diagnostic: await safeLine(brokerStderrPath, "safe_result_preflight_failure:"),
  broker_topology: normalizeTopology({ label: "live", service: "t201-semantic", composeProject: process.env.COMPOSE_PROJECT_NAME ?? "default", inspect, imageDigest: builtImageId, probe }),
  stale_image_detected: Boolean(builtImageId && inspect.Image && builtImageId !== inspect.Image),
  reader_result: (await fs.readFile(readerStderrPath, "utf8")).includes("safe_result_reader_success:") ? "passed" : "failed",
  reader_safe_diagnostic: await safeLine(readerStderrPath, "safe_result_reader_"),
  cleanup_result: cleanup.first_failure ? "failed" : "passed",
  cleanup_safe_diagnostic: await safeLine(cleanupStderrPath, "safe_result_cleanup_"),
};
process.stdout.write(`${JSON.stringify(report)}\n`);
process.exitCode = report.broker_exit === 0 && report.reader_exit === 0 && report.cleanup_exit === 0 && report.first_failing_operation === null && report.stale_image_detected === false ? 0 : 1;
