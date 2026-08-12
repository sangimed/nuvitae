import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AIProviderRuntimeConnection } from "@nuvitae/domain";
import {
  CodexDirectProviderAdapter,
  type CodexDirectProviderAdapterPorts,
} from "./codex-direct-provider-adapter.js";

const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const connectionA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const connectionB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const referenceA = "a".repeat(64);
const referenceB = "b".repeat(64);
const now = new Date("2026-08-08T12:00:00.000Z");

function atom(value: string) {
  return {
    value,
    sourceRefs: [{ fragmentId: "fragment-1", quote: value }],
  };
}

function response() {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v2" as const,
    sections: {
      contact: {
        fullName: atom("Ada"),
        email: null,
        phone: null,
        location: null,
        website: null,
      },
      headline: null,
      summary: null,
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [],
    ambiguities: [],
    conflicts: [],
  };
}

function request() {
  const text = "Ada";
  const hash = createHash("sha256").update(text).digest("hex");
  return {
    contractVersion: "nuvitae.resume-semantic-parser.v1" as const,
    importId: "import-1",
    correlationId: "import-1",
    documentFormat: "pdf" as const,
    languageContext: {
      detectedLanguage: "english" as const,
      confidence: null,
      textDirection: "ltr" as const,
    },
    normalizedTranscript: { text, sha256: hash, lineCount: 1 },
    sourceFragments: [
      {
        order: 0,
        line: 1,
        text,
        hash,
        bounds: { lineStart: 1, lineEnd: 1, start: 0, end: 3 },
      },
    ],
    fragmentHashes: [hash],
    formatMetadata: {
      sourceFormat: "pdf" as const,
      extractionMode: "selectable_text" as const,
      renderedPageCount: 1,
      parserVersion: null,
    },
  };
}

function connection(
  ownerUserId: string = ownerA,
  id: string = connectionA,
  sessionReference: string | null = referenceA,
  overrides: Partial<AIProviderRuntimeConnection> = {},
): AIProviderRuntimeConnection {
  return {
    id,
    ownerUserId,
    providerKind: "codex",
    displayName: "Codex",
    connectionStatus: "connected",
    authenticationStatus: "authenticated",
    availabilityStatus: "available",
    capabilities: {
      supportedDocumentFormats: ["pdf", "docx"],
      supportedDocumentLanguages: [
        "english",
        "french",
        "bilingual_french_english",
      ],
      supportsNonInteractiveParsing: true,
      supportsStructuredJson: true,
      supportsCanonicalFlattenedEvidence: true,
      acceptsNormalizedTranscript: true,
      acceptsRawStoragePaths: false,
      exposesCredentialsToDomain: false,
      predictsPhysicalCoordinates: false,
      maxRequestJsonBytes: 256000,
      maxResponseJsonBytes: 256000,
      maxTimeoutMs: 30000,
    },
    capabilitySnapshotAt: now,
    sessionReference,
    lastCheckedAt: now,
    loginStartedAt: now,
    connectedAt: now,
    refreshedAt: now,
    expiresAt: null,
    disconnectedAt: null,
    revokedAt: null,
    revocationReason: null,
    createdAt: now,
    deletedAt: null,
    deletionReason: null,
    ...overrides,
  };
}

function session(
  reference: string,
  expiresAt: string | null = null,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      v: 1,
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accountId: "account-id",
      expiresAt,
      reference,
    }),
  );
}

function setup(
  current: AIProviderRuntimeConnection | null = connection(ownerA, connectionA),
  transportResult:
    | { readonly ok: true; readonly normalizedOutput: string }
    | { readonly ok: false; readonly category: never } = {
    ok: true,
    normalizedOutput: JSON.stringify(response()),
  },
) {
  const transport = { invoke: vi.fn(async () => transportResult) };
  const onV2EnvelopeDiagnostic = vi.fn();
  const repository = {
    findConnectionByProviderAndOwner: vi.fn(
      async (_provider: string, owner: string) =>
        current?.ownerUserId === owner ? current : null,
    ),
  };
  const sessionStore = {
    readSession: vi.fn(
      async (input: {
        ownerUserId: string;
        connectionId: string;
        sessionReference: string;
      }) => {
        if (
          input.ownerUserId !== ownerA ||
          input.connectionId !== connectionA ||
          input.sessionReference !== referenceA
        )
          throw new Error("session_not_found");
        return session(input.sessionReference);
      },
    ),
  };
  const ports = {
    repository,
    sessionStore,
    transport,
    now: () => now,
    onV2EnvelopeDiagnostic,
  } as unknown as CodexDirectProviderAdapterPorts;
  return {
    provider: new CodexDirectProviderAdapter(ports),
    repository,
    sessionStore,
    transport,
    onV2EnvelopeDiagnostic,
  };
}

