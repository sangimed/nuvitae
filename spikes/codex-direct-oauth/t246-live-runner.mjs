// Dedicated T246 live runner.
//
// The runner implements the single-case attempt contract for an authorized
// T246 live run. `--mode offline` performs only deterministic artifact
// verification (never credentials/network). `--mode preflight` exercises every
// live check up to, but excluding, credential-volume access and provider
// invocation (authorization, transcript regeneration, immutable image,
// credential-free topology preflight, and a broker credential-free
// rehearsal). `--mode live` runs the same pre-credential gates and then
// executes the bounded live path through the qualified T201 infrastructure.
// The runner never defaults an attempt, never targets multiple cases, and
// stops before credentials on any mismatch.
const { parseT246AttemptArguments } = await import(
  new URL("./lib/t246-authorization.mjs", import.meta.url)
);
const { collectT246CorpusProof, T246_CASES } = await import(
  new URL("./lib/t246-corpus-verification.mjs", import.meta.url)
);
const { runT246LiveBridge } = await import(
  new URL("./lib/t246-live-bridge.mjs", import.meta.url)
);

function usage() {
  return [
    "Usage: node spikes/codex-direct-oauth/t246-live-runner.mjs --mode <offline|preflight|live>",
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
  if (
    args.mode !== "offline" &&
    args.mode !== "preflight" &&
    args.mode !== "live"
  ) {
    throw new Error(`t246_mode_required\n${usage()}`);
  }
  const invocation = parseT246AttemptArguments(args.attemptArgs);
  const root = new URL(".", import.meta.url).pathname;
  if (args.mode === "preflight" || args.mode === "live") {
    const outcome = await runT246LiveBridge({
      root,
      invocation,
      mode: args.mode,
    });
    if (!outcome.success) {
      throw new Error(
        `t246_${args.mode}_failed:${outcome.phase}:exit=${outcome.exitCode ?? "n/a"}`,
      );
    }
    return {
      outcome,
      mode: args.mode,
      caseDefinition: T246_CASES.find(
        (c) => c.caseId === invocation.semantic_case,
      ),
    };
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
  .then((result) => {
    if (result.mode === "preflight" || result.mode === "live") {
      const { outcome, mode } = result;
      console.log(
        `T246 ${mode} path passed: ${outcome.authorization.semantic_case} ${outcome.authorization.attempt} (phase=${outcome.phase})`,
      );
      console.log(
        `fixture_sha256=${outcome.fixture_sha256} transcript_sha256=${outcome.transcript_sha256} manifest_sha256=${outcome.manifest_sha256}`,
      );
      console.log(
        `credential_recovery_attempted=${mode === "live"} semantic_backend_requests=${mode === "live" ? "at_most_1" : "0"}`,
      );
      return;
    }
    const { row } = result;
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
