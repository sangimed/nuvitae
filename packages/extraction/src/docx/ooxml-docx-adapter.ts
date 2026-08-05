import type { Readable } from "node:stream";
import { XMLParser } from "fast-xml-parser";
import yauzl, { type Entry, type ZipFile } from "yauzl";

import type {
  DocxDeterministicTextExtractor,
  DocxExtractionLimits,
  DocxParagraph,
  DocxRunProvenance,
  DocxTextRun,
  ExtractionRequest,
  ExtractionResult,
  ExtractionSourceReader,
} from "../adapters.js";
import {
  ExtractionOperationError,
  categoryFromUnknown,
  failed,
  succeeded,
  throwIfAborted,
} from "../extraction-failures.js";
import { scanTextForHostileContent } from "../safety.js";

const structuralDangerCategories = new Set([
  "script",
  "macro",
  "ole_object",
  "entity_expansion",
  "path_traversal",
  "launch_action",
  "embedded_file",
]);

const contentTypesPart = "[Content_Types].xml";
const rootRelationshipsPart = "_rels/.rels";
const mainDocumentPart = "word/document.xml";
const documentRelationshipsPart = "word/_rels/document.xml.rels";
const collectedParts = new Set([
  contentTypesPart,
  rootRelationshipsPart,
  mainDocumentPart,
  documentRelationshipsPart,
]);
const securitySensitiveParts = new Set([
  contentTypesPart.toLowerCase(),
  rootRelationshipsPart.toLowerCase(),
  mainDocumentPart.toLowerCase(),
]);
const officeDocumentRelationship =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const docxMainContentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const macroMainContentType =
  "application/vnd.ms-word.document.macroEnabled.main+xml";

/**
 * All DOCX provenance indexes are zero-based. Paragraph indexes are global
 * within `word/document.xml`; table indexes are global within that part; row
 * and cell indexes are local to their containing table/row; run indexes are
 * local to a paragraph; reading order is global across emitted runs.
 */
export class OoxmlDocxAdapter implements DocxDeterministicTextExtractor {
  constructor(
    private readonly sourceReader: ExtractionSourceReader,
    private readonly limits: DocxExtractionLimits,
  ) {
    validateLimits(limits);
  }

  async extractText(
    request: ExtractionRequest,
  ): Promise<ExtractionResult<readonly DocxParagraph[]>> {
    if (request.format !== "docx") {
      return failed("unsupported");
    }
    try {
      throwIfAborted(request.abortSignal);
      const bytes = await this.sourceReader.readSource({
        sourceStorageKey: request.sourceStorageKey,
        maximumBytes: this.limits.maximumArchiveSizeBytes,
        ...(request.abortSignal === undefined
          ? {}
          : { abortSignal: request.abortSignal }),
      });
      throwIfAborted(request.abortSignal);
      if (
        bytes.byteLength === 0 ||
        bytes.byteLength > this.limits.maximumArchiveSizeBytes
      ) {
        throw new ExtractionOperationError(
          bytes.byteLength === 0 ? "malformed" : "resource_limit",
        );
      }

      const parts = await readPackage(bytes, this.limits, request.abortSignal);
      validateDocxPackage(parts, this.limits);
      const documentXml = parts.get(mainDocumentPart);
      if (documentXml === undefined) {
        throw new ExtractionOperationError("corrupted");
      }
      const result = parseDocumentXml(documentXml, this.limits);
      const allText = result
        .flatMap((paragraph) => paragraph.runs.map((run) => run.text))
        .join(" ");
      const hostile = scanTextForHostileContent(allText);
      if (hostile.some((cat) => structuralDangerCategories.has(cat))) {
        throw new ExtractionOperationError("unsupported");
      }
      return succeeded(Object.freeze(result));
    } catch (error) {
      return failed(mapDocxFailure(error, request.abortSignal));
    }
  }
}

