import { createHash } from "node:crypto";
import {
  resumeSemanticParserContractVersion,
  type ResumeSemanticParseRequest,
} from "@nuvitae/contracts";
import type { ImportedDocument } from "@nuvitae/domain";
import type {
  PdfTextItemProvenance,
  ResumeSourceFragment,
} from "@nuvitae/extraction";

/** Builds the provider-neutral request from normalized extraction fragments. */
export function buildSemanticParseRequest(
  document: ImportedDocument,
  fragments: readonly ResumeSourceFragment[],
  correlationId?: string,
): ResumeSemanticParseRequest {
  const normalizedFragments = fragments
    .map((fragment, inputIndex) => ({
      fragment,
      inputIndex,
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
        fragments.slice(
          item.inputIndex + 1,
          normalizedFragments[index + 1]?.inputIndex,
        ),
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
  skipped: readonly ResumeSourceFragment[],
): ScalarContinuation | undefined {
  if (right === undefined || left.format !== right.format) return undefined;
  const physicalSequence = [left, ...skipped, right];
  if (
    skipped.some(
      (fragment) => normalizeFragmentText(fragment.text).length > 0,
    ) ||
    !hasContiguousReadingOrder(physicalSequence)
  )
    return undefined;

  if (left.location.kind === "docx_run" && right.location.kind === "docx_run") {
    if (!isContiguousDocxRunSequence(physicalSequence)) return undefined;
    return continuationFromExtractedText(
      physicalSequence
        .slice(0, -1)
        .map((fragment) => fragment.text)
        .join(""),
      right.text,
    );
  }

  if (
    left.location.kind !== "pdf_text_item" ||
    right.location.kind !== "pdf_text_item" ||
    left.location.pageNumber !== right.location.pageNumber ||
    !isContiguousPdfPhysicalSequence(physicalSequence)
  )
    return undefined;
  const leftBox = left.location.boundingBox;
  const rightBox = right.location.boundingBox;
  if (isSourceProvenWrappedPdfLine(left.location, right.location))
    return "space";
  if (
    isSourceProvenPdfListContinuation(left.location, right.location, right.text)
  )
    return "space";
  if (!isIgnorablePdfGap(physicalSequence)) return undefined;
  if (left.location.hasEol !== false) return undefined;
  const height = Math.min(leftBox.height, rightBox.height);
  if (!Number.isFinite(height) || height <= 0) return undefined;
  if (Math.abs(leftBox.y - rightBox.y) > height * 0.2) return undefined;
  const gap = rightBox.x - (leftBox.x + leftBox.width);
  const contactTolerance = Math.max(0.5, height * 0.05);
  if (gap < -contactTolerance || gap > height * 0.5) return undefined;

  if (/\s$/u.test(left.text) || /^\s/u.test(right.text))
    return continuationFromExtractedText(left.text, right.text);
  return gap > contactTolerance ? "space" : "none";
}

function isSourceProvenWrappedPdfLine(
  left: PdfTextItemProvenance,
  right: PdfTextItemProvenance,
): boolean {
  if (left.hasEol !== true) return false;
  const leftBox = left.boundingBox;
  const rightBox = right.boundingBox;
  const averageHeight = (leftBox.height + rightBox.height) / 2;
  if (!Number.isFinite(averageHeight) || averageHeight <= 0) return false;
  const heightDifference = Math.abs(leftBox.height - rightBox.height);
  const baselineDrop = leftBox.y - rightBox.y;
  return (
    heightDifference <= averageHeight * 0.2 &&
    Math.abs(leftBox.x - rightBox.x) <= averageHeight * 0.3 &&
    baselineDrop >= averageHeight * 0.75 &&
    baselineDrop <= averageHeight * 1.6
  );
}

function isSourceProvenPdfListContinuation(
  left: PdfTextItemProvenance,
  right: PdfTextItemProvenance,
  rightText: string,
): boolean {
  if (!/^[•●▪◦·‣⁃*-]$/u.test(normalizeFragmentText(rightText))) return false;
  const leftBox = left.boundingBox;
  const rightBox = right.boundingBox;
  if (!Number.isFinite(leftBox.height) || leftBox.height <= 0) return false;
  const baselineDrop = leftBox.y - rightBox.y;
  return (
    Math.abs(leftBox.x - rightBox.x) <= leftBox.height &&
    baselineDrop >= leftBox.height * 0.5 &&
    baselineDrop <= leftBox.height * 2.5
  );
}

function hasContiguousReadingOrder(
  fragments: readonly ResumeSourceFragment[],
): boolean {
  return fragments.every((fragment, index) => {
    if (index === 0) return true;
    const previous = fragments[index - 1];
    return (
      previous !== undefined &&
      previous.location.readingOrder + 1 === fragment.location.readingOrder
    );
  });
}

function isContiguousDocxRunSequence(
  fragments: readonly ResumeSourceFragment[],
): boolean {
  return fragments.every((fragment, index) => {
    if (fragment.location.kind !== "docx_run") return false;
    const previous = fragments[index - 1];
    if (previous === undefined) return true;
    if (previous.location.kind !== "docx_run") return false;
    return (
      previous.location.packagePart === fragment.location.packagePart &&
      previous.location.paragraphIndex === fragment.location.paragraphIndex &&
      previous.location.tableIndex === fragment.location.tableIndex &&
      previous.location.rowIndex === fragment.location.rowIndex &&
      previous.location.cellIndex === fragment.location.cellIndex &&
      previous.location.characterOffsetEnd ===
        fragment.location.characterOffsetStart
    );
  });
}

function isIgnorablePdfGap(
  fragments: readonly ResumeSourceFragment[],
): boolean {
  if (!isContiguousPdfPhysicalSequence(fragments)) return false;
  return fragments.every((fragment, index) => {
    if (fragment.location.kind !== "pdf_text_item") return false;
    return index === fragments.length - 1 || fragment.location.hasEol === false;
  });
}

function isContiguousPdfPhysicalSequence(
  fragments: readonly ResumeSourceFragment[],
): boolean {
  return fragments.every((fragment, index) => {
    if (fragment.location.kind !== "pdf_text_item") return false;
    const previous = fragments[index - 1];
    if (previous === undefined) return true;
    return (
      previous.location.kind === "pdf_text_item" &&
      previous.location.pageNumber === fragment.location.pageNumber &&
      previous.location.itemIndex + 1 === fragment.location.itemIndex
    );
  });
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
