import { probeResultChannel } from "./lib/t201-result-channel-diagnostic.mjs";

const resultPath = process.env.NUVITAE_T201_RESULT_PATH;
if (!resultPath?.startsWith("/spike/result/")) {
  process.stderr.write("safe_result_preflight_failure:invalid_result_path:EINVAL\n");
  process.exitCode = 2;
} else {
  const result = await probeResultChannel(resultPath);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.first_failure) {
    process.stderr.write(`safe_result_preflight_failure:${result.first_failure.operation}:${result.first_failure.errno}\n`);
    process.exitCode = 1;
  }
}
