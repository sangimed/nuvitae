#!/usr/bin/env node
// Offline T202 re-measurement.
//
// Rebuilds the checked-in sanitized T202 aggregate from accepted sanitized
// evidence only. No OAuth, Codex, Docker, credential access, or live Campaign-B
// attempt occurs. The evaluator fails closed on missing, malformed,
// conflicting, or ambiguous evidence and is deterministic and idempotent.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  T202_AGGREGATE_REL_PATH,
  writeT202Aggregate,
} from "./lib/t202-evaluator.mjs";

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(spikeRoot, "../..");

const report = await writeT202Aggregate({ repoRoot });

process.stdout.write(
  `${JSON.stringify(
    {
      aggregate_path: T202_AGGREGATE_REL_PATH,
      matrix_state: report.matrix.matrix_state,
      matrix_pass: report.matrix.matrix_pass,
      authoritative_attempts: Object.keys(report.authoritative_attempts),
      metrics: report.metrics.map((metric) => ({
        key: metric.key,
        numerator: metric.numerator,
        denominator: metric.denominator,
        value: metric.value,
        pass: metric.pass,
      })),
      unmeasured_metrics: report.unmeasured_metrics.map(
        (metric) => metric.key,
      ),
      historical_failed_attempts: report.historical_failed_attempts.attempts
        .length,
    },
    null,
    2,
  )}\n`,
);
