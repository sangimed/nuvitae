import { createHash } from "node:crypto";

import {
  buildLimitedDeterministicFallbackOutcome,
  limitedDeterministicFallbackRuleByField,
  type LimitedDeterministicFallbackAcceptedCandidate,
  type LimitedDeterministicFallbackAllowedField,
  type LimitedDeterministicFallbackConfidenceCategory,
  type LimitedDeterministicFallbackEvidence,
  type LimitedDeterministicFallbackFieldRule,
  type LimitedDeterministicFallbackOutcome,
  type LimitedDeterministicFallbackRejectedCandidate,
  type LimitedDeterministicFallbackRejectionReason,
} from "@nuvitae/contracts";
import type { ResumeSemanticParseRequest } from "@nuvitae/contracts";

/**
 * T188 - limited deterministic partial extraction fallback orchestration.
 *
 * Provider-neutral orchestration that turns the completed normalized
 * transcript and canonical flattened fragments into the closed T187 fallback
 * outcome. It only ever accepts a value when the field-specific deterministic
 * rule proves the label/value or pattern boundary, the canonical flattened
 * evidence is valid, the classification is explicit, and confidence is high.
 * The fallback is always partial and never claims reliable full semantic
 * parsing. Provider failures may trigger it, but provider-native details
 * never enter the result.
 */

/**
 * Closed provider-neutral failure triggers that may lead to the fallback.
 * These are categories only: no provider identity, payload, prompt, raw
 * error, or session material is accepted or serialized.
 */
export const limitedDeterministicFallbackProviderTriggers = [
  "no_provider",
  "provider_unavailable",
  "expired_session",
  "quota_exhausted",
  "timeout",
  "malformed_provider_output",
] as const;

export type LimitedDeterministicFallbackProviderTrigger =
  (typeof limitedDeterministicFallbackProviderTriggers)[number];

