import type {
  DocxParagraph,
  ExtractionRequest,
  ExtractionResult,
  LanguageDetectionResult,
  LanguageDetector,
  PdfPageText,
} from "../adapters.js";
import { failed, succeeded } from "../extraction-failures.js";

const minimumWordCount = 12;
const minimumSupportedEvidence = 4;
const minimumBilingualEvidencePerLanguage = 4;

const englishEvidence = new Set([
  "and",
  "built",
  "company",
  "developed",
  "education",
  "english",
  "experience",
  "for",
  "from",
  "managed",
  "project",
  "responsibilities",
  "skills",
  "team",
  "the",
  "with",
  "work",
  "years",
]);

const frenchEvidence = new Set([
  "avec",
  "compétences",
  "développé",
  "éducation",
  "équipe",
  "expérience",
  "français",
  "gestion",
  "pour",
  "projet",
  "réalisé",
  "responsabilités",
  "travail",
  "une",
  "des",
  "dans",
  "ans",
]);

const unsupportedEvidence = new Set([
  "años",
  "desarrollado",
  "educación",
  "equipo",
  "experiencia",
  "habilidades",
  "para",
  "proyecto",
  "responsabilidades",
  "trabajo",
  "und",
  "berufserfahrung",
  "kenntnisse",
  "projekt",
]);

/**
 * Conservative, offline detector for the import feature's deliberately narrow
 * language scope. It scores a small explicit vocabulary after removing obvious
 * contact and link noise. It is not a general-purpose language detector:
 * short, name-heavy, or vocabulary-poor text is reported as `unknown`, and
 * unsupported detection is limited to strong evidence in the pinned table.
 */
export class DeterministicLanguageDetector implements LanguageDetector {
  async detectLanguage(
    request: ExtractionRequest,
    extractedText: readonly PdfPageText[] | readonly DocxParagraph[],
  ): Promise<ExtractionResult<LanguageDetectionResult>> {
    if (request.abortSignal?.aborted === true) {
      return failed("cancelled");
    }

    const tokens = tokenize(flattenText(extractedText));
    if (tokens.length < minimumWordCount) {
      return succeeded({
        language: "unknown",
        confidence: "not_applicable",
      });
    }

    const unique = new Set(tokens);
    const english = score(unique, englishEvidence);
    const french = score(unique, frenchEvidence);
    const unsupported = score(unique, unsupportedEvidence);

    if (
      unsupported >= minimumSupportedEvidence &&
      unsupported > english + french
    ) {
      return succeeded({ language: "unsupported", confidence: "high" });
    }

    if (
      english >= minimumBilingualEvidencePerLanguage &&
      french >= minimumBilingualEvidencePerLanguage
    ) {
      return succeeded({
        language: "bilingual_french_english",
        confidence: "high",
      });
    }

    if (
      english >= minimumSupportedEvidence &&
      english >= french + 2 &&
      english > unsupported
    ) {
      return succeeded({
        language: "english",
        confidence: english >= 7 ? "high" : "medium",
      });
    }

    if (
      french >= minimumSupportedEvidence &&
      french >= english + 2 &&
      french > unsupported
    ) {
      return succeeded({
        language: "french",
        confidence: french >= 7 ? "high" : "medium",
      });
    }

    return succeeded({ language: "unknown", confidence: "low" });
  }
}

function flattenText(
  extractedText: readonly PdfPageText[] | readonly DocxParagraph[],
): string {
  return extractedText
    .flatMap((block) =>
      "items" in block
        ? block.items.map((item) => item.text)
        : block.runs.map((run) => run.text),
    )
    .join(" ");
}

function tokenize(value: string): readonly string[] {
  return (
    value
      .toLocaleLowerCase("und")
      .replace(/\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}\b/gu, " ")
      .replace(/\b(?:https?:\/\/|www\.)\S+/gu, " ")
      .replace(/\+?\d[\d\s().-]{6,}\d/gu, " ")
      .match(/\p{L}+(?:[’'-]\p{L}+)*/gu) ?? []
  );
}

function score(tokens: ReadonlySet<string>, evidence: ReadonlySet<string>) {
  let result = 0;
  for (const token of tokens) {
    if (evidence.has(token)) result += 1;
  }
  return result;
}
