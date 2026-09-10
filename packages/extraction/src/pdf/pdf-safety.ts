import { pdfSafetyReasonCodes, type PdfSafetyReasonCode } from "../adapters.js";

export { pdfSafetyReasonCodes };
export type { PdfSafetyReasonCode };

export type PdfSafetyInspection =
  | { readonly safe: true }
  | {
      readonly safe: false;
      readonly failure:
        "malformed_pdf" | "unsafe_active_content" | "resource_limit";
      readonly reasonCode?: PdfSafetyReasonCode;
    };

type Token =
  | { readonly kind: "name"; readonly value: string }
  | { readonly kind: "word"; readonly value: string }
  | { readonly kind: "literal"; readonly value: "string" | "hex" }
  | { readonly kind: "dict_start" }
  | { readonly kind: "dict_end" }
  | { readonly kind: "array_start" }
  | { readonly kind: "array_end" };

interface PdfDictionary {
  readonly entries: ReadonlyMap<string, PdfValue>;
}

type PdfValue =
  | { readonly kind: "dictionary"; readonly value: PdfDictionary }
  | { readonly kind: "array"; readonly value: readonly PdfValue[] }
  | { readonly kind: "name"; readonly value: string }
  | { readonly kind: "reference"; readonly objectId: string }
  | { readonly kind: "other" };

interface TokenizationResult {
  readonly tokens: readonly Token[];
  readonly malformed: boolean;
  readonly resourceLimitExceeded: boolean;
}

const activeContentNames = new Set([
  "JS",
  "JavaScript",
  "Launch",
  "SubmitForm",
  "ImportData",
  "ResetForm",
  "RichMedia",
  "Movie",
  "Sound",
  "3D",
  "GoToR",
  "GoToE",
  "Named",
  "Rendition",
  "Trans",
]);

const embeddedFileNames = new Set([
  "EmbeddedFile",
  "EmbeddedFiles",
  "Filespec",
]);

const richMediaNames = new Set(["RichMedia", "Movie", "Sound", "3D"]);
const maximumPdfSyntaxTokenCount = 1_000_000;

/**
 * Inspects only PDF dictionary tokens. It deliberately ignores strings and
 * content streams, so ordinary resume text and URL values cannot become
 * action classifications. No URL is parsed, normalized, dereferenced, or
 * executed here.
 */
export function inspectPdfStructuralSafety(
  source: Uint8Array,
  maximumObjectCount = 50_000,
): PdfSafetyInspection {
  if (!Number.isSafeInteger(maximumObjectCount) || maximumObjectCount <= 0) {
    return { safe: false, failure: "resource_limit" };
  }
  const tokenized = tokenize(source, maximumPdfSyntaxTokenCount);
  if (tokenized.resourceLimitExceeded) {
    return { safe: false, failure: "resource_limit" };
  }
  if (tokenized.malformed) {
    return { safe: false, failure: "malformed_pdf" };
  }

  const parsed = parsePdfTokens(tokenized.tokens, maximumObjectCount);
  if (parsed.resourceLimitExceeded) {
    return { safe: false, failure: "resource_limit" };
  }
  if (parsed.malformed) {
    return { safe: false, failure: "malformed_pdf" };
  }

  const inspected = inspectDictionaries(parsed.dictionaries, parsed.objects);
  if (inspected !== undefined) {
    return {
      safe: false,
      failure: "unsafe_active_content",
      reasonCode: inspected,
    };
  }
  return { safe: true };
}

