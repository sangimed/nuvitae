#!/usr/bin/env node
// Offline T201 matrix consolidation.
//
// Rebuilds the checked-in T201 aggregate matrix from sanitized evidence files
// without any OAuth, Codex, Docker, or live Campaign-B attempt. The
// authoritative evidence for each case is the single passing attempt recorded
// in the Campaign-B authorization registry; C01's legacy canonical evidence is
// preserved unchanged. The command fails closed on ambiguous successful
// attempts or an invalid matrix/registry.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  consolidateT201MatrixEvidence,
  selectT201AuthoritativeEvidenceFiles,
} from "./lib/t201-live-runner-evidence.mjs";

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const [matrixArg, registryArg] = process.argv.slice(2);
const matrixPath = path.resolve(
  spikeRoot,
  matrixArg ?? "evidence/codex-direct-oauth-t201-matrix.json",
);
const registryPath = path.resolve(
  spikeRoot,
  registryArg ?? "campaign-b-authorizations.json",
);
const repoRoot = path.resolve(spikeRoot, "../..");

const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const authoritative = await selectT201AuthoritativeEvidenceFiles({
  registry,
  repoRoot,
});
const matrix = await consolidateT201MatrixEvidence({
  matrixPath,
  registryPath,
  repoRoot,
});

process.stdout.write(
  `${JSON.stringify(
    {
      matrix_path: matrixPath,
      matrix_pass: matrix.matrix_pass,
      matrix_state: matrix.matrix_state,
      authoritative_attempts: Object.fromEntries(
        [...authoritative.entries()].map(([caseId, selection]) => [
          caseId,
          {
            campaign: selection.campaign,
            attempt: selection.attempt,
            evidence_path: selection.evidence_path,
          },
        ]),
      ),
      cases: matrix.cases.map((item) => ({
        case_id: item.case_id,
        pass: item.pass,
      })),
    },
    null,
    2,
  )}\n`,
);
