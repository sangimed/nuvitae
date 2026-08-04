import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ResumeSemanticParseRequest } from "@nuvitae/contracts";
import {
  limitedDeterministicFallbackProviderTriggers,
  runLimitedDeterministicPartialFallback,
  type LimitedDeterministicFallbackProviderTrigger,
  type LimitedDeterministicPartialFallbackInput,
} from "@nuvitae/import-application";

/**
 * T186 - limited deterministic partial extraction fallback integration tests.
 *
 * These tests exercise the closed T187 contract through the T188
 * orchestration using realistic normalized transcripts and canonical
 * flattened fragments. No PDF/DOCX parsing implementation is reopened here;
 * transcripts and fragments are built from text exactly like the completed
 * extraction normalization boundary (`buildSemanticParseRequest`).
 */

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
    readonly trigger?: LimitedDeterministicFallbackProviderTrigger;
    readonly alternativeProviderAvailable?: boolean;
    readonly fragments?: readonly Fragment[];
    readonly transcript?: Transcript;
  } = {},
) {
  const fragments = options.fragments ?? buildFragments(lines);
  const transcript = options.transcript ?? buildTranscript(fragments);
  const input: LimitedDeterministicPartialFallbackInput = {
    normalizedTranscript: transcript,
    sourceFragments: fragments,
    trigger: options.trigger ?? "no_provider",
    alternativeProviderAvailable: options.alternativeProviderAvailable ?? false,
  };
  return runLimitedDeterministicPartialFallback(input);
}

