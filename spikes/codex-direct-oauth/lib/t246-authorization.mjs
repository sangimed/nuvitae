// Fail-closed T246 authorization contract.
//
// Reuses the qualified T201 authorization pattern (explicit per-attempt
// registration, immutable hash pins, one broker run, one maximum semantic
// backend request, zero automatic retries, no default evidence path, no
// generic run-all) with a dedicated T246 registry. The registry owns the
// authorization state: every entry is `NOT_AUTHORIZED` until an operator
// explicitly flips it to `AUTHORIZED` in a later, separately reviewed step.
// Until then this validator MUST fail before any credential recovery, broker
// run, or Codex request. C08 is a recovery-only case: it requires zero
// broker runs and zero semantic backend requests.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const T246_AUTHORIZATION_REGISTRY = "t246-authorizations.json";

export const T246_CANONICAL_TARGETS = Object.freeze([
  "t246-live-runner.mjs",
  "t246-authorizations.json",
  "lib/t246-authorization.mjs",
  "lib/t246-corpus-verification.mjs",
]);

const OPTION_TO_FIELD = Object.freeze({
  "--campaign": "campaign",
  "--attempt": "attempt",
  "--semantic-case": "semantic_case",
  "--fixture": "fixture",
  "--manifest": "manifest",
  "--evidence": "evidence",
  "--max-broker-runs": "maximum_live_broker_runs",
  "--max-semantic-backend-requests": "maximum_semantic_backend_requests",
  "--automatic-retries": "automatic_retries",
});

const REQUIRED_FIELDS = Object.freeze(Object.values(OPTION_TO_FIELD));
const SEMANTIC_EVIDENCE_PATTERN =
  /^spikes\/codex-direct-oauth\/evidence\/codex-direct-oauth-t246-c0[1-7]-a[0-9]{2}-semantic-parsing\.json$/;
const RECOVERY_EVIDENCE_PATTERN =
  /^spikes\/codex-direct-oauth\/evidence\/codex-direct-oauth-t246-c08-a[0-9]{2}-recovery\.json$/;
const T246_EVIDENCE_FILE_PATTERN =
  /^codex-direct-oauth-t246-(c0[1-8])-(a[0-9]{2})-(semantic-parsing|recovery)\.json$/i;

function authorizationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeNumber(value, field) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(String(value))) {
    throw authorizationError(`t246_invalid_${field}`);
  }
  return Number(value);
}

export function parseT246AttemptArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const field = OPTION_TO_FIELD[option];
    if (!field || index + 1 >= argv.length || Object.hasOwn(values, field)) {
      throw authorizationError("t246_invalid_arguments");
    }
    values[field] = argv[index + 1];
    index += 1;
  }
  if (
    Object.keys(values).length !== REQUIRED_FIELDS.length ||
    REQUIRED_FIELDS.some((field) => !Object.hasOwn(values, field))
  ) {
    throw authorizationError("t246_explicit_contract_required");
  }
  return {
    ...values,
    maximum_live_broker_runs: normalizeNumber(
      values.maximum_live_broker_runs,
      "maximum_live_broker_runs",
    ),
    maximum_semantic_backend_requests: normalizeNumber(
      values.maximum_semantic_backend_requests,
      "maximum_semantic_backend_requests",
    ),
    automatic_retries: normalizeNumber(
      values.automatic_retries,
      "automatic_retries",
    ),
  };
}

export async function loadT246AuthorizationRegistry({ root, registry } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(
      await fs.readFile(
        path.join(root, registry ?? T246_AUTHORIZATION_REGISTRY),
        "utf8",
      ),
    );
  } catch {
    throw authorizationError("t246_authorization_registry_invalid");
  }
  if (
    parsed?.schema_version !== 1 ||
    !Array.isArray(parsed.authorized_attempts)
  ) {
    throw authorizationError("t246_authorization_registry_invalid");
  }
  if (
    parsed.consumed_attempts !== undefined &&
    !Array.isArray(parsed.consumed_attempts)
  ) {
    throw authorizationError("t246_authorization_registry_invalid");
  }
  return parsed;
}

// Consumed-attempt discovery across the whole spike tree.
//
// A consumed live attempt must never depend on one expected pathname: a
// runner defect can write the sanitized evidence elsewhere (T246-C01-A01 was
// written to a double-prefixed nested path). The authorization gate therefore
// walks the spike directory and treats any T246 evidence artifact whose
// case/attempt matches the invocation as consumed, in addition to the
// explicit `consumed_attempts` ledger in the registry.
export async function findT246EvidenceArtifacts({
  root,
  campaign,
  attempt,
  walk = walkSpikeEvidenceArtifacts,
} = {}) {
  const artifacts = await walk(root);
  return artifacts.filter(
    (artifact) =>
      artifact.campaign === campaign && artifact.attempt === attempt,
  );
}

async function walkSpikeEvidenceArtifacts(spikeRoot) {
  const results = [];
  const stack = [spikeRoot];
  while (stack.length > 0) {
    const directory = stack.pop();
    const entries = await fs
      .readdir(directory, { withFileTypes: true })
      .catch((error) => {
        if (error?.code === "ENOENT") return [];
        throw error;
      });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".tmp" || entry.name === "node_modules") continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const match = T246_EVIDENCE_FILE_PATTERN.exec(entry.name);
      if (!match) continue;
      results.push({
        path: fullPath,
        campaign: `T246-${match[1].toUpperCase()}`,
        attempt: match[2].toUpperCase(),
        kind: match[3],
      });
    }
  }
  return results;
}