function inspectDictionaries(
  dictionaries: readonly PdfDictionary[],
  objects: ReadonlyMap<string, PdfValue>,
): PdfSafetyReasonCode | undefined {
  const visited = new Set<PdfDictionary>();
  for (const dictionary of dictionaries) {
    const reason = inspectDictionary(dictionary, objects, visited, false);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

function inspectDictionary(
  dictionary: PdfDictionary,
  objects: ReadonlyMap<string, PdfValue>,
  visited: Set<PdfDictionary>,
  actionContext: boolean,
): PdfSafetyReasonCode | undefined {
  if (visited.has(dictionary)) return undefined;
  visited.add(dictionary);

  for (const [key, value] of dictionary.entries) {
    const featureReason = featureReasonForEntry(key, value);
    if (featureReason !== undefined) return featureReason;

    if (key === "A" || key === "OpenAction") {
      const reason = inspectActionValue(
        value,
        objects,
        visited,
        key === "OpenAction",
      );
      if (reason !== undefined) return reason;
      continue;
    }
    if (key === "AA") {
      const resolved = resolveValue(value, objects, new Set());
      if (resolved.kind !== "dictionary") {
        return "pdf_malformed_active_content";
      }
      for (const additionalAction of resolved.value.entries.values()) {
        const reason = inspectActionValue(
          additionalAction,
          objects,
          visited,
          false,
        );
        if (reason !== undefined) return reason;
      }
      continue;
    }
    if (key === "Type" && isName(value, "Action")) {
      const reason = inspectActionDictionary(dictionary, objects, visited);
      if (reason !== undefined) return reason;
      continue;
    }

    const nested = resolveValue(value, objects, new Set());
    if (nested.kind === "dictionary") {
      const reason = inspectDictionary(
        nested.value,
        objects,
        visited,
        actionContext,
      );
      if (reason !== undefined) return reason;
    } else if (nested.kind === "array") {
      for (const item of nested.value) {
        const resolvedItem = resolveValue(item, objects, new Set());
        if (resolvedItem.kind === "dictionary") {
          const reason = inspectDictionary(
            resolvedItem.value,
            objects,
            visited,
            actionContext,
          );
          if (reason !== undefined) return reason;
        }
      }
    }
  }

  return actionContext ? "pdf_unclassified_action" : undefined;
}

function inspectActionValue(
  value: PdfValue,
  objects: ReadonlyMap<string, PdfValue>,
  visited: Set<PdfDictionary>,
  openAction: boolean,
): PdfSafetyReasonCode | undefined {
  const resolved = resolveValue(value, objects, new Set());
  if (resolved.kind === "array") {
    return openAction && resolved.value.length > 0
      ? undefined
      : "pdf_unclassified_action";
  }
  if (resolved.kind !== "dictionary") {
    return "pdf_malformed_active_content";
  }
  return inspectActionDictionary(resolved.value, objects, visited);
}

function inspectActionDictionary(
  dictionary: PdfDictionary,
  objects: ReadonlyMap<string, PdfValue>,
  visited: Set<PdfDictionary>,
): PdfSafetyReasonCode | undefined {
  if (dictionary.entries.has("JS") || dictionary.entries.has("JavaScript")) {
    return "pdf_javascript_action";
  }

  const action = dictionary.entries.get("S");
  if (!isNameValue(action)) return "pdf_malformed_active_content";

  let reason: PdfSafetyReasonCode | undefined;
  switch (action.value) {
    case "URI":
      if (!dictionary.entries.has("URI")) {
        return "pdf_malformed_active_content";
      }
      break;
    case "GoTo":
      if (!dictionary.entries.has("D")) {
        return "pdf_malformed_active_content";
      }
      break;
    case "JavaScript":
    case "JS":
      reason = "pdf_javascript_action";
      break;
    case "Launch":
      reason = "pdf_launch_action";
      break;
    case "RichMedia":
    case "Movie":
    case "Sound":
    case "3D":
      reason = "pdf_rich_media";
      break;
    case "SubmitForm":
    case "ImportData":
    case "ResetForm":
    case "GoToR":
    case "GoToE":
    case "Named":
    case "Rendition":
    case "Trans":
      reason = "pdf_unsupported_active_content";
      break;
    default:
      reason = "pdf_unclassified_action";
      break;
  }
  if (reason !== undefined) return reason;

  const next = dictionary.entries.get("Next");
  if (next === undefined) return undefined;
  const resolvedNext = resolveValue(next, objects, new Set());
  const nextValues =
    resolvedNext.kind === "array" ? resolvedNext.value : [resolvedNext];
  for (const nextValue of nextValues) {
    const nextReason = inspectActionValue(nextValue, objects, visited, false);
    if (nextReason !== undefined) return nextReason;
  }
  return undefined;
}

function featureReasonForEntry(
  key: string,
  value: PdfValue,
): PdfSafetyReasonCode | undefined {
  if (embeddedFileNames.has(key)) return "pdf_embedded_file";
  if (richMediaNames.has(key)) return "pdf_rich_media";
  if (key === "JS" || key === "JavaScript") return "pdf_javascript_action";
  if (activeContentNames.has(key) && key !== "URI") {
    return key === "Launch"
      ? "pdf_launch_action"
      : key === "RichMedia" ||
          key === "Movie" ||
          key === "Sound" ||
          key === "3D"
        ? "pdf_rich_media"
        : "pdf_unsupported_active_content";
  }
  if (isNameValue(value)) {
    if (embeddedFileNames.has(value.value)) return "pdf_embedded_file";
    if (richMediaNames.has(value.value)) return "pdf_rich_media";
    if (value.value === "JavaScript" || value.value === "JS") {
      return "pdf_javascript_action";
    }
  }
  return undefined;
}

function isNameValue(
  value: PdfValue | undefined,
): value is { kind: "name"; value: string } {
  return value?.kind === "name";
}

function isName(value: PdfValue, expected: string): boolean {
  return value.kind === "name" && value.value === expected;
}

function resolveValue(
  value: PdfValue,
  objects: ReadonlyMap<string, PdfValue>,
  seen: Set<string>,
): PdfValue {
  if (value.kind !== "reference" || seen.has(value.objectId)) return value;
  const target = objects.get(value.objectId);
  if (target === undefined) return { kind: "other" };
  seen.add(value.objectId);
  return resolveValue(target, objects, seen);
}

function parsePdfTokens(
  tokens: readonly Token[],
  maximumObjectCount: number,
): {
  readonly dictionaries: readonly PdfDictionary[];
  readonly objects: ReadonlyMap<string, PdfValue>;
  readonly malformed: boolean;
  readonly resourceLimitExceeded: boolean;
} {
  const parser = new TokenParser(tokens);
  const dictionaries: PdfDictionary[] = [];
  const objects = new Map<string, PdfValue>();
  let malformed = false;
  let objectCount = 0;

  while (!parser.done()) {
    if (parser.isObjectHeader()) {
      objectCount += 1;
      if (objectCount > maximumObjectCount) {
        return {
          dictionaries,
          objects,
          malformed: false,
          resourceLimitExceeded: true,
        };
      }
      const objectId = parser.objectId();
      const value = parser.parseValue();
      if (value === undefined) {
        malformed = true;
        break;
      }
      objects.set(objectId, value);
      if (value.kind === "dictionary") dictionaries.push(value.value);
      continue;
    }
    const value = parser.parseValue();
    if (value === undefined) {
      malformed = true;
      break;
    }
    if (value.kind === "dictionary") dictionaries.push(value.value);
  }

  return {
    dictionaries,
    objects,
    malformed,
    resourceLimitExceeded: false,
  };
}

class TokenParser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  done(): boolean {
    return this.index >= this.tokens.length;
  }

  isObjectHeader(): boolean {
    const first = this.tokens[this.index];
    const second = this.tokens[this.index + 1];
    const third = this.tokens[this.index + 2];
    return (
      first?.kind === "word" &&
      second?.kind === "word" &&
      third?.kind === "word" &&
      isInteger(first.value) &&
      isInteger(second.value) &&
      third.value === "obj"
    );
  }

  objectId(): string {
    const first = this.tokens[this.index];
    const second = this.tokens[this.index + 1];
    this.index += 3;
    return `${first?.kind === "word" ? first.value : ""} ${second?.kind === "word" ? second.value : ""}`;
  }

  parseValue(): PdfValue | undefined {
    const token = this.tokens[this.index];
    if (token === undefined) return undefined;
    if (token.kind === "dict_start") return this.parseDictionary();
    if (token.kind === "array_start") return this.parseArray();
    this.index += 1;
    if (token.kind === "name") return { kind: "name", value: token.value };
    if (token.kind === "literal") return { kind: "other" };
    const generation = this.tokens[this.index];
    const referenceMarker = this.tokens[this.index + 1];
    if (
      token.kind === "word" &&
      isInteger(token.value) &&
      generation?.kind === "word" &&
      isInteger(generation.value) &&
      referenceMarker?.kind === "word" &&
      referenceMarker.value === "R"
    ) {
      this.index += 2;
      return {
        kind: "reference",
        objectId: `${token.value} ${generation?.kind === "word" ? generation.value : ""}`,
      };
    }
    return { kind: "other" };
  }

  private parseDictionary(): PdfValue {
    this.index += 1;
    const entries = new Map<string, PdfValue>();
    while (!this.done()) {
      const token = this.tokens[this.index];
      if (token?.kind === "dict_end") {
        this.index += 1;
        return { kind: "dictionary", value: { entries } };
      }
      if (token?.kind !== "name") {
        this.index += 1;
        continue;
      }
      this.index += 1;
      const value = this.parseValue();
      if (value === undefined) return { kind: "other" };
      entries.set(token.value, value);
    }
    return { kind: "other" };
  }

  private parseArray(): PdfValue {
    this.index += 1;
    const values: PdfValue[] = [];
    while (!this.done()) {
      if (this.tokens[this.index]?.kind === "array_end") {
        this.index += 1;
        return { kind: "array", value: values };
      }
      const value = this.parseValue();
      if (value === undefined) return { kind: "other" };
      values.push(value);
    }
    return { kind: "other" };
  }
}

function tokenize(
  source: Uint8Array,
  maximumTokenCount: number,
): TokenizationResult {
  const tokens: Token[] = [];
  let index = 0;
  let malformed = false;
  while (index < source.length) {
    if (tokens.length >= maximumTokenCount) {
      return { tokens, malformed: false, resourceLimitExceeded: true };
    }
    const byte = source[index];
    if (isWhitespace(byte)) {
      index += 1;
      continue;
    }
    if (byte === 0x25) {
      while (
        index < source.length &&
        source[index] !== 0x0a &&
        source[index] !== 0x0d
      )
        index += 1;
      continue;
    }
    if (byte === 0x28) {
      const result = skipLiteralString(source, index);
      index = result.index;
      malformed ||= result.malformed;
      tokens.push({ kind: "literal", value: "string" });
      continue;
    }
    if (byte === 0x3c && source[index + 1] === 0x3c) {
      tokens.push({ kind: "dict_start" });
      index += 2;
      continue;
    }
    if (byte === 0x3e && source[index + 1] === 0x3e) {
      tokens.push({ kind: "dict_end" });
      index += 2;
      continue;
    }
    if (byte === 0x3c) {
      index = skipHexString(source, index);
      tokens.push({ kind: "literal", value: "hex" });
      continue;
    }
    if (byte === 0x2f) {
      const name = readName(source, index + 1);
      tokens.push({ kind: "name", value: name.value });
      index = name.index;
      continue;
    }
    if (byte === 0x5b) {
      tokens.push({ kind: "array_start" });
      index += 1;
      continue;
    }
    if (byte === 0x5d) {
      tokens.push({ kind: "array_end" });
      index += 1;
      continue;
    }
    if (byte === 0x29 || byte === 0x3e) {
      malformed = true;
      index += 1;
      continue;
    }
    const word = readWord(source, index);
    if (word.value === "stream") {
      const end = skipStream(source, word.index);
      if (end === undefined) {
        malformed = true;
        break;
      }
      index = end;
      continue;
    }
    tokens.push({ kind: "word", value: word.value });
    index = word.index;
  }
  return { tokens, malformed, resourceLimitExceeded: false };
}

function readName(
  source: Uint8Array,
  start: number,
): { readonly value: string; readonly index: number } {
  let index = start;
  let value = "";
  while (index < source.length && !isDelimiter(source[index])) {
    const current = source[index];
    if (current === undefined) break;
    if (current === 0x23 && index + 2 < source.length) {
      const first = source[index + 1];
      const second = source[index + 2];
      if (first === undefined || second === undefined) break;
      const hex = String.fromCharCode(first, second);
      if (/^[0-9a-f]{2}$/iu.test(hex)) {
        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 3;
        continue;
      }
    }
    value += String.fromCharCode(current);
    index += 1;
  }
  return { value, index };
}

function readWord(
  source: Uint8Array,
  start: number,
): { readonly value: string; readonly index: number } {
  let index = start;
  while (index < source.length && !isDelimiter(source[index])) index += 1;
  return {
    value: String.fromCharCode(...source.subarray(start, index)),
    index,
  };
}

function skipLiteralString(
  source: Uint8Array,
  start: number,
): { readonly index: number; readonly malformed: boolean } {
  let index = start + 1;
  let depth = 1;
  while (index < source.length) {
    const byte = source[index];
    if (byte === 0x5c) {
      index += 2;
      continue;
    }
    if (byte === 0x28) depth += 1;
    if (byte === 0x29) {
      depth -= 1;
      if (depth === 0) return { index: index + 1, malformed: false };
    }
    index += 1;
  }
  return { index, malformed: true };
}

function skipHexString(source: Uint8Array, start: number): number {
  let index = start + 1;
  while (index < source.length && source[index] !== 0x3e) index += 1;
  return Math.min(source.length, index + 1);
}

function skipStream(source: Uint8Array, start: number): number | undefined {
  let index = start;
  while (index < source.length && isWhitespace(source[index])) index += 1;
  for (; index + 9 <= source.length; index += 1) {
    if (
      String.fromCharCode(...source.subarray(index, index + 9)) !== "endstream"
    )
      continue;
    const before = index === 0 ? 0x20 : source[index - 1];
    const after = source[index + 9];
    if (isWhitespace(before) && (after === undefined || isWhitespace(after))) {
      return index + 9;
    }
  }
  return undefined;
}

function isInteger(value: string): boolean {
  return /^-?\d+$/u.test(value);
}

function isWhitespace(value: number | undefined): boolean {
  return (
    value === 0 ||
    value === 9 ||
    value === 10 ||
    value === 12 ||
    value === 13 ||
    value === 32
  );
}

function isDelimiter(value: number | undefined): boolean {
  return (
    isWhitespace(value) ||
    value === 0x25 ||
    value === 0x28 ||
    value === 0x29 ||
    value === 0x3c ||
    value === 0x3e ||
    value === 0x5b ||
    value === 0x5d ||
    value === 0x2f ||
    value === 0x7b ||
    value === 0x7d
  );
}
