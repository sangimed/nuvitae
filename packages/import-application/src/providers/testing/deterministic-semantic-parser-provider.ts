import {
  maxSemanticExtractionResponseJsonBytes,
  maxSemanticParserRequestJsonBytes,
  type ResumeSemanticParseRequest,
} from "@nuvitae/contracts";

import { createPrivacySafeSemanticProviderError } from "../../semantic-parser/provider-errors.js";
import type {
  ResumeSemanticParserCapabilities,
  ResumeSemanticParserConnectionSnapshot,
  ResumeSemanticParserInvocationOptions,
  ResumeSemanticParserProvider,
  ResumeSemanticParserProviderResult,
} from "../../semantic-parser/resume-semantic-parser-provider.js";
import { validateSemanticParseRequest } from "../../semantic-parser/validate-semantic-response.js";
import {
  deterministicFixtureProfiles,
  type DeterministicFixtureProfile,
} from "./fixture-transcripts.js";

export const deterministicSemanticProviderKind = "deterministic-test" as const;

/**
 * Deterministic semantic-provider test adapter.
 *
 * This provider exists exclusively for automated and explicit local
 * integration testing. It implements the real `ResumeSemanticParserProvider`
 * boundary, consumes only the provider-neutral normalized transcript and
 * flattened source fragments carried by the parse request, and returns the
 * versioned Nuvitae-owned semantic extraction response for an anonymous
 * normalized fixture transcript.
 *
 * It is framework-independent, never reads PDF/DOCX files, never touches
 * storage, PostgreSQL, TypeORM, BullMQ, NestJS, environment variables, the
 * network, credentials, tokens, provider SDKs, or Codex code, and is not
 * exported from the production `@nuvitae/import-application` barrel.
 *
 * Profile selection is content-based: a request matches a fixture profile only
 * when its normalized transcript hash/text and every flattened source fragment
 * (order, line, text, hash, bounds) match the fixture byte-for-byte. An
 * arbitrary user resume therefore cannot accidentally match a fixture profile.
 */
export class DeterministicSemanticParserProvider implements ResumeSemanticParserProvider {
  readonly providerKind: string = deterministicSemanticProviderKind;

  readonly capabilities: ResumeSemanticParserCapabilities = {
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
    maxTimeoutMs: 30_000,
  };

  private readonly profiles: readonly DeterministicFixtureProfile[] =
    deterministicFixtureProfiles;

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

    for (const profile of this.profiles) {
      const comparison = compareRequestToProfile(validated.value, profile);
      if (comparison === "match") {
        return { ok: true, response: profile.response };
      }
      if (comparison === "fragment_mismatch") {
        return {
          ok: false,
          error: createPrivacySafeSemanticProviderError(
            "malformed_flattened_evidence",
          ),
        };
      }
    }

    return {
      ok: false,
      error: createPrivacySafeSemanticProviderError("unsupported_capability"),
    };
  }
}

export function createDeterministicSemanticParserProvider(): DeterministicSemanticParserProvider {
  return new DeterministicSemanticParserProvider();
}

type RequestComparison = "match" | "transcript_mismatch" | "fragment_mismatch";

function compareRequestToProfile(
  request: ResumeSemanticParseRequest,
  profile: DeterministicFixtureProfile,
): RequestComparison {
  if (
    request.documentFormat !== profile.documentFormat ||
    request.languageContext.detectedLanguage !== profile.detectedLanguage ||
    request.normalizedTranscript.sha256 !== profile.transcript.sha256 ||
    request.normalizedTranscript.text !== profile.transcript.text ||
    request.normalizedTranscript.lineCount !== profile.transcript.lineCount ||
    request.formatMetadata.sourceFormat !== profile.formatMetadata.sourceFormat
  ) {
    return "transcript_mismatch";
  }

  if (
    request.sourceFragments.length !== profile.fragments.length ||
    request.fragmentHashes.length !== profile.fragmentHashes.length
  ) {
    return "fragment_mismatch";
  }

  for (let index = 0; index < profile.fragments.length; index += 1) {
    const expected = profile.fragments[index];
    const actual = request.sourceFragments[index];
    const expectedHash = profile.fragmentHashes[index];
    const actualHash = request.fragmentHashes[index];
    if (!expected || !actual || !expectedHash || !actualHash) {
      return "fragment_mismatch";
    }
    if (
      actual.order !== expected.order ||
      actual.line !== expected.line ||
      actual.text !== expected.text ||
      actual.hash !== expected.hash ||
      actualHash !== expectedHash ||
      actual.bounds.lineStart !== expected.bounds.lineStart ||
      actual.bounds.lineEnd !== expected.bounds.lineEnd ||
      actual.bounds.start !== expected.bounds.start ||
      actual.bounds.end !== expected.bounds.end
    ) {
      return "fragment_mismatch";
    }
  }

  return "match";
}

export type { DeterministicFixtureProfile };
