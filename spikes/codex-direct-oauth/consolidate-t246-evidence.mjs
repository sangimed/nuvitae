// Offline T246 evidence aggregator.
//
// The aggregator is intentionally incomplete: accepted evidence can be
// reconciled, but the full T246 matrix is not complete and no new live
// execution is authorized by this command. It writes a fail-closed aggregate
// that preserves only independently verified sanitized evidence.
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadT246AuthorizationRegistry } from "./lib/t246-authorization.mjs";
import { t246CompleteGate } from "./lib/t246-live-runner-evidence.mjs";
import { verifyT246C08RecoveryEvidence } from "./lib/t246-recovery.mjs";

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

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

function consumedEvidenceForPath(registry, evidencePath) {
  return (registry.consumed_attempts ?? []).find(
    (entry) => entry.evidence_canonical_path === evidencePath,
  );
}

async function verifyConsumedCanonicalEvidence(registry, evidenceNames) {
  for (const evidenceName of evidenceNames) {
    const evidencePath = `${AGGREGATE_REL_PATH.replace(
      "codex-direct-oauth-t246-aggregate.json",
      evidenceName,
    )}`;
    const consumed = consumedEvidenceForPath(registry, evidencePath);
    if (!consumed) {
      throw new Error("t246_aggregate_live_evidence_requires_consumed_record");
    }
    const bytes = await fs.readFile(path.join(REPO_ROOT, evidencePath));
    if (
      consumed.evidence_sha256 !== sha256(bytes) ||
      consumed.evidence_size_bytes !== bytes.byteLength
    ) {
      throw new Error("t246_consumed_evidence_pin_mismatch");
    }
  }
}

