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

const evidence = {
  line: 1,
  start: 0,
  end: 4,
  fragmentHash: createHash("sha256").update("Ada").digest("hex"),
  fragmentId: null,
};

function semanticValue(value: string) {
  return {
    value,
    normalizedValue: null,
    evidence: [evidence],
    classification: "explicit" as const,
    confidence: "high" as const,
  };
}

function response() {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v1" as const,
    documentLanguage: {
      value: "english" as const,
      confidence: "high" as const,
      evidence: [evidence],
    },
    sections: {
      contact: {
        fullName: null,
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
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
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
  } as unknown as CodexDirectProviderAdapterPorts;
  return {
    provider: new CodexDirectProviderAdapter(ports),
    repository,
    sessionStore,
    transport,
  };
}

describe("CodexDirectProviderAdapter (T216)", () => {
  it("accepts a semantic candidate without a provider-owned ID", async () => {
    const candidate = response() as {
      sections: { skills: unknown[] };
    };
    candidate.sections.skills = [
      { name: semanticValue("TypeScript"), category: null },
    ];

    const harness = setup(connection(), {
      ok: true,
      normalizedOutput: JSON.stringify(candidate),
    });
    const result = await harness.provider.parse(request(), {
      timeoutMs: 30000,
      ownerUserId: ownerA,
    });

    expect(result.ok).toBe(true);
  });

  it("does not treat null or arbitrary legacy IDs as application identity", async () => {
    for (const candidateId of [null, "provider-controlled"]) {
      const candidate = response() as {
        sections: { skills: unknown[] };
      };
      candidate.sections.skills = [
        { candidateId, name: semanticValue("TypeScript"), category: null },
      ];
      const harness = setup(connection(), {
        ok: true,
        normalizedOutput: JSON.stringify(candidate),
      });

      const result = await harness.provider.parse(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
      });

      expect(result.ok).toBe(true);
    }
  });

  it("ignores a wrong-typed legacy candidate ID at the provider boundary", async () => {
    const candidate = response() as {
      sections: { skills: unknown[] };
    };
    candidate.sections.skills = [
      { candidateId: 42, name: semanticValue("TypeScript"), category: null },
    ];
    const harness = setup(connection(), {
      ok: true,
      normalizedOutput: JSON.stringify(candidate),
    });

    await expect(
      harness.provider.parse(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("resolves the ready owner-bound session and invokes Codex once", async () => {
    const harness = setup();
    const result = await harness.provider.parse(request(), {
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
      "preserve explicit professional titles",
    );
    expect(invocation?.instructions).toContain("Do not return candidateId");
    const input = JSON.parse(invocation?.inputText ?? "{}") as {
      readonly output?: { readonly sections?: string };
    };
    expect(input.output?.sections).toContain("education");
    expect(input.output?.sections).not.toContain("candidateId");
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
    const result = await harness.provider.parse(request(), {
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
      await missing.provider.parse(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
      }),
    ).toMatchObject({ ok: false, error: { code: "authentication_revoked" } });

    const foreign = setup(connection(ownerA, connectionA, referenceB));
    expect(
      await foreign.provider.parse(request(), {
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
      await deleted.provider.parse(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
      }),
    ).toMatchObject({ ok: false, error: { code: "authentication_revoked" } });
  });

  it("cannot resolve owner A through owner B's connection", async () => {
    const harness = setup(connection(ownerB, connectionB, referenceB));
    const result = await harness.provider.parse(request(), {
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
      ["provider_unavailable", "provider_unavailable"],
    ] as const) {
      const harness = setup(connection(), { ok: false, category });
      const result = await harness.provider.parse(request(), {
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
    const result = await harness.provider.parse(request(), {
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
      await harness.provider.parse(request(), {
        timeoutMs: 30000,
        ownerUserId: ownerA,
        abortSignal: controller.signal,
      }),
    ).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(
      await harness.provider.parse(request(), { timeoutMs: 30000 }),
    ).toMatchObject({ ok: false, error: { code: "unknown_provider_failure" } });
    expect(harness.transport.invoke).not.toHaveBeenCalled();
  });
});