export interface LimitedDeterministicPartialFallbackInput {
  /**
   * Completed normalized extraction transcript (T150
   * `resumeSemanticParseRequestSchema.normalizedTranscript`).
   */
  readonly normalizedTranscript: ResumeSemanticParseRequest["normalizedTranscript"];
  /**
   * Completed canonical flattened fragments (T150
   * `resumeSemanticParseRequestSchema.sourceFragments`).
   */
  readonly sourceFragments: readonly ResumeSemanticParseRequest["sourceFragments"][number][];
  /**
   * Provider-neutral failure trigger. Validated and deliberately never
   * serialized into the outcome.
   */
  readonly trigger: LimitedDeterministicFallbackProviderTrigger;
  /**
   * Whether another configured provider is currently available. Drives the
   * closed T187 recovery action set; nothing else in the outcome varies.
   */
  readonly alternativeProviderAvailable: boolean;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const phonePattern = /^(?:\+?[0-9][0-9 ()./-]{6,}[0-9])$/u;
const fullUrlPattern = /^https?:\/\/[^\s<>()]+$/iu;
const urlTokenPattern = /https?:\/\/[^\s<>()]+/giu;
const delimiterPattern = /[,;|•]+/gu;

const maxAcceptedValueLength = 240;

const nameLabels = [
  "name",
  "nom",
  "full name",
  "fullname",
  "nom complet",
] as const;
const locationLabels = [
  "location",
  "localisation",
  "address",
  "adresse",
] as const;
const emailLabels = ["email", "e-mail", "courriel", "mail"] as const;
const phoneLabels = [
  "phone",
  "telephone",
  "téléphone",
  "tel",
  "mobile",
  "portable",
] as const;
const websiteLabels = ["website", "site", "site web", "url", "web"] as const;
const skillsLabels = [
  "skills",
  "compétences",
  "competences",
  "technical skills",
  "tech skills",
  "technologies",
] as const;
const languagesLabels = ["languages", "langues"] as const;

/**
 * Forbidden semantic/grouped sections. A line that is exactly one of these
 * headings (optionally followed by a colon) is rejected as `forbidden_field`;
 * the fallback never extracts section content from it.
 */
const forbiddenHeadings: readonly {
  readonly fieldPath: string;
  readonly labels: readonly string[];
}[] = [
  {
    fieldPath: "summary",
    labels: ["summary", "profile", "profil", "à propos"],
  },
  {
    fieldPath: "headline",
    labels: ["headline", "title", "titre"],
  },
  {
    fieldPath: "work_experience",
    labels: [
      "work experience",
      "experience",
      "expérience",
      "expérience professionnelle",
    ],
  },
  { fieldPath: "education", labels: ["education", "formation"] },
  { fieldPath: "projects", labels: ["projects", "projets"] },
  {
    fieldPath: "certifications",
    labels: ["certifications", "certification"],
  },
  {
    fieldPath: "professional_links",
    labels: ["professional links", "links", "liens"],
  },
  { fieldPath: "relationships", labels: ["relationships", "relations"] },
];

/**
 * Common document titles at the top of a resume. They are neither contact
 * fields nor inferred candidates and are skipped by preamble inference
 * rejection.
 */
const documentTitleMarkers = new Set([
  "cv",
  "resume",
  "résumé",
  "curriculum vitae",
  "curriculumvitae",
]);

interface LabelMatch {
  readonly label: string;
  readonly colonIndex: number;
  readonly value: string;
}

interface FragmentRecord {
  readonly order: number;
  readonly line: number;
  readonly text: string;
  readonly hash: string;
  readonly boundsStart: number;
  readonly boundsEnd: number;
  readonly valid: boolean;
}

type FragmentBinding =
  | { readonly kind: "valid"; readonly fragment: FragmentRecord }
  | { readonly kind: "missing" }
  | { readonly kind: "invalid" };

interface ValueExtraction {
  readonly fieldPath: LimitedDeterministicFallbackAllowedField;
  readonly value: string;
  readonly rule: LimitedDeterministicFallbackFieldRule;
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly fragmentHash: string;
  readonly fragmentId: string | null;
  readonly sourceOrder: number;
}

interface RejectionSummary {
  readonly fieldPath: string;
  readonly reason: LimitedDeterministicFallbackRejectionReason;
  readonly confidence: LimitedDeterministicFallbackConfidenceCategory;
  readonly evidenceCount: number;
  readonly line: number;
  readonly start: number;
}

/**
 * Runs the limited deterministic partial fallback against the completed
 * normalized transcript and canonical flattened fragments. Returns the
 * closed T187 outcome; the provider trigger is validated and never appears in
 * the result.
 */
export function runLimitedDeterministicPartialFallback(
  input: LimitedDeterministicPartialFallbackInput,
): LimitedDeterministicFallbackOutcome {
  if (!limitedDeterministicFallbackProviderTriggers.includes(input.trigger)) {
    throw new Error("unsupported limited deterministic fallback trigger");
  }
  if (input.normalizedTranscript.text.length === 0) {
    throw new Error("normalized transcript must not be empty");
  }
  if (
    sha256(input.normalizedTranscript.text) !==
    input.normalizedTranscript.sha256
  ) {
    throw new Error("normalized transcript hash mismatch");
  }

  const fragmentsByLine = new Map<number, readonly FragmentRecord[]>();
  for (const fragment of input.sourceFragments) {
    const record = toFragmentRecord(fragment);
    const existing = fragmentsByLine.get(record.line);
    if (existing === undefined) {
      fragmentsByLine.set(record.line, [record]);
    } else {
      fragmentsByLine.set(record.line, [...existing, record]);
    }
  }

  const extractions: ValueExtraction[] = [];
  const rejections: RejectionSummary[] = [];
  let headingGroupedField: "skills.name" | "languages.name" | null = null;
  let seenHeading = false;
  let inferredNameRejected = false;

  const lines = input.normalizedTranscript.text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const raw = lines[index];
    if (raw === undefined) continue;
    const line = normalizeText(raw);
    if (line.length === 0) continue;

    const binding = resolveFragmentBinding(
      line,
      fragmentsByLine.get(lineNumber),
    );

    const forbidden = matchForbiddenHeading(line);
    if (forbidden !== undefined) {
      seenHeading = true;
      headingGroupedField = null;
      rejections.push({
        fieldPath: forbidden.fieldPath,
        reason: "forbidden_field",
        confidence: "not_applicable",
        evidenceCount: evidenceCountFor(binding),
        line: lineNumber,
        start: 0,
      });
      continue;
    }

    if (isBareGroupHeading(line, skillsLabels)) {
      seenHeading = true;
      headingGroupedField = "skills.name";
      continue;
    }
    if (isBareGroupHeading(line, languagesLabels)) {
      seenHeading = true;
      headingGroupedField = "languages.name";
      continue;
    }

    const handledByRules = applyAllowedRules(
      line,
      lineNumber,
      binding,
      extractions,
      rejections,
    );
    if (handledByRules) continue;

    if (lineIncludesMultipleUrls(line)) {
      seenHeading = true;
      headingGroupedField = null;
      rejections.push({
        fieldPath: "professional_links",
        reason: "forbidden_field",
        confidence: "not_applicable",
        evidenceCount: evidenceCountFor(binding),
        line: lineNumber,
        start: 0,
      });
      continue;
    }

    if (headingGroupedField !== null) {
      for (const item of splitDelimitedItems(line, 0)) {
        rejections.push({
          fieldPath: headingGroupedField,
          reason: "low_confidence",
          confidence: "low",
          evidenceCount: evidenceCountFor(binding),
          line: lineNumber,
          start: item.start,
        });
      }
      continue;
    }

    const unsupported = matchUnsupportedLabeledField(line);
    if (unsupported !== undefined) {
      rejections.push({
        fieldPath: unsupported,
        reason: "unsupported_field",
        confidence: "not_applicable",
        evidenceCount: evidenceCountFor(binding),
        line: lineNumber,
        start: 0,
      });
      continue;
    }

    if (!seenHeading) {
      const marker = documentTitleMarkers.has(line.toLowerCase());
      if (!inferredNameRejected && !marker) {
        inferredNameRejected = true;
        rejections.push({
          fieldPath: "contact.full_name",
          reason: "inferred_value",
          confidence: "high",
          evidenceCount: evidenceCountFor(binding),
          line: lineNumber,
          start: 0,
        });
      } else if (!marker) {
        rejections.push({
          fieldPath: "contact.location",
          reason: "inferred_value",
          confidence: "high",
          evidenceCount: evidenceCountFor(binding),
          line: lineNumber,
          start: 0,
        });
      }
    }
  }

