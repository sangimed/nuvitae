import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import {
  createMasterKey,
  encryptCredentialEnvelope,
  writeKeyFile,
} from "../lib/credential-store.mjs";
import { diagnoseCredentialRecovery } from "../lib/t201-credential-recovery-diagnostic.mjs";

const bindings = Object.freeze({
  ownerNamespace: "live-t199-owner",
  connectionId: "live-t199-connection",
  provider: "openai-codex",
});
const identity = Object.freeze({
  uid: process.geteuid(),
  gid: process.getegid(),
});
const spikeRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const execFileAsync = promisify(execFile);

async function resolvedDiagnosticService() {
  const { stdout } = await execFileAsync(
    "docker",
    ["compose", "config", "--format", "json"],
    {
      cwd: spikeRoot,
      env: {
        ...process.env,
        NUVITAE_T201_IMMUTABLE_IMAGE: `sha256:${"0".repeat(64)}`,
      },
      maxBuffer: 1024 * 1024,
    },
  );
  return JSON.parse(stdout).services["t201-credential-recovery-diagnostic"];
}

async function fixture({
  key = true,
  envelope = true,
  envelopeValue,
  keyValue,
} = {}) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-credential-diagnostic-"),
  );
  const keyDirectory = path.join(root, "key");
  const credentialDirectory = path.join(root, "credentials");
  await Promise.all([
    fs.mkdir(keyDirectory, { mode: 0o700 }),
    fs.mkdir(credentialDirectory, { mode: 0o700 }),
  ]);
  const keyPath = path.join(keyDirectory, "master.key");
  const credentialPath = path.join(credentialDirectory, "credential.json");
  const masterKey = keyValue ?? createMasterKey();
  if (key) await writeKeyFile(keyPath, masterKey);
  if (envelope)
    await fs.writeFile(
      credentialPath,
      `${JSON.stringify(envelopeValue ?? encryptCredentialEnvelope({ access_token: "synthetic-only" }, bindings, masterKey))}\n`,
      { mode: 0o600 },
    );
  return {
    root,
    keyDirectory,
    credentialDirectory,
    keyPath,
    credentialPath,
    masterKey,
  };
}

function diagnostic(paths, overrides = {}) {
  return diagnoseCredentialRecovery({
    keyMountPath: paths.keyDirectory,
    keyPath: paths.keyPath,
    credentialMountPath: paths.credentialDirectory,
    credentialPath: paths.credentialPath,
    bindings,
    runtimeIdentity: () => identity,
    ...overrides,
  });
}

test("credential diagnostic distinguishes missing files, malformed structure, wrong keys, bindings, and successful recovery", async () => {
  const missingKey = await fixture({ key: false });
  assert.equal((await diagnostic(missingKey)).failure_stage, "key_stat");
  await fs.rm(missingKey.root, { recursive: true, force: true });

  const missingCredential = await fixture({ envelope: false });
  assert.equal(
    (await diagnostic(missingCredential)).failure_stage,
    "credential_stat",
  );
  await fs.rm(missingCredential.root, { recursive: true, force: true });

  const malformed = await fixture();
  await fs.writeFile(malformed.credentialPath, "{not-json}", { mode: 0o600 });
  assert.equal((await diagnostic(malformed)).failure_stage, "envelope_parse");
  await fs.rm(malformed.root, { recursive: true, force: true });

  const invalid = await fixture({ envelopeValue: { envelope_version: 1 } });
  assert.equal((await diagnostic(invalid)).failure_stage, "envelope_structure");
  await fs.rm(invalid.root, { recursive: true, force: true });

  const wrongKey = await fixture();
  await writeKeyFile(wrongKey.keyPath, createMasterKey()).catch(async () => {
    await fs.rm(wrongKey.keyPath);
    await writeKeyFile(wrongKey.keyPath, createMasterKey());
  });
  assert.equal(
    (await diagnostic(wrongKey)).failure_stage,
    "credential_decryption",
  );
  await fs.rm(wrongKey.root, { recursive: true, force: true });

  const bindingMismatch = await fixture({
    envelopeValue: encryptCredentialEnvelope(
      { access_token: "synthetic-only" },
      { ...bindings, connectionId: "other" },
      createMasterKey(),
    ),
  });
  assert.equal(
    (await diagnostic(bindingMismatch)).failure_stage,
    "binding_validation",
  );
  await fs.rm(bindingMismatch.root, { recursive: true, force: true });

  const success = await fixture();
  const output = await diagnostic(success);
  assert.equal(output.failure_stage, "complete");
  assert.equal(output.credential_decryption_succeeded, true);
  assert.equal(output.binding_validation_succeeded, true);
  assert.equal(JSON.stringify(output).includes("synthetic-only"), false);
  assert.equal(JSON.stringify(output).includes("access_token"), false);
  await fs.rm(success.root, { recursive: true, force: true });
});