describe("limited deterministic partial fallback integration", () => {
  it("handles the no-provider flow with retry, reconnect, and manual-entry recovery", () => {
    const outcome = runFallback(["Email: jane@example.com"], {
      trigger: "no_provider",
    });
    expect(outcome.status).toBe("partial");
    expect(outcome.meetsDraftThreshold).toBe(true);
    expect(outcome.recoveryActions).toEqual([
      "retry",
      "reconnect",
      "manual_entry",
    ]);
    expect(outcome.alternativeProviderAvailable).toBe(false);
    expect(outcome.disclosure.isPartial).toBe(true);
    expect(JSON.stringify(outcome)).not.toContain("no_provider");
  });

  it("handles the provider-unavailable flow and offers an alternative provider when available", () => {
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
    expect(withoutAlternative.recoveryActions).not.toContain(
      "alternative_provider",
    );
    expect(JSON.stringify(withoutAlternative)).not.toContain(
      "provider_unavailable",
    );
  });

  it("handles the expired-session flow with reconnect recovery", () => {
    const outcome = runFallback(["Email: jane@example.com"], {
      trigger: "expired_session",
    });
    expect(outcome.recoveryActions).toContain("reconnect");
    expect(JSON.stringify(outcome)).not.toContain("expired_session");
    expect(JSON.stringify(outcome)).not.toContain("session");
  });

  it("handles the quota-exhausted flow without provider-native detail", () => {
    const outcome = runFallback(["Email: jane@example.com"], {
      trigger: "quota_exhausted",
    });
    expect(outcome.recoveryActions).toContain("manual_entry");
    const serialized = JSON.stringify(outcome).toLowerCase();
    expect(serialized).not.toContain("quota");
    expect(serialized).not.toContain("subscription");
  });

  it("handles the timeout flow with retry", () => {
    const outcome = runFallback(["Email: jane@example.com"], {
      trigger: "timeout",
    });
    expect(outcome.recoveryActions).toContain("retry");
    expect(JSON.stringify(outcome)).not.toContain("timeout");
  });

  it("handles the malformed-provider-output flow without raw provider payloads", () => {
    const outcome = runFallback(["Email: jane@example.com"], {
      trigger: "malformed_provider_output",
    });
    const serialized = JSON.stringify(outcome).toLowerCase();
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("providernative");
    expect(serialized).not.toContain("nativepayload");
    expect(serialized).not.toContain("nativejson");
    expect(serialized).not.toContain("stderr");
    expect(serialized).not.toContain("raw");
    expect(serialized).not.toContain("malformed");
  });

  it("rejects unknown provider triggers deterministically", () => {
    expect(() =>
      runFallback(["Email: jane@example.com"], {
        trigger: "unknown_trigger" as never,
      }),
    ).toThrow("unsupported limited deterministic fallback trigger");
  });

  it("reaches the draft threshold with one valid explicit candidate", () => {
    const outcome = runFallback(["Email: jane@example.com"]);
    expect(outcome.status).toBe("partial");
    expect(outcome.meetsDraftThreshold).toBe(true);
    expect(outcome.acceptedCandidateCount).toBe(1);
    expect(outcome.acceptedCandidates[0]).toMatchObject({
      fieldPath: "contact.email",
      value: "jane@example.com",
      classification: "explicit",
      confidence: "high",
      rule: "email_rule",
      acceptanceReason: "deterministic_rule_satisfied",
      reviewStatus: "unreviewed",
    });
  });

  it("does not reach the draft threshold without a valid candidate", () => {
    const outcome = runFallback([
      "Summary",
      "Passionate engineer with five years of experience.",
    ]);
    expect(outcome.status).toBe("no_supported_field");
    expect(outcome.meetsDraftThreshold).toBe(false);
    expect(outcome.acceptedCandidateCount).toBe(0);
    expect(outcome.rejectedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: "summary",
          reason: "forbidden_field",
        }),
      ]),
    );
  });

  it("mixes accepted and rejected candidates with closed reasons", () => {
    const outcome = runFallback([
      "Nom: Mélodie Dupont",
      "Email: melodie@exemple.fr",
      "Compétences: TypeScript, Go",
      "Summary",
      "Site web: https://exemple.fr https://autre.fr",
    ]);
    expect(outcome.status).toBe("partial");
    expect(outcome.acceptedCandidateCount).toBe(4);
    expect(
      outcome.acceptedCandidates.map((candidate) => candidate.fieldPath),
    ).toEqual([
      "contact.full_name",
      "contact.email",
      "skills.name",
      "skills.name",
    ]);
    expect(
      outcome.rejectedCandidates.map((candidate) => candidate.reason),
    ).toEqual(expect.arrayContaining(["forbidden_field", "ambiguous_value"]));
  });

  it("rejects values whose canonical flattened evidence is missing", () => {
    const allFragments = buildFragments([
      "Nom: Mélodie Dupont",
      "melodie@exemple.fr",
    ]);
    const transcript = buildTranscript(allFragments);
    const outcome = runFallback([], {
      transcript,
      fragments: [allFragments[0] as Fragment],
    });
    expect(outcome.acceptedCandidateCount).toBe(1);
    expect(outcome.rejectedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: "contact.email",
          reason: "missing_evidence",
          evidenceCount: 0,
        }),
      ]),
    );
    expect(outcome.status).toBe("partial");
  });

  it("rejects values whose canonical flattened evidence hash is invalid", () => {
    const fragments = buildFragments(["Email: jane@example.com"]);
    const transcript = buildTranscript(fragments);
    const invalidFragments = fragments.map((fragment) => ({
      ...fragment,
      hash: "0".repeat(64),
    }));
    const outcome = runFallback([], {
      transcript,
      fragments: invalidFragments,
    });
    expect(outcome.acceptedCandidateCount).toBe(0);
    expect(outcome.rejectedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: "contact.email",
          reason: "invalid_evidence",
          evidenceCount: 1,
        }),
      ]),
    );
    expect(outcome.status).toBe("no_supported_field");
  });

  it("supports French, English, and bilingual transcripts", () => {
    const french = [
      "Nom complet: Mélodie Dupont",
      "Email: melodie@exemple.fr",
      "Localisation: Paris, France",
      "Compétences: Gestion de projet, TypeScript",
      "Langues: Français, Anglais",
    ];
    const english = [
      "Full name: Mélodie Dupont",
      "Email: melodie@exemple.fr",
      "Location: Paris, France",
      "Skills: Project Management, TypeScript",
      "Languages: French, English",
    ];
    const bilingual = [
      "Full name: Mélodie Dupont",
      "Email: melodie@exemple.fr",
      "Localisation: Paris, France",
      "Compétences: Gestion de projet, TypeScript",
      "Languages: Français, Anglais",
    ];
    for (const lines of [french, english, bilingual]) {
      const outcome = runFallback(lines);
      expect(outcome.status).toBe("partial");
      expect(outcome.acceptedCandidateCount).toBe(7);
      expect(
        outcome.acceptedCandidates.map((candidate) => candidate.fieldPath),
      ).toEqual([
        "contact.full_name",
        "contact.email",
        "contact.location",
        "skills.name",
        "skills.name",
        "languages.name",
        "languages.name",
      ]);
    }
  });

  it("produces deterministic ordering and repeatable output", () => {
    const lines = [
      "Nom complet: Mélodie Dupont",
      "Email: melodie@exemple.fr",
      "Compétences: TypeScript, Go",
      "Summary",
      "Site web: https://exemple.fr https://autre.fr",
    ];
    const first = runFallback(lines);
    const repeated = runFallback(lines);
    expect(JSON.stringify(first)).toBe(JSON.stringify(repeated));
    expect(
      first.acceptedCandidates.map((candidate) => candidate.fieldPath),
    ).toEqual([
      "contact.full_name",
      "contact.email",
      "skills.name",
      "skills.name",
    ]);
    const sortKeys = first.warnings.map((warning) => warning.sortKey);
    expect(sortKeys).toEqual([...sortKeys].sort((left, right) => left - right));
  });

  it("keeps every accepted candidate unconfirmed and review-required", () => {
    const outcome = runFallback([
      "Nom complet: Mélodie Dupont",
      "Email: melodie@exemple.fr",
      "Compétences: TypeScript, Go",
    ]);
    expect(outcome.acceptedCandidateCount).toBeGreaterThan(0);
    for (const candidate of outcome.acceptedCandidates) {
      expect(candidate.reviewStatus).toBe("unreviewed");
      expect(candidate.classification).toBe("explicit");
      expect(candidate.confidence).toBe("high");
      expect(candidate.acceptanceReason).toBe("deterministic_rule_satisfied");
      expect(candidate.evidence.length).toBeGreaterThan(0);
      expect(candidate.evidence[0]?.line).toBeGreaterThan(0);
      expect(candidate.evidence[0]?.fragmentHash).toMatch(/^[a-f0-9]{64}$/u);
    }
    expect(outcome.meetsDraftThreshold).toBe(true);
  });

  it("never claims reliable full semantic parsing in disclosure", () => {
    const outcome = runFallback(["Email: jane@example.com"]);
    expect(outcome.disclosure).toMatchObject({
      isPartial: true,
      mayMissInformation: true,
      notReliableFullSemanticParsing: true,
      manualCorrectionOrEntryMayBeRequired: true,
    });
    expect(outcome.disclosure.summary).toContain("partial");
    expect(outcome.disclosure.summary).toContain(
      "does not provide reliable full semantic parsing",
    );
    expect(
      outcome.warnings.some(
        (warning) => warning.category === "no_reliable_semantic_parsing",
      ),
    ).toBe(true);
  });

  it("serializes privacy-safely without source text or provider details", () => {
    const sourceLine =
      "Confidential resume text with secret project details and metrics";
    const outcome = runFallback([
      sourceLine,
      "Nom complet: Mélodie Dupont",
      "Email: melodie@exemple.fr",
      "Compétences: TypeScript, Go",
    ]);
    const serialized = JSON.stringify(outcome);
    const lower = serialized.toLowerCase();
    expect(serialized).not.toContain(sourceLine);
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
      "no_provider",
      "expired_session",
      "quota_exhausted",
      "timeout",
      "malformed_provider_output",
      "provider_unavailable",
    ]) {
      expect(lower).not.toContain(token);
    }
  });

  it.each(limitedDeterministicFallbackProviderTriggers)(
    "offers the closed recovery action set for trigger %s",
    (trigger) => {
      const withAlternative = runFallback(["Email: jane@example.com"], {
        trigger,
        alternativeProviderAvailable: true,
      });
      expect(withAlternative.recoveryActions).toEqual([
        "retry",
        "reconnect",
        "alternative_provider",
        "manual_entry",
      ]);

      const withoutAlternative = runFallback(["Email: jane@example.com"], {
        trigger,
      });
      expect(withoutAlternative.recoveryActions).toEqual([
        "retry",
        "reconnect",
        "manual_entry",
      ]);
      expect(withoutAlternative.recoveryActions).toContain("manual_entry");
    },
  );

  it("always offers manual-entry recovery even without accepted candidates", () => {
    const outcome = runFallback(["Work Experience", "Nova Systems"]);
    expect(outcome.recoveryActions).toContain("manual_entry");
    expect(outcome.recoveryActions).toContain("retry");
    expect(outcome.recoveryActions).toContain("reconnect");
    expect(outcome.status).toBe("no_supported_field");
  });
});