async function readPackage(
  bytes: Uint8Array,
  limits: DocxExtractionLimits,
  signal: AbortSignal | undefined,
): Promise<Map<string, string>> {
  const zip = await openZip(bytes);
  const abort = () => zip.close();
  signal?.addEventListener("abort", abort, { once: true });
  const result = new Map<string, string>();
  const seenSensitive = new Set<string>();
  let entryCount = 0;
  let totalUncompressed = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      zip.once("error", fail);
      zip.once("end", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      zip.on("entry", (entry: Entry) => {
        void handleEntry(entry).catch(fail);
      });

      const handleEntry = async (entry: Entry): Promise<void> => {
        throwIfAborted(signal);
        entryCount += 1;
        if (entryCount > limits.maximumEntryCount) {
          throw new ExtractionOperationError("resource_limit");
        }
        validateEntryName(entry.fileName);
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
          throw new ExtractionOperationError("encrypted");
        }
        if (entry.uncompressedSize > limits.maximumEntryUncompressedSizeBytes) {
          throw new ExtractionOperationError("resource_limit");
        }
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > limits.maximumTotalUncompressedSizeBytes) {
          throw new ExtractionOperationError("resource_limit");
        }
        const ratio =
          entry.compressedSize === 0
            ? entry.uncompressedSize === 0
              ? 1
              : Number.POSITIVE_INFINITY
            : entry.uncompressedSize / entry.compressedSize;
        if (ratio > limits.maximumCompressionRatio) {
          throw new ExtractionOperationError("resource_limit");
        }

        const lowerName = entry.fileName.toLowerCase();
        if (
          lowerName.endsWith("vbaproject.bin") ||
          lowerName.includes("/macros/")
        ) {
          throw new ExtractionOperationError("unsupported");
        }
        if (securitySensitiveParts.has(lowerName)) {
          if (seenSensitive.has(lowerName)) {
            throw new ExtractionOperationError("malformed");
          }
          seenSensitive.add(lowerName);
        }

        if (
          !entry.fileName.endsWith("/") &&
          collectedParts.has(entry.fileName)
        ) {
          const content = await readEntry(zip, entry, limits, signal);
          result.set(entry.fileName, content);
        }
        if (!settled) {
          zip.readEntry();
        }
      };

      zip.readEntry();
    });
    throwIfAborted(signal);
    return result;
  } finally {
    signal?.removeEventListener("abort", abort);
    zip.close();
  }
}

function openZip(bytes: Uint8Array): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      Buffer.from(bytes),
      {
        autoClose: false,
        decodeStrings: true,
        lazyEntries: true,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (error, zip) => {
        if (error !== null || zip === undefined) {
          reject(new ExtractionOperationError("malformed"));
        } else {
          resolve(zip);
        }
      },
    );
  });
}

function readEntry(
  zip: ZipFile,
  entry: Entry,
  limits: DocxExtractionLimits,
  signal: AbortSignal | undefined,
): Promise<string> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error !== null || stream === undefined) {
        reject(new ExtractionOperationError("corrupted"));
        return;
      }
      collectStream(stream, limits, signal).then(resolve, reject);
    });
  });
}

async function collectStream(
  stream: Readable,
  limits: DocxExtractionLimits,
  signal: AbortSignal | undefined,
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  const abort = () => stream.destroy(new ExtractionOperationError("cancelled"));
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for await (const chunk of stream) {
      throwIfAborted(signal);
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > limits.maximumEntryUncompressedSizeBytes) {
        throw new ExtractionOperationError("resource_limit");
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, size).toString("utf8");
  } finally {
    signal?.removeEventListener("abort", abort);
    stream.destroy();
  }
}

function validateEntryName(name: string): void {
  const segments = name.split("/");
  if (
    name.length === 0 ||
    name.includes("\0") ||
    name.includes("\\") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    segments.some((segment) => segment === "..")
  ) {
    throw new ExtractionOperationError("malformed");
  }
}

