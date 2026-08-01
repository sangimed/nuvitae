import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { validateCampaignBExecutionTopology } from "../lib/t201-campaign-b-runtime.mjs";
import { assertImmutableImageReference, prepareImmutableT201Image, verifyPreparedT201Image } from "../lib/t201-image-contract.mjs";
import { runCredentialFreePreflight } from "../lib/t201-preflight-diagnostics.mjs";

const imageId = `sha256:${"b".repeat(64)}`;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const preparedImage = { reference: imageId, identity_hash: hash(imageId), declared_runtime_user_hash: hash("spike") };
const root = new URL("../", import.meta.url).pathname;

function result({ stdout = "", stderr = "", exitCode = 0 } = {}) {
  return { process_started: true, timed_out: false, exit_code: exitCode, stdout, stderr, stdout_byte_count: Buffer.byteLength(stdout), stderr_byte_count: Buffer.byteLength(stderr), stdout_hash: hash(stdout), stderr_hash: hash(stderr) };
}

function imageExecutor(calls, { image = imageId, user = "spike" } = {}) {
  return async ({ args }) => {
    calls.push(args);
    if (args[0] === "image") return result({ stdout: JSON.stringify([{ Id: image, Config: { User: user } }]) });
    return result();
  };
}

test("preparation builds exactly once, resolves a local immutable ID, and verifies a non-root declared user", async () => {
  const calls = [];
  const prepared = await prepareImmutableT201Image({ root, runId: "test", execute: imageExecutor(calls) });
  assert.equal(calls.filter((args) => args[0] === "build").length, 1);
  assert.equal(prepared.reference, imageId);
  assert.match(prepared.identity_hash, /^[a-f0-9]{64}$/);
  assert.equal(calls[0].includes("--pull=false"), true);
});

test("mutable tags, unset input, root images, and stale local identities fail closed", async () => {
  assert.throws(() => assertImmutableImageReference("t201-semantic:latest"), /immutable_image_reference_required/);
  await assert.rejects(() => verifyPreparedT201Image({ root, execute: imageExecutor([]) }), /immutable_image_reference_required/);
  await assert.rejects(() => prepareImmutableT201Image({ root, execute: imageExecutor([], { user: "root" }) }), /immutable_image_non_root_user_required/);
  await assert.rejects(() => verifyPreparedT201Image({ root, preparedImage, execute: imageExecutor([], { image: `sha256:${"c".repeat(64)}` }) }), /immutable_image_identity_mismatch/);
});

test("preflight requires the prepared ID, never builds or pulls, uses it for broker and reader, and mounts no credentials", async () => {
  const calls = [];
  let inspect = 0;
  const execute = async ({ args }) => {
    calls.push(args);
    if (args.includes("config")) return result({ stdout: JSON.stringify({ services: { "t201-semantic": {} } }) });
    if (args[0] === "image") return result({ stdout: JSON.stringify([{ Id: imageId, Config: { User: "spike" } }]) });
    if (args.includes("inspect")) { inspect += 1; return result({ stdout: JSON.stringify([{ Image: imageId, Mounts: [{ Destination: "/spike/result", RW: true }] }]) }); }
    if (args.includes("wait")) return result({ stdout: "0\n" });
    if (args.includes("cp")) { await (await import("node:fs/promises")).writeFile(args.at(-1), JSON.stringify({ probe: "t201_live_result_channel", semantic_invocation_attempted: false, identity: { uid: 1000, gid: 1000 }, records: [{ operation: "stat_result_mount", after: { uid: 1000, gid: 1000, mode: 448 } }], first_failure: null })); return result(); }
    if (args.includes("start")) return result(args.some((value) => String(value).includes("reader")) ? { stderr: "safe_result_reader_success:1000:1000:600:same_filesystem\n" } : { stdout: "{}\n" });
    return result();
  };
  const value = await runCredentialFreePreflight({ root, preparedImage, execute, runId: "d".repeat(32) });
  assert.equal(value.success, true);
  assert.equal(value.preserved_credentials_mounted, false);
  assert.equal(value.credential_mounts_are_disposable_standins, false);
  assert.equal(value.fresh_image_identity_hash, value.reader_launched_container_image_identity_hash);
  assert.equal(calls.some((args) => args.includes("build") || args.includes("pull")), false);
  assert.ok(inspect >= 4);
});

