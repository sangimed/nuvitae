#!/usr/bin/env node
// Offline T245 lifecycle evaluation.
//
// Consumes only the accepted sanitized T199/T200 evidence. No OAuth, Codex,
// Docker, credential access, or live lifecycle attempt occurs. The evaluator
// fails closed on missing, malformed, or contradictory evidence and writes the
// sanitized T245 aggregate only when a future accepted live run satisfies every
// canonical criterion. Current incomplete evidence therefore exits non-zero
// and writes nothing.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessT245, writeT245Aggregate } from "./lib/t245-evaluator.mjs";

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(spikeRoot, "../..");

const assessment = await assessT245({ repoRoot });

if (!assessment.summary.t245_live_proof_complete) {
  process.stderr.write(
    `t245_not_ready\n${assessment.summary.failures.join("\n")}\n`,
  );
  process.exit(1);
}

const report = await writeT245Aggregate({ repoRoot });

process.stdout.write(
  `${JSON.stringify(
    {
      aggregate_path:
        "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json",
      pass: report.summary.t245_live_proof_complete,
      mandatory_criteria_count: report.summary.mandatory_criteria_count,
      passing_mandatory_criteria_count:
        report.summary.passing_mandatory_criteria_count,
      live_observed_count: report.summary.live_observed_count,
      deterministic_only_count: report.summary.deterministic_only_count,
      not_exercised_count: report.summary.not_exercised_count,
      recovery_observations: report.recovery_observations,
    },
    null,
    2,
  )}\n`,
);