it("rejects values whose canonical flattened bounds are inconsistent", () => {
  const fragments = buildFragments(["Email: jane@example.com"]);
  const transcript = buildTranscript(fragments);
  const outOfBounds = fragments.map((fragment) => ({
    ...fragment,
    bounds: { ...fragment.bounds, end: fragment.bounds.end + 5 },
  }));
  const outcome = runFallback([], {
    transcript,
    fragments: outOfBounds,
  });
  expect(outcome.acceptedCandidateCount).toBe(0);
  expect(outcome.rejectedCandidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ reason: "invalid_evidence" }),
    ]),
  );
});

it("rejects inferred names and locations from unlabelled preamble lines", () => {
  const outcome = runFallback([
    "Jordan Avery",
    "jordan.avery@example.test",
    "Paris, France",
  ]);
  expect(
    outcome.acceptedCandidates.map((candidate) => candidate.fieldPath),
  ).toEqual(["contact.email"]);
  expect(
    outcome.acceptedCandidates.some(
      (candidate) =>
        candidate.fieldPath === "contact.full_name" ||
        candidate.fieldPath === "contact.location",
    ),
  ).toBe(false);
  expect(outcome.rejectedCandidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldPath: "contact.full_name",
        reason: "inferred_value",
      }),
      expect.objectContaining({
        fieldPath: "contact.location",
        reason: "inferred_value",
      }),
    ]),
  );
  expect(outcome.status).toBe("partial");
});

