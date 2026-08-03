import type { Provider } from "@nestjs/common";
import { createDeterministicSemanticParserProvider } from "@nuvitae/import-application/testing";
import {
  WORKER_SEMANTIC_PARSER_PROVIDER,
  workerImportRuntimeProviders,
} from "./worker-import-runtime.providers.js";

/**
 * Explicit local/E2E worker provider composition.
 *
 * This composition reuses every production worker provider except the semantic
 * provider registration, which it replaces with the deterministic test
 * adapter through the dedicated `@nuvitae/import-application/testing` import
 * path. It is imported only by `WorkerE2EModule`, which the worker runtime
 * selects exclusively when `NUVITAE_SEMANTIC_PROVIDER_MODE` is exactly
 * `deterministic-e2e-test`. The production `WorkerModule` never imports this
 * file and never instantiates the deterministic provider.
 */
export const workerE2EImportRuntimeProviders: Provider[] = [
  ...workerImportRuntimeProviders.filter(
    (provider) =>
      typeof provider !== "object" ||
      provider === null ||
      !("provide" in provider) ||
      (provider as { provide?: unknown }).provide !==
        WORKER_SEMANTIC_PARSER_PROVIDER,
  ),
  {
    provide: WORKER_SEMANTIC_PARSER_PROVIDER,
    useFactory: createDeterministicSemanticParserProvider,
  },
];
