import { describe, expect, it } from "vitest";

import {
  maxSemanticExtractionResponseJsonBytes,
  maxSemanticParserRequestJsonBytes,
  nuvitaeSemanticExtractionResponseSchema,
  nuvitaeSemanticExtractionResponseVersion,
  resumeSemanticParseRequestSchema,
  resumeSemanticParserContractVersion,
  type NuvitaeSemanticExtractionResponse,
  type ResumeSemanticParseRequest,
  type SemanticValue,
} from "@nuvitae/contracts";
import {
  createPrivacySafeSemanticProviderError,
  semanticProviderErrorCodes,
  semanticProviderRecoveryActions,
  serializeSemanticProviderError,
  validateSemanticParseRequest,
  type PrivacySafeSemanticProviderError,
  type ResumeSemanticParserCapabilities,
  type ResumeSemanticParserConnectionSnapshot,
  type ResumeSemanticParserInvocationOptions,
  type ResumeSemanticParserProvider,
  type ResumeSemanticParserProviderResult,
  type SemanticProviderAvailabilityState,
  type SemanticProviderConnectionState,
} from "@nuvitae/import-application";

const hash = "a".repeat(64);

const evidence = {
  line: 1,
  start: 0,
  end: 12,
  fragmentHash: hash,
  fragmentId: "fragment-1",
};

const semanticValue: SemanticValue = {
  value: "Jane Example",
  normalizedValue: null,
  evidence: [evidence],
  classification: "explicit",
  confidence: "high",
};

const providerNativeKeys = [
  "model",
  "provider",
  "providerKind",
  "sdk",
  "apiKey",
  "api_key",
  "credentials",
  "credential",
  "token",
  "accessToken",
  "refreshToken",
  "oauth",
  "endpoint",
  "headers",
  "transport",
  "threadId",
  "messageId",
  "usage",
  "prompt",
  "raw",
  "rawProviderPayload",
  "providerResponse",
  "stderr",
  "content",
];

const physicalCoordinateKeys = [
  "page",
  "item",
  "physical",
  "physicalOffset",
  "physicalOffsets",
  "coordinate",
  "coordinates",
  "bbox",
  "boundingBox",
  "x",
  "y",
  "width",
  "height",
  "top",
  "left",
];

const connectionStates = [
  "not_configured",
  "login_pending",
  "connected",
  "login_cancelled",
  "disconnected",
  "authentication_expired",
  "authentication_revoked",
] as const satisfies readonly SemanticProviderConnectionState[];

const availabilityStates = [
  "available",
  "unavailable",
  "rate_limited",
  "quota_exceeded",
  "unsupported_capability",
  "unknown",
] as const satisfies readonly SemanticProviderAvailabilityState[];

function contractRequest(): ResumeSemanticParseRequest {
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: null,
    correlationId: "contract-correlation-1",
    documentFormat: "pdf",
    languageContext: {
      detectedLanguage: "english",
      confidence: "high",
      textDirection: "ltr",
    },
    normalizedTranscript: {
      text: "Jane Example",
      sha256: hash,
      lineCount: 1,
    },
    sourceFragments: [
      {
        order: 0,
        line: 1,
        text: "Jane Example",
        hash,
        bounds: {
          lineStart: 1,
          lineEnd: 1,
          start: 0,
          end: 12,
        },
      },
    ],
    fragmentHashes: [hash],
    formatMetadata: {
      sourceFormat: "pdf",
      extractionMode: "selectable_text",
      renderedPageCount: 1,
      parserVersion: "contract-test-parser-v1",
    },
  };
}

