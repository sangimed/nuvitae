import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCredentialFreePreflight } from "./lib/t201-preflight-diagnostics.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const outputPath = process.env.NUVITAE_T201_PREFLIGHT_RESULT_PATH;
const result = await runCredentialFreePreflight({ root, outputPath });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.success ? 0 : 1;