describe("CodexDirectProviderAdapter (semantic-extraction.v2)", () => {
  it("diagnoses semantic JSON parse failure without reaching the canonicalizer", async () => {
    const harness = setup(connection(), {
      ok: true,
      normalizedOutput: "not-json",
    });

    const result = await harness.provider.parseV2(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_provider_response" },
    });
    expect(harness.onV2EnvelopeDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        semanticJsonParseSucceeded: false,
        canonicalizerReached: false,
        failureStage: "semantic_json_parse",
        topLevelValueCategory: "unparseable",
      }),
    );
  });

  it("does not strip a markdown wrapper before semantic JSON parsing", async () => {
    const harness = setup(connection(), {
      ok: true,
      normalizedOutput: `\`\`\`json\n${JSON.stringify(response())}\n\`\`\``,
    });

    const result = await harness.provider.parseV2(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_provider_response" },
    });
    expect(harness.onV2EnvelopeDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        semanticJsonParseSucceeded: false,
        failureStage: "semantic_json_parse",
      }),
    );
  });

  it("diagnoses a parsed wrong-version envelope after the canonicalizer is reached", async () => {
    const harness = setup(connection(), {
      ok: true,
      normalizedOutput: JSON.stringify({
        ...response(),
        schemaVersion: "nuvitae.semantic-extraction.v1",
      }),
    });

    await harness.provider.parseV2(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });

    expect(harness.onV2EnvelopeDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        semanticJsonParseSucceeded: true,
        canonicalizerReached: true,
        failureStage: "v2_envelope",
        topLevelValueCategory: "object",
        schemaVersionCategory: "other_string",
        firstZodPath: ["schemaVersion"],
      }),
    );
  });

  it("does not emit envelope diagnostics for a valid envelope with a malformed atom", async () => {
    const candidate = response();
    candidate.sections.headline = { value: 42, sourceRefs: [] } as never;
    const harness = setup(connection(), {
      ok: true,
      normalizedOutput: JSON.stringify(candidate),
    });

    const result = await harness.provider.parseV2(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.canonical.candidates).toHaveLength(1);
      expect(
        result.canonical.candidates.some(
          (candidate) => candidate.fieldPath === "headline",
        ),
      ).toBe(false);
    }
    expect(harness.onV2EnvelopeDiagnostic).not.toHaveBeenCalled();
  });

  it("returns Nuvitae-canonical V2 candidates without provider-owned metadata", async () => {
    const harness = setup(connection(), {
      ok: true,
      normalizedOutput: JSON.stringify(response()),
    });
    const result = await harness.provider.parseV2(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });

    expect(result).toMatchObject({
      ok: true,
      contractVersion: "nuvitae.semantic-extraction.v2",
      canonical: { candidates: [{ value: "Ada" }] },
    });
  });

  it("resolves the ready owner-bound session and invokes Codex once", async () => {
    const harness = setup();
    const result = await harness.provider.parseV2(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });
    expect(result.ok).toBe(true);
    expect(
      harness.repository.findConnectionByProviderAndOwner,
    ).toHaveBeenCalledWith("codex", ownerA);
    expect(harness.sessionStore.readSession).toHaveBeenCalledWith({
      ownerUserId: ownerA,
      connectionId: connectionA,
      sessionReference: referenceA,
    });
    expect(harness.transport.invoke).toHaveBeenCalledTimes(1);
    const invocation = harness.transport.invoke.mock.calls[0]?.[0] as
      { readonly instructions: string; readonly inputText: string } | undefined;
    expect(invocation?.instructions).toContain(
      "nuvitae.semantic-extraction.v2",
    );
    expect(invocation?.instructions).toContain(
      "Nuvitae owns candidateId, hashes, offsets",
    );
    expect(invocation?.instructions).toContain("object depth 10");
    expect(invocation?.instructions).toContain("total atoms 600");
    expect(invocation?.instructions).toContain("relationships 120");
    const input = JSON.parse(invocation?.inputText ?? "{}") as {
      readonly contract?: string;
      readonly document?: {
        readonly fragments?: readonly Record<string, unknown>[];
      };
    };
    expect(input.contract).toBe("nuvitae.semantic-extraction.v2");
    expect(input.document?.fragments).toEqual([
      { fragmentId: "fragment-1", order: 0, text: "Ada" },
    ]);
    expect(JSON.stringify(input)).not.toContain("fragmentHash");
    expect(JSON.stringify(input)).not.toContain("candidateId");
  });

  it.each([
    [
      "not_configured",
      connection(ownerA, connectionA, null, {
        connectionStatus: "not_configured",
        authenticationStatus: "unauthenticated",
      }),
    ],
    [
      "disconnected",
      connection(ownerA, connectionA, null, {
        connectionStatus: "disconnected",
        authenticationStatus: "unauthenticated",
      }),
    ],
    [
      "login_pending",
      connection(ownerA, connectionA, null, {
        connectionStatus: "login_pending",
        authenticationStatus: "pending",
      }),
    ],
    [
      "expired",
      connection(ownerA, connectionA, referenceA, {
        connectionStatus: "authentication_expired",
        authenticationStatus: "expired",
      }),
    ],
    [
      "revoked",
      connection(ownerA, connectionA, null, {
        connectionStatus: "authentication_revoked",
        authenticationStatus: "revoked",
      }),
    ],
    [
      "unavailable",
      connection(ownerA, connectionA, referenceA, {
        availabilityStatus: "unavailable",
      }),
    ],
  ] as const)("does not invoke for %s", async (_name, current) => {
    const harness = setup(current);
    const result = await harness.provider.parseV2(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });
    expect(result.ok).toBe(false);
    expect(harness.transport.invoke).not.toHaveBeenCalled();
  });

  it("fails closed for missing, foreign, and deleted session material", async () => {
    const missing = setup(connection(ownerA, connectionA));
    missing.sessionStore.readSession.mockRejectedValue(new Error("missing"));
    expect(
      await missing.provider.parseV2(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
      }),
    ).toMatchObject({ ok: false, error: { code: "authentication_revoked" } });

    const foreign = setup(connection(ownerA, connectionA, referenceB));
    expect(
      await foreign.provider.parseV2(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
      }),
    ).toMatchObject({ ok: false, error: { code: "authentication_revoked" } });

    const deleted = setup(
      connection(ownerA, connectionA, referenceA, {
        deletedAt: now,
        deletionReason: "user_deleted",
      }),
    );
    expect(
      await deleted.provider.parseV2(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
      }),
    ).toMatchObject({ ok: false, error: { code: "authentication_revoked" } });
  });

  it("cannot resolve owner A through owner B's connection", async () => {
    const harness = setup(connection(ownerB, connectionB, referenceB));
    const result = await harness.provider.parseV2(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "not_configured" },
    });
    expect(harness.transport.invoke).not.toHaveBeenCalled();
  });

  it("maps protocol, timeout, cancellation, and provider availability safely", async () => {
    for (const [category, expected] of [
      ["protocol_invalid", "schema_violation"],
      ["timeout", "timeout"],
      ["cancelled", "cancelled"],
      ["authentication_expired", "authentication_expired"],
      ["authentication_revoked", "authentication_revoked"],
      ["rate_limited", "rate_limited"],
      ["quota_exceeded", "quota_exceeded"],
      ["provider_unavailable", "provider_unavailable"],
    ] as const) {
      const harness = setup(connection(), { ok: false, category });
      const result = await harness.provider.parseV2(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
      });
      expect(result).toMatchObject({ ok: false, error: { code: expected } });
      expect(harness.transport.invoke).toHaveBeenCalledTimes(1);
    }
  });

  it("maps malformed semantic JSON without persisting provider output", async () => {
    const harness = setup(connection(), {
      ok: true,
      normalizedOutput: "not-json",
    });
    const result = await harness.provider.parseV2(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_provider_response" },
    });
    expect(JSON.stringify(result)).not.toContain("not-json");
  });

  it("does not invoke after cancellation and requires the trusted owner context", async () => {
    const harness = setup();
    const controller = new AbortController();
    controller.abort();
    expect(
      await harness.provider.parseV2(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
        abortSignal: controller.signal,
      }),
    ).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(
      await harness.provider.parseV2(request(), { timeoutMs: 30000 }),
    ).toMatchObject({ ok: false, error: { code: "unknown_provider_failure" } });
    expect(harness.transport.invoke).not.toHaveBeenCalled();
  });
});
