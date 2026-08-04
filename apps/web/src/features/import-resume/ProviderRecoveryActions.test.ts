import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LimitedDeterministicFallbackDisclosure } from "@nuvitae/contracts";
import { describe, expect, it } from "vitest";
import {
  ProviderRecoveryActions,
  manualEntryUrl,
  type ProviderRecoveryAction,
  type ProviderRecoveryState,
} from "./ProviderRecoveryActions";

const allStates: readonly ProviderRecoveryState[] = [
  "no_provider",
  "disconnected",
  "authentication_expired",
  "authentication_revoked",
  "provider_unavailable",
  "rate_limited",
  "quota_exceeded",
  "timeout",
  "malformed_output",
  "invalid_schema",
  "invalid_evidence",
  "ungrounded",
  "invented",
  "unsupported_capability",
  "unknown",
];

const fallbackDisclosure: LimitedDeterministicFallbackDisclosure = {
  title: "Limited automatic extraction",
  summary:
    "This automatic extraction is partial. It may miss information and does not provide reliable full semantic parsing. Review everything, correct any mistakes, or continue with manual entry.",
  isPartial: true,
  mayMissInformation: true,
  notReliableFullSemanticParsing: true,
  manualCorrectionOrEntryMayBeRequired: true,
};

function renderRecovery(input: {
  readonly state: ProviderRecoveryState;
  readonly actions?: readonly ProviderRecoveryAction[];
  readonly alternativeProviderAvailable?: boolean;
  readonly fallbackDisclosure?: LimitedDeterministicFallbackDisclosure;
}) {
  return renderToStaticMarkup(
    createElement(ProviderRecoveryActions, {
      state: input.state,
      recoveryActions: input.actions ?? [],
      alternativeProviderAvailable: input.alternativeProviderAvailable ?? false,
      ...(input.fallbackDisclosure === undefined
        ? {}
        : { fallbackDisclosure: input.fallbackDisclosure }),
      onRetry: () => undefined,
      onReconnect: () => undefined,
      onChooseAnotherProvider: () => undefined,
      onContinueLimitedExtraction: () => undefined,
      onReplaceUpload: () => undefined,
      onManualEntry: () => undefined,
    }),
  );
}