function validateDocxPackage(
  parts: Map<string, string>,
  limits: DocxExtractionLimits,
): void {
  const contentTypes = parts.get(contentTypesPart);
  const relationships = parts.get(rootRelationshipsPart);
  if (contentTypes === undefined || relationships === undefined) {
    throw new ExtractionOperationError("corrupted");
  }
  validateXmlComplexity(contentTypes, limits.maximumXmlDepth);
  validateXmlComplexity(relationships, limits.maximumXmlDepth);

  const parser = new XMLParser({
    allowBooleanAttributes: false,
    attributeNamePrefix: "",
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    processEntities: false,
    removeNSPrefix: true,
  });
  let types: unknown;
  let rels: unknown;
  try {
    types = parser.parse(contentTypes);
    rels = parser.parse(relationships);
  } catch {
    throw new ExtractionOperationError("malformed");
  }

  const overrides = toArray(record(record(types).Types).Override).map(record);
  const mainOverride = overrides.find(
    (entry) => entry.PartName === "/word/document.xml",
  );
  if (mainOverride?.ContentType === macroMainContentType) {
    throw new ExtractionOperationError("unsupported");
  }
  if (mainOverride?.ContentType !== docxMainContentType) {
    throw new ExtractionOperationError("corrupted");
  }

  const rootRelationships = toArray(
    record(record(rels).Relationships).Relationship,
  ).map(record);
  const mainRelationship = rootRelationships.find(
    (entry) => entry.Type === officeDocumentRelationship,
  );
  if (
    mainRelationship === undefined ||
    mainRelationship.TargetMode === "External" ||
    normalizeRelationshipTarget(String(mainRelationship.Target ?? "")) !==
      mainDocumentPart
  ) {
    throw new ExtractionOperationError("corrupted");
  }

  const documentRelationships = parts.get(documentRelationshipsPart);
  if (documentRelationships !== undefined) {
    validateXmlComplexity(documentRelationships, limits.maximumXmlDepth);
    try {
      // Parse for structural safety only. External relationships (including
      // hyperlinks, templates and images) are never dereferenced.
      parser.parse(documentRelationships);
    } catch {
      throw new ExtractionOperationError("malformed");
    }
  }
}

