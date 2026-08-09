// T246 live broker CLI entrypoint.
//
// Runs inside the immutable spike image with the exact T201 runtime/security
// topology (non-root UID 1000, read-only root, cap_drop ALL,
// no-new-privileges, bounded pids/memory/cpus, tmpfs /tmp). It reuses the
// shared T201 credential recovery/refresh/transport/result-channel machinery
// through the injectable broker core; this file only wires the real
// dependencies. The broker never persists raw model output, transcripts,
// credentials, or account identifiers in its result.
import { runT246Broker } from "./lib/t246-live-broker-core.mjs";

const outcome = await runT246Broker();
process.exitCode = outcome.exitCode;
