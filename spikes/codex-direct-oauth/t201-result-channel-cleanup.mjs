import { cleanupResultChannel } from "./lib/t201-result-channel-diagnostic.mjs";

const result = await cleanupResultChannel(process.env.NUVITAE_T201_RESULT_PATH);
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.first_failure) {
  process.stderr.write(`safe_result_cleanup_failure:${result.first_failure.operation}:${result.first_failure.errno}\n`);
  process.exitCode = 1;
}