  const resolved = resolveAcceptedCandidates(extractions);
  const acceptedCandidates = [...resolved.accepted]
    .sort(compareAccepted)
    .map(toAcceptedCandidate);
  const rejectedCandidates = [...rejections, ...resolved.rejected]
    .sort(compareRejected)
    .map(toRejectedCandidate);

  return buildLimitedDeterministicFallbackOutcome({
    acceptedCandidates,
    rejectedCandidates,
    alternativeProviderAvailable: input.alternativeProviderAvailable,
  });
}

function applyAllowedRules(
  line: string,
  lineNumber: number,
  binding: FragmentBinding,
  extractions: ValueExtraction[],
  rejections: RejectionSummary[],
): boolean {
  if (isEmail(line)) {
    pushExtraction(
      "contact.email",
      "email_rule",
      line,
      0,
      line.length,
      lineNumber,
      binding,
      extractions,
      rejections,
    );
    return true;
  }
  if (isPhone(line)) {
    pushExtraction(
      "contact.phone",
      "phone_rule",
      line,
      0,
      line.length,
      lineNumber,
      binding,
      extractions,
      rejections,
    );
    return true;
  }
  const wholeLineUrl = singleUrlValue(line);
  if (wholeLineUrl !== undefined) {
    pushExtraction(
      "contact.website",
      "explicit_url_rule",
      wholeLineUrl,
      0,
      wholeLineUrl.length,
      lineNumber,
      binding,
      extractions,
      rejections,
    );
    return true;
  }

  const emailMatch = matchLabeled(line, emailLabels);
  if (emailMatch !== undefined) {
    if (emailMatch.value.length === 0) return true;
    if (isEmail(emailMatch.value)) {
      pushLabelledExtraction(
        "contact.email",
        "email_rule",
        line,
        emailMatch,
        lineNumber,
        binding,
        extractions,
        rejections,
      );
    } else {
      rejectAmbiguous(
        "contact.email",
        line,
        emailMatch,
        lineNumber,
        binding,
        rejections,
      );
    }
    return true;
  }

  const phoneMatch = matchLabeled(line, phoneLabels);
  if (phoneMatch !== undefined) {
    if (phoneMatch.value.length === 0) return true;
    if (isPhone(phoneMatch.value)) {
      pushLabelledExtraction(
        "contact.phone",
        "phone_rule",
        line,
        phoneMatch,
        lineNumber,
        binding,
        extractions,
        rejections,
      );
    } else {
      rejectAmbiguous(
        "contact.phone",
        line,
        phoneMatch,
        lineNumber,
        binding,
        rejections,
      );
    }
    return true;
  }

  const websiteMatch = matchLabeled(line, websiteLabels);
  if (websiteMatch !== undefined) {
    if (websiteMatch.value.length === 0) return true;
    const url = singleUrlValue(websiteMatch.value);
    if (url !== undefined) {
      pushLabelledExtraction(
        "contact.website",
        "explicit_url_rule",
        line,
        websiteMatch,
        lineNumber,
        binding,
        extractions,
        rejections,
      );
    } else {
      rejectAmbiguous(
        "contact.website",
        line,
        websiteMatch,
        lineNumber,
        binding,
        rejections,
      );
    }
    return true;
  }

  const nameMatch = matchLabeled(line, nameLabels);
  if (nameMatch !== undefined) {
    if (nameMatch.value.length === 0) return true;
    if (isValidFullName(nameMatch.value)) {
      pushLabelledExtraction(
        "contact.full_name",
        "labelled_name_rule",
        line,
        nameMatch,
        lineNumber,
        binding,
        extractions,
        rejections,
      );
    } else if (isSingleWord(nameMatch.value)) {
      rejections.push({
        fieldPath: "contact.full_name",
        reason: "low_confidence",
        confidence: "low",
        evidenceCount: evidenceCountFor(binding),
        line: lineNumber,
        start: nameMatch.colonIndex + 1,
      });
    } else {
      rejectAmbiguous(
        "contact.full_name",
        line,
        nameMatch,
        lineNumber,
        binding,
        rejections,
      );
    }
    return true;
  }

  const locationMatch = matchLabeled(line, locationLabels);
  if (locationMatch !== undefined) {
    if (locationMatch.value.length === 0) return true;
    if (isValidLocation(locationMatch.value)) {
      pushLabelledExtraction(
        "contact.location",
        "labelled_location_rule",
        line,
        locationMatch,
        lineNumber,
        binding,
        extractions,
        rejections,
      );
    } else {
      rejectAmbiguous(
        "contact.location",
        line,
        locationMatch,
        lineNumber,
        binding,
        rejections,
      );
    }
    return true;
  }

  const skillsMatch = matchLabeled(line, skillsLabels);
  if (skillsMatch !== undefined) {
    if (skillsMatch.value.length === 0) return true;
    for (const item of splitDelimitedItems(line, skillsMatch.colonIndex + 1)) {
      if (!isValidSkillItem(item.item)) {
        rejections.push({
          fieldPath: "skills.name",
          reason:
            item.item.length > maxAcceptedValueLength
              ? "low_confidence"
              : "ambiguous_value",
          confidence:
            item.item.length > maxAcceptedValueLength ? "low" : "medium",
          evidenceCount: evidenceCountFor(binding),
          line: lineNumber,
          start: item.start,
        });
        continue;
      }
      pushExtraction(
        "skills.name",
        "delimited_skill_rule",
        item.item,
        item.start,
        item.end,
        lineNumber,
        binding,
        extractions,
        rejections,
      );
    }
    return true;
  }

  const languagesMatch = matchLabeled(line, languagesLabels);
  if (languagesMatch !== undefined) {
    if (languagesMatch.value.length === 0) return true;
    for (const item of splitDelimitedItems(
      line,
      languagesMatch.colonIndex + 1,
    )) {
      if (!isValidLanguageItem(item.item)) {
        rejections.push({
          fieldPath: "languages.name",
          reason:
            item.item.length > maxAcceptedValueLength
              ? "low_confidence"
              : "ambiguous_value",
          confidence:
            item.item.length > maxAcceptedValueLength ? "low" : "medium",
          evidenceCount: evidenceCountFor(binding),
          line: lineNumber,
          start: item.start,
        });
        continue;
      }
      pushExtraction(
        "languages.name",
        "delimited_language_rule",
        item.item,
        item.start,
        item.end,
        lineNumber,
        binding,
        extractions,
        rejections,
      );
    }
    return true;
  }

  return false;
}