it("rejects ambiguous contact values", () => {
  const multipleEmails = runFallback([
    "Email: a@example.com",
    "Email: b@example.com",
  ]);
  expect(multipleEmails.acceptedCandidateCount).toBe(0);
  expect(
    multipleEmails.rejectedCandidates.filter(
      (candidate) =>
        candidate.reason === "ambiguous_value" &&
        candidate.fieldPath === "contact.email",
    ),
  ).toHaveLength(2);
  expect(multipleEmails.status).toBe("no_supported_field");

  const mixedName = runFallback(["Nom: Jane Doe jane@example.com"]);
  expect(mixedName.rejectedCandidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldPath: "contact.full_name",
        reason: "ambiguous_value",
      }),
    ]),
  );
});

it("rejects low-confidence values", () => {
  const singleWordName = runFallback(["Nom: Jane"]);
  expect(singleWordName.acceptedCandidateCount).toBe(0);
  expect(singleWordName.rejectedCandidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldPath: "contact.full_name",
        reason: "low_confidence",
      }),
    ]),
  );
  expect(singleWordName.status).toBe("no_supported_field");
});

it("keeps duplicated values once and rejects duplicates", () => {
  const outcome = runFallback([
    "Email: jane@example.com",
    "Email: jane@example.com",
  ]);
  expect(outcome.acceptedCandidateCount).toBe(1);
  expect(outcome.acceptedCandidates[0]?.value).toBe("jane@example.com");
  expect(outcome.rejectedCandidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldPath: "contact.email",
        reason: "duplicate_value",
        evidenceCount: 1,
      }),
    ]),
  );
});

