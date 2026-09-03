const functionWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "hers",
  "him",
  "his",
  "i",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "our",
  "ours",
  "she",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "they",
  "this",
  "through",
  "to",
  "was",
  "we",
  "were",
  "with",
  "you",
  "your",
]);

const negations = new Set(["no", "not", "never", "without"]);
const sentenceInitialNonFacts = new Set([
  "built",
  "created",
  "delivered",
  "did",
  "improved",
  "led",
  "managed",
  "partnered",
  "reduced",
  "responsible",
  "was",
  "worked",
]);
const months = new Set([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
]);

export type FactPreservationFailure =
  | "empty_proposal"
  | "new_content"
  | "protected_fact_changed"
  | "meaning_reversed";

export type FactPreservationResult =
  | { readonly ok: true; readonly proposedText: string }
  | { readonly ok: false; readonly reason: FactPreservationFailure };

/**
 * Fail-closed lexical grounding for rewrite proposals. A provider may remove,
 * reorder, or inflect source content and add grammatical function words, but
 * it cannot add a new content word. Names, dates, numbers/metrics, and explicit
 * negation must also remain present. This intentionally favors safety over an
 * unconstrained rewrite when semantic equivalence cannot be proven.
 */
export function validateFactPreservingEdit(
  currentText: string,
  proposedText: string,
): FactPreservationResult {
  const proposed = proposedText.trim();
  if (proposed.length === 0 || proposed.length > 4_000) {
    return { ok: false, reason: "empty_proposal" };
  }
  const sourceTokens = tokens(currentText);
  const proposalTokens = tokens(proposed);
  const sourceNegations = sourceTokens
    .map((token) => normalize(token.value))
    .filter((token) => negations.has(token));
  const proposalNegations = proposalTokens
    .map((token) => normalize(token.value))
    .filter((token) => negations.has(token));
  if (sourceNegations.join("|") !== proposalNegations.join("|")) {
    return { ok: false, reason: "meaning_reversed" };
  }
  const sourceRoots = new Set(
    sourceTokens
      .map((token) => normalize(token.value))
      .filter((token) => !functionWords.has(token))
      .map(stem),
  );

  for (const token of proposalTokens) {
    const normalized = normalize(token.value);
    if (functionWords.has(normalized)) continue;
    if (!sourceRoots.has(stem(normalized))) {
      return { ok: false, reason: "new_content" };
    }
  }

  const requiredFacts = sourceTokens.filter((token) => {
    const normalized = normalize(token.value);
    return (
      /\p{N}/u.test(token.value) ||
      months.has(normalized) ||
      (/^\p{Lu}/u.test(token.value) && !sentenceInitialNonFacts.has(normalized))
    );
  });
  const proposalCounts = counts(
    proposalTokens.map((token) => normalize(token.value)),
  );
  for (const fact of requiredFacts) {
    const normalized = normalize(fact.value);
    const remaining = proposalCounts.get(normalized) ?? 0;
    if (remaining === 0) {
      return { ok: false, reason: "protected_fact_changed" };
    }
    proposalCounts.set(normalized, remaining - 1);
  }

  return { ok: true, proposedText: proposed };
}

function tokens(value: string): Array<{ readonly value: string }> {
  return [...value.matchAll(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu)].map(
    (match) => ({ value: match[0] }),
  );
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function stem(value: string): string {
  for (const suffix of ["ingly", "edly", "ing", "ed", "es", "s", "ly"]) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 4) {
      const base = value.slice(0, -suffix.length);
      return base.at(-1) === base.at(-2) && base.length > 4
        ? base.slice(0, -1)
        : base;
    }
  }
  return value;
}

function counts(values: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}