function pushLabelledExtraction(
  fieldPath: LimitedDeterministicFallbackAllowedField,
  rule: LimitedDeterministicFallbackFieldRule,
  line: string,
  match: LabelMatch,
  lineNumber: number,
  binding: FragmentBinding,
  extractions: ValueExtraction[],
  rejections: RejectionSummary[],
): void {
  const start = line.indexOf(match.value, match.colonIndex + 1);
  if (start < 0) {
    rejections.push({
      fieldPath,
      reason: "invalid_evidence",
      confidence: "high",
      evidenceCount: evidenceCountFor(binding),
      line: lineNumber,
      start: match.colonIndex + 1,
    });
    return;
  }
  pushExtraction(
    fieldPath,
    rule,
    match.value,
    start,
    start + match.value.length,
    lineNumber,
    binding,
    extractions,
    rejections,
  );
}

function rejectAmbiguous(
  fieldPath: string,
  _line: string,
  match: LabelMatch,
  lineNumber: number,
  binding: FragmentBinding,
  rejections: RejectionSummary[],
): void {
  rejections.push({
    fieldPath,
    reason: "ambiguous_value",
    confidence: "medium",
    evidenceCount: evidenceCountFor(binding),
    line: lineNumber,
    start: match.colonIndex + 1,
  });
}

