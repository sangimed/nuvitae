import { describe, expect, it } from "vitest";

import {
  maxSemanticExtractionResponseJsonBytes,
  maxSemanticParserRequestJsonBytes,
  type NuvitaeSemanticExtractionResponse,
  type ResumeSemanticParseRequest,
  type SemanticEvidence,
} from "@nuvitae/contracts";

import * as importApplicationExports from "../../index.js";
import { serializeSemanticProviderError } from "../../semantic-parser/provider-errors.js";
import { validateSemanticExtractionResponse } from "../../semantic-parser/validate-semantic-response.js";
import { normalizeGroundedText } from "../../validation/evidence-grounding.js";
import { validateSemanticResponse } from "../../validation/semantic-validation.js";
import {
  createDeterministicSemanticParserProvider,
  deterministicSemanticProviderKind,
} from "./deterministic-semantic-parser-provider.js";
import {
  buildFixtureParseRequest,
  deterministicFixtureProfiles,
  type DeterministicFixtureProfile,
} from "./fixture-transcripts.js";

function fixtureProfile(
  documentFormat: DeterministicFixtureProfile["documentFormat"],
): DeterministicFixtureProfile {
  const profile = deterministicFixtureProfiles.find(
    (candidate) => candidate.documentFormat === documentFormat,
  );
  if (!profile) throw new Error(`Missing ${documentFormat} fixture profile.`);
  return profile;
}

const pdfProfile = () => fixtureProfile("pdf");
const docxProfile = () => fixtureProfile("docx");

interface ValueWithEvidence {
  readonly value: string;
  readonly evidence: SemanticEvidence;
}

function isValueWithEvidence(
  value: unknown,
): value is { value: string; evidence: SemanticEvidence[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof (value as { value: unknown }).value === "string" &&
    "evidence" in value &&
    Array.isArray((value as { evidence: unknown }).evidence)
  );
}

function collectSectionValues(
  response: NuvitaeSemanticExtractionResponse,
): ValueWithEvidence[] {
  const collected: ValueWithEvidence[] = [];
  const walk = (value: unknown): void => {
    if (isValueWithEvidence(value)) {
      for (const evidence of value.evidence) {
        collected.push({ value: value.value, evidence });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === "object" && value !== null) {
      Object.values(value).forEach(walk);
    }
  };
  walk(response.sections);
  return collected;
}

function collectAllEvidence(
  response: NuvitaeSemanticExtractionResponse,
): SemanticEvidence[] {
  const collected: SemanticEvidence[] = [];
  const collect = (evidence: readonly SemanticEvidence[]): void => {
    collected.push(...evidence);
  };
  collect(response.documentLanguage.evidence);
  for (const { evidence } of collectSectionValues(response)) {
    collected.push(evidence);
  }
  for (const relationship of response.relationships)
    collect(relationship.evidence);
  for (const item of response.ambiguityDiagnostics) collect(item.evidence);
  for (const item of response.conflictDiagnostics) collect(item.evidence);
  return collected;
}

function expectGrounded(
  request: ResumeSemanticParseRequest,
  response: NuvitaeSemanticExtractionResponse,
): void {
  const findFragment = (evidence: SemanticEvidence) =>
    request.sourceFragments.find(
      (fragment) =>
        fragment.hash === evidence.fragmentHash &&
        fragment.line === evidence.line,
    );
  for (const { value, evidence } of collectSectionValues(response)) {
    const fragment = findFragment(evidence);
    expect(fragment).toBeDefined();
    expect(evidence.line).toBe(fragment!.line);
    expect(
      evidence.fragmentId === null ||
        evidence.fragmentId === `fragment-${fragment!.order + 1}`,
    ).toBe(true);
    expect(evidence.start).toBeGreaterThanOrEqual(fragment!.bounds.start);
    expect(evidence.end).toBeLessThanOrEqual(fragment!.bounds.end);
    expect(evidence.end).toBeGreaterThan(evidence.start);
    expect(evidence.end).toBeLessThanOrEqual(fragment!.text.length);
    const slice = fragment!.text.slice(evidence.start, evidence.end);
    expect(slice).toBe(value);
    expect(normalizeGroundedText(slice)).toBe(normalizeGroundedText(value));
  }
  for (const evidence of collectAllEvidence(response)) {
    const fragment = findFragment(evidence);
    expect(fragment).toBeDefined();
    expect(evidence.line).toBe(fragment!.line);
    expect(
      evidence.fragmentId === null ||
        evidence.fragmentId === `fragment-${fragment!.order + 1}`,
    ).toBe(true);
    expect(evidence.start).toBeGreaterThanOrEqual(fragment!.bounds.start);
    expect(evidence.end).toBeLessThanOrEqual(fragment!.bounds.end);
    expect(evidence.end).toBeGreaterThan(evidence.start);
    expect(evidence.end).toBeLessThanOrEqual(fragment!.text.length);
    const slice = fragment!.text.slice(evidence.start, evidence.end);
    expect(normalizeGroundedText(slice).length).toBeGreaterThan(0);
    expect(normalizeGroundedText(slice).includes("\n")).toBe(false);
  }
}

function assertNoForbiddenKeys(value: unknown, path = ""): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenKeys(item, `${path}[${index}]`),
    );
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    expect(
      [
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
        "provider",
        "providerKind",
        "model",
        "sdk",
        "threadId",
        "messageId",
        "content",
        "usage",
        "prompt",
        "input",
        "output",
      ].includes(key),
      `Forbidden key "${key}" at ${path}`,
    ).toBe(false);
    assertNoForbiddenKeys(item, `${path}.${key}`);
  }
}