describe("ProviderRecoveryActions (T176)", () => {
  it.each([
    {
      state: "no_provider",
      message: "No AI provider connected",
      actions: [
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: [
        "Choose another provider",
        "Continue with limited extraction",
        "Enter manually",
      ],
      unexpected: ["Try again", "Reconnect AI provider"],
    },
    {
      state: "disconnected",
      message: "Your AI provider is disconnected",
      actions: [
        "reconnect_provider",
        "choose_another_provider",
        "manual_entry",
      ],
      alternative: true,
      expected: [
        "Reconnect AI provider",
        "Choose another provider",
        "Enter manually",
      ],
      unexpected: ["Try again", "Continue with limited extraction"],
    },
    {
      state: "authentication_expired",
      message: "Your provider session has expired",
      actions: [
        "reconnect_provider",
        "choose_another_provider",
        "manual_entry",
      ],
      alternative: true,
      expected: [
        "Reconnect AI provider",
        "Choose another provider",
        "Enter manually",
      ],
      unexpected: ["Try again"],
    },
    {
      state: "authentication_revoked",
      message: "Your provider connection is no longer valid",
      actions: [
        "reconnect_provider",
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: [
        "Reconnect AI provider",
        "Choose another provider",
        "Enter manually",
      ],
      unexpected: ["Continue with limited extraction"],
    },
    {
      state: "provider_unavailable",
      message: "The AI provider is temporarily unavailable",
      actions: [
        "retry",
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: [
        "Try again",
        "Choose another provider",
        "Continue with limited extraction",
        "Enter manually",
      ],
      unexpected: ["Reconnect AI provider"],
    },
    {
      state: "rate_limited",
      message: "The AI provider is receiving too many requests",
      actions: [
        "retry",
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: [
        "Try again",
        "Choose another provider",
        "Continue with limited extraction",
        "Enter manually",
      ],
      unexpected: ["Reconnect AI provider"],
    },
    {
      state: "quota_exceeded",
      message: "The AI provider subscription quota is exhausted",
      actions: [
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: [
        "Choose another provider",
        "Continue with limited extraction",
        "Enter manually",
      ],
      unexpected: ["Try again"],
    },
    {
      state: "timeout",
      message: "The AI provider took too long to respond",
      actions: [
        "retry",
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: [
        "Try again",
        "Choose another provider",
        "Continue with limited extraction",
        "Enter manually",
      ],
      unexpected: ["Reconnect AI provider"],
    },
    {
      state: "malformed_output",
      message: "The AI provider returned an unexpected response",
      actions: [
        "retry",
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: [
        "Try again",
        "Choose another provider",
        "Continue with limited extraction",
        "Enter manually",
      ],
      unexpected: ["Reconnect AI provider"],
    },
    {
      state: "invalid_schema",
      message: "The AI provider returned an unexpected format",
      actions: [
        "retry",
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: ["Try again", "Choose another provider", "Enter manually"],
      unexpected: ["Continue with limited extraction"],
    },
    {
      state: "invalid_evidence",
      message:
        "The AI provider returned information without valid source evidence",
      actions: [
        "retry",
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: ["Try again", "Choose another provider", "Enter manually"],
      unexpected: ["Continue with limited extraction"],
    },
    {
      state: "ungrounded",
      message:
        "The AI provider returned information that could not be verified",
      actions: [
        "retry",
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: ["Try again", "Choose another provider", "Enter manually"],
      unexpected: ["Continue with limited extraction"],
    },
    {
      state: "invented",
      message: "The AI provider returned information not in your resume",
      actions: ["retry", "choose_another_provider", "manual_entry"],
      alternative: true,
      expected: ["Enter manually"],
      unexpected: [
        "Try again",
        "Choose another provider",
        "Continue with limited extraction",
        "Upload a different file",
      ],
    },
    {
      state: "unsupported_capability",
      message: "The AI provider cannot analyse this resume",
      actions: [
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternative: true,
      expected: ["Choose another provider", "Enter manually"],
      unexpected: ["Continue with limited extraction", "Try again"],
    },
    {
      state: "unknown",
      message: "We could not prepare this resume for review",
      actions: ["retry", "replace_upload"],
      alternative: false,
      expected: ["Try again", "Upload a different file", "Enter manually"],
      unexpected: ["Choose another provider"],
    },
  ] as const)(
    "renders the expected message and action set for %s",
    (testCase) => {
      const markup = renderRecovery({
        state: testCase.state,
        actions: [...testCase.actions],
        alternativeProviderAvailable: testCase.alternative,
      });
      expect(markup).toContain(testCase.message);
      for (const label of testCase.expected) {
        expect(markup, testCase.state).toContain(label);
      }
      for (const label of testCase.unexpected) {
        expect(markup, testCase.state).not.toContain(label);
      }
    },
  );

  it("offers reconnect for disconnected, expired, and revoked authentication states", () => {
    for (const state of [
      "disconnected",
      "authentication_expired",
      "authentication_revoked",
    ] as const) {
      const markup = renderRecovery({
        state,
        actions: ["reconnect_provider", "manual_entry"],
      });
      expect(markup, state).toContain("Reconnect AI provider");
      expect(markup, state).toContain("Enter manually");
    }
  });

  it("offers executable deterministic fallback for rate limited states", () => {
    const markup = renderRecovery({
      state: "rate_limited",
      actions: [
        "retry",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
    });
    expect(markup).toContain("Continue with limited extraction");
    expect(markup).toContain("Try again");
    expect(markup).toContain("Enter manually");
  });

  it("never offers deterministic fallback for unsupported capability", () => {
    const markup = renderRecovery({
      state: "unsupported_capability",
      actions: [
        "choose_another_provider",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
      alternativeProviderAvailable: true,
    });
    expect(markup).not.toContain("Continue with limited extraction");
    expect(markup).toContain("Choose another provider");
    expect(markup).toContain("Enter manually");
  });

  it("shows the alternative-provider action only when an alternative is available", () => {
    const withAlternative = renderRecovery({
      state: "provider_unavailable",
      actions: ["choose_another_provider", "manual_entry"],
      alternativeProviderAvailable: true,
    });
    expect(withAlternative).toContain("Choose another provider");

    const withoutAlternative = renderRecovery({
      state: "provider_unavailable",
      actions: ["choose_another_provider", "manual_entry"],
      alternativeProviderAvailable: false,
    });
    expect(withoutAlternative).not.toContain("Choose another provider");
    expect(withoutAlternative).toContain("Enter manually");
  });

  it("keeps manual entry available in every recovery state", () => {
    for (const state of allStates) {
      const markup = renderRecovery({ state, actions: [] });
      expect(markup, state).toContain("Enter manually");
    }
  });

  it("presents fallback results as partial, review-required, and not full semantic parsing", () => {
    const markup = renderRecovery({
      state: "rate_limited",
      actions: ["manual_entry"],
      fallbackDisclosure,
    });
    expect(markup).toContain("Limited automatic extraction");
    expect(markup).toContain("partial");
    expect(markup).toContain("does not provide reliable full semantic parsing");
    expect(markup).toContain(
      "Extracted fields are unconfirmed and need your review.",
    );
    expect(markup).not.toContain("Your resume draft is ready");
  });

  it("fails safely for unknown states without internal diagnostics", () => {
    const markup = renderRecovery({
      state: "unknown",
      actions: ["retry"],
    });
    expect(markup).toContain("We could not prepare this resume for review");
    expect(markup).toContain("Try again");
    expect(markup).toContain("Upload a different file");
    expect(markup).toContain("Enter manually");
    expect(markup).not.toContain("unknown");
    expect(markup).not.toContain("diagnostic");
    expect(markup).not.toContain("rate_limited");
    expect(markup).not.toContain("internal");
  });

  it("drops unknown backend actions and never renders private data", () => {
    const markup = renderRecovery({
      state: "provider_unavailable",
      actions: [
        "manual_entry",
        "leak_secret_transcript",
      ] as unknown as readonly ProviderRecoveryAction[],
    });
    expect(markup).not.toContain("leak");
    expect(markup).not.toContain("secret");
    expect(markup).not.toContain("transcript");
    expect(markup).toContain("Enter manually");
  });

  it("renders keyboard-operable controls with accessible names and status semantics", () => {
    const markup = renderRecovery({
      state: "rate_limited",
      actions: [
        "retry",
        "limited_deterministic_partial_extraction",
        "manual_entry",
      ],
    });
    const buttons = markup.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBe(3);
    for (const button of buttons) {
      expect(button).toContain('type="button"');
    }
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(labelledBy).toBeDefined();
    expect(markup).toContain(`<h2 id="${labelledBy}">`);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-atomic="true"');
  });

  it("wires actions to the existing callbacks and manual-entry route", async () => {
    const source = await readFile(
      "apps/web/src/features/import-resume/ProviderRecoveryActions.tsx",
      "utf8",
    );
    expect(source).toContain("onClick={handler}");
    expect(source).toContain("return props.onRetry;");
    expect(source).toContain("return props.onReconnect;");
    expect(source).toContain("return props.onChooseAnotherProvider;");
    expect(source).toContain("return props.onContinueLimitedExtraction;");
    expect(source).toContain("return props.onReplaceUpload;");
    expect(source).toContain("return props.onManualEntry;");
    expect(manualEntryUrl).toBe("/resumes/new/manual");
  });

  it("never exposes model, OAuth, credential, prompt, session reference, or raw diagnostic details", async () => {
    const source = await readFile(
      "apps/web/src/features/import-resume/ProviderRecoveryActions.tsx",
      "utf8",
    );
    for (const term of [
      "apiKey",
      "accessToken",
      "refreshToken",
      "authorization code",
      "storagePath",
      "sk-",
      "gpt-",
      "openai",
      "codex",
      "dangerouslySetInnerHTML",
    ]) {
      expect(source).not.toContain(term);
    }
    for (const state of allStates) {
      const markup = renderRecovery({
        state,
        actions: [
          "retry",
          "reconnect_provider",
          "choose_another_provider",
          "limited_deterministic_partial_extraction",
          "replace_upload",
          "manual_entry",
        ],
        alternativeProviderAvailable: true,
      });
      const lower = markup.toLowerCase();
      for (const term of [
        "oauth",
        "credential",
        "token",
        "prompt",
        "openai",
        "codex",
        "endpoint",
        "diagnostic",
        "storage",
        "capability",
        "api key",
        "access token",
        "refresh token",
        "session id",
        "session reference",
        "sk-",
        "gpt-",
      ]) {
        expect(lower, state).not.toContain(term);
      }
    }
  });
});