function pushExtraction(
  fieldPath: LimitedDeterministicFallbackAllowedField,
  rule: LimitedDeterministicFallbackFieldRule,
  value: string,
  start: number,
  end: number,
  lineNumber: number,
  binding: FragmentBinding,
  extractions: ValueExtraction[],
  rejections: RejectionSummary[],
): void {
  if (binding.kind === "missing") {
    rejections.push({
      fieldPath,
      reason: "missing_evidence",
      confidence: "not_applicable",
      evidenceCount: 0,
      line: lineNumber,
      start,
    });
    return;
  }
  if (binding.kind === "invalid") {
    rejections.push({
      fieldPath,
      reason: "invalid_evidence",
      confidence: "high",
      evidenceCount: 1,
      line: lineNumber,
      start,
    });
    return;
  }
  if (
    start < binding.fragment.boundsStart ||
    end > binding.fragment.boundsEnd ||
    start < 0 ||
    end <= start
  ) {
    rejections.push({
      fieldPath,
      reason: "invalid_evidence",
      confidence: "high",
      evidenceCount: 1,
      line: lineNumber,
      start,
    });
    return;
  }
  extractions.push({
    fieldPath,
    value,
    rule,
    line: lineNumber,
    start,
    end,
    fragmentHash: binding.fragment.hash,
    fragmentId: `fragment-${binding.fragment.order + 1}`,
    sourceOrder: lineNumber * 1_000_000 + start,
  });
}

function resolveAcceptedCandidates(extractions: readonly ValueExtraction[]): {
  readonly accepted: readonly ValueExtraction[];
  readonly rejected: readonly RejectionSummary[];
} {
  const accepted: ValueExtraction[] = [];
  const rejected: RejectionSummary[] = [];
  const singleValuedFields = new Set<string>([
    "contact.email",
    "contact.phone",
    "contact.website",
    "contact.full_name",
    "contact.location",
  ]);
  const byField = new Map<string, ValueExtraction[]>();
  for (const extraction of extractions) {
    const existing = byField.get(extraction.fieldPath);
    if (existing === undefined) {
      byField.set(extraction.fieldPath, [extraction]);
    } else {
      byField.set(extraction.fieldPath, [...existing, extraction]);
    }
  }
  for (const [fieldPath, candidates] of byField) {
    const ordered = [...candidates].sort(compareAccepted);
    if (singleValuedFields.has(fieldPath)) {
      const distinctValues = new Set(
        ordered.map((candidate) => candidate.value),
      );
      if (distinctValues.size > 1) {
        for (const candidate of ordered) {
          rejected.push({
            fieldPath,
            reason: "ambiguous_value",
            confidence: "medium",
            evidenceCount: 1,
            line: candidate.line,
            start: candidate.start,
          });
        }
        continue;
      }
    }
    const seen = new Set<string>();
    for (const candidate of ordered) {
      if (seen.has(candidate.value)) {
        rejected.push({
          fieldPath,
          reason: "duplicate_value",
          confidence: "high",
          evidenceCount: 1,
          line: candidate.line,
          start: candidate.start,
        });
        continue;
      }
      seen.add(candidate.value);
      accepted.push(candidate);
    }
  }
  return { accepted, rejected };
}

