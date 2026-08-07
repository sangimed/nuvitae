// Dedicated T246 live runner (offline-safe).
//
// The runner implements the single-case attempt contract that a future
// authorized T246 live run will use. It is deliberately inert today:
// `--mode live` requires an `AUTHORIZED` registry entry, and every registry
// entry is `NOT_AUTHORIZED`, so the runner always stops before credential
// recovery, broker invocation, or any Codex/OpenAI/provider request.
// `--mode offline` performs only deterministic artifact verification and
// prints the prepared case row; it never touches credentials or the network.
const { parseT246AttemptArguments, validateT246Authorization } = await import(
  new URL("./lib/t246-authorization.mjs", import.meta.url)
);
const { collectT246CorpusProof, T246_CASES } = await import(
  new URL("./lib/t246-corpus-verification.mjs", import.meta.url)
);

function usage() {
  return [
    "Usage: node spikes/codex-direct-oauth/t246-live-runner.mjs --mode <offline|live>",
    "  --campaign T246-C0X --attempt A01 --semantic-case T246-C0X",
    "  --fixture <path> --manifest <path> --evidence <path>",
    "  --max-broker-runs <n> --max-semantic-backend-requests <n> --automatic-retries <n>",
  ].join("\n");
}

function parseArguments(argv) {
  const values = {};
  const attemptArgs = [];
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--mode") {
      values.mode = argv[index + 1];
      index += 1;
      continue;
    }
    values[option] = argv[index + 1];
    attemptArgs.push(option, argv[index + 1]);
    index += 1;
  }
  return { ...values, attemptArgs };
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  if (args.mode !== "offline" && args.mode !== "live") {
    throw new Error(`t246_mode_required\n${usage()}`);
  }
  const invocation = parseT246AttemptArguments(args.attemptArgs);
  const root = new URL(".", import.meta.url).pathname;
  if (args.mode === "live") {
    const authorization = await validateT246Authorization({ root, invocation });
    throw new Error(
      `t246_live_path_not_reachable:${authorization.semantic_case}`,
    );
  }
  const { rows } = await collectT246CorpusProof();
  const row = rows.find(
    (candidate) => candidate.case_id === invocation.semantic_case,
  );
  if (row === undefined) {
    throw new Error(`t246_case_not_in_corpus:${invocation.semantic_case}`);
  }
  return {
    row,
    caseDefinition: T246_CASES.find(
      (c) => c.caseId === invocation.semantic_case,
    ),
  };
}

run()
  .then(({ row }) => {
    console.log(
      `T246 offline case check passed: ${row.case_id} (${row.scenario}); fixture=${row.fixture_sha256.slice(0, 16)}... transcript=${(row.transcript_sha256 ?? row.recovery_input_sha256).slice(0, 16)}...`,
    );
    console.log(
      `live_request_required=${row.live_request_required} live_ready=${row.live_ready} authorized=false`,
    );
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`T246 runner stopped: ${message}`);
    process.exitCode = 1;
  });
