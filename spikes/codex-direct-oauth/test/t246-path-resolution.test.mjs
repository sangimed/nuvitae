import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadT246AuthorizationRegistry,
  parseT246AttemptArguments,
  validateT246Authorization,
} from "../lib/t246-authorization.mjs";
import { t246ContainerManifestPath } from "../lib/t246-live-bridge.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");
const registry = await loadT246AuthorizationRegistry({ root });

function argvOf(entry) {
  return [
    "--campaign",
    entry.campaign,
    "--attempt",
    entry.attempt,
    "--semantic-case",
    entry.semantic_case,
    "--fixture",
    entry.fixture,
    "--manifest",
    entry.manifest,
    "--evidence",
    entry.evidence,
    "--max-broker-runs",
    String(entry.maximum_live_broker_runs),
    "--max-semantic-backend-requests",
    String(entry.maximum_semantic_backend_requests),
    "--automatic-retries",
    String(entry.automatic_retries),
  ];
}

async function authorizedFreshEntry(caseId) {
  const base = registry.authorized_attempts.find(
    (entry) => entry.semantic_case === caseId,
  );
  return {
    ...base,
    attempt: "A42",
    authorization_state: "AUTHORIZED",
    evidence: `spikes/codex-direct-oauth/evidence/codex-direct-oauth-${caseId.toLowerCase()}-a42-semantic-parsing.json`,
  };
}

test("T246 repository-relative operator paths resolve exactly once against the repository root", async () => {
  const entry = await authorizedFreshEntry("T246-C04");
  const invocation = parseT246AttemptArguments(argvOf(entry));
  const authorization = await validateT246Authorization({
    root,
    invocation,
    registry: { schema_version: 1, authorized_attempts: [entry] },
    isTracked: async () => "tracked",
  });
  assert.equal(authorization.evidence_path, path.join(repo, entry.evidence));
  assert.equal(authorization.fixture_path, path.join(repo, entry.fixture));
  assert.equal(authorization.manifest_path, path.join(repo, entry.manifest));
  for (const value of [
    authorization.evidence_path,
    authorization.fixture_path,
    authorization.manifest_path,
  ]) {
    // The canonical absolute paths must never contain the doubled
    // `spikes/codex-direct-oauth/spikes/codex-direct-oauth` prefix.
    assert.equal(
      value.includes("codex-direct-oauth/spikes/codex-direct-oauth"),
      false,
    );
  }
});

test("T246 evidence and fixture paths handed to the execution body are canonical and never double-prefixed", async () => {
  const entry = await authorizedFreshEntry("T246-C04");
  const invocation = parseT246AttemptArguments(argvOf(entry));
  const authorization = await validateT246Authorization({
    root,
    invocation,
    registry: { schema_version: 1, authorized_attempts: [entry] },
    isTracked: async () => "tracked",
  });
  const canonicalEvidence = path.join(
    repo,
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c04-a42-semantic-parsing.json",
  );
  const canonicalFixture = path.join(
    repo,
    "tests/fixtures/resumes/anonymous-bilingual-resume.pdf",
  );
  assert.equal(authorization.evidence_path, canonicalEvidence);
  assert.equal(authorization.fixture_path, canonicalFixture);
  assert.equal(
    authorization.evidence_path.startsWith(path.join(repo, "spikes")),
    true,
  );
});

test("T246 container manifest path is derived exactly once and never double-prefixed", async () => {
  const entry = await authorizedFreshEntry("T246-C01");
  const invocation = parseT246AttemptArguments(argvOf(entry));
  const authorization = await validateT246Authorization({
    root,
    invocation,
    registry: { schema_version: 1, authorized_attempts: [entry] },
    isTracked: async () => "tracked",
  });
  const containerPath = t246ContainerManifestPath(authorization, root);
  assert.equal(containerPath, "fixtures/t246-matrix/t246-c01.manifest.json");
  assert.equal(containerPath.startsWith("spikes/"), false);
  assert.equal(
    containerPath.includes(
      "spikes/codex-direct-oauth/spikes/codex-direct-oauth",
    ),
    false,
  );
});

test("T246 container manifest path fails closed when the manifest is outside the spike", () => {
  assert.throws(
    () =>
      t246ContainerManifestPath(
        { manifest_path: path.join(repo, "package.json") },
        root,
      ),
    /t246_manifest_outside_spike/,
  );
});