function toAcceptedCandidate(
  extraction: ValueExtraction,
): LimitedDeterministicFallbackAcceptedCandidate {
  const evidence: LimitedDeterministicFallbackEvidence = {
    line: extraction.line,
    start: extraction.start,
    end: extraction.end,
    fragmentHash: extraction.fragmentHash,
    fragmentId: extraction.fragmentId,
  };
  return {
    fieldPath: extraction.fieldPath,
    value: extraction.value,
    evidence: [evidence],
    classification: "explicit",
    confidence: "high",
    rule: limitedDeterministicFallbackRuleByField[extraction.fieldPath],
    acceptanceReason: "deterministic_rule_satisfied",
    reviewStatus: "unreviewed",
  };
}

function toRejectedCandidate(
  summary: RejectionSummary,
): LimitedDeterministicFallbackRejectedCandidate {
  return {
    fieldPath: summary.fieldPath,
    reason: summary.reason,
    confidence: summary.confidence,
    evidenceCount: summary.evidenceCount,
  };
}

function compareAccepted(
  left: ValueExtraction,
  right: ValueExtraction,
): number {
  return (
    left.sourceOrder - right.sourceOrder ||
    left.fieldPath.localeCompare(right.fieldPath, "en") ||
    left.value.localeCompare(right.value, "en")
  );
}

function compareRejected(
  left: RejectionSummary,
  right: RejectionSummary,
): number {
  return (
    left.line - right.line ||
    left.start - right.start ||
    left.fieldPath.localeCompare(right.fieldPath, "en") ||
    left.reason.localeCompare(right.reason, "en")
  );
}

function toFragmentRecord(
  fragment: ResumeSemanticParseRequest["sourceFragments"][number],
): FragmentRecord {
  const text = normalizeText(fragment.text);
  const valid =
    text.length > 0 &&
    text.length <= 2_000 &&
    fragment.line >= 1 &&
    fragment.line <= 5_000 &&
    fragment.hash === sha256(text) &&
    fragment.bounds.lineStart >= 1 &&
    fragment.bounds.lineStart <= 5_000 &&
    fragment.bounds.lineEnd >= 1 &&
    fragment.bounds.lineEnd <= 5_000 &&
    fragment.bounds.lineEnd >= fragment.bounds.lineStart &&
    fragment.line >= fragment.bounds.lineStart &&
    fragment.line <= fragment.bounds.lineEnd &&
    fragment.bounds.start >= 0 &&
    fragment.bounds.start <= 20_000 &&
    fragment.bounds.end >= 1 &&
    fragment.bounds.end <= 20_000 &&
    fragment.bounds.end > fragment.bounds.start &&
    fragment.bounds.start <= text.length &&
    fragment.bounds.end <= text.length;
  return {
    order: fragment.order,
    line: fragment.line,
    text,
    hash: fragment.hash,
    boundsStart: fragment.bounds.start,
    boundsEnd: fragment.bounds.end,
    valid,
  };
}

function resolveFragmentBinding(
  line: string,
  candidates: readonly FragmentRecord[] | undefined,
): FragmentBinding {
  if (candidates === undefined || candidates.length === 0) {
    return { kind: "missing" };
  }
  if (candidates.length > 1) return { kind: "invalid" };
  const fragment = candidates[0];
  if (fragment === undefined || !fragment.valid) return { kind: "invalid" };
  if (normalizeText(fragment.text) !== line) return { kind: "invalid" };
  return { kind: "valid", fragment };
}

function evidenceCountFor(binding: FragmentBinding): number {
  return binding.kind === "valid" ? 1 : 0;
}

function matchLabeled(
  line: string,
  labels: readonly string[],
): LabelMatch | undefined {
  const lower = line.toLowerCase();
  for (const label of labels) {
    if (!lower.startsWith(label)) continue;
    const remainder = lower.slice(label.length);
    const colonMatch = /^\s*:/u.exec(remainder);
    if (colonMatch === null) continue;
    const colonIndex = label.length + colonMatch[0].indexOf(":");
    const value = line.slice(colonIndex + 1).trim();
    return { label, colonIndex, value };
  }
  return undefined;
}

function isBareGroupHeading(line: string, labels: readonly string[]): boolean {
  const lower = line.toLowerCase();
  if (labels.some((label) => lower === label)) return true;
  const matched = matchLabeled(line, labels);
  return matched !== undefined && matched.value.length === 0;
}