test("a deterministic prepared-image mismatch aborts before any volume creation or credential mount", async () => {
  const calls = [];
  const mismatch = `sha256:${"e".repeat(64)}`;
  const value = await runCredentialFreePreflight({ root, preparedImage: { ...preparedImage, reference: mismatch }, execute: async ({ args }) => {
    calls.push(args);
    if (args.includes("config")) return result({ stdout: JSON.stringify({ services: { "t201-semantic": {} } }) });
    if (args[0] === "image") return result({ stdout: JSON.stringify([{ Id: imageId, Config: { User: "spike" } }]) });
    return result();
  }, runId: "e".repeat(32) });
  assert.equal(value.success, false);
  assert.equal(value.first_failure_operation, "prepared_image_reinspection");
  assert.equal(calls.some((args) => args.includes("volume") && args.includes("create")), false);
  assert.equal(value.preserved_credentials_mounted, false);
});

test("preflight rejects missing input plus created and launched container image mismatches", async () => {
  await assert.rejects(() => runCredentialFreePreflight({ root, execute: imageExecutor([]) }), /immutable_image_reference_required/);
  for (const [label, mismatchAt, expected] of [["created", 1, "created_container_inspection"], ["launched", 3, "launched_image_verification"]]) {
    let inspect = 0;
    const value = await runCredentialFreePreflight({ root, preparedImage, runId: `${label[0]}`.repeat(32), execute: async ({ args }) => {
      if (args.includes("config")) return result({ stdout: JSON.stringify({ services: { "t201-semantic": {} } }) });
      if (args[0] === "image") return result({ stdout: JSON.stringify([{ Id: imageId, Config: { User: "spike" } }]) });
      if (args.includes("inspect")) { inspect += 1; return result({ stdout: JSON.stringify([{ Image: inspect === mismatchAt ? `sha256:${"f".repeat(64)}` : imageId, Mounts: [{ Destination: "/spike/result", RW: true }] }]) }); }
      if (args.includes("wait")) return result({ stdout: "0\n" });
      return result();
    } });
    assert.equal(value.success, false, label);
    assert.equal(value.first_failure_operation, expected, label);
    assert.equal(value.preserved_credentials_mounted, false, label);
  }
});

test("Campaign B topology rejects post-preflight build, pull, implicit Compose build, and created image mismatches before credentials", async () => {
  const calls = [];
  const execute = async ({ args }) => {
    calls.push(args);
    if (args[0] === "image") return result({ stdout: JSON.stringify([{ Id: imageId, Config: { User: "spike" } }]) });
    if (args.includes("inspect")) return result({ stdout: JSON.stringify([{ Image: imageId }]) });
    return result();
  };
  const topology = await validateCampaignBExecutionTopology({ root, preparedImage, preflight: { success: true }, execute, brokerContainer: "broker", readerContainer: "reader" });
  assert.equal(topology.broker_identity_matches, true);
  assert.equal(topology.reader_identity_matches, true);
  assert.equal(topology.commands.some(({ args }) => args.includes("build") || args.includes("pull")), false);
  assert.equal(topology.commands.some(({ args }) => args.includes("--no-build")), true);
  await assert.rejects(() => validateCampaignBExecutionTopology({ root, preparedImage, preflight: { success: false }, execute, brokerContainer: "broker", readerContainer: "reader" }), /campaign_b_preflight_required/);
  await assert.rejects(() => validateCampaignBExecutionTopology({ root, preparedImage, preflight: { success: true }, execute: async ({ args }) => {
    if (args[0] === "image") return result({ stdout: JSON.stringify([{ Id: imageId, Config: { User: "spike" } }]) });
    return args.includes("inspect") ? result({ stdout: JSON.stringify([{ Image: `sha256:${"d".repeat(64)}` }]) }) : result();
  }, brokerContainer: "broker", readerContainer: "reader" }), /campaign_b_created_image_mismatch/);
});