function contractResponse(): NuvitaeSemanticExtractionResponse {
  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [],
    },
    sections: {
      contact: {
        fullName: semanticValue,
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

/**
 * Minimal provider-neutral stub that satisfies the production
 * `ResumeSemanticParserProvider` boundary without importing any provider SDK.
 * It shares the real provider-neutral request validation so malformed inputs
 * surface through the generic failure envelope instead of native exceptions.
 */
class CompliantProviderStub implements ResumeSemanticParserProvider {
  readonly providerKind = "contract-test-stub";

  readonly capabilities: ResumeSemanticParserCapabilities = {
    supportedDocumentFormats: ["pdf"],
    supportedDocumentLanguages: ["english"],
    supportsNonInteractiveParsing: true,
    supportsStructuredJson: true,
    supportsCanonicalFlattenedEvidence: true,
    acceptsNormalizedTranscript: true,
    acceptsRawStoragePaths: false,
    exposesCredentialsToDomain: false,
    predictsPhysicalCoordinates: false,
    maxRequestJsonBytes: maxSemanticParserRequestJsonBytes,
    maxResponseJsonBytes: maxSemanticExtractionResponseJsonBytes,
    maxTimeoutMs: 30_000,
  };

  async inspectConnection(): Promise<ResumeSemanticParserConnectionSnapshot> {
    return {
      connectionState: "connected",
      availabilityState: "available",
      checkedAt: new Date(),
      safeMessage: null,
    };
  }

  async parse(
    request: ResumeSemanticParseRequest,
    options?: ResumeSemanticParserInvocationOptions,
  ): Promise<ResumeSemanticParserProviderResult> {
    if (options?.abortSignal?.aborted === true) {
      return {
        ok: false,
        error: createPrivacySafeSemanticProviderError("cancelled"),
      };
    }
    const validated = validateSemanticParseRequest(request);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }
    return { ok: true, response: contractResponse() };
  }
}

function collectKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectKeys(item, `${path}[${index}]`),
    );
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, item]) => [
    path === "" ? key : `${path}.${key}`,
    ...collectKeys(item, path === "" ? key : `${path}.${key}`),
  ]);
}

