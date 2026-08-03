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
  const sourceFragments = fragments
    .map((fragment) =>
      fragment.text.normalize("NFKC").replace(/\s+/gu, " ").trim(),
    )
    .filter((text) => text.length > 0)
    .map((text, index) => ({
      order: index,
      line: index + 1,
      text,
      hash: hash(text),
      bounds: {
        lineStart: index + 1,
        lineEnd: index + 1,
        start: 0,
        end: text.length,
      },
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

function hash(value: string): string {
  return createHash("sha256")
    .update(value.normalize("NFKC").replace(/\s+/gu, " ").trim())
    .digest("hex");
}

function hashTranscript(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
