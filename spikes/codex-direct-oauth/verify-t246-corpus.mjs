// Deterministic offline verifier for the complete T246 real-document corpus
// (C01-C08). See lib/t246-corpus-verification.mjs for the checks. Runs
// entirely offline: no OAuth, Codex/OpenAI/provider request, network,
// credential access, live runner, or Campaign-B attempt.
const { verifyT246Corpus } = await import(
  new URL("./lib/t246-corpus-verification.mjs", import.meta.url)
);

verifyT246Corpus()
  .then(({ evidence, evidencePath }) => {
    const semanticCases = evidence.cases.filter(
      (row) => row.live_request_required,
    ).length;
    console.log(
      `T246 corpus offline verification passed: ${evidence.cases.length} cases (${semanticCases} semantic, ${evidence.cases.length - semanticCases} recovery); evidence written to ${evidencePath}`,
    );
    console.log(`request_budget=${JSON.stringify(evidence.request_budget)}`);
    console.log(`evidence_abs_path=${evidencePath}`);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`T246 corpus verification failed: ${message}`);
    process.exitCode = 1;
  });