async function defaultIsTracked(root, target, gitCommand = "git") {
  return await new Promise((resolve) => {
    const child = spawn(
      gitCommand,
      ["ls-files", "--error-unmatch", "--", target],
      { cwd: root, shell: false, stdio: "ignore" },
    );
    child.once("error", () => resolve("unavailable"));
    child.once("close", (code) =>
      resolve(code === 0 ? "tracked" : "untracked"),
    );
  });
}

const hashFile = async (file) =>
  crypto
    .createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex");

export async function validateT246Authorization({
  root,
  invocation,
  registry,
  exists = fs.access,
  isTracked,
  gitCommand = "git",
  findConsumedArtifacts = findT246EvidenceArtifacts,
} = {}) {
  const selectedRegistry =
    registry ?? (await loadT246AuthorizationRegistry({ root }));
  const consumedLedgerMatch = (selectedRegistry.consumed_attempts ?? []).filter(
    (entry) =>
      entry.campaign === invocation.campaign &&
      entry.attempt === invocation.attempt,
  );
  if (consumedLedgerMatch.length > 0) {
    throw authorizationError("t246_attempt_consumed");
  }
  const misplacedArtifacts = await findConsumedArtifacts({
    root,
    campaign: invocation.campaign,
    attempt: invocation.attempt,
  });
  if (misplacedArtifacts.length > 0) {
    throw authorizationError("t246_attempt_consumed");
  }
  const matches = selectedRegistry.authorized_attempts.filter(
    (entry) =>
      entry.campaign === invocation.campaign &&
      entry.attempt === invocation.attempt,
  );
  if (matches.length !== 1) {
    throw authorizationError("t246_attempt_not_authorized");
  }
  const authorization = matches[0];
  if (authorization.authorization_state === "CONSUMED") {
    throw authorizationError("t246_attempt_consumed");
  }
  if (authorization.authorization_state !== "AUTHORIZED") {
    throw authorizationError("t246_not_authorized");
  }
  for (const field of REQUIRED_FIELDS) {
    if (invocation[field] !== authorization[field]) {
      throw authorizationError(`t246_contract_mismatch_${field}`);
    }
  }
  if (
    !/^T246-C0[1-8]$/.test(invocation.semantic_case) ||
    !/^A[0-9]{2,}$/.test(invocation.attempt)
  ) {
    throw authorizationError("t246_attempt_not_authorized");
  }
  const isRecoveryCase = invocation.semantic_case === "T246-C08";
  const expectedBrokerRuns = isRecoveryCase ? 0 : 1;
  const expectedBackendRequests = isRecoveryCase ? 0 : 1;
  if (
    invocation.maximum_live_broker_runs !== expectedBrokerRuns ||
    invocation.maximum_semantic_backend_requests !== expectedBackendRequests
  ) {
    throw authorizationError(
      isRecoveryCase
        ? "t246_recovery_single_request_required"
        : "t246_single_request_required",
    );
  }
  if (invocation.automatic_retries !== 0) {
    throw authorizationError("t246_retries_disabled_required");
  }
  const evidencePattern = isRecoveryCase
    ? RECOVERY_EVIDENCE_PATTERN
    : SEMANTIC_EVIDENCE_PATTERN;
  if (!evidencePattern.test(invocation.evidence)) {
    throw authorizationError("t246_default_evidence_forbidden");
  }
  const evidencePath = path.join(root, "../..", invocation.evidence);
  try {
    await exists(evidencePath);
    throw authorizationError("t246_evidence_path_reused");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const fixturePath = path.join(root, "../..", invocation.fixture);
  const manifestPath = path.join(root, "../..", invocation.manifest);
  if ((await hashFile(fixturePath)) !== authorization.fixture_sha256) {
    throw authorizationError("t246_fixture_hash_mismatch");
  }
  if ((await hashFile(manifestPath)) !== authorization.manifest_sha256) {
    throw authorizationError("t246_manifest_hash_mismatch");
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (manifest.t246_case !== invocation.semantic_case) {
    throw authorizationError("t246_fixture_manifest_binding_mismatch");
  }
  if (isRecoveryCase) {
    if (
      manifest.semantic_request_required !== false ||
      manifest.credential_recovery_required !== false ||
      manifest.maximum_semantic_backend_requests !== 0
    ) {
      throw authorizationError("t246_recovery_manifest_contract_mismatch");
    }
  } else if (authorization.transcript_sha256 !== manifest.transcript_sha256) {
    throw authorizationError("t246_transcript_hash_mismatch");
  }
  for (const target of T246_CANONICAL_TARGETS) {
    try {
      await exists(path.join(root, target));
    } catch {
      throw authorizationError("t246_canonical_target_missing");
    }
    const tracked = await (isTracked ?? defaultIsTracked)(
      root,
      target,
      gitCommand,
    );
    if (tracked === "unavailable") {
      throw authorizationError("t246_canonical_target_tracking_unavailable");
    }
    if (tracked !== true && tracked !== "tracked") {
      throw authorizationError("t246_canonical_target_untracked");
    }
  }
  return Object.freeze({
    ...authorization,
    ...invocation,
    fixture_path: fixturePath,
    manifest_path: manifestPath,
    evidence_path: evidencePath,
    is_recovery_case: isRecoveryCase,
  });
}