async function readAndVerifyAcceptedEvidence(registry, consumedAttempts) {
  const accepted = [];
  for (const entry of consumedAttempts) {
    if (entry.semantic_case === "T246-C08") continue;
    if (entry.case_pass !== true) continue;
    const evidencePath = entry.evidence_canonical_path;
    const evidence = JSON.parse(
      await fs.readFile(path.join(REPO_ROOT, evidencePath), "utf8"),
    );
    if (
      evidence.case_id !== entry.semantic_case ||
      evidence.attempt_id !== entry.attempt ||
      evidence.case_pass !== true ||
      evidence.safe_final_state !== "complete" ||
      !t246CompleteGate(evidence, "success")
    ) {
      throw new Error("t246_accepted_evidence_gate_mismatch");
    }
    accepted.push({
      campaign: entry.campaign,
      attempt: entry.attempt,
      semantic_case: entry.semantic_case,
      evidence_canonical_path: evidencePath,
      evidence_sha256: entry.evidence_sha256,
      evidence_size_bytes: entry.evidence_size_bytes,
      case_pass: true,
      safe_final_state: "complete",
    });
  }
  return accepted;
}

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
  const recoveryEvidenceNames = entries.filter((entry) =>
    /^codex-direct-oauth-t246-c08-a[0-9]{2}-recovery\.json$/.test(entry),
  );
  const registry = await registryLoader({ root });
  await verifyConsumedCanonicalEvidence(registry, [
    ...semanticEvidence,
    ...recoveryEvidenceNames,
  ]);
  const consumedAttempts = (registry.consumed_attempts ?? []).map((entry) => ({
    campaign: entry.campaign,
    attempt: entry.attempt,
    semantic_case: entry.semantic_case,
    consumed: true,
    accepted: entry.case_pass === true,
    invocation_attempted: entry.invocation_attempted ?? null,
    invocation_succeeded: entry.invocation_succeeded ?? null,
    semantic_metrics_passed: entry.semantic_metrics_passed ?? null,
    exact_fact_recall: entry.exact_fact_recall ?? null,
    high_priority_fact_recall: entry.high_priority_fact_recall ?? null,
    unsupported_fact_count: entry.unsupported_fact_count ?? null,
    forbidden_inference_count: entry.forbidden_inference_count ?? null,
    missing_evidence_count: entry.missing_evidence_count ?? null,
    invalid_evidence_count: entry.invalid_evidence_count ?? null,
    grounding: entry.grounding ?? null,
    no_invention: entry.no_invention ?? null,
    parsing: entry.parsing ?? null,
    runner_finalization: entry.runner_finalization ?? null,
    evidence_actual_path: entry.evidence_actual_path ?? null,
    evidence_canonical_path: entry.evidence_canonical_path ?? null,
    evidence_sha256: entry.evidence_sha256 ?? null,
    evidence_size_bytes: entry.evidence_size_bytes ?? null,
    primary_failure_phase: entry.primary_failure_phase ?? null,
    primary_failure_category: entry.primary_failure_category ?? null,
    safe_final_state: entry.safe_final_state ?? null,
    case_pass: entry.case_pass ?? null,
  }));
  const acceptedLiveAttempts = await readAndVerifyAcceptedEvidence(
    registry,
    consumedAttempts,
  );
  const recoveryConsumed = consumedAttempts.find(
    (entry) => entry.semantic_case === "T246-C08",
  );
  let recoveryEvidence = null;
  if (recoveryConsumed) {
    recoveryEvidence = JSON.parse(
      await fs.readFile(
        path.join(REPO_ROOT, recoveryConsumed.evidence_canonical_path),
        "utf8",
      ),
    );
    verifyT246C08RecoveryEvidence(recoveryEvidence);
    if (
      recoveryEvidence.evidence_sha256 !== undefined ||
      recoveryEvidence.evidence_size_bytes !== undefined
    ) {
      throw new Error("t246_recovery_raw_file_metadata_persisted");
    }
  }
  const acceptedCases = new Set(
    acceptedLiveAttempts.map((entry) => entry.semantic_case),
  );
  const consumedCases = new Set(
    consumedAttempts.map((entry) => entry.semantic_case),
  );
  const recoveryPassed = recoveryConsumed?.case_pass === true;
  const allCasesConsumed =
    SEMANTIC_CASES.every((caseId) => consumedCases.has(caseId)) &&
    recoveryConsumed !== undefined;
  const allCasesPassed =
    SEMANTIC_CASES.every((caseId) => acceptedCases.has(caseId)) &&
    recoveryPassed;
  const qualificationStatus = !allCasesConsumed
    ? "INCOMPLETE"
    : allCasesPassed
      ? "PASS"
      : "FAILED";
  const aggregate = {
    evidence_classification: "t246_aggregate",
    status: qualificationStatus,
    qualification_result: qualificationStatus,
    all_cases_consumed: allCasesConsumed,
    all_cases_passed: allCasesPassed,
    accepted_live_evidence_count: acceptedLiveAttempts.length,
    accepted_live_attempts: acceptedLiveAttempts,
    consumed_attempts: consumedAttempts,
    passed_case_count: consumedAttempts.filter(
      (entry) => entry.case_pass === true,
    ).length,
    failed_case_count: SEMANTIC_CASES.filter(
      (caseId) =>
        consumedAttempts.some((entry) => entry.semantic_case === caseId) &&
        !acceptedCases.has(caseId),
    ).length,
    harness_invalid_attempts: consumedAttempts
      .filter(
        (entry) =>
          entry.semantic_case !== "T246-C08" &&
          entry.runner_finalization === "failed",
      )
      .map((entry) => ({
        campaign: entry.campaign,
        attempt: entry.attempt,
        evidence_canonical_path: entry.evidence_canonical_path,
      })),
    harness_invalid_attempt_count: consumedAttempts.filter(
      (entry) =>
        entry.semantic_case !== "T246-C08" &&
        entry.runner_finalization === "failed",
    ).length,
    semantic_recall_results: consumedAttempts
      .filter((entry) => entry.semantic_case !== "T246-C08")
      .map((entry) => ({
        campaign: entry.campaign,
        attempt: entry.attempt,
        exact_fact_recall: entry.exact_fact_recall ?? null,
        high_priority_fact_recall: entry.high_priority_fact_recall ?? null,
        case_pass: entry.case_pass ?? null,
      })),
    aggregate_hallucination_unsupported_fact_results: {
      total_unsupported_fact_count: consumedAttempts
        .filter((entry) => entry.semantic_case !== "T246-C08")
        .reduce(
          (total, entry) => total + (entry.unsupported_fact_count ?? 0),
          0,
        ),
      total_forbidden_inference_count: consumedAttempts
        .filter((entry) => entry.semantic_case !== "T246-C08")
        .reduce(
          (total, entry) => total + (entry.forbidden_inference_count ?? 0),
          0,
        ),
      pass: consumedAttempts
        .filter((entry) => entry.semantic_case !== "T246-C08")
        .every(
          (entry) =>
            (entry.unsupported_fact_count ?? 0) === 0 &&
            (entry.forbidden_inference_count ?? 0) === 0,
        ),
    },
    grounding_no_invention_results: {
      all_grounding_pass: consumedAttempts
        .filter((entry) => entry.semantic_case !== "T246-C08")
        .every((entry) => entry.grounding !== false),
      all_no_invention_pass: consumedAttempts
        .filter((entry) => entry.semantic_case !== "T246-C08")
        .every((entry) => entry.no_invention !== false),
    },
    prompt_isolation_result: consumedAttempts.find(
      (entry) => entry.semantic_case === "T246-C07",
    )
      ? JSON.parse(
          await fs.readFile(
            path.join(
              REPO_ROOT,
              consumedAttempts.find(
                (entry) => entry.semantic_case === "T246-C07",
              ).evidence_canonical_path,
            ),
            "utf8",
          ),
        ).prompt_isolation_diagnostics
      : null,
    malformed_recovery_result: recoveryEvidence
      ? {
          case_id: recoveryEvidence.case_id,
          attempt: recoveryEvidence.attempt_id,
          malformed_detection: recoveryEvidence.malformed_detection,
          safe_recovery_category: recoveryEvidence.safe_recovery_category,
          invocation_attempted: recoveryEvidence.invocation_attempted,
          semantic_backend_requests: recoveryEvidence.semantic_backend_requests,
          credential_recovery_attempted:
            recoveryEvidence.credential_recovery_attempted,
          broker_runs: recoveryEvidence.broker_runs,
          recovery_behavior_pass: recoveryEvidence.recovery_behavior_pass,
          case_pass: recoveryEvidence.case_pass,
          secret_scan_result: recoveryEvidence.secret_scan_result,
        }
      : null,
    semantic_cases: SEMANTIC_CASES.map((caseId) => ({
      case_id: caseId,
      accepted: acceptedCases.has(caseId),
      consumed: consumedCases.has(caseId),
    })),
    recovery_case: {
      case_id: "T246-C08",
      accepted: recoveryPassed,
      consumed: consumedCases.has("T246-C08"),
      evidence_canonical_path:
        recoveryConsumed?.evidence_canonical_path ?? null,
    },
    case_matrix: [
      ...SEMANTIC_CASES.map((caseId) => ({
        case_id: caseId,
        result: acceptedCases.has(caseId)
          ? "PASS"
          : consumedCases.has(caseId)
            ? "FAIL"
            : "INCOMPLETE",
        consumed: consumedCases.has(caseId),
        attempts: consumedAttempts
          .filter((entry) => entry.semantic_case === caseId)
          .map((entry) => ({
            attempt: entry.attempt,
            case_pass: entry.case_pass,
            runner_finalization: entry.runner_finalization,
            exact_fact_recall: entry.exact_fact_recall,
            high_priority_fact_recall: entry.high_priority_fact_recall,
          })),
      })),
      {
        case_id: "T246-C08",
        result: recoveryPassed
          ? "PASS"
          : recoveryConsumed
            ? "FAIL"
            : "INCOMPLETE",
        consumed: consumedCases.has("T246-C08"),
        attempts: recoveryConsumed
          ? [
              {
                attempt: recoveryConsumed.attempt,
                case_pass: recoveryConsumed.case_pass,
                runner_finalization: recoveryConsumed.runner_finalization,
                exact_fact_recall: null,
                high_priority_fact_recall: null,
              },
            ]
          : [],
      },
    ],
    note: "Final T246 qualification preserves the consumed canonical results: C01-A01 is harness-invalid, C01-A02 is a semantic FAIL at 23/24 exact facts and 17/18 high-priority facts, C04-A01 is a semantic FAIL at 18/24 exact facts and 13/19 high-priority facts, C02/C03/C05/C06/C07 are PASS, and C08 is PASS through the offline malformed-recovery contract. All C01-C08 attempts are consumed; no replacement attempt is created. The qualification result is FAILED because the all-case contract requires every case to pass.",
  };
  const aggregatePath = path.join(REPO_ROOT, AGGREGATE_REL_PATH);
  await fs.mkdir(path.dirname(aggregatePath), { recursive: true });
  await fs.writeFile(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`);
  return { aggregate, aggregatePath };
}

consolidateT246Evidence()
  .then(({ aggregate, aggregatePath }) => {
    console.log(
      `T246 aggregate ${aggregate.status} (${aggregate.passed_case_count} passed, ${aggregate.failed_case_count} failed, ${aggregate.consumed_attempts.length} consumed); evidence written to ${AGGREGATE_REL_PATH}`,
    );
    console.log(`evidence_abs_path=${aggregatePath}`);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`T246 aggregation failed closed: ${message}`);
    process.exitCode = 1;
  });
