import { describe, expect, it } from "vitest";

import {
  resumeSemanticParserContractVersion,
  type ResumeSemanticParseRequest,
} from "@nuvitae/contracts";

import {
  createSourceRegistry,
  createSourceRegistryFromSemanticParseRequest,
} from "./source-registry.js";

describe("Nuvitae-owned source registry", () => {
  it("recomputes canonical hashes and resolves unique quoted substrings", () => {
    const registry = createSourceRegistry([
      { order: 0, line: 4, text: "Name: Alex Martin" },
    ]);

    const result = registry.resolve({
      fragmentId: "fragment-1",
      quote: "Alex Martin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fragment.hash).toMatch(/^[a-f0-9]{64}$/u);
      expect(result.start).toBe(6);
      expect(result.end).toBe(17);
    }
  });

  it("fails closed for unknown and repeated quote matches", () => {
    const registry = createSourceRegistry([
      { order: 0, line: 1, text: "TypeScript TypeScript" },
    ]);

    expect(
      registry.resolve({ fragmentId: "fragment-99", quote: "TypeScript" }),
    ).toEqual({ ok: false, reason: "unknown_fragment" });
    expect(
      registry.resolve({ fragmentId: "fragment-1", quote: "TypeScript" }),
    ).toEqual({ ok: false, reason: "quote_ambiguous" });
  });

  it("adapts current V1 request fragments without importing parser types", () => {
    const request: ResumeSemanticParseRequest = {
      contractVersion: resumeSemanticParserContractVersion,
      importId: "import-1",
      correlationId: "correlation-1",
      documentFormat: "pdf",
      languageContext: {
        detectedLanguage: "english",
        confidence: null,
        textDirection: "ltr",
      },
      normalizedTranscript: {
        text: "Alex Martin",
        sha256: "0".repeat(64),
        lineCount: 1,
      },
      sourceFragments: [
        {
          order: 0,
          line: 1,
          text: "Alex Martin",
          hash: "0".repeat(64),
          bounds: { lineStart: 1, lineEnd: 1, start: 0, end: 11 },
        },
      ],
      fragmentHashes: ["0".repeat(64)],
      formatMetadata: {
        sourceFormat: "pdf",
        extractionMode: "selectable_text",
        renderedPageCount: 1,
        parserVersion: null,
      },
    };
    const registry = createSourceRegistryFromSemanticParseRequest(request);

    expect(registry.get("fragment-1")?.hash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