function expectNoUndefined(value: unknown, path = ""): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectNoUndefined(item, `${path}[${index}]`),
    );
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    expect(item, `undefined at ${path}.${key}`).not.toBeUndefined();
    expectNoUndefined(item, `${path}.${key}`);
  }
}

const sensitiveFixtureValues = [
  "Jordan Avery",
  "jordan.avery@example.test",
  "Nova Systems",
  "Maya Chen",
  "maya.chen@example.test",
  "Acme Studio",
  "Bright Labs",
  "2019/2021",
  "Lead the payments platform team of eight engineers.",
];

describe("deterministic semantic-provider test adapter", () => {
  it("exposes testing-only provider capabilities", () => {
    const provider = createDeterministicSemanticParserProvider();
    expect(provider.providerKind).toBe(deterministicSemanticProviderKind);
    expect(provider.capabilities).toMatchObject({
      supportedDocumentFormats: ["pdf", "docx"],
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
  });

  it("reports an available, connected provider state", async () => {
    const connection =
      await createDeterministicSemanticParserProvider().inspectConnection();
    expect(connection.connectionState).toBe("connected");
    expect(connection.availabilityState).toBe("available");
    expect(connection.safeMessage).toBeNull();
    expect(connection.checkedAt).toBeInstanceOf(Date);
  });

  it("parses the anonymous normalized PDF fixture transcript", async () => {
    const request = buildFixtureParseRequest(pdfProfile());
    const result =
      await createDeterministicSemanticParserProvider().parse(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.sections.contact.fullName?.value).toBe(
      "Jordan Avery",
    );
    expect(result.response.sections.workExperience).toHaveLength(1);
    expect(result.response.sections.workExperience[0]?.roles).toHaveLength(2);
    expect(result.response.sections.education).toHaveLength(1);
    expect(result.response.sections.skills).toHaveLength(5);
    expect(result.response.sections.languages).toHaveLength(2);
  });

  it("parses the anonymous normalized DOCX fixture transcript", async () => {
    const request = buildFixtureParseRequest(docxProfile());
    const result =
      await createDeterministicSemanticParserProvider().parse(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.sections.contact.fullName?.value).toBe("Maya Chen");
    expect(result.response.sections.workExperience).toHaveLength(2);
    expect(result.response.sections.education).toEqual([]);
    expect(result.response.sections.projects).toHaveLength(2);
    expect(result.response.ambiguityDiagnostics).toHaveLength(1);
  });

  it("produces byte-equivalent output for repeated identical requests and ignores operational identifiers", async () => {
    const provider = createDeterministicSemanticParserProvider();
    const firstRequest = buildFixtureParseRequest(pdfProfile(), {
      importId: "import-a",
    });
    const secondRequest = buildFixtureParseRequest(pdfProfile(), {
      importId: "import-b",
      correlationId: "correlation-b",
    });
    const first = await provider.parse(firstRequest);
    const second = await provider.parse(secondRequest);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(firstRequest.importId).not.toBe(secondRequest.importId);
  });

  it("returns exact evidence substring ranges with valid fragment hashes and bounds", async () => {
    const provider = createDeterministicSemanticParserProvider();
    for (const profile of deterministicFixtureProfiles) {
      const request = buildFixtureParseRequest(profile);
      const result = await provider.parse(request);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expectGrounded(request, result.response);
    }
  });

  it("uses required nulls and empty collections for absent content", async () => {
    const provider = createDeterministicSemanticParserProvider();
    const pdf = await provider.parse(buildFixtureParseRequest(pdfProfile()));
    const docx = await provider.parse(buildFixtureParseRequest(docxProfile()));
    expect(pdf.ok).toBe(true);
    expect(docx.ok).toBe(true);
    if (!pdf.ok || !docx.ok) return;

    expect(pdf.response.sections.contact.website).toBeNull();
    expect(pdf.response.sections.projects).toEqual([]);
    expect(pdf.response.sections.certifications).toEqual([]);
    expect(pdf.response.sections.professionalLinks).toEqual([]);

    expect(docx.response.sections.contact.phone).toBeNull();
    expect(docx.response.sections.contact.website).toBeNull();
    expect(docx.response.sections.education).toEqual([]);
    expect(docx.response.sections.certifications).toEqual([]);
    expect(docx.response.sections.professionalLinks).toEqual([]);

    expectNoUndefined(pdf.response);
    expectNoUndefined(docx.response);
  });

  it("grounds explicit candidates and preserves work-experience relationships", async () => {
    const provider = createDeterministicSemanticParserProvider();
    const result = await provider.parse(buildFixtureParseRequest(pdfProfile()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const work = result.response.sections.workExperience[0];
    expect(work?.employerName?.value).toBe("Nova Systems");
    expect(work?.roles.map((role) => role.title?.value)).toEqual([
      "Senior Software Engineer",
      "Software Engineer",
    ]);
    expect(result.response.relationships).toHaveLength(2);
    expect(result.response.relationships[0]?.relationshipType).toBe(
      "role_belongs_to_employer",
    );
    expect(result.response.relationships[0]?.fromCandidateId).toBe("role-1");
    expect(result.response.relationships[0]?.toCandidateId).toBe("work-1");
    expect(result.response.relationships[1]?.fromCandidateId).toBe("role-2");
    expect(result.response.relationships[1]?.toCandidateId).toBe("work-1");
  });

  it("represents one supported ambiguity through the diagnostic contract", async () => {
    const result = await createDeterministicSemanticParserProvider().parse(
      buildFixtureParseRequest(docxProfile()),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.ambiguityDiagnostics).toHaveLength(1);
    const ambiguity = result.response.ambiguityDiagnostics[0];
    expect(ambiguity?.code).toBe("ambiguous_date");
    expect(ambiguity?.severity).toBe("warning");
    expect(ambiguity?.evidence.length).toBeGreaterThan(0);
    expect(ambiguity?.safeDetail).not.toContain("2019/2021");
    const role = result.response.sections.workExperience[0]?.roles[0];
    expect(role?.endDate).toBeNull();
    expect(role?.isOngoing).toBeNull();
  });

  it("fails explicitly for unknown input without returning an empty success", async () => {
    const unknownRequest = buildFixtureParseRequest(pdfProfile());
    unknownRequest.normalizedTranscript = {
      text: "Completely different unsupported resume content.",
      sha256: "0".repeat(64),
      lineCount: 1,
    };
    const result =
      await createDeterministicSemanticParserProvider().parse(unknownRequest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unsupported_capability");
    expect(result.error.retryable).toBe(false);
    expect(result.error.validationIssues).toEqual([]);
  });

  it("fails explicitly for incomplete or invalid fragment input", async () => {
    const provider = createDeterministicSemanticParserProvider();

    const incomplete = buildFixtureParseRequest(docxProfile());
    incomplete.sourceFragments = incomplete.sourceFragments.slice(0, -1);
    incomplete.fragmentHashes = incomplete.fragmentHashes.slice(0, -1);
    const incompleteResult = await provider.parse(incomplete);
    expect(incompleteResult.ok).toBe(false);
    if (incompleteResult.ok) return;
    expect(incompleteResult.error.code).toBe("malformed_flattened_evidence");

    const corrupt = buildFixtureParseRequest(pdfProfile());
    const corruptFragment = {
      ...corrupt.sourceFragments[0]!,
      text: "Corrupted fragment content",
      hash: "1".repeat(64),
    };
    corrupt.sourceFragments = [
      corruptFragment,
      ...corrupt.sourceFragments.slice(1),
    ];
    corrupt.fragmentHashes = [
      corruptFragment.hash,
      ...corrupt.fragmentHashes.slice(1),
    ];
    const corruptResult = await provider.parse(corrupt);
    expect(corruptResult.ok).toBe(false);
    if (corruptResult.ok) return;
    expect(corruptResult.error.code).toBe("malformed_flattened_evidence");
  });

  it("never invents values: every non-null section value is the exact evidenced substring", async () => {
    const provider = createDeterministicSemanticParserProvider();
    for (const profile of deterministicFixtureProfiles) {
      const request = buildFixtureParseRequest(profile);
      const result = await provider.parse(request);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expectGrounded(request, result.response);
      const validation = validateSemanticResponse({
        request,
        response: result.response,
      });
      expect(validation.noInventionValid).toBe(true);
    }
  });

  it("emits no physical coordinates and no provider-native fields", async () => {
    const provider = createDeterministicSemanticParserProvider();
    for (const profile of deterministicFixtureProfiles) {
      const result = await provider.parse(buildFixtureParseRequest(profile));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      assertNoForbiddenKeys(result.response);
      const schema = validateSemanticExtractionResponse(result.response);
      expect(schema.ok).toBe(true);
    }
  });

  it("returns privacy-safe errors that contain no transcript or extracted personal values", async () => {
    const provider = createDeterministicSemanticParserProvider();
    const unknownRequest = buildFixtureParseRequest(docxProfile());
    unknownRequest.normalizedTranscript = {
      text: "Another unsupported resume.",
      sha256: "2".repeat(64),
      lineCount: 1,
    };
    const unknown = await provider.parse(unknownRequest);
    const malformed = buildFixtureParseRequest(pdfProfile());
    malformed.sourceFragments = malformed.sourceFragments.slice(0, -1);
    malformed.fragmentHashes = malformed.fragmentHashes.slice(0, -1);
    const fragmentError = await provider.parse(malformed);
    const serialized = [
      ...(unknown.ok ? [] : [serializeSemanticProviderError(unknown.error)]),
      ...(fragmentError.ok
        ? []
        : [serializeSemanticProviderError(fragmentError.error)]),
    ];
    expect(serialized.length).toBe(2);
    const json = JSON.stringify(serialized);
    for (const sensitive of sensitiveFixtureValues) {
      expect(json).not.toContain(sensitive);
    }
  });

  it("is not exported from the production package barrel", () => {
    expect(importApplicationExports).not.toHaveProperty(
      "DeterministicSemanticParserProvider",
    );
    expect(importApplicationExports).not.toHaveProperty(
      "createDeterministicSemanticParserProvider",
    );
  });

  it("validates every supported output through the real semantic-response and validation pipeline", async () => {
    const provider = createDeterministicSemanticParserProvider();
    for (const profile of deterministicFixtureProfiles) {
      const request = buildFixtureParseRequest(profile);
      const result = await provider.parse(request);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const validation = validateSemanticResponse({
        request,
        response: result.response,
      });
      expect(validation).toMatchObject({
        schemaValid: true,
        evidenceValid: true,
        groundingValid: true,
        absenceValid: true,
        ambiguityValid: true,
        conflictValid: true,
        noInventionValid: true,
        injectionResistant: true,
        accepted: true,
      });
      expect(validation.response).not.toBeNull();
    }
  });
});
