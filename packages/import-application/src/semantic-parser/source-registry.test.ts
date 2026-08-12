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

  it("uses fragmentId as the authoritative anchor", () => {
    const registry = createSourceRegistry([
      { order: 0, line: 1, text: "Paris, France" },
      { order: 1, line: 2, text: "Senior Backend Engineer in Paris, France" },
    ]);

    expect(
      registry.resolve({ fragmentId: "fragment-2", quote: "Paris, France" }),
    ).toMatchObject({
      ok: true,
      fragment: { fragmentId: "fragment-2" },
    });
    expect(
      registry.resolve({ fragmentId: "fragment-99", quote: "Paris, France" }),
    ).toEqual({ ok: false, reason: "source_fragment_not_found" });
    expect(
      registry.resolve({
        fragmentId: "fragment-1",
        quote: "Senior Backend Engineer",
      }),
    ).toEqual({ ok: false, reason: "quote_not_found_in_fragment" });
  });

  it("rejects repeated quotes only within the anchored fragment", () => {
    const registry = createSourceRegistry([
      { order: 0, line: 1, text: "TypeScript TypeScript" },
      { order: 1, line: 2, text: "TypeScript" },
    ]);

    expect(
      registry.resolve({ fragmentId: "fragment-1", quote: "TypeScript" }),
    ).toEqual({
      ok: false,
      reason: "quote_ambiguous_within_fragment",
    });
    expect(
      registry.resolve({ fragmentId: "fragment-2", quote: "TypeScript" }),
    ).toMatchObject({
      ok: true,
      fragment: { fragmentId: "fragment-2" },
    });
  });

  it("fails closed when a quote exists only outside the referenced fragment", () => {
    const registry = createSourceRegistry([
      { order: 0, line: 1, text: "Example University" },
      { order: 1, line: 2, text: "MSc Computer Science — Example University" },
    ]);

    expect(
      registry.resolve({
        fragmentId: "fragment-1",
        quote: "MSc Computer Science",
      }),
    ).toEqual({ ok: false, reason: "quote_not_found_in_fragment" });
  });

  it("does not join adjacent fragments to rescue a split skill quote", () => {
    const registry = createSourceRegistry([
      { order: 0, line: 1, text: "Type" },
      { order: 1, line: 1, text: "Script" },
    ]);

    expect(
      registry.resolve({
        fragmentId: "fragment-1",
        quote: "TypeScript",
      }),
    ).toEqual({ ok: false, reason: "quote_not_found_in_fragment" });
  });

  it("does not rescue a skill whose provider fragment ID points at a sibling", () => {
    const registry = createSourceRegistry([
      { order: 0, line: 1, text: "Python" },
      { order: 1, line: 1, text: "Kubernetes" },
    ]);

    expect(
      registry.resolve({
        fragmentId: "fragment-1",
        quote: "Kubernetes",
      }),
    ).toEqual({ ok: false, reason: "quote_not_found_in_fragment" });
    expect(
      registry.resolve({
        fragmentId: "fragment-2",
        quote: "Kubernetes",
      }),
    ).toMatchObject({ ok: true });
  });

  it("rejects malformed source-reference metadata without throwing", () => {
    const registry = createSourceRegistry([
      { order: 0, line: 1, text: "Alex Martin" },
    ]);

    expect(
      registry.resolve({ fragmentId: null, quote: "Alex Martin" } as never),
    ).toEqual({ ok: false, reason: "malformed_source_ref" });
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
