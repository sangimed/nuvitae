import { createHash } from "node:crypto";
import {
  resumeSemanticParserContractVersion,
  type ResumeSemanticParseRequest,
} from "@nuvitae/contracts";
import type { ImportedDocument } from "@nuvitae/domain";
import type { ResumeSourceFragment } from "@nuvitae/extraction";

/**
 * Builds the provider-neutral semantic parse request from normalized physical
 * extraction fragments.
 *
 * This is the single normalization boundary shared by the real worker
 * processor and the T211 fixture-exactness integration tests: a physical
 * PDF/DOCX fixture matches a T210 deterministic profile only when this
 * function produces the exact normalized transcript, flattened fragments,
 * fragment hashes, and bounds the profile declares.
 */
export function buildSemanticParseRequest(
  document: ImportedDocument,
  fragments: readonly ResumeSourceFragment[],
  correlationId?: string,
): ResumeSemanticParseRequest {
  // Flattened transcript line numbering is assigned after empty items are
  // removed, so `line` always refers to a line in the normalized transcript.
  // PDF.js can emit empty text items between rendered lines; they must not
  // shift the canonical flattened line coordinates (which T210 profiles
  // declare as the transcript line index).
  const normalizedFragments = fragments
    .map((fragment) => ({
      fragment,
      text: normalizeFragmentText(fragment.text),
    }))
    .filter((item) => item.text.length > 0);
  const sourceFragments = normalizedFragments.map((item, index) => ({
    order: index,
    line: index + 1,
    text: item.text,
    hash: hash(item.text),
    bounds: {
      lineStart: index + 1,
      lineEnd: index + 1,
      start: 0,
      end: item.text.length,
    },
    ...(() => {
      const continuationToNext = continuationBetween(
        item.fragment,
        normalizedFragments[index + 1]?.fragment,
      );
      return continuationToNext === undefined ? {} : { continuationToNext };
    })(),
  }));
  const text = sourceFragments.map((fragment) => fragment.text).join("\n");
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: document.id,
    correlationId: correlationId ?? document.id,
    documentFormat: document.fileExtension === "docx" ? "docx" : "pdf",
    languageContext: {
      detectedLanguage:
        document.detectedLanguage && document.detectedLanguage !== "unsupported"
          ? document.detectedLanguage
          : "unknown",
      confidence: null,
      textDirection: "ltr",
    },
    normalizedTranscript: {
      text,
      // The transcript hash is computed over the already-normalized,
      // newline-joined text without re-collapsing the line separators, so it
      // matches the T210 fixture-profile transcript hashes byte-for-byte.
      sha256: hashTranscript(text),
      lineCount: Math.max(1, text.split("\n").length),
    },
    sourceFragments,
    fragmentHashes: sourceFragments.map((fragment) => fragment.hash),
    formatMetadata: {
      sourceFormat: document.fileExtension === "docx" ? "docx" : "pdf",
      extractionMode: "selectable_text",
      renderedPageCount: document.renderedPageCount ?? null,
      parserVersion: null,
    },
  } as ResumeSemanticParseRequest;
}

type ScalarContinuation = "none" | "space";

function continuationBetween(
  left: ResumeSourceFragment,
  right: ResumeSourceFragment | undefined,
): ScalarContinuation | undefined {
  if (right === undefined || left.format !== right.format) return undefined;
  if (left.location.readingOrder + 1 !== right.location.readingOrder)
    return undefined;

  if (left.location.kind === "docx_run" && right.location.kind === "docx_run") {
    if (
      left.location.packagePart !== right.location.packagePart ||
      left.location.paragraphIndex !== right.location.paragraphIndex ||
      left.location.tableIndex !== right.location.tableIndex ||
      left.location.rowIndex !== right.location.rowIndex ||
      left.location.cellIndex !== right.location.cellIndex ||
      left.location.characterOffsetEnd !== right.location.characterOffsetStart
    ) {
      return undefined;
    }
    return continuationFromExtractedText(left.text, right.text);
  }

  if (
    left.location.kind !== "pdf_text_item" ||
    right.location.kind !== "pdf_text_item" ||
    left.location.pageNumber !== right.location.pageNumber ||
    left.location.itemIndex + 1 !== right.location.itemIndex ||
    left.location.hasEol !== false
  ) {
    return undefined;
  }
  const leftBox = left.location.boundingBox;
  const rightBox = right.location.boundingBox;
  const height = Math.min(leftBox.height, rightBox.height);
  if (!Number.isFinite(height) || height <= 0) return undefined;
  // A PDF continuation is deliberately narrower than reading order: both
  // items must be on the same baseline, the first item must not terminate a
  // PDF.js line, and the horizontal gap must be no larger than half a glyph
  // height. This rejects wraps, columns, and ordinary table-cell gaps rather
  // than guessing a scalar boundary from proximity alone.
  if (Math.abs(leftBox.y - rightBox.y) > height * 0.2) return undefined;
  const gap = rightBox.x - (leftBox.x + leftBox.width);
  const contactTolerance = Math.max(0.5, height * 0.05);
  if (gap < -contactTolerance || gap > height * 0.5) return undefined;

  const hasExtractedBoundaryWhitespace =
    /\s$/u.test(left.text) || /^\s/u.test(right.text);
  if (hasExtractedBoundaryWhitespace) {
    return continuationFromExtractedText(left.text, right.text);
  }
  return gap > contactTolerance ? "space" : "none";
}

function continuationFromExtractedText(
  left: string,
  right: string,
): ScalarContinuation | undefined {
  const normalizedLeft = normalizeFragmentText(left);
  const normalizedRight = normalizeFragmentText(right);
  const normalizedCombined = normalizeFragmentText(`${left}${right}`);
  if (normalizedCombined === `${normalizedLeft}${normalizedRight}`)
    return "none";
  if (normalizedCombined === `${normalizedLeft} ${normalizedRight}`)
    return "space";
  return undefined;
}

function normalizeFragmentText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function hash(value: string): string {
  return createHash("sha256")
    .update(value.normalize("NFKC").replace(/\s+/gu, " ").trim())
    .digest("hex");
}

function hashTranscript(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