test("credential diagnostic reports unreadable paths and non-root runtime identity without exposing errors", async () => {
  const value = await fixture();
  const deniedFs = {
    ...fs,
    access: async (file, mode) =>
      file === value.keyPath
        ? Promise.reject(Object.assign(new Error("denied"), { code: "EACCES" }))
        : fs.access(file, mode),
  };
  const unreadableKey = await diagnostic(value, { fsApi: deniedFs });
  assert.equal(unreadableKey.failure_stage, "key_read");
  assert.equal(unreadableKey.safe_failure_category, "key_read_failure");

  const unreadableCredential = await diagnostic(value, {
    fsApi: {
      ...deniedFs,
      access: async (file, mode) =>
        file === value.credentialPath
          ? Promise.reject(
              Object.assign(new Error("denied"), { code: "EACCES" }),
            )
          : fs.access(file, mode),
    },
  });
  assert.equal(unreadableCredential.failure_stage, "credential_read");
  const rootIdentity = await diagnostic(value, {
    runtimeIdentity: () => ({ uid: 0, gid: 0 }),
  });
  assert.equal(rootIdentity.failure_stage, "runtime_identity");
  assert.equal(JSON.stringify(rootIdentity).includes("denied"), false);
  await fs.rm(value.root, { recursive: true, force: true });
});

test("diagnostic service resolves to the isolated immutable live-volume configuration", async () => {
  const [compose, dockerfile, runner] = await Promise.all([
    fs.readFile(path.join(spikeRoot, "compose.yml"), "utf8"),
    fs.readFile(path.join(spikeRoot, "Dockerfile"), "utf8"),
    fs.readFile(
      path.join(spikeRoot, "t201-credential-recovery-diagnostic-runner.mjs"),
      "utf8",
    ),
  ]);
  assert.match(compose, /t201-credential-recovery-diagnostic:/);
  assert.match(dockerfile, /USER spike/);
  assert.match(runner, /"--no-deps"/);
  assert.doesNotMatch(runner, /"--no-build"/);

  const service = await resolvedDiagnosticService();
  assert.equal(service.user, "100:101");
  assert.equal(service.network_mode, "none");
  assert.equal(service.read_only, true);
  assert.deepEqual(service.ports ?? [], []);
  assert.equal(service.networks == null, true);
  assert.notEqual(service.privileged, true);
  assert.deepEqual(service.cap_add ?? [], []);
  assert.equal(
    service.volumes.some((mount) => mount.type === "bind" && !mount.read_only),
    false,
  );
  assert.deepEqual(
    service.volumes.map(({ source, target, read_only }) => ({
      source,
      target,
      read_only,
    })),
    [
      {
        source: "t199-key-live",
        target: "/run/t199-key",
        read_only: true,
      },
      {
        source: "t199-credentials-live",
        target: "/spike/credentials",
        read_only: true,
      },
    ],
  );
});