function matchForbiddenHeading(
  line: string,
): { readonly fieldPath: string } | undefined {
  const lower = line.toLowerCase();
  for (const heading of forbiddenHeadings) {
    for (const label of heading.labels) {
      if (lower === label) return heading;
      if (matchLabeled(line, [label]) !== undefined) return heading;
    }
  }
  return undefined;
}

const unsupportedLabelPattern = /^[a-zà-ÿ][a-zà-ÿ0-9 .&'’-]{0,40}$/iu;

/**
 * Detects an explicitly labelled line whose label is outside every closed
 * allowed rule. The label/value structure is explicit, but the content is
 * unsupported by the fallback, so it is rejected with `unsupported_field`.
 * This never infers a value; it only rejects an unprovable boundary.
 */
function matchUnsupportedLabeledField(line: string): string | undefined {
  const colonIndex = line.indexOf(":");
  if (colonIndex <= 0) return undefined;
  const label = line.slice(0, colonIndex).trim();
  if (label.length === 0 || label.length > 41) return undefined;
  if (!unsupportedLabelPattern.test(label)) return undefined;
  return label.toLowerCase().replace(/\s+/gu, "_");
}

function splitDelimitedItems(
  source: string,
  offset: number,
): readonly {
  readonly item: string;
  readonly start: number;
  readonly end: number;
}[] {
  const items: {
    readonly item: string;
    readonly start: number;
    readonly end: number;
  }[] = [];
  const remainder = source.slice(offset);
  delimiterPattern.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = delimiterPattern.exec(remainder)) !== null) {
    const raw = remainder.slice(cursor, match.index);
    const item = raw.trim();
    if (item.length > 0) {
      const localStart = remainder.indexOf(item, cursor);
      items.push({
        item,
        start: offset + localStart,
        end: offset + localStart + item.length,
      });
    }
    cursor = match.index + match[0].length;
  }
  const tail = remainder.slice(cursor).trim();
  if (tail.length > 0) {
    const localStart = remainder.indexOf(tail, cursor);
    items.push({
      item: tail,
      start: offset + localStart,
      end: offset + localStart + tail.length,
    });
  }
  return items;
}

function isEmail(value: string): boolean {
  return value.length <= maxAcceptedValueLength && emailPattern.test(value);
}

function isPhone(value: string): boolean {
  return value.length <= maxAcceptedValueLength && phonePattern.test(value);
}

function singleUrlValue(value: string): string | undefined {
  const stripped = value.replace(/[.,;]+$/u, "");
  if (stripped.length === 0 || stripped.length > maxAcceptedValueLength) {
    return undefined;
  }
  return fullUrlPattern.test(stripped) ? stripped : undefined;
}

function lineIncludesMultipleUrls(line: string): boolean {
  urlTokenPattern.lastIndex = 0;
  const matches = [...line.matchAll(urlTokenPattern)];
  return matches.length >= 2;
}

function isValidFullName(value: string): boolean {
  if (value.length > maxAcceptedValueLength) return false;
  const words = value.split(/\s+/u).filter((word) => word.length > 0);
  if (words.length < 2) return false;
  if (containsContactToken(value)) return false;
  return !value.includes(":");
}

function isValidLocation(value: string): boolean {
  if (value.length > maxAcceptedValueLength) return false;
  if (value.length === 0) return false;
  if (containsContactToken(value)) return false;
  return !value.includes(":");
}

function isValidSkillItem(value: string): boolean {
  if (value.length > maxAcceptedValueLength) return false;
  return !containsContactToken(value);
}

function isValidLanguageItem(value: string): boolean {
  if (value.length > maxAcceptedValueLength) return false;
  if (value.includes("(") || value.includes(")")) return false;
  if (/\d/u.test(value)) return false;
  return !containsContactToken(value);
}

function containsContactToken(value: string): boolean {
  if (value.includes("@")) return true;
  if (value.includes("://")) return true;
  if (value.toLowerCase().includes("http")) return true;
  if (isEmail(value)) return true;
  if (isPhone(value)) return true;
  return singleUrlValue(value) !== undefined;
}

function isSingleWord(value: string): boolean {
  const words = value.split(/\s+/u).filter((word) => word.length > 0);
  return words.length === 1;
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
