// Offline T246 evidence aggregator.
//
// The aggregator is intentionally incomplete: no live T246 evidence exists
// and no live execution is authorized. It writes a fail-closed aggregate
// that reports INCOMPLETE and counts zero accepted cases. When accepted live
// evidence exists (after a future explicit authorization step), the same
// aggregator will be extended to validate and consolidate it fail-closed.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadT246AuthorizationRegistry } from "./lib/t246-authorization.mjs";

const SPIKE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SPIKE_ROOT, "..", "..");
const EVIDENCE_DIR = path.join(SPIKE_ROOT, "evidence");
const AGGREGATE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-aggregate.json";

const SEMANTIC_CASES = [
  "T246-C01",
  "T246-C02",
  "T246-C03",
  "T246-C04",
  "T246-C05",
  "T246-C06",
  "T246-C07",
];

export async function consolidateT246Evidence({
  root = SPIKE_ROOT,
  registryLoader = loadT246AuthorizationRegistry,
} = {}) {
  const entries = await fs.readdir(EVIDENCE_DIR).catch(() => []);
  const semanticEvidence = entries.filter((entry) =>
    /^codex-direct-oauth-t246-c0[1-7]-a[0-9]{2}-semantic-parsing\.json$/.test(
      entry,
    ),
  );
  const recoveryEvidence = entries.filter((entry) =>
    /^codex-direct-oauth-t246-c08-a[0-9]{2}-recovery\.json$/.test(entry),
  );
  if (semanticEvidence.length > 0 || recoveryEvidence.length > 0) {
    throw new Error(
      "t246_aggregate_live_evidence_requires_accepted_validation",
    );
  }
  const registry = await registryLoader({ root });
  const consumedAttempts = (registry.consumed_attempts ?? []).map((entry) => ({
    campaign: entry.campaign,
    attempt: entry.attempt,
    semantic_case: entry.semantic_case,
    consumed: true,
    accepted: false,
    invocation_attempted: entry.invocation_attempted ?? null,
    invocation_succeeded: entry.invocation_succeeded ?? null,
    semantic_metrics_passed: entry.semantic_metrics_passed ?? null,
    runner_finalization: entry.runner_finalization ?? null,
    evidence_actual_path: entry.evidence_actual_path ?? null,
    evidence_canonical_path: entry.evidence_canonical_path ?? null,
    evidence_sha256: entry.evidence_sha256 ?? null,
  }));
  const consumedCases = new Set(
    consumedAttempts.map((entry) => entry.semantic_case),
  );
  const aggregate = {
    evidence_classification: "t246_aggregate",
    status: "INCOMPLETE",
    all_cases_passed: false,
    accepted_live_evidence_count: 0,
    consumed_attempts: consumedAttempts,
    semantic_cases: SEMANTIC_CASES.map((caseId) => ({
      case_id: caseId,
      accepted: false,
      consumed: consumedCases.has(caseId),
    })),
    recovery_case: {
      case_id: "T246-C08",
      accepted: false,
      consumed: consumedCases.has("T246-C08"),
    },
    note: "Offline T246 corpus is prepared; C01-A01 was executed once and is CONSUMED (semantic metrics passed, runner finalization failed) but is not accepted; C02-C08 remain NOT_AUTHORIZED. This aggregator stays incomplete until accepted live evidence exists.",
  };
  const aggregatePath = path.join(REPO_ROOT, AGGREGATE_REL_PATH);
  await fs.mkdir(path.dirname(aggregatePath), { recursive: true });
  await fs.writeFile(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`);
  return { aggregate, aggregatePath };
}

consolidateT246Evidence()
  .then(({ aggregate, aggregatePath }) => {
    console.log(
      `T246 aggregate remains INCOMPLETE (${aggregate.accepted_live_evidence_count} accepted, ${aggregate.consumed_attempts.length} consumed); evidence written to ${AGGREGATE_REL_PATH}`,
    );
    console.log(`evidence_abs_path=${aggregatePath}`);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`T246 aggregation failed closed: ${message}`);
    process.exitCode = 1;
  });
