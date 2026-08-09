import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCredentialFreePreflight } from "./lib/t201-preflight-diagnostics.mjs";
import { prepareImmutableT201Image } from "./lib/t201-image-contract.mjs";
import { executeDockerCommand } from "./lib/t201-preflight-diagnostics.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const outputPath = process.env.NUVITAE_T201_PREFLIGHT_RESULT_PATH;
const preparedImage = await prepareImmutableT201Image({ root, execute: executeDockerCommand });
const result = await runCredentialFreePreflight({ root, outputPath, preparedImage });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.success ? 0 : 1;