function normalizeRelationshipTarget(target: string): string {
  return target.replace(/^\//, "").replace(/^\.\//, "");
}

type OrderedNode = Record<string, unknown>;
interface TraversalState {
  paragraphIndex: number;
  tableIndex: number;
  paragraphReadingOrder: number;
  runReadingOrder: number;
  readonly paragraphs: DocxParagraph[];
}
interface TableContext {
  readonly tableIndex: number;
  readonly rowIndex: number;
  readonly cellIndex: number;
}

function parseDocumentXml(
  xml: string,
  limits: DocxExtractionLimits,
): readonly DocxParagraph[] {
  validateXmlComplexity(xml, limits.maximumXmlDepth);
  const parser = new XMLParser({
    allowBooleanAttributes: false,
    ignoreAttributes: false,
    parseTagValue: false,
    preserveOrder: true,
    processEntities: false,
    removeNSPrefix: true,
    trimValues: false,
  });
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch {
    throw new ExtractionOperationError("malformed");
  }
  if (!Array.isArray(parsed)) {
    throw new ExtractionOperationError("malformed");
  }
  const state: TraversalState = {
    paragraphIndex: 0,
    tableIndex: 0,
    paragraphReadingOrder: 0,
    runReadingOrder: 0,
    paragraphs: [],
  };
  const documentNode = findChild(parsed, "document");
  const body =
    documentNode === undefined
      ? undefined
      : findChild(childrenOf(documentNode, "document"), "body");
  if (body === undefined) {
    throw new ExtractionOperationError("corrupted");
  }
  visitBlockChildren(childrenOf(body, "body"), state);
  return state.paragraphs;
}

function visitBlockChildren(
  nodes: readonly unknown[],
  state: TraversalState,
  context?: TableContext,
): void {
  for (const node of nodes) {
    const item = record(node);
    if ("p" in item) {
      emitParagraph(childrenOf(item, "p"), state, context);
    } else if ("tbl" in item) {
      visitTable(childrenOf(item, "tbl"), state);
    } else {
      for (const value of Object.values(item)) {
        if (Array.isArray(value)) {
          visitBlockChildren(value, state, context);
        }
      }
    }
  }
}

function visitTable(nodes: readonly unknown[], state: TraversalState): void {
  const tableIndex = state.tableIndex;
  state.tableIndex += 1;
  let rowIndex = 0;
  for (const rowNode of nodes) {
    const row = record(rowNode);
    if (!("tr" in row)) {
      continue;
    }
    let cellIndex = 0;
    for (const cellNode of childrenOf(row, "tr")) {
      const cell = record(cellNode);
      if (!("tc" in cell)) {
        continue;
      }
      visitBlockChildren(childrenOf(cell, "tc"), state, {
        tableIndex,
        rowIndex,
        cellIndex,
      });
      cellIndex += 1;
    }
    rowIndex += 1;
  }
}

function emitParagraph(
  nodes: readonly unknown[],
  state: TraversalState,
  context?: TableContext,
): void {
  const paragraphIndex = state.paragraphIndex;
  state.paragraphIndex += 1;
  let runIndex = 0;
  let characterOffset = 0;
  const runs: DocxTextRun[] = [];

  walkRunContainers(nodes, (runNode) => {
    const text = textFromRun(runNode);
    const currentRunIndex = runIndex;
    runIndex += 1;
    if (text.length === 0) {
      return;
    }
    const provenance: DocxRunProvenance = Object.freeze({
      kind: "docx_run",
      packagePart: mainDocumentPart,
      paragraphIndex,
      ...(context === undefined
        ? {}
        : {
            tableIndex: context.tableIndex,
            rowIndex: context.rowIndex,
            cellIndex: context.cellIndex,
          }),
      runIndex: currentRunIndex,
      characterOffsetStart: characterOffset,
      characterOffsetEnd: characterOffset + text.length,
      readingOrder: state.runReadingOrder,
    });
    runs.push(Object.freeze({ text, provenance }));
    characterOffset += text.length;
    state.runReadingOrder += 1;
  });

  state.paragraphs.push(
    Object.freeze({
      packagePart: mainDocumentPart,
      paragraphIndex,
      readingOrder: state.paragraphReadingOrder,
      runs: Object.freeze(runs),
    }),
  );
  state.paragraphReadingOrder += 1;
}

function walkRunContainers(
  nodes: readonly unknown[],
  visit: (nodes: readonly unknown[]) => void,
): void {
  for (const node of nodes) {
    const item = record(node);
    if ("r" in item) {
      visit(childrenOf(item, "r"));
      continue;
    }
    for (const [key, value] of Object.entries(item)) {
      if (
        Array.isArray(value) &&
        !["instrText", "del", "object", "pict"].includes(key)
      ) {
        walkRunContainers(value, visit);
      }
    }
  }
}

function textFromRun(nodes: readonly unknown[]): string {
  let result = "";
  const visit = (values: readonly unknown[]): void => {
    for (const node of values) {
      const item = record(node);
      if ("t" in item) {
        result += textValue(childrenOf(item, "t"));
      } else if ("tab" in item) {
        result += "\t";
      } else if ("br" in item || "cr" in item) {
        result += "\n";
      } else {
        for (const [key, value] of Object.entries(item)) {
          if (Array.isArray(value) && key !== "instrText") {
            visit(value);
          }
        }
      }
    }
  };
  visit(nodes);
  return result.replace(/\r\n?/g, "\n");
}

function textValue(nodes: readonly unknown[]): string {
  return nodes
    .map((node) => {
      const value = record(node)["#text"];
      return typeof value === "string" ? value : "";
    })
    .join("");
}

function findChild(
  nodes: readonly unknown[],
  name: string,
): OrderedNode | undefined {
  return nodes.map(record).find((node) => name in node);
}

function childrenOf(node: OrderedNode, name: string): readonly unknown[] {
  const value = node[name];
  return Array.isArray(value) ? value : [];
}

function validateXmlComplexity(xml: string, maximumDepth: number): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new ExtractionOperationError("unsupported");
  }
  let depth = 0;
  for (const match of xml.matchAll(/<[^>]+>/g)) {
    const token = match[0];
    if (
      token.startsWith("<?") ||
      token.startsWith("<!") ||
      token.endsWith("/>")
    ) {
      continue;
    }
    if (token.startsWith("</")) {
      depth -= 1;
      if (depth < 0) {
        throw new ExtractionOperationError("malformed");
      }
    } else {
      depth += 1;
      if (depth > maximumDepth) {
        throw new ExtractionOperationError("resource_limit");
      }
    }
  }
  if (depth !== 0) {
    throw new ExtractionOperationError("malformed");
  }
}

function toArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function validateLimits(limits: DocxExtractionLimits): void {
  const values = Object.values(limits);
  if (
    values.some(
      (value) =>
        !Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(value),
    )
  ) {
    throw new TypeError("DOCX extraction limits must be positive integers.");
  }
}

function mapDocxFailure(
  error: unknown,
  signal: AbortSignal | undefined,
): ReturnType<typeof categoryFromUnknown> {
  if (signal?.aborted === true) {
    return "cancelled";
  }
  const known = categoryFromUnknown(error, "unexpected");
  if (known !== "unexpected") {
    return known;
  }
  if (error instanceof Error && /zip|xml/i.test(error.name)) {
    return "malformed";
  }
  return "unexpected";
}
