import { createHash } from "node:crypto";

import type {
  ResumeSemanticParseRequest,
  SemanticExtractionV2SourceRef,
} from "@nuvitae/contracts";

export interface SourceRegistryFragmentInput {
  readonly fragmentId?: string;
  readonly order: number;
  readonly line: number;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly start?: number;
  readonly end?: number;
  readonly text: string;
}

export interface CanonicalSourceFragment {
  readonly fragmentId: string;
  readonly order: number;
  readonly line: number;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly hash: string;
}

export type SourceReferenceResolution =
  | {
      readonly ok: true;
      readonly fragment: CanonicalSourceFragment;
      readonly quote: string;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "unknown_fragment"
        | "empty_quote"
        | "quote_not_found"
        | "quote_ambiguous";
    };

export interface SourceRegistry {
  get(fragmentId: string): CanonicalSourceFragment | undefined;
  resolve(reference: SemanticExtractionV2SourceRef): SourceReferenceResolution;
  all(): readonly CanonicalSourceFragment[];
}

export class SourceRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceRegistryError";
  }
}

/**
 * Builds the provider-neutral registry owned by Nuvitae. The input is a
 * deliberately small structural projection, so this boundary can later be
 * populated by NuvitaeDocument without importing PDF.js, OOXML, or Docling
 * types into semantic parsing.
 */
export function createSourceRegistry(
  inputs: readonly SourceRegistryFragmentInput[],
): SourceRegistry {
  const fragments = inputs.map(toCanonicalFragment);
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const fragment of fragments) {
    if (ids.has(fragment.fragmentId)) {
      throw new SourceRegistryError("duplicate source fragment ID");
    }
    if (orders.has(fragment.order)) {
      throw new SourceRegistryError("duplicate source fragment order");
    }
    ids.add(fragment.fragmentId);
    orders.add(fragment.order);
  }

  const byId = new Map(
    fragments.map((fragment) => [fragment.fragmentId, fragment] as const),
  );
  const ordered = [...fragments].sort(
    (left, right) => left.order - right.order,
  );
  return {
    get: (fragmentId) => byId.get(fragmentId),
    resolve: (reference) => resolveReference(byId, reference),
    all: () => ordered,
  };
}

/**
 * Adapter for the current V1 extracted-fragment request. The request hash is
 * not trusted here: the registry recomputes the Nuvitae-owned hash from the
 * canonical normalized fragment text.
 */
export function createSourceRegistryFromSemanticParseRequest(
  request: ResumeSemanticParseRequest,
): SourceRegistry {
  return createSourceRegistry(
    request.sourceFragments.map((fragment) => ({
      fragmentId: `fragment-${fragment.order + 1}`,
      order: fragment.order,
      line: fragment.line,
      lineStart: fragment.bounds.lineStart,
      lineEnd: fragment.bounds.lineEnd,
      start: fragment.bounds.start,
      end: fragment.bounds.end,
      text: fragment.text,
    })),
  );
}

function toCanonicalFragment(
  input: SourceRegistryFragmentInput,
): CanonicalSourceFragment {
  if (!Number.isInteger(input.order) || input.order < 0) {
    throw new SourceRegistryError("invalid source fragment order");
  }
  if (!Number.isInteger(input.line) || input.line < 1) {
    throw new SourceRegistryError("invalid source fragment line");
  }

  const text = normalizeSourceText(input.text);
  if (text.length === 0) {
    throw new SourceRegistryError("empty source fragment");
  }
  const fragmentId = input.fragmentId ?? `fragment-${input.order + 1}`;
  if (!/^[A-Za-z0-9._:-]{1,120}$/u.test(fragmentId)) {
    throw new SourceRegistryError("invalid source fragment ID");
  }

  const lineStart = input.lineStart ?? input.line;
  const lineEnd = input.lineEnd ?? input.line;
  const start = input.start ?? 0;
  const end = input.end ?? text.length;
  if (
    !Number.isInteger(lineStart) ||
    !Number.isInteger(lineEnd) ||
    lineStart < 1 ||
    lineEnd < lineStart ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end - start < text.length
  ) {
    throw new SourceRegistryError("invalid source fragment bounds");
  }

  return {
    fragmentId,
    order: input.order,
    line: input.line,
    lineStart,
    lineEnd,
    start,
    end,
    text,
    hash: sha256(text),
  };
}

function resolveReference(
  fragments: ReadonlyMap<string, CanonicalSourceFragment>,
  reference: SemanticExtractionV2SourceRef,
): SourceReferenceResolution {
  const fragment = fragments.get(reference.fragmentId);
  if (fragment === undefined) return { ok: false, reason: "unknown_fragment" };
  const quote = normalizeSourceText(reference.quote);
  if (quote.length === 0) return { ok: false, reason: "empty_quote" };

  const first = fragment.text.indexOf(quote);
  if (first < 0) return { ok: false, reason: "quote_not_found" };
  if (fragment.text.indexOf(quote, first + 1) >= 0) {
    return { ok: false, reason: "quote_ambiguous" };
  }
  return {
    ok: true,
    fragment,
    quote,
    start: first,
    end: first + quote.length,
  };
}

export function normalizeSourceText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