describe("ResumeSemanticParserProvider contract", () => {
  it("declares provider-neutral capabilities without provider-native fields", () => {
    const provider = new CompliantProviderStub();

    expect(provider.capabilities).toMatchObject({
      supportedDocumentFormats: ["pdf"],
      supportedDocumentLanguages: ["english"],
      supportsNonInteractiveParsing: true,
      supportsStructuredJson: true,
      supportsCanonicalFlattenedEvidence: true,
      acceptsNormalizedTranscript: true,
      acceptsRawStoragePaths: false,
      exposesCredentialsToDomain: false,
      predictsPhysicalCoordinates: false,
      maxRequestJsonBytes: maxSemanticParserRequestJsonBytes,
      maxResponseJsonBytes: maxSemanticExtractionResponseJsonBytes,
    });
    expect(provider.capabilities.maxTimeoutMs).toBeGreaterThan(0);
    expect(
      provider.capabilities.supportedDocumentFormats.every((format) =>
        ["pdf", "docx", "plain_text"].includes(format),
      ),
    ).toBe(true);
    expect(
      provider.capabilities.supportedDocumentLanguages.every((language) =>
        [
          "english",
          "french",
          "bilingual_french_english",
          "unsupported",
          "unknown",
        ].includes(language),
      ),
    ).toBe(true);

    const capabilityKeys = Object.keys(provider.capabilities);
    for (const forbidden of providerNativeKeys) {
      expect(capabilityKeys).not.toContain(forbidden);
    }
  });

  it("exposes connection and availability states through the provider-neutral snapshot", async () => {
    const snapshot = await new CompliantProviderStub().inspectConnection();

    expect(connectionStates).toContain(snapshot.connectionState);
    expect(availabilityStates).toContain(snapshot.availabilityState);
    expect(snapshot.checkedAt).toBeInstanceOf(Date);
    expect(snapshot.safeMessage).toBeNull();

    const connectionKeys = Object.keys(snapshot).sort();
    expect(connectionKeys).toEqual(
      [
        "availabilityState",
        "checkedAt",
        "connectionState",
        "safeMessage",
      ].sort(),
    );
  });

  it("returns a contract-valid versioned response for a valid parse request", async () => {
    const provider = new CompliantProviderStub();
    const request = contractRequest();

    expect(resumeSemanticParseRequestSchema.safeParse(request).success).toBe(
      true,
    );

    const result = await provider.parse(request, { timeoutMs: 30_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = nuvitaeSemanticExtractionResponseSchema.safeParse(
      result.response,
    );
    expect(parsed.success).toBe(true);
    expect(result.response.schemaVersion).toBe(
      nuvitaeSemanticExtractionResponseVersion,
    );
  });

  it("surfaces malformed inputs as provider-neutral failures instead of native exceptions", async () => {
    const provider = new CompliantProviderStub();

    const unknownField = {
      ...contractRequest(),
      credentials: "not allowed",
    };
    const unsupportedVersion = {
      ...contractRequest(),
      contractVersion: "nuvitae.resume-semantic-parser.v0",
    };
    const invalidEvidence = {
      ...contractRequest(),
      sourceFragments: [
        {
          ...contractRequest().sourceFragments[0]!,
          bounds: {
            lineStart: 1,
            lineEnd: 1,
            start: 8,
            end: 4,
          },
        },
      ],
    };

    for (const candidate of [
      unknownField,
      unsupportedVersion,
      invalidEvidence,
    ]) {
      let result: ResumeSemanticParserProviderResult | undefined;
      let thrown: unknown;
      try {
        result = await provider.parse(candidate as ResumeSemanticParseRequest);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeUndefined();
      if (result === undefined) {
        throw new Error("Expected a provider result for malformed input.");
      }
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(semanticProviderErrorCodes).toContain(result.error.code);
        expect([
          "schema_violation",
          "unsupported_contract_version",
          "malformed_flattened_evidence",
        ]).toContain(result.error.code);
      }
    }
  });

  it("maps abort signals to the provider-neutral cancelled failure", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const result = await new CompliantProviderStub().parse(contractRequest(), {
      timeoutMs: 30_000,
      abortSignal: abortController.signal,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("cancelled");
      expect(result.error.retryable).toBe(true);
    }
  });

  it("exposes a complete provider-neutral error taxonomy with recovery metadata", () => {
    expect(semanticProviderErrorCodes.length).toBeGreaterThan(0);

    for (const code of semanticProviderErrorCodes) {
      const error = createPrivacySafeSemanticProviderError(code);

      expect(error.code).toBe(code);
      expect(typeof error.retryable).toBe("boolean");
      expect(error.diagnostic).toBe(code);
      expect(error.recoveryActions.length).toBeGreaterThan(0);
      for (const action of error.recoveryActions) {
        expect(semanticProviderRecoveryActions).toContain(action);
      }
      expect(error.validationIssues).toEqual([]);
    }
  });

  it("serializes privacy-safe recovery metadata with no extra fields or sensitive content", () => {
    const error = createPrivacySafeSemanticProviderError("schema_violation", [
      { path: ["sections", "contact", 0, "email"], code: "invalid_type" },
      { path: ["rawProviderPayload"], code: "forbidden_key" },
    ]);

    const serialized = serializeSemanticProviderError(error);
    expect(Object.keys(serialized).sort()).toEqual(
      [
        "code",
        "diagnostic",
        "recoveryActions",
        "retryable",
        "validationIssues",
      ].sort(),
    );
    expect(serialized.validationIssues).toEqual([
      { path: ["sections", "contact", 0, "email"], code: "invalid_type" },
      { path: ["rawProviderPayload"], code: "forbidden_key" },
    ]);

    const json = JSON.stringify(serialized);
    expect(json).not.toContain("Jane Example");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("token");
  });

  it("keeps provider results free of provider-native and physical-coordinate leakage", async () => {
    const result = await new CompliantProviderStub().parse(contractRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const responseKeys = collectKeys(result.response);
    for (const forbidden of [
      ...providerNativeKeys,
      ...physicalCoordinateKeys,
    ]) {
      const matches = responseKeys.filter(
        (key) => key.endsWith(`.${forbidden}`) || key === forbidden,
      );
      expect(matches).toEqual([]);
    }

    const validated = nuvitaeSemanticExtractionResponseSchema.safeParse(
      result.response,
    );
    expect(validated.success).toBe(true);
  });

  it("never exposes sensitive values or provider-native details through failures", async () => {
    const provider = new CompliantProviderStub();
    const request = {
      ...contractRequest(),
      credentials: "secret-password jane@example.test",
    };

    const result = await provider.parse(request as ResumeSemanticParseRequest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const json = JSON.stringify(serializeSemanticProviderError(result.error));
      expect(json).not.toContain("jane@example.test");
      expect(json).not.toContain("secret-password");
      const errorKeys = collectKeys(result.error);
      for (const forbidden of providerNativeKeys) {
        const matches = errorKeys.filter(
          (key) => key === forbidden || key.endsWith(`.${forbidden}`),
        );
        expect(matches).toEqual([]);
      }
    }
  });

  it("keeps the provider kind and capability shape stable across the boundary", () => {
    const provider = new CompliantProviderStub();
    const providerKeys = Object.keys(provider);
    expect(providerKeys).toEqual(
      expect.arrayContaining(["capabilities", "providerKind"]),
    );
    expect(provider.providerKind).toBe("contract-test-stub");

    const error: PrivacySafeSemanticProviderError =
      createPrivacySafeSemanticProviderError("provider_unavailable");
    expect(error.recoveryActions).toContain("retry");
    expect(error.recoveryActions).toContain("manual_entry");
  });
});