it("rejects forbidden semantic and grouped fields", () => {
  const outcome = runFallback([
    "Work Experience",
    "Nova Systems",
    "Software Engineer",
    "https://linkedin.com/in/jane https://github.com/jane",
  ]);
  expect(outcome.acceptedCandidateCount).toBe(0);
  expect(outcome.rejectedCandidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldPath: "work_experience",
        reason: "forbidden_field",
      }),
      expect.objectContaining({
        fieldPath: "professional_links",
        reason: "forbidden_field",
      }),
    ]),
  );
  expect(outcome.status).toBe("no_supported_field");
});

it("accepts explicitly labelled names and locations in English and French", () => {
  const french = runFallback([
    "Nom complet: Mélodie Dupont",
    "Localisation: Paris, France",
  ]);
  const english = runFallback([
    "Full name: John Smith",
    "Location: Lyon, France",
  ]);
  expect(
    french.acceptedCandidates.map((candidate) => [
      candidate.fieldPath,
      candidate.value,
    ]),
  ).toEqual([
    ["contact.full_name", "Mélodie Dupont"],
    ["contact.location", "Paris, France"],
  ]);
  expect(
    english.acceptedCandidates.map((candidate) => [
      candidate.fieldPath,
      candidate.value,
    ]),
  ).toEqual([
    ["contact.full_name", "John Smith"],
    ["contact.location", "Lyon, France"],
  ]);
});

it("accepts explicit email, phone, and website values", () => {
  const outcome = runFallback([
    "jane@example.com",
    "+33 6 12 34 56 78",
    "Website: https://jane.example.com",
  ]);
  expect(
    outcome.acceptedCandidates.map((candidate) => [
      candidate.fieldPath,
      candidate.value,
      candidate.rule,
    ]),
  ).toEqual([
    ["contact.email", "jane@example.com", "email_rule"],
    ["contact.phone", "+33 6 12 34 56 78", "phone_rule"],
    ["contact.website", "https://jane.example.com", "explicit_url_rule"],
  ]);
});

it("accepts explicitly delimited skills and languages with provable boundaries", () => {
  const outcome = runFallback([
    "Compétences: TypeScript, Go, PostgreSQL",
    "Langues: Anglais, Français",
  ]);
  expect(
    outcome.acceptedCandidates.map((candidate) => [
      candidate.fieldPath,
      candidate.value,
    ]),
  ).toEqual([
    ["skills.name", "TypeScript"],
    ["skills.name", "Go"],
    ["skills.name", "PostgreSQL"],
    ["languages.name", "Anglais"],
    ["languages.name", "Français"],
  ]);
});

it("rejects heading-grouped skills and languages when the boundary is insufficient", () => {
  const outcome = runFallback([
    "Skills",
    "TypeScript, Go",
    "Languages",
    "English (native), French (fluent)",
  ]);
  expect(
    outcome.acceptedCandidates.some(
      (candidate) =>
        candidate.fieldPath === "skills.name" ||
        candidate.fieldPath === "languages.name",
    ),
  ).toBe(false);
  const headingGrouped = outcome.rejectedCandidates.filter(
    (candidate) => candidate.reason === "low_confidence",
  );
  expect(headingGrouped.map((candidate) => candidate.fieldPath).sort()).toEqual(
    ["languages.name", "languages.name", "skills.name", "skills.name"],
  );
  expect(outcome.status).toBe("no_supported_field");
});

it("never creates language proficiency from parenthetical values", () => {
  const outcome = runFallback(["Langues: Anglais (courant), Français (natif)"]);
  expect(outcome.acceptedCandidateCount).toBe(0);
  expect(
    outcome.rejectedCandidates.filter(
      (candidate) =>
        candidate.fieldPath === "languages.name" &&
        candidate.reason === "ambiguous_value",
    ),
  ).toHaveLength(2);
});

it("rejects unsupported labelled fields with a closed reason", () => {
  const outcome = runFallback(["Date de naissance: 1990"]);
  expect(outcome.acceptedCandidateCount).toBe(0);
  expect(outcome.rejectedCandidates).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fieldPath: "date_de_naissance",
        reason: "unsupported_field",
      }),
    ]),
  );
  expect(outcome.status).toBe("no_supported_field");
});
