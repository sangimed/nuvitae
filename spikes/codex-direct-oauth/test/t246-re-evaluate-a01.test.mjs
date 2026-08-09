import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadT246AuthorizationRegistry } from "../lib/t246-authorization.mjs";
import { reEvaluateT246C01A01 } from "../re-evaluate-t246-a01.mjs";

const spikeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("T246 C01-A01 offline re-evaluation proves semantic PASS with runner finalization FAIL", async () => {
  // The test injects a no-op writer so the deterministic verifier never
  // touches the repository evidence directory concurrently with the other
  // spike suites (which snapshot the working tree).
  let written = null;
  const { derived } = await reEvaluateT246C01A01({
    write: async (path, artifact) => {
      written = { path, artifact };
    },
  });
  assert.equal(derived.case_id, "T246-C01");
  assert.equal(derived.attempt_id, "A01");
  assert.equal(derived.semantic_result, "PASS");
  assert.equal(derived.runner_finalization, "FAIL");
  assert.equal(derived.derived_case_pass, true);
  assert.equal(
    derived.official_status,
    "semantic_pass_runner_finalization_failed_not_accepted",
  );
  assert.equal(derived.checks.canonical_gate_passes, true);
  assert.equal(derived.historical_evidence.invocation_attempted, true);
  assert.equal(derived.historical_evidence.immutable, true);
  assert.match(
    derived.historical_evidence.actual_path,
    /spikes\/codex-direct-oauth\/spikes\/codex-direct-oauth\/evidence\//,
  );
  assert.match(
    derived.historical_evidence.canonical_path,
    /^spikes\/codex-direct-oauth\/evidence\//,
  );
  assert.ok(written, "derived acceptance artifact must be emitted");
  assert.match(written.path, /derived-acceptance\.json$/);
  assert.equal(written.artifact.derived_case_pass, true);
});

test("T246 C01-A01 offline re-evaluation fails closed when the attempt is not recorded as consumed", async () => {
  const registry = await loadT246AuthorizationRegistry({ root: spikeRoot });
  const withoutLedger = {
    ...registry,
    consumed_attempts: [],
  };
  await assert.rejects(
    reEvaluateT246C01A01({
      registryLoader: async () => withoutLedger,
    }),
    (error) => error.code === "t246_a01_not_recorded_consumed",
  );
});

test("T246 C01-A01 offline re-evaluation fails closed on historical evidence hash mismatch", async () => {
  await assert.rejects(
    reEvaluateT246C01A01({
      hash: () => "0".repeat(64),
    }),
    (error) => error.code === "t246_a01_historical_evidence_hash_mismatch",
  );
});
