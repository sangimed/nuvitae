import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { executeDockerCommand, runCredentialFreePreflight } from "../lib/t201-preflight-diagnostics.mjs";
import { prepareImmutableT201Image, verifyPreparedT201Image } from "../lib/t201-image-contract.mjs";

const execFileAsync = promisify(execFile);
const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dockerGated = process.env.NUVITAE_RUN_T201_PREFLIGHT_TEST === "1";
const IMMUTABLE_IMAGE = `sha256:${"0".repeat(64)}`;

async function withOutput(run) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-live-preflight-"),
  );
  const outputPath = path.join(directory, "preflight.json");
  try {
    await run(outputPath);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function renderedService(serviceName) {
  const { stdout } = await execFileAsync(
    "docker",
    ["compose", "config", "--format", "json"],
    {
      cwd: spikeRoot,
      env: { ...process.env, NUVITAE_T201_IMMUTABLE_IMAGE: IMMUTABLE_IMAGE },
      maxBuffer: 1024 * 1024,
    },
  );
  return JSON.parse(stdout).services[serviceName];
}

test("rendered Compose binds the T201 broker to 1000:1000, keeps the reader identity-unmodified, and isolates the 100:101 credential diagnostic", async () => {
  const [semantic, reader, diagnostic] = await Promise.all([
    renderedService("t201-semantic"),
    renderedService("t201-result-reader"),
    renderedService("t201-credential-recovery-diagnostic"),
  ]);
  assert.equal(semantic.user, "1000:1000");
  assert.equal(reader.user == null, true);
  assert.equal(reader.network_mode, "none");
  assert.equal(
    (reader.volumes ?? []).some(
      (mount) =>
        mount.target === "/run/t199-key" ||
        mount.target === "/spike/credentials",
    ),
    false,
  );
  assert.equal(diagnostic.user, "100:101");
  assert.equal(diagnostic.network_mode, "none");
  assert.deepEqual(
    (diagnostic.volumes ?? []).map(({ source, target, read_only }) => ({
      source,
      target,
      read_only,
    })),
    [
      { source: "t199-key-live", target: "/run/t199-key", read_only: true },
      {
        source: "t199-credentials-live",
        target: "/spike/credentials",
        read_only: true,
      },
    ],
  );
});

test("T201 image declares a non-root spike identity pinned to 1000:1000 and a private result directory owned by that identity", async () => {
  const dockerfile = await fs.readFile(
    path.join(spikeRoot, "Dockerfile"),
    "utf8",
  );
  assert.match(dockerfile, /addgroup -S -g 1000 spike/);
  assert.match(dockerfile, /adduser -S -u 1000 -G spike spike/);
  assert.match(dockerfile, /USER spike/);
  assert.match(dockerfile, /install -d -o spike -g spike -m 0700 \/spike\/result/);
});

test(
  "credential-free preflight succeeds with the explicit 1000:1000 broker identity against the real Docker daemon",
  { skip: !dockerGated },
  async () => {
    const preparedImage = await prepareImmutableT201Image({
      root: spikeRoot,
      execute: executeDockerCommand,
    });
    try {
      await withOutput(async (outputPath) => {
        const result = await runCredentialFreePreflight({
          root: spikeRoot,
          outputPath,
          preparedImage,
          execute: executeDockerCommand,
        });
        assert.equal(result.success, true, JSON.stringify(result, null, 2));
        assert.equal(result.first_failure_operation, null);
        assert.equal(result.semantic_invocation_attempted, false);
        assert.equal(result.preserved_credentials_mounted, false);
        assert.equal(result.credential_mounts_are_disposable_standins, false);
        assert.equal(result.effective_uid, 1000);
        assert.equal(result.effective_gid, 1000);
        assert.equal(result.reader_effective_uid, 1000);
        assert.equal(result.reader_effective_gid, 1000);
        assert.equal(result.broker_network_isolated, true);
        assert.equal(result.reader_network_isolated, true);
        assert.equal(result.result_mount_present, true);
        assert.equal(result.result_mount_read_write, true);
        assert.equal(result.result_mount_owner_uid, 1000);
        assert.equal(result.result_mount_owner_gid, 1000);
        assert.equal(result.result_mount_mode, 0o700);
        assert.equal(result.filesystem_probe_completed, true);
        assert.equal(result.reader_path_passed, true);
        assert.equal(result.cleanup_container_removed, true);
        assert.equal(result.cleanup_volume_removed, true);
        assert.equal(result.evidence_written, true);
        const volumeOperations = result.operations.filter((operation) =>
          operation.operation.startsWith("diagnostic_volume_"),
        );
        assert.deepEqual(
          volumeOperations.map((operation) => operation.operation),
          ["diagnostic_volume_creation_result", "diagnostic_volume_removal_result"],
        );
        assert.equal(
          result.operations.some((operation) =>
            JSON.stringify(operation).includes("credential"),
          ),
          false,
        );
      });
    } finally {
      await execFileAsync("docker", ["image", "rm", "--force", preparedImage.reference]).catch(
        () => undefined,
      );
    }
  },
);

test(
  "a mismatched immutable-image identity still fails closed before any volume creation",
  { skip: !dockerGated },
  async () => {
    const preparedImage = await prepareImmutableT201Image({
      root: spikeRoot,
      execute: executeDockerCommand,
    });
    try {
      const mismatched = {
        ...preparedImage,
        reference: `${preparedImage.reference.slice(0, -1)}${
          preparedImage.reference.endsWith("0") ? "1" : "0"
        }`,
      };
      await withOutput(async (outputPath) => {
        const result = await runCredentialFreePreflight({
          root: spikeRoot,
          outputPath,
          preparedImage: mismatched,
          execute: executeDockerCommand,
        });
        assert.equal(result.success, false);
        assert.equal(result.first_failure_operation, "prepared_image_reinspection");
        assert.equal(
          result.operations.some((operation) =>
            operation.operation === "diagnostic_volume_creation_result",
          ),
          false,
        );
        assert.equal(result.preserved_credentials_mounted, false);
      });
    } finally {
      await execFileAsync("docker", ["image", "rm", "--force", preparedImage.reference]).catch(
        () => undefined,
      );
    }
  },
);

test(
  "a prepared image whose declared runtime user is root is rejected by the immutable-image contract",
  async () => {
    const reference = `sha256:${"a".repeat(64)}`;
    await assert.rejects(
      () =>
        verifyPreparedT201Image({
          root: spikeRoot,
          preparedImage: {
            reference,
            identity_hash: "a".repeat(64),
            declared_runtime_user_hash: "b".repeat(64),
          },
          execute: async () => ({
            process_started: true,
            timed_out: false,
            exit_code: 0,
            stdout: JSON.stringify([{ Id: reference, Config: { User: "root" } }]),
          }),
        }),
      /immutable_image_non_root_user_required/,
    );
  },
);
