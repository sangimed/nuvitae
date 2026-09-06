import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DeterministicSemanticParserProvider,
  deterministicSemanticProviderKind,
} from "@nuvitae/import-application/testing";
import { CodexDirectProviderAdapter } from "@nuvitae/import-application/codex";
import {
  WORKER_SEMANTIC_PARSER_PROVIDER,
  createProductionSemanticParserProvider,
  workerImportRuntimeProviders,
} from "./worker-import-runtime.providers.js";
import { workerE2EImportRuntimeProviders } from "./worker-e2e-import-runtime.providers.js";

interface ProviderRegistration {
  readonly provide: unknown;
  readonly useFactory: () => unknown;
}

function registrationFor(
  providers: readonly unknown[],
  token: unknown,
): ProviderRegistration {
  const registration = providers.find(
    (provider) =>
      typeof provider === "object" &&
      provider !== null &&
      "provide" in provider &&
      (provider as { provide?: unknown }).provide === token,
  );
  if (registration === undefined) {
    throw new Error(`Missing provider registration for ${String(token)}.`);
  }
  return registration as ProviderRegistration;
}

describe("semantic provider registration boundaries", () => {
  it("registers the production Codex adapter without invoking it at startup", () => {
    const repository = {
      findConnectionByProviderAndOwner: async () => null,
    };
    const sessionStore = {
      readSession: async () => new Uint8Array(),
    };
    const provider = createProductionSemanticParserProvider(
      repository as never,
      sessionStore as never,
    );
    expect(provider).toBeInstanceOf(CodexDirectProviderAdapter);
    const registration = registrationFor(
      workerImportRuntimeProviders,
      WORKER_SEMANTIC_PARSER_PROVIDER,
    );
    expect(registration.useFactory).toBe(
      createProductionSemanticParserProvider,
    );
  });

  it("registers the deterministic provider only in the explicit E2E composition", () => {
    const e2eRegistrations = workerE2EImportRuntimeProviders.filter(
      (provider) =>
        typeof provider === "object" &&
        provider !== null &&
        "provide" in provider &&
        (provider as { provide?: unknown }).provide ===
          WORKER_SEMANTIC_PARSER_PROVIDER,
    );
    expect(e2eRegistrations).toHaveLength(1);
    const provider = registrationFor(
      workerE2EImportRuntimeProviders,
      WORKER_SEMANTIC_PARSER_PROVIDER,
    ).useFactory();
    expect(provider).toBeInstanceOf(DeterministicSemanticParserProvider);
    expect((provider as DeterministicSemanticParserProvider).providerKind).toBe(
      deterministicSemanticProviderKind,
    );
  });

  it("keeps the testing provider import out of the production module graph", async () => {
    const runtimeProviders = await readFile(
      new URL("./worker-import-runtime.providers.ts", import.meta.url),
      "utf8",
    );
    expect(runtimeProviders).not.toContain(
      "@nuvitae/import-application/testing",
    );

    const workerModule = await readFile(
      new URL("../worker.module.ts", import.meta.url),
      "utf8",
    );
    expect(workerModule).not.toContain("worker-e2e.module");
  });
});
