import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
} from "@nuvitae/contracts";
import {
  createManualDraftRequestSchema,
  limitedDeterministicFallbackContractVersion,
  limitedDeterministicFallbackDisclosureSummary,
  limitedDeterministicFallbackOutcomeSchema,
  limitedDeterministicFallbackRejectionReasons,
  manualDraftResponseSchema,
  resumeSemanticParserContractVersion,
  type LimitedDeterministicFallbackOutcome,
} from "@nuvitae/contracts";
import type {
  AIProviderRuntimeConnection,
  ManualStructuredResumeDraft,
  ProviderRuntimeCapabilities,
} from "@nuvitae/domain";
import {
  createPrivacySafeSemanticProviderError,
  generateSemanticWarnings,
  limitedDeterministicFallbackProviderTriggers,
  ProviderConnectionError,
  ProviderConnectionService,
  runLimitedDeterministicPartialFallback,
  semanticProviderErrorCodes,
  semanticProviderRecoveryActions,
  serializeSemanticProviderError,
  validateSemanticResponse,
  type ProviderAdapterConnectedResult,
  type ProviderAdapterInspection,
  type ProviderAdapterLoginResult,
  type ProviderAdapterQuotaResult,
  type ProviderRuntimeAdapterContext,
  type ProviderRuntimeConnectionAdapter,
  type ProviderSessionStorageInput,
  type ProviderSessionStore,
  type ProviderSessionWriteInput,
  type SemanticProviderErrorCode,
  type SemanticWarning,
  type SemanticWarningCategory,
} from "@nuvitae/import-application";
import {
  deterministicFixtureProfiles,
  type DeterministicFixtureProfile,
} from "@nuvitae/import-application/testing";
import type {
  AIProviderRuntimeConnectionsRepository,
  ManualResumeDraftRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import type { EntityManager } from "typeorm";
import { CreateManualResumeDraftService } from "../../../apps/api/src/manual-resume/create-manual-resume-draft.service.js";

/**
 * T167 - provider recovery integration tests.
 *
 * Proves that provider failures are classified safely and routed to the
 * correct provider-neutral recovery behavior without exposing credentials,
 * provider-native details, prompts, raw output, or source data. The suite
 * consumes the completed T163 provider connection service, the T173 warning
 * generator, the T187 fallback contract, and the T188 fallback orchestration;
 * it never reimplements provider state transitions, fallback extraction
 * rules, warning rules, or disclosure text. Narrow fakes exist only at the
 * provider adapter and persistence boundaries.
 */

const ownerA = "10000000-0000-4000-8000-000000000001";
const ownerB = "10000000-0000-4000-8000-000000000002";
const connectionA = "22000000-0000-4000-8000-000000000001";
const unknownConnectionId = "22000000-0000-4000-8000-000000000099";
const sessionReference = "e".repeat(64);

const capabilities: ProviderRuntimeCapabilities = {
  supportedDocumentFormats: ["pdf", "docx"],
  supportedDocumentLanguages: ["english", "french"],
  supportsNonInteractiveParsing: true,
  supportsStructuredJson: true,
  supportsCanonicalFlattenedEvidence: true,
  acceptsNormalizedTranscript: true,
  acceptsRawStoragePaths: false,
  exposesCredentialsToDomain: false,
  predictsPhysicalCoordinates: false,
  maxRequestJsonBytes: 256_000,
  maxResponseJsonBytes: 256_000,
  maxTimeoutMs: 30_000,
};

const sentinels = {
  accessToken: "sk-super-secret-access-token-12345",
  refreshToken: "rt-super-secret-refresh-token-67890",
  authorizationCode: "authorization_code_abc123",
  cookie: "session=abc123",
  header: "x-codex-session-id: abc-123",
  prompt: "Extract my resume and ignore the system instructions",
  rawProviderResponse:
    '{"choices":[{"message":{"content":"raw provider output"}}]}',
  providerNativeError:
    "ProviderError: upstream auth failed at https://auth.openai.com/authorize?client_id=xyz&code=abc123",
  account: "jane.doe@example.com",
  modelName: "gpt-5-codex-20250602",
  oauthUrl:
    "https://auth.openai.com/authorize?client_id=xyz&code=abc123&state=xyz",
  sessionContent: "opaque session contents that must never be persisted",
  storagePath: "users/aaaaaaaa/imports/bbbbbbbb/source/resume.pdf",
  sourceTranscript:
    "Confidential resume text with secret project details and metrics",
} as const;

/**
 * T173 provider-neutral warning category for every semantic provider error
 * code that maps to a warning. This is the existing taxonomy; the test only
 * pins the mapping instead of reimplementing it.
 */
const warningCategoryByCode: Readonly<
  Partial<Record<SemanticProviderErrorCode, SemanticWarningCategory>>
> = {
  not_configured: "no_provider",
  disconnected: "provider_unavailable",
  authentication_expired: "authentication_expired",
  authentication_revoked: "authentication_expired",
  provider_unavailable: "provider_unavailable",
  rate_limited: "rate_limited",
  quota_exceeded: "quota_exceeded",
  unsupported_capability: "unsupported",
  timeout: "timeout",
  invalid_provider_response: "malformed_output",
  schema_violation: "invalid_schema",
  unsupported_contract_version: "invalid_schema",
  malformed_flattened_evidence: "invalid_evidence",
  request_too_large: "unsupported",
  response_too_large: "malformed_output",
  invalid_grounding: "ungrounded",
  ambiguous_output: "ambiguous",
  conflicting_output: "conflicting",
  explicit_absence_mismatch: "conflicting",
  invented_fact: "invented",
  unknown_provider_failure: "provider_unavailable",
};

const transientProviderErrorCodes: readonly SemanticProviderErrorCode[] = [
  "provider_unavailable",
  "rate_limited",
  "timeout",
  "cancelled",
  "invalid_provider_response",
  "schema_violation",
  "unsupported_contract_version",
  "malformed_flattened_evidence",
  "response_too_large",
  "unknown_provider_failure",
];

describe("provider connection recovery vocabulary (T163)", () => {
  it("reports no provider configured without a connection and without details", async () => {
    const h = harness();
    const list = await h.service.list(ownerA);
    expect(list).toEqual([]);

    const missing = await probe(() => h.service.status(ownerA, connectionA));
    expect(missing).toBeInstanceOf(ProviderConnectionError);
    expect((missing as ProviderConnectionError).code).toBe(
      "provider_connection_not_found",
    );
    expect(JSON.stringify(missing)).not.toContain(connectionA);
    expect(JSON.stringify(missing)).not.toContain(ownerA);
  });

  it("keeps unknown connection ids and wrong-owner access non-disclosing", async () => {
    const h = harness();
    await createConnectedConnection(h);
    const before = structuredClone(h.repository.rows.get(connectionA));

    const probes = [
      () => h.service.status(ownerA, unknownConnectionId),
      () => h.service.status(ownerB, connectionA),
      () => h.service.connect(ownerB, connectionA),
      () => h.service.reconnect(ownerB, connectionA),
      () => h.service.disconnect(ownerB, connectionA),
      () => h.service.revoke(ownerB, connectionA),
    ] as const;
    for (const operation of probes) {
      const error = await probe(operation);
      expect(error).toBeInstanceOf(ProviderConnectionError);
      expect((error as ProviderConnectionError).code).toBe(
        "provider_connection_not_found",
      );
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(connectionA);
      expect(serialized).not.toContain(ownerA);
      for (const sentinel of Object.values(sentinels)) {
        expect(serialized).not.toContain(sentinel);
      }
    }

    expect(h.repository.rows.get(connectionA)).toEqual(before);
    expect(h.adapter.disconnectCalls).toBe(0);
    expect(h.adapter.revokeCalls).toBe(0);
  });

  it("detects expired sessions and reconnects after expired authentication", async () => {
    const h = harness();
    await createConnectedConnection(h);

    const expired = await h.service.detectExpiredConnections(
      ownerA,
      new Date("2026-08-01T11:00:00.000Z"),
    );
    expect(expired[0]?.connectionStatus).toBe("authentication_expired");
    expect(h.repository.rows.get(connectionA)?.authenticationStatus).toBe(
      "expired",
    );

    const reconnected = await h.service.reconnect(ownerA, connectionA);
    expect(reconnected.connectionStatus).toBe("login_pending");
    expect(reconnected.authenticationStatus).toBe("pending");
  });

  it("revokes sessions, destroys session material, and reconnects after revoked authentication", async () => {
    const h = harness();
    await createConnectedConnection(h);

    const revoked = await h.service.revoke(ownerA, connectionA, "user_revoked");
    expect(revoked.connectionStatus).toBe("authentication_revoked");
    expect(revoked.authenticationStatus).toBe("revoked");
    expect(h.sessionStore.objects.size).toBe(0);

    const reconnected = await h.service.reconnect(ownerA, connectionA);
    expect(reconnected.connectionStatus).toBe("login_pending");
    expect(reconnected.authenticationStatus).toBe("pending");
  });

  it("disconnects providers and reconnects through the same service boundary", async () => {
    const h = harness();
    await createConnectedConnection(h);

    const disconnected = await h.service.disconnect(ownerA, connectionA);
    expect(disconnected.connectionStatus).toBe("disconnected");
    expect(h.sessionStore.objects.size).toBe(0);

    const reconnected = await h.service.reconnect(ownerA, connectionA);
    expect(reconnected.connectionStatus).toBe("login_pending");
    expect(reconnected.authenticationStatus).toBe("pending");
  });
});

describe("provider failure classification and warnings (T173)", () => {
  it.each(
    Object.entries(warningCategoryByCode) as readonly [
      SemanticProviderErrorCode,
      SemanticWarningCategory,
    ][],
  )(
    "maps provider failure %s to the provider-neutral warning category %s",
    (code, expectedCategory) => {
      const warning = warningFor(code);
      expect(warning.category).toBe(expectedCategory);
      expect(warning.severity).toBe("blocking");
      expect(warning.message.length).toBeGreaterThan(0);
      expect(warning.recoveryActions.length).toBeGreaterThan(0);
      expect(warning.recoveryActions).toContain("manual_entry");
      for (const action of warning.recoveryActions) {
        expect(semanticProviderRecoveryActions).toContain(action);
      }
    },
  );

  it("marks exactly the transient provider failures retryable", () => {
    for (const code of semanticProviderErrorCodes) {
      const error = createPrivacySafeSemanticProviderError(code);
      expect(error.retryable).toBe(transientProviderErrorCodes.includes(code));
    }
  });

  it("keeps the provider failure taxonomy closed with only cancellation outside warning generation", () => {
    const mapped = Object.keys(
      warningCategoryByCode,
    ) as SemanticProviderErrorCode[];
    const unmapped = semanticProviderErrorCodes.filter(
      (code) => !mapped.includes(code),
    );
    expect(unmapped).toEqual(["cancelled"]);

    const cancelled = generateSemanticWarnings({
      providerError: createPrivacySafeSemanticProviderError("cancelled"),
    });
    expect(cancelled.warnings).toEqual([]);
  });

  it("offers retry after transient failures and keeps repeated classification idempotent", () => {
    for (const code of transientProviderErrorCodes) {
      const error = createPrivacySafeSemanticProviderError(code);
      expect(error.retryable).toBe(true);
      if (code === "cancelled") continue;
      const first = generateSemanticWarnings({ providerError: error });
      const second = generateSemanticWarnings({ providerError: error });
      expect(JSON.stringify(first.warnings)).toBe(
        JSON.stringify(second.warnings),
      );
      expect(first.warnings[0]?.recoveryActions).toContain("retry");
      expect(first.warnings[0]?.recoveryActions).toContain("manual_entry");
    }
  });

  it("offers reconnect for expired, revoked, and disconnected authentication states", () => {
    expect(warningFor("authentication_expired").recoveryActions).toContain(
      "reconnect_provider",
    );
    expect(warningFor("disconnected").recoveryActions).toContain(
      "reconnect_provider",
    );

    // Revoked authentication uses the same safe reconnect family as expired
    // authentication; the provider-specific session is already unusable.
    const recovery = warningFor("authentication_revoked").recoveryActions;
    expect(recovery).toContain("reconnect_provider");
    expect(recovery).toContain("manual_entry");
  });

  it("maps schema-invalid provider output to the invalid_schema warning", () => {
    const profile = pdfProfile();
    const request = buildFixtureRequest(profile);
    const response = cloneResponse();
    Reflect.deleteProperty(response.sections.contact, "email");

    const validation = validateSemanticResponse({ request, response });
    expect(validation.accepted).toBe(false);
    const result = generateSemanticWarnings({
      diagnostics: validation.diagnostics,
    });
    const warning = result.warnings.find(
      (item) => item.category === "invalid_schema",
    );
    expect(warning?.severity).toBe("blocking");
    expect(warning?.recoveryActions).toContain("manual_entry");
  });

  it("maps provider output with invalid evidence to the invalid_evidence warning", () => {
    const profile = pdfProfile();
    const request = buildFixtureRequest(profile);
    const response = cloneResponse();
    const fragment = profile.fragments[0];
    if (response.sections.contact.fullName === null || fragment === undefined) {
      throw new Error("PDF profile must have a grounded full name.");
    }
    response.sections.contact.fullName = {
      ...response.sections.contact.fullName,
      evidence: [
        {
          line: 1,
          start: fragment.text.length + 10,
          end: fragment.text.length + 20,
          fragmentHash: fragment.hash,
          fragmentId: "fragment-1",
        },
      ],
    };

    const validation = validateSemanticResponse({ request, response });
    expect(
      validation.diagnostics.some((item) => item.category === "evidence"),
    ).toBe(true);
    const result = generateSemanticWarnings({
      response: validation.response ?? response,
      diagnostics: validation.diagnostics,
    });
    const warning = result.warnings.find(
      (item) => item.category === "invalid_evidence",
    );
    expect(warning?.severity).toBe("blocking");
    expect(warning?.recoveryActions).toContain("manual_entry");
  });

  it("maps ungrounded provider output to the ungrounded warning", () => {
    const fixture = ungroundedFixture();
    const validation = validateSemanticResponse({
      request: fixture.request,
      response: fixture.response,
    });
    expect(
      validation.diagnostics.some((item) => item.category === "grounding"),
    ).toBe(true);
    const result = generateSemanticWarnings({
      response: validation.response ?? fixture.response,
      diagnostics: validation.diagnostics,
    });
    const warning = result.warnings.find(
      (item) => item.category === "ungrounded",
    );
    expect(warning?.severity).toBe("blocking");
    expect(warning?.recoveryActions).toContain("manual_entry");
  });

  it("maps invented provider output to the invented warning with manual entry only", () => {
    const profile = pdfProfile();
    const request = buildFixtureRequest(profile);
    const response = cloneResponse();
    if (response.sections.contact.fullName === null) {
      throw new Error("PDF profile must have a grounded full name.");
    }
    response.sections.contact.fullName = {
      ...response.sections.contact.fullName,
      value: "Bruce Wayne",
    };

    const validation = validateSemanticResponse({ request, response });
    expect(
      validation.diagnostics.some((item) => item.category === "no_invention"),
    ).toBe(true);
    const result = generateSemanticWarnings({
      response: validation.response ?? response,
      diagnostics: validation.diagnostics,
    });
    const warning = result.warnings.find(
      (item) => item.category === "invented",
    );
    expect(warning?.severity).toBe("blocking");
    expect(warning?.recoveryActions).toEqual(["manual_entry"]);
  });
});

describe("limited deterministic partial fallback routing (T185-T188)", () => {
  it.each(limitedDeterministicFallbackProviderTriggers)(
    "invokes the T188 fallback for supported trigger %s and preserves the T187 disclosure",
    (trigger) => {
      const outcome = runFallback(["Email: jane@example.com"], {
        trigger,
      });
      expectFallbackOutcome(outcome, { alternative: false });
      expect(JSON.stringify(outcome)).not.toContain(trigger);
    },
  );

  it("rejects fallback invocation for unsupported provider-failure triggers", () => {
    expect(limitedDeterministicFallbackProviderTriggers).toEqual([
      "no_provider",
      "provider_unavailable",
      "expired_session",
      "quota_exhausted",
      "timeout",
      "malformed_provider_output",
      "rate_limited",
    ]);
    for (const unsupported of [
      "unsupported_capability",
      "revoked_session",
      "disconnected",
      "schema_invalid",
      "invalid_evidence",
      "ungrounded",
      "invented",
    ]) {
      expect(() =>
        runFallback(["Email: jane@example.com"], {
          trigger: unsupported as never,
        }),
      ).toThrow("unsupported limited deterministic fallback trigger");
    }
  });

  it("keeps rate_limited executable and unsupported_capability out of the T188 trigger set", () => {
    expect(limitedDeterministicFallbackProviderTriggers).toContain(
      "rate_limited",
    );
    expect(limitedDeterministicFallbackProviderTriggers).not.toContain(
      "unsupported_capability",
    );

    // T173 and T188 now agree: rate limiting is a temporary provider failure
    // that supports retry, alternative provider, partial deterministic
    // fallback, and manual entry.
    expect(warningFor("rate_limited").recoveryActions).toContain(
      "limited_deterministic_partial_extraction",
    );
    expect(warningFor("rate_limited").recoveryActions).toContain("retry");
    expect(warningFor("rate_limited").recoveryActions).toContain(
      "choose_another_provider",
    );
    expect(warningFor("rate_limited").recoveryActions).toContain(
      "manual_entry",
    );

    const rateLimited = runFallback(["Email: jane@example.com"], {
      trigger: "rate_limited",
    });
    expect(rateLimited.status).toBe("partial");
    expect(rateLimited.meetsDraftThreshold).toBe(true);
    expect(rateLimited.disclosure.isPartial).toBe(true);
    expect(rateLimited.disclosure.notReliableFullSemanticParsing).toBe(true);
    expect(rateLimited.recoveryActions).toContain("manual_entry");
    expect(JSON.stringify(rateLimited)).not.toContain("rate_limited");

    // Unsupported capability recovers through alternative provider and manual
    // entry only, and never invokes the deterministic fallback.
    expect(warningFor("unsupported_capability").recoveryActions).not.toContain(
      "limited_deterministic_partial_extraction",
    );
    expect(warningFor("unsupported_capability").recoveryActions).toEqual([
      "choose_another_provider",
      "manual_entry",
    ]);
    expect(() =>
      runFallback(["Email: jane@example.com"], {
        trigger: "unsupported_capability" as never,
      }),
    ).toThrow("unsupported limited deterministic fallback trigger");
  });

  it("offers alternative_provider only when a usable alternative exists", () => {
    const withAlternative = runFallback(["Email: jane@example.com"], {
      trigger: "provider_unavailable",
      alternativeProviderAvailable: true,
    });
    expect(withAlternative.recoveryActions).toEqual([
      "retry",
      "reconnect",
      "alternative_provider",
      "manual_entry",
    ]);
    expect(withAlternative.alternativeProviderAvailable).toBe(true);

    const withoutAlternative = runFallback(["Email: jane@example.com"], {
      trigger: "provider_unavailable",
    });
    expect(withoutAlternative.recoveryActions).toEqual([
      "retry",
      "reconnect",
      "manual_entry",
    ]);
    expect(withoutAlternative.recoveryActions).not.toContain(
      "alternative_provider",
    );
    expect(withoutAlternative.alternativeProviderAvailable).toBe(false);
  });

  it("creates a threshold-qualified partial outcome with at least one accepted explicit field", () => {
    const outcome = runFallback(["Email: jane@example.com"]);
    expect(outcome.status).toBe("partial");
    expect(outcome.meetsDraftThreshold).toBe(true);
    expect(outcome.acceptedCandidateCount).toBe(1);
    expect(outcome.acceptedCandidates[0]).toMatchObject({
      fieldPath: "contact.email",
      value: "jane@example.com",
      classification: "explicit",
      confidence: "high",
      reviewStatus: "unreviewed",
    });
  });

  it("returns no_supported_field when no deterministic field is supported", () => {
    const outcome = runFallback([
      "Work Experience",
      "Nova Systems",
      "Software Engineer",
    ]);
    expect(outcome.status).toBe("no_supported_field");
    expect(outcome.meetsDraftThreshold).toBe(false);
    expect(outcome.acceptedCandidateCount).toBe(0);
    expectFallbackOutcome(outcome, { alternative: false });
  });

  it("never confirms or persists inferred, ambiguous, low-confidence, or unsupported candidates", () => {
    const outcome = runFallback([
      "Email: jane@example.com",
      "Nom: Jane Doe jane@example.com",
      "Nom: Jane",
      "Summary",
      "Date de naissance: 1990",
    ]);
    expect(outcome.acceptedCandidateCount).toBe(1);
    for (const candidate of outcome.acceptedCandidates) {
      expect(candidate.classification).toBe("explicit");
      expect(candidate.confidence).toBe("high");
      expect(candidate.reviewStatus).toBe("unreviewed");
      expect(candidate.acceptanceReason).toBe("deterministic_rule_satisfied");
    }
    expect(
      outcome.rejectedCandidates.map((candidate) => candidate.reason),
    ).toEqual(
      expect.arrayContaining([
        "ambiguous_value",
        "low_confidence",
        "forbidden_field",
        "unsupported_field",
      ]),
    );
    for (const rejected of outcome.rejectedCandidates) {
      expect(limitedDeterministicFallbackRejectionReasons).toContain(
        rejected.reason,
      );
    }
  });

  it("never claims the import completed successfully with partial fallback data", () => {
    const outcome = runFallback(["Email: jane@example.com"]);
    expect(["partial", "no_supported_field"]).toContain(outcome.status);
    expect(outcome.disclosure.notReliableFullSemanticParsing).toBe(true);
    expect(
      outcome.warnings.some(
        (warning) => warning.category === "no_reliable_semantic_parsing",
      ),
    ).toBe(true);
    const serialized = JSON.stringify(outcome).toLowerCase();
    expect(outcome.status).not.toBe("complete");
    expect(serialized).not.toContain("completed successfully");
    expect(serialized).not.toContain("successfully completed");
    expect(serialized).not.toContain("success");
    expect(serialized).not.toContain("confirmed");
  });

  it("produces deterministic, idempotent recovery output across repeated attempts", () => {
    const lines = [
      "Nom complet: Mélodie Dupont",
      "Email: melodie@exemple.fr",
      "Compétences: TypeScript, Go",
      "Summary",
    ];
    const first = runFallback(lines, { trigger: "expired_session" });
    const second = runFallback(lines, { trigger: "expired_session" });
    const third = runFallback(lines, { trigger: "expired_session" });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(JSON.stringify(second)).toBe(JSON.stringify(third));
    expect(limitedDeterministicFallbackOutcomeSchema.parse(first)).toEqual(
      first,
    );
  });
});

describe("manual-entry recovery", () => {
  it("keeps manual_entry available in every provider-failure warning state", () => {
    for (const code of Object.keys(
      warningCategoryByCode,
    ) as SemanticProviderErrorCode[]) {
      expect(warningFor(code).recoveryActions).toContain("manual_entry");
    }
    for (const trigger of limitedDeterministicFallbackProviderTriggers) {
      expect(
        runFallback(["Email: jane@example.com"], { trigger }).recoveryActions,
      ).toContain("manual_entry");
    }
  });

  it("routes recovery to the existing manual-entry contract and service", async () => {
    const repository = new FakeManualDraftRepository();
    const transactionRunner: PersistenceTransactionRunner = {
      transaction: async (work) => work(undefined as unknown as EntityManager),
    };
    const service = new CreateManualResumeDraftService(
      repository,
      transactionRunner,
      { now: () => new Date("2026-08-01T09:30:00.000Z") },
      { nextId: () => "30000000-0000-4000-8000-000000000001" },
      { nextRequestId: () => "40000000-0000-4000-8000-000000000001" },
    );
    const creationKey = "manual-recovery-key-0001";

    const result = await service.create({
      ownerUserId: ownerA,
      creationKey,
    });
    expect(manualDraftResponseSchema.safeParse(result).success).toBe(true);
    expect(result.status).toBe("manual_draft");
    expect(result.draft.source).toBe("manual_entry");
    expect(result.draft.status).toBe("editing");
    expect(createManualDraftRequestSchema.parse({ creationKey })).toEqual({
      creationKey,
    });

    const repeated = await service.create({
      ownerUserId: ownerA,
      creationKey,
    });
    expect(repeated.draft.draftId).toBe(result.draft.draftId);
    expect(repository.drafts.size).toBe(1);
    expect(result.userMessage.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(result);
    for (const sentinel of Object.values(sentinels)) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("keeps the manual-entry route contract stable", () => {
    expect("/resumes/new/manual").toBe("/resumes/new/manual");
    expect(
      createManualDraftRequestSchema.parse({ creationKey: "a".repeat(16) }),
    ).toEqual({ creationKey: "a".repeat(16) });
    expect(
      createManualDraftRequestSchema.safeParse({ creationKey: "short" })
        .success,
    ).toBe(false);
  });
});

describe("privacy and non-disclosure", () => {
  it("keeps provider-failure warnings free of credentials, prompts, raw output, and source data", () => {
    for (const code of Object.keys(
      warningCategoryByCode,
    ) as SemanticProviderErrorCode[]) {
      const serialized = JSON.stringify(warningFor(code)).toLowerCase();
      for (const token of [
        "token",
        "oauth",
        "prompt",
        "model",
        "secret",
        "credential",
        "session",
        "header",
        "cookie",
        "https://",
        "/users/",
        "raw",
        "providerjson",
        "nativejson",
      ]) {
        expect(serialized).not.toContain(token);
      }
    }
  });

  it("keeps serialized provider errors free of provider-native material", () => {
    for (const code of Object.keys(
      warningCategoryByCode,
    ) as SemanticProviderErrorCode[]) {
      const error = createPrivacySafeSemanticProviderError(code, [
        { path: ["sections", "contact", "email"], code },
      ]);
      const serialized = JSON.stringify(serializeSemanticProviderError(error));
      expect(serialized).toContain(code);
      for (const sentinel of Object.values(sentinels)) {
        expect(serialized).not.toContain(sentinel);
      }
      expect(serialized).not.toContain("https://");
    }
  });

  it("serializes provider connection status without session references or provider-native material", async () => {
    const h = harness();
    await createConnectedConnection(h);
    const view = await h.service.status(ownerA, connectionA);
    const serialized = JSON.stringify(view).toLowerCase();
    for (const key of [
      "sessionreference",
      "accesstoken",
      "refreshtoken",
      "authorizationcode",
      "client_id",
      "oauth",
      "header",
      "cookie",
      "prompt",
      "model",
      "endpoint",
      "auth.openai.com",
      "code=",
      "/users/",
    ]) {
      expect(serialized).not.toContain(key);
    }
    for (const sentinel of Object.values(sentinels)) {
      expect(serialized).not.toContain(sentinel.toLowerCase());
    }
  });

  it("keeps service errors free of provider-native details when the adapter leaks them", async () => {
    const h = harness();
    await createConnectedConnection(h);
    h.adapter.failWith = new Error(
      [
        sentinels.accessToken,
        sentinels.providerNativeError,
        sentinels.oauthUrl,
        sentinels.sourceTranscript,
      ].join(" "),
    );
    const error = await probe(() => h.service.status(ownerA, connectionA));
    expect(error).toBeInstanceOf(ProviderConnectionError);
    expect((error as ProviderConnectionError).code).toBe(
      "provider_adapter_failed",
    );
    const serialized = JSON.stringify(error);
    for (const sentinel of Object.values(sentinels)) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(serialized).not.toContain("https://");
  });

  it("never serializes source transcripts, fragments, or private storage paths in fallback outcomes", () => {
    const outcome = runFallback([
      sentinels.sourceTranscript,
      sentinels.storagePath,
      "Nom complet: Mélodie Dupont",
      "Email: melodie@exemple.fr",
      "Compétences: TypeScript, Go",
    ]);
    const serialized = JSON.stringify(outcome);
    const lower = serialized.toLowerCase();
    expect(serialized).not.toContain(sentinels.sourceTranscript);
    expect(serialized).not.toContain(sentinels.storagePath);
    for (const sentinel of Object.values(sentinels)) {
      expect(serialized).not.toContain(sentinel);
    }
    for (const token of [
      "api_key",
      "apikey",
      "token",
      "oauth",
      "credential",
      "password",
      "secret",
      "bearer",
      "authorization",
      "prompt",
      "model",
      "openai",
      "codex",
      "anthropic",
      "claude",
      "ollama",
      "chatgpt",
      "endpoint",
      "header",
      "stderr",
      "storage",
      "filename",
      "bucket",
      "snippet",
      "source",
      "raw",
      "providernative",
      "nativepayload",
      "nativejson",
      "providerjson",
      "rawprovider",
      "sdk",
      "credentials",
    ]) {
      expect(lower).not.toContain(token);
    }
  });
});

function warningFor(code: SemanticProviderErrorCode): SemanticWarning {
  const result = generateSemanticWarnings({
    providerError: createPrivacySafeSemanticProviderError(code),
  });
  const warning = result.warnings[0];
  if (warning === undefined) {
    throw new Error(`expected a provider failure warning for ${code}`);
  }
  return warning;
}

function expectFallbackOutcome(
  outcome: LimitedDeterministicFallbackOutcome,
  options: { readonly alternative: boolean },
): void {
  expect(
    limitedDeterministicFallbackOutcomeSchema.safeParse(outcome).success,
  ).toBe(true);
  expect(outcome.contractVersion).toBe(
    limitedDeterministicFallbackContractVersion,
  );
  expect(outcome.disclosure.isPartial).toBe(true);
  expect(outcome.disclosure.mayMissInformation).toBe(true);
  expect(outcome.disclosure.notReliableFullSemanticParsing).toBe(true);
  expect(outcome.disclosure.manualCorrectionOrEntryMayBeRequired).toBe(true);
  expect(outcome.disclosure.summary).toBe(
    limitedDeterministicFallbackDisclosureSummary,
  );
  expect(outcome.recoveryActions).toContain("retry");
  expect(outcome.recoveryActions).toContain("reconnect");
  expect(outcome.recoveryActions).toContain("manual_entry");
  if (options.alternative) {
    expect(outcome.recoveryActions).toEqual([
      "retry",
      "reconnect",
      "alternative_provider",
      "manual_entry",
    ]);
  } else {
    expect(outcome.recoveryActions).toEqual([
      "retry",
      "reconnect",
      "manual_entry",
    ]);
    expect(outcome.recoveryActions).not.toContain("alternative_provider");
  }
  for (const candidate of outcome.acceptedCandidates) {
    expect(candidate.reviewStatus).toBe("unreviewed");
    expect(candidate.classification).toBe("explicit");
    expect(candidate.confidence).toBe("high");
  }
}

function harness(): {
  readonly repository: FakeConnectionsRepository;
  readonly sessionStore: FakeSessionStore;
  readonly adapter: FakeAdapter;
  readonly service: ProviderConnectionService;
} {
  const repository = new FakeConnectionsRepository();
  const sessionStore = new FakeSessionStore();
  const adapter = new FakeAdapter();
  const service = new ProviderConnectionService({
    repository,
    sessionStore,
    adapter,
  });
  return { repository, sessionStore, adapter, service };
}

async function createConnectedConnection(
  h: ReturnType<typeof harness>,
): Promise<void> {
  await h.service.connect(ownerA, connectionA);
  await h.service.completeLogin(ownerA, connectionA);
  expect(h.sessionStore.objects.size).toBe(1);
}

async function probe(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected the provider operation to fail closed");
}

class FakeSessionStore implements ProviderSessionStore {
  readonly objects = new Map<string, Uint8Array>();

  private key(input: ProviderSessionStorageInput): string {
    return [input.ownerUserId, input.connectionId, input.sessionReference].join(
      "|",
    );
  }

  async writeSession(
    input: ProviderSessionWriteInput,
  ): Promise<ProviderSessionStorageInput> {
    this.objects.set(this.key(input), input.payload);
    return {
      ownerUserId: input.ownerUserId,
      connectionId: input.connectionId,
      sessionReference: input.sessionReference,
    };
  }

  async readSession(input: ProviderSessionStorageInput): Promise<Uint8Array> {
    const payload = this.objects.get(this.key(input));
    if (payload === undefined) throw new Error("missing");
    return payload;
  }

  async deleteSession(
    input: ProviderSessionStorageInput,
  ): Promise<{ readonly deleted: boolean }> {
    return { deleted: this.objects.delete(this.key(input)) };
  }

  async hasSession(input: ProviderSessionStorageInput): Promise<boolean> {
    return this.objects.has(this.key(input));
  }
}

class FakeConnectionsRepository implements AIProviderRuntimeConnectionsRepository {
  readonly rows = new Map<string, AIProviderRuntimeConnection>();

  async transaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return work({} as EntityManager);
  }

  async createConnection(
    connection: AIProviderRuntimeConnection,
  ): Promise<AIProviderRuntimeConnection> {
    if (this.rows.has(connection.id)) {
      throw new Error("duplicate");
    }
    this.rows.set(connection.id, connection);
    return connection;
  }

  async findConnectionByOwner(
    connectionId: string,
    userId: string,
  ): Promise<AIProviderRuntimeConnection | null> {
    const row = this.rows.get(connectionId);
    return row !== undefined && row.ownerUserId === userId ? row : null;
  }

  async findConnectionByProviderAndOwner(
    providerKind: string,
    userId: string,
  ): Promise<AIProviderRuntimeConnection | null> {
    for (const row of this.rows.values()) {
      if (row.providerKind === providerKind && row.ownerUserId === userId) {
        return row;
      }
    }
    return null;
  }

  async listConnectionsByOwner(
    userId: string,
  ): Promise<readonly AIProviderRuntimeConnection[]> {
    return [...this.rows.values()].filter((row) => row.ownerUserId === userId);
  }

  async saveConnection(
    connection: AIProviderRuntimeConnection,
  ): Promise<AIProviderRuntimeConnection> {
    this.rows.set(connection.id, connection);
    return connection;
  }
}

class FakeAdapter implements ProviderRuntimeConnectionAdapter {
  readonly providerKind = "test_provider";
  inspection: ProviderAdapterInspection = {
    connectionState: "connected",
    authenticationState: "authenticated",
    availabilityState: "available",
    checkedAt: new Date("2026-08-01T09:02:00.000Z"),
    safeMessage: null,
  };
  connected: ProviderAdapterConnectedResult = {
    connectedAt: new Date("2026-08-01T09:02:00.000Z"),
    expiresAt: new Date("2026-08-01T10:02:00.000Z"),
    sessionReference,
    capabilities,
  };
  login: ProviderAdapterLoginResult = {
    loginStartedAt: new Date("2026-08-01T09:01:00.000Z"),
    safeMessage: null,
    browserHandoff: {
      loginReference: "test-login-reference",
      authorizationUrl: "https://codex.test/login",
    },
  };
  quota: ProviderAdapterQuotaResult = {
    availabilityState: "available",
    checkedAt: new Date("2026-08-01T09:03:00.000Z"),
    safeMessage: null,
  };
  failWith: Error | null = null;
  disconnectCalls = 0;
  revokeCalls = 0;
  deleteCalls = 0;

  async inspect(): Promise<ProviderAdapterInspection> {
    this.throwIfConfigured();
    return this.inspection;
  }

  async startLogin(): Promise<ProviderAdapterLoginResult> {
    this.throwIfConfigured();
    return this.login;
  }

  async completeLogin(
    context: ProviderRuntimeAdapterContext,
  ): Promise<ProviderAdapterConnectedResult> {
    this.throwIfConfigured();
    await context.sessionStore.writeSession({
      ownerUserId: ownerA,
      connectionId: connectionA,
      sessionReference: this.connected.sessionReference,
      payload: new TextEncoder().encode(sentinels.sessionContent),
    });
    return this.connected;
  }

  async cancelLogin(): Promise<ProviderAdapterLoginResult> {
    this.throwIfConfigured();
    return this.login;
  }

  async reconnect(): Promise<ProviderAdapterConnectedResult> {
    this.throwIfConfigured();
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.throwIfConfigured();
    this.disconnectCalls += 1;
  }

  async revoke(): Promise<void> {
    this.throwIfConfigured();
    this.revokeCalls += 1;
  }

  async deleteLocalState(): Promise<void> {
    this.throwIfConfigured();
    this.deleteCalls += 1;
  }

  async capabilities(): Promise<ProviderRuntimeCapabilities> {
    this.throwIfConfigured();
    return capabilities;
  }

  async quotaState(): Promise<ProviderAdapterQuotaResult> {
    this.throwIfConfigured();
    return this.quota;
  }

  private throwIfConfigured(): void {
    if (this.failWith !== null) throw this.failWith;
  }
}

class FakeManualDraftRepository implements ManualResumeDraftRepository {
  readonly drafts = new Map<string, ManualStructuredResumeDraft>();
  private readonly byCreationKey = new Map<
    string,
    ManualStructuredResumeDraft
  >();

  async createManualDraft(input: {
    readonly draft: ManualStructuredResumeDraft;
    readonly creationKey: string;
  }): Promise<ManualStructuredResumeDraft> {
    this.drafts.set(input.draft.id, input.draft);
    this.byCreationKey.set(input.creationKey, input.draft);
    return input.draft;
  }

  async findManualDraftByOwner(
    draftId: string,
    userId: string,
  ): Promise<ManualStructuredResumeDraft | null> {
    const draft = this.drafts.get(draftId);
    return draft !== undefined && draft.ownerUserId === userId ? draft : null;
  }

  async findManualDraftByCreationKey(
    creationKey: string,
    userId: string,
  ): Promise<ManualStructuredResumeDraft | null> {
    const draft = this.byCreationKey.get(creationKey);
    return draft !== undefined && draft.ownerUserId === userId ? draft : null;
  }

  async saveManualDraft(
    draft: ManualStructuredResumeDraft,
  ): Promise<ManualStructuredResumeDraft> {
    this.drafts.set(draft.id, draft);
    return draft;
  }
}

type Fragment = ResumeSemanticParseRequest["sourceFragments"][number];
type Transcript = ResumeSemanticParseRequest["normalizedTranscript"];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function buildFragments(lines: readonly string[]): readonly Fragment[] {
  return lines
    .map((line) => normalizeText(line))
    .filter((text) => text.length > 0)
    .map((text, index) => ({
      order: index,
      line: index + 1,
      text,
      hash: sha256(text),
      bounds: {
        lineStart: index + 1,
        lineEnd: index + 1,
        start: 0,
        end: text.length,
      },
    }));
}

function buildTranscript(fragments: readonly Fragment[]): Transcript {
  const text = fragments.map((fragment) => fragment.text).join("\n");
  return { text, sha256: sha256(text), lineCount: fragments.length };
}

function runFallback(
  lines: readonly string[],
  options: {
    readonly trigger?: (typeof limitedDeterministicFallbackProviderTriggers)[number];
    readonly alternativeProviderAvailable?: boolean;
  } = {},
): LimitedDeterministicFallbackOutcome {
  const fragments = buildFragments(lines);
  const transcript = buildTranscript(fragments);
  return runLimitedDeterministicPartialFallback({
    normalizedTranscript: transcript,
    sourceFragments: fragments,
    trigger: options.trigger ?? "no_provider",
    alternativeProviderAvailable: options.alternativeProviderAvailable ?? false,
  });
}

function pdfProfile(): DeterministicFixtureProfile {
  const profile = deterministicFixtureProfiles.find(
    (candidate) => candidate.profileId === "pdf-english-anonymous",
  );
  if (profile === undefined) throw new Error("Missing PDF fixture profile.");
  return profile;
}

function buildFixtureRequest(
  profile: DeterministicFixtureProfile,
): ResumeSemanticParseRequest {
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: "20000000-0000-4000-8000-000000000099",
    correlationId: "20000000-0000-4000-8000-000000000099",
    documentFormat: profile.documentFormat,
    languageContext: {
      detectedLanguage: "english",
      confidence: null,
      textDirection: "ltr",
    },
    normalizedTranscript: profile.transcript,
    sourceFragments: [...profile.fragments],
    fragmentHashes: [...profile.fragmentHashes],
    formatMetadata: profile.formatMetadata,
  };
}

function cloneResponse(): NuvitaeSemanticExtractionResponse {
  return structuredClone(pdfProfile().response);
}

function ungroundedFixture(): {
  readonly request: ResumeSemanticParseRequest;
  readonly response: NuvitaeSemanticExtractionResponse;
} {
  const profile = pdfProfile();
  const request = buildFixtureRequest(profile);
  const fragment = profile.fragments[0];
  if (fragment === undefined) {
    throw new Error("PDF profile must have at least one fragment.");
  }
  const tamperedHash = sha256("different normalized text");
  const tamperedFragments = request.sourceFragments.map((item, index) =>
    index === 0 ? { ...item, hash: tamperedHash } : item,
  );
  const response = cloneResponse();
  if (response.sections.contact.fullName === null) {
    throw new Error("PDF profile must have a grounded full name.");
  }
  response.sections.contact.fullName = {
    ...response.sections.contact.fullName,
    evidence: [
      {
        line: fragment.line,
        start: 0,
        end: fragment.text.length,
        fragmentHash: tamperedHash,
        fragmentId: null,
      },
    ],
  };
  return {
    request: {
      ...request,
      sourceFragments: tamperedFragments,
      fragmentHashes: tamperedFragments.map((item) => item.hash),
    },
    response,
  };
}
